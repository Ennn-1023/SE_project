/**
 * GoogleAuthService（組件圖 003-component、diagrams/003-sequence-connect.puml、research R1）：
 * 老師以自己的 Google 帳號授權（授權碼＋PKCE）、token 加密保存與自動更新、中斷連結。
 */
import { createHash, randomBytes } from 'node:crypto';
import type { GoogleConfig } from '../config/env.js';
import type {
  GoogleConnectionRepository,
  GoogleOAuthClient,
  OAuthStateRepository,
  QuestionEventRepository,
} from '../domain/questionPorts.js';
import { SPREADSHEETS_SCOPE } from '../integrations/google/googleOAuthClient.js';
import { GoogleHttpError, mapGoogleError } from '../integrations/google/googleHttp.js';
import type { Clock } from '../lib/clock.js';
import { appError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { TokenCipher } from '../lib/tokenCipher.js';

export const OAUTH_STATE_TTL_MS = 10 * 60_000;
/** access token 剩餘有效時間小於此值即先更新（research R1）。 */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail?: string;
}

/** OAuth 回呼結果（contracts/ui-routes.md「查詢參數 ?google=」）。 */
export type CallbackResult = 'connected' | 'denied' | 'scope_missing' | 'state_invalid' | 'error';

export interface CallbackParams {
  state?: string;
  code?: string;
  error?: string;
}

export interface GoogleAuthServiceDeps {
  config: GoogleConfig | null;
  oauth: GoogleOAuthClient | null;
  cipher: TokenCipher | null;
  connections: GoogleConnectionRepository;
  states: OAuthStateRepository;
  events: QuestionEventRepository;
  clock: Clock;
  logger: Logger;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export class GoogleAuthService {
  constructor(private readonly deps: GoogleAuthServiceDeps) {}

  private configured() {
    const { config, oauth, cipher } = this.deps;
    if (!config || !oauth || !cipher) throw appError('GOOGLE_NOT_CONFIGURED');
    return { oauth, cipher };
  }

  getStatus(userId: number): GoogleStatus {
    const configured = !!(this.deps.config && this.deps.oauth && this.deps.cipher);
    const conn = configured ? this.deps.connections.findByUser(userId) : null;
    return conn
      ? { configured, connected: true, googleEmail: conn.googleEmail }
      : { configured, connected: false };
  }

  /** 建立 state 與 PKCE verifier，回傳 Google 授權頁網址。 */
  startAuthorization(userId: number, sessionId: string): string {
    const { oauth, cipher } = this.configured();
    const now = this.deps.clock.now();
    this.deps.states.deleteExpired(now);
    const state = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    this.deps.states.create({
      state,
      userId,
      sessionId,
      codeVerifierEnc: cipher.encrypt(verifier),
      createdAt: now,
      expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    });
    return oauth.buildAuthUrl(state, challenge);
  }

  /** 處理 Google 導回；結果只用固定代碼，不帶任何 token 或 Google 原文。 */
  async handleCallback(params: CallbackParams, sessionId: string | null): Promise<CallbackResult> {
    if (!this.deps.config || !this.deps.oauth || !this.deps.cipher) return 'error';
    const { oauth, cipher } = this.configured();
    const now = this.deps.clock.now();
    const st = params.state ? this.deps.states.take(params.state) : null;
    if (
      !st ||
      st.expiresAt.getTime() <= now.getTime() ||
      !sessionId ||
      st.sessionId !== sessionId
    ) {
      return 'state_invalid';
    }
    if (params.error) return params.error === 'access_denied' ? 'denied' : 'error';
    if (!params.code) return 'error';
    try {
      const tokens = await oauth.exchangeCode(params.code, cipher.decrypt(st.codeVerifierEnc));
      if (!tokens.scope.split(/\s+/).includes(SPREADSHEETS_SCOPE)) {
        await oauth.revoke(tokens.accessToken).catch(() => undefined);
        return 'scope_missing';
      }
      if (!tokens.refreshToken) return 'error';
      const email = await oauth.fetchEmail(tokens.accessToken);
      this.deps.connections.upsert({
        userId: st.userId,
        googleEmail: email.slice(0, 320),
        refreshTokenEnc: cipher.encrypt(tokens.refreshToken),
        accessTokenEnc: cipher.encrypt(tokens.accessToken),
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
        scopes: tokens.scope,
        connectedAt: now,
        lastUsedAt: now,
      });
      this.deps.events.record({
        at: now,
        actorUserId: st.userId,
        type: 'GOOGLE_CONNECTED',
        spreadsheetId: null,
        sheetTitle: null,
        questionCount: null,
      });
      return 'connected';
    } catch (err) {
      this.deps.logger.warn('google oauth callback failed', {
        status: err instanceof GoogleHttpError ? err.status : undefined,
        reason: err instanceof GoogleHttpError ? err.reason : (err as Error)?.name,
      });
      return 'error';
    }
  }

  /** 中斷連結：盡可能撤銷授權（失敗只記 log），刪除保存的 token；題目集不受影響。 */
  async disconnect(userId: number): Promise<void> {
    const conn = this.deps.connections.findByUser(userId);
    if (!conn) return;
    if (this.deps.oauth && this.deps.cipher) {
      try {
        await this.deps.oauth.revoke(this.deps.cipher.decrypt(conn.refreshTokenEnc));
      } catch (err) {
        this.deps.logger.warn('google revoke failed', {
          status: err instanceof GoogleHttpError ? err.status : undefined,
        });
      }
    }
    this.deps.connections.delete(userId);
    this.deps.events.record({
      at: this.deps.clock.now(),
      actorUserId: userId,
      type: 'GOOGLE_DISCONNECTED',
      spreadsheetId: null,
      sheetTitle: null,
      questionCount: null,
    });
  }

  /**
   * 取得可用的 access token：剩餘 < 60 秒或 forceRefresh 時先更新（FR-004）。
   * refresh 被拒（invalid_grant）時刪除連結並丟 GOOGLE_AUTH_EXPIRED。
   */
  async getAccessToken(userId: number, forceRefresh = false): Promise<string> {
    const { oauth, cipher } = this.configured();
    const conn = this.deps.connections.findByUser(userId);
    if (!conn) throw appError('GOOGLE_NOT_CONNECTED');
    const now = this.deps.clock.now();
    if (
      !forceRefresh &&
      conn.accessTokenEnc &&
      conn.accessTokenExpiresAt &&
      conn.accessTokenExpiresAt.getTime() - now.getTime() > TOKEN_REFRESH_MARGIN_MS
    ) {
      this.deps.connections.updateAccessToken(
        userId,
        conn.accessTokenEnc,
        conn.accessTokenExpiresAt,
        now,
      );
      return cipher.decrypt(conn.accessTokenEnc);
    }
    let tokens;
    try {
      tokens = await oauth.refresh(cipher.decrypt(conn.refreshTokenEnc));
    } catch (err) {
      if (
        err instanceof GoogleHttpError &&
        (err.reason === 'invalid_grant' || err.status === 400 || err.status === 401)
      ) {
        this.deps.connections.delete(userId);
        throw appError('GOOGLE_AUTH_EXPIRED');
      }
      throw mapGoogleError(err, 'read', this.deps.logger);
    }
    const expiresAt = new Date(now.getTime() + tokens.expiresInSeconds * 1000);
    this.deps.connections.updateAccessToken(
      userId,
      cipher.encrypt(tokens.accessToken),
      expiresAt,
      now,
    );
    return tokens.accessToken;
  }
}
