/**
 * GoogleOAuthClient（組件圖 003-component、research R1）：以內建 fetch 呼叫 Google OAuth 2.0
 * 授權碼流程（PKCE）的 authorize、token、revoke 與 userinfo 端點。
 */
import type {
  GoogleOAuthClient as GoogleOAuthClientPort,
  TokenSet,
} from '../../domain/questionPorts.js';
import { GoogleHttpError, googleFetch, type GoogleHttpOptions } from './googleHttp.js';

export const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const OAUTH_SCOPES = ['openid', 'email', SPREADSHEETS_SCOPE];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const form = (params: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});

function toTokenSet(body: unknown): TokenSet {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.access_token !== 'string' || b.access_token === '') {
    throw new GoogleHttpError(502, 'INVALID_TOKEN_RESPONSE');
  }
  return {
    accessToken: b.access_token,
    refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
    scope: typeof b.scope === 'string' ? b.scope : '',
    expiresInSeconds: typeof b.expires_in === 'number' ? b.expires_in : 3600,
  };
}

export class GoogleOAuthClient implements GoogleOAuthClientPort {
  constructor(
    private readonly config: GoogleOAuthClientConfig,
    private readonly http: GoogleHttpOptions = {},
  ) {}

  buildAuthUrl(state: string, codeChallenge: string): string {
    const url = new URL(AUTH_URL);
    const p = url.searchParams;
    p.set('client_id', this.config.clientId);
    p.set('redirect_uri', this.config.redirectUri);
    p.set('response_type', 'code');
    p.set('scope', OAUTH_SCOPES.join(' '));
    p.set('access_type', 'offline');
    p.set('prompt', 'consent');
    p.set('include_granted_scopes', 'true');
    p.set('state', state);
    p.set('code_challenge', codeChallenge);
    p.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
    const body = await googleFetch(
      TOKEN_URL,
      form({
        code,
        code_verifier: codeVerifier,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
      this.http,
    );
    return toTokenSet(body);
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    const body = await googleFetch(
      TOKEN_URL,
      form({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      }),
      this.http,
    );
    return toTokenSet(body);
  }

  async revoke(token: string): Promise<void> {
    await googleFetch(REVOKE_URL, form({ token }), this.http);
  }

  async fetchEmail(accessToken: string): Promise<string> {
    const body = (await googleFetch(
      USERINFO_URL,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      this.http,
    )) as { email?: unknown } | null;
    if (typeof body?.email !== 'string' || body.email === '') {
      throw new GoogleHttpError(502, 'INVALID_USERINFO');
    }
    return body.email;
  }
}
