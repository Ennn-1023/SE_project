import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, authEvents, createApiClient, UNAUTHENTICATED_EVENT } from '../src/api/apiClient';
import { Button } from '../src/components/Button';
import { ErrorMessage } from '../src/components/ErrorMessage';

describe('ErrorMessage', () => {
  it('顯示 message 與 hint（正常）', () => {
    render(<ErrorMessage message="學號格式不正確" hint="學號須為 4–20 個英文字母或數字" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('學號格式不正確');
    expect(alert).toHaveTextContent('學號須為 4–20 個英文字母或數字');
  });

  it('沒有 hint 時不顯示空白區塊；沒有 message 時不渲染（邊界）', () => {
    const { container, rerender } = render(<ErrorMessage message="帳號或密碼錯誤" />);
    expect(screen.getByRole('alert').querySelectorAll('p')).toHaveLength(1);
    rerender(<ErrorMessage message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Button', () => {
  it('具最小尺寸 class 與兩種撞色變體', () => {
    render(
      <>
        <Button>主要</Button>
        <Button variant="secondary">次要</Button>
      </>,
    );
    const primary = screen.getByRole('button', { name: '主要' });
    const secondary = screen.getByRole('button', { name: '次要' });
    for (const b of [primary, secondary]) {
      expect(b.className).toContain('min-h-11');
      expect(b.className).toContain('min-w-11');
    }
    expect(primary.className).toContain('bg-primary ');
    expect(secondary.className).toContain('bg-accent');
    expect(primary).toHaveAttribute('type', 'button');
  });
});

describe('ApiClient', () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function callWith(status: number, code: string) {
    const client = createApiClient(async () =>
      jsonResponse(status, { error: { code, message: 'x' } }),
    );
    const listener = vi.fn();
    authEvents.addEventListener(UNAUTHENTICATED_EVENT, listener);
    try {
      await client.get('/anything');
      throw new Error('expected ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe(code);
    } finally {
      authEvents.removeEventListener(UNAUTHENTICATED_EVENT, listener);
    }
    return listener;
  }

  it('收到 401 UNAUTHENTICATED 時觸發「未登入」事件', async () => {
    expect(await callWith(401, 'UNAUTHENTICATED')).toHaveBeenCalledTimes(1);
  });

  it('收到 401 INVALID_CREDENTIALS 與 400 INVALID_CURRENT_PASSWORD 時不觸發', async () => {
    expect(await callWith(401, 'INVALID_CREDENTIALS')).not.toHaveBeenCalled();
    expect(await callWith(400, 'INVALID_CURRENT_PASSWORD')).not.toHaveBeenCalled();
  });

  it('將 ErrorResponse 轉為含 field／hint／details 的 ApiError', async () => {
    const client = createApiClient(async () =>
      jsonResponse(409, {
        error: {
          code: 'ALREADY_ASSIGNED',
          message: '你已分組',
          hint: 'h',
          field: 'groupNumber',
          details: { currentGroupNumber: 2 },
        },
      }),
    );
    await expect(client.post('/groups/me', { groupNumber: 3 })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_ASSIGNED',
      field: 'groupNumber',
      hint: 'h',
      details: { currentGroupNumber: 2 },
    });
  });

  it('送出 JSON 並帶 same-origin 憑證；204 回 undefined', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createApiClient(fetchImpl);
    await expect(client.post('/auth/logout', { a: 1 })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });
});
