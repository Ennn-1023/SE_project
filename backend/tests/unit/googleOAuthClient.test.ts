import { describe, expect, it, vi } from 'vitest';
import { GoogleOAuthClient } from '../../src/integrations/google/googleOAuthClient.js';
import { GoogleHttpError, mapGoogleError } from '../../src/integrations/google/googleHttp.js';

const cfg = {
  clientId: 'fake-client.apps.googleusercontent.com',
  clientSecret: 'fake-secret',
  redirectUri: 'http://localhost:5173/api/google/oauth/callback',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(fetchImpl: ReturnType<typeof vi.fn>) {
  return new GoogleOAuthClient(cfg, { fetch: fetchImpl as never });
}

describe('GoogleOAuthClient（research R1）', () => {
  it('授權網址含 offline、consent、PKCE S256、state 與三個 scope（正常）', () => {
    const url = new URL(client(vi.fn()).buildAuthUrl('st-1', 'chal-1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(cfg.clientId);
    expect(p.get('redirect_uri')).toBe(cfg.redirectUri);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent');
    expect(p.get('state')).toBe('st-1');
    expect(p.get('code_challenge')).toBe('chal-1');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('scope')?.split(' ').sort()).toEqual(
      ['email', 'https://www.googleapis.com/auth/spreadsheets', 'openid'].sort(),
    );
  });

  it('exchangeCode 以表單送出授權碼與 verifier，回傳 TokenSet', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        access_token: 'at',
        refresh_token: 'rt',
        scope: 'openid https://www.googleapis.com/auth/spreadsheets',
        expires_in: 3599,
      }),
    );
    const t = await client(fetchImpl).exchangeCode('the-code', 'the-verifier');
    expect(t).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      scope: 'openid https://www.googleapis.com/auth/spreadsheets',
      expiresInSeconds: 3599,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('client_secret')).toBe(cfg.clientSecret);
    expect(body.get('redirect_uri')).toBe(cfg.redirectUri);
  });

  it('refresh 送出 refresh_token；Google 未回傳新 refresh token 時為 null', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { access_token: 'at2', scope: 'x', expires_in: 3600 }),
    );
    const t = await client(fetchImpl).refresh('rt');
    expect(t.refreshToken).toBeNull();
    const body = new URLSearchParams(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt');
  });

  it('invalid_grant → GoogleHttpError，對應為 GOOGLE_AUTH_EXPIRED（邊界）', async () => {
    const fetchImpl = vi.fn(async () => json(400, { error: 'invalid_grant' }));
    const err = await client(fetchImpl)
      .refresh('revoked')
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(GoogleHttpError);
    expect(mapGoogleError(err, 'read').code).toBe('GOOGLE_AUTH_EXPIRED');
  });

  it('revoke 呼叫撤銷端點；fetchEmail 以 Bearer 取得 email', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json(200, { email: 'teacher.fake@example.edu' }));
    const c = client(fetchImpl);
    await c.revoke('rt');
    await expect(c.fetchEmail('at')).resolves.toBe('teacher.fake@example.edu');
    const [rUrl, rInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(rUrl).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams(String(rInit.body)).get('token')).toBe('rt');
    const [eUrl, eInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(eUrl).toBe('https://openidconnect.googleapis.com/v1/userinfo');
    expect((eInit.headers as Record<string, string>).Authorization).toBe('Bearer at');
  });

  it('回應缺少 access_token 或 email 時視為錯誤（邊界）', async () => {
    await expect(client(vi.fn(async () => json(200, {}))).refresh('rt')).rejects.toBeInstanceOf(
      GoogleHttpError,
    );
    await expect(client(vi.fn(async () => json(200, {}))).fetchEmail('at')).rejects.toBeInstanceOf(
      GoogleHttpError,
    );
  });
});
