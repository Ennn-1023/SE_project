import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loggedOut, meAs, mockApi, renderApp, studentUser, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectLocation(path: string) {
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(path));
}

describe("前端路由守衛（US4、contracts/api.md 前端路由）", () => {
  it.each(["/teacher", "/teacher/students", "/student", "/account/password"])(
    "未登入進 %s 導向 /login",
    async (path) => {
      mockApi({ "GET /api/auth/me": loggedOut });
      renderApp(path);
      await expectLocation("/login");
    },
  );

  it("學生進 /teacher/students 導向 /student，看不到老師頁內容（US4-3）", async () => {
    mockApi({ "GET /api/auth/me": meAs(studentUser), "GET /api/students": () => ({ status: 403, body: { error: { code: "FORBIDDEN", message: "權限不足" } } }) });
    renderApp("/teacher/students");
    await expectLocation("/student");
    expect(screen.queryByText("學生帳號管理")).not.toBeInTheDocument();
  });

  it("學生進 /teacher 導向 /student", async () => {
    mockApi({ "GET /api/auth/me": meAs(studentUser) });
    renderApp("/teacher");
    await expectLocation("/student");
  });

  it("老師進 /student 導向 /teacher", async () => {
    mockApi({ "GET /api/auth/me": meAs(teacherUser) });
    renderApp("/student");
    await expectLocation("/teacher");
  });

  it("老師與學生都可以進入 /account/password", async () => {
    mockApi({ "GET /api/auth/me": meAs(studentUser) });
    renderApp("/account/password");
    await expectLocation("/account/password");
  });

  it("載入登入狀態時不會先閃現受保護頁面", async () => {
    mockApi({ "GET /api/auth/me": loggedOut });
    renderApp("/teacher");
    expect(screen.queryByText("老師管理")).not.toBeInTheDocument();
    await expectLocation("/login");
  });
});
