import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meAs, mockApi, renderApp, studentUser, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("登出與逾時（US5）", () => {
  it("按登出後呼叫 API、導向 /login，且登入狀態清空", async () => {
    let loggedIn = true;
    const fetchMock = mockApi({
      "GET /api/auth/me": () =>
        loggedIn
          ? { status: 200, body: { user: studentUser } }
          : { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "尚未登入" } } },
      "POST /api/auth/logout": () => {
        loggedIn = false;
        return { status: 204 };
      },
    });
    renderApp("/student");
    await userEvent.click(await screen.findByRole("button", { name: "登出" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/auth/logout" && init?.method === "POST")).toBe(true);
    expect(await screen.findByRole("button", { name: "登入" })).toBeInTheDocument();
  });

  it("頁首顯示目前使用者名稱", async () => {
    mockApi({ "GET /api/auth/me": meAs(teacherUser) });
    renderApp("/teacher");
    expect(await screen.findByText("老師（teacher）")).toBeInTheDocument();
  });

  it("任一 API 回 SESSION_EXPIRED 時導向 /login 並顯示逾時訊息", async () => {
    mockApi({
      "GET /api/auth/me": meAs(teacherUser),
      "GET /api/students": () => ({
        status: 401,
        body: { error: { code: "SESSION_EXPIRED", message: "登入已逾時，請重新登入" } },
      }),
    });
    renderApp("/teacher/students");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login?reason=expired"));
    expect(await screen.findByText("登入已逾時，請重新登入")).toBeInTheDocument();
  });
});
