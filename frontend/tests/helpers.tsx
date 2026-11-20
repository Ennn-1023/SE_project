import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { vi } from "vitest";
import type { CurrentUser } from "@se/shared";
import { App } from "../src/App";
import { AuthProvider } from "../src/auth/AuthContext";

export type Handler = (init: RequestInit | undefined) => { status: number; body?: unknown };

/**
 * 以「方法 路徑」對應假回應，例如 { "GET /api/auth/me": () => ({ status: 401, ... }) }。
 * 未定義的路徑回 404。
 */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = routes[key];
    const result = handler ? handler(init) : { status: 404, body: { error: { code: "NOT_FOUND", message: "找不到此 API" } } };
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
      status: result.status,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function bodyOf(init: RequestInit | undefined): unknown {
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

export const studentUser: CurrentUser = {
  username: "411000001",
  displayName: "王小明",
  role: "STUDENT",
  usesDefaultPassword: true,
};

export const teacherUser: CurrentUser = {
  username: "teacher",
  displayName: "老師",
  role: "TEACHER",
  usesDefaultPassword: false,
};

export const loggedOut: Handler = () => ({
  status: 401,
  body: { error: { code: "UNAUTHENTICATED", message: "尚未登入" } },
});

export const meAs =
  (user: CurrentUser): Handler =>
  () => ({ status: 200, body: { user } });

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

/** 以真實的路由與 AuthProvider 渲染整個 App。 */
export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
}
