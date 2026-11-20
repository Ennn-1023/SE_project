import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyOf, loggedOut, meAs, mockApi, renderApp, studentUser, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("登入頁（US1）", () => {
  it("空欄位送出時顯示欄位錯誤，且不呼叫登入 API（US1-4）", async () => {
    const fetchMock = mockApi({ "GET /api/auth/me": loggedOut });
    renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: "登入" }));
    expect(await screen.findByText("請輸入學號或帳號")).toBeInTheDocument();
    expect(screen.getByText("請輸入密碼")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("INVALID_CREDENTIALS 時留在登入頁顯示「學號或密碼錯誤」，學號不被清空（US1-2、分析 F1）", async () => {
    mockApi({
      "GET /api/auth/me": loggedOut,
      "POST /api/auth/login": () => ({
        status: 401,
        body: { error: { code: "INVALID_CREDENTIALS", message: "學號或密碼錯誤", hint: "請確認學號與密碼後再試一次" } },
      }),
    });
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText("學號或帳號"), "411000001");
    await userEvent.type(screen.getByLabelText("密碼"), "bad-password");
    await userEvent.click(screen.getByRole("button", { name: "登入" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("學號或密碼錯誤");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByLabelText("學號或帳號")).toHaveValue("411000001");
  });

  it("登入成功後導向 redirectTo，送出的密碼不被修剪", async () => {
    let sent: unknown;
    mockApi({
      "GET /api/auth/me": loggedOut,
      "POST /api/auth/login": (init) => {
        sent = bodyOf(init);
        return { status: 200, body: { user: studentUser, redirectTo: "/student" } };
      },
    });
    renderApp("/login");
    await userEvent.type(await screen.findByLabelText("學號或帳號"), "411000001");
    await userEvent.type(screen.getByLabelText("密碼"), " pw-with-space ");
    await userEvent.click(screen.getByRole("button", { name: "登入" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/student"));
    expect(sent).toEqual({ username: "411000001", password: " pw-with-space " });
  });

  it("已登入的學生開啟 /login 直接導向 /student（FR-011）", async () => {
    mockApi({ "GET /api/auth/me": meAs(studentUser) });
    renderApp("/login");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/student"));
  });

  it("已登入的老師開啟 /login 直接導向 /teacher（FR-011）", async () => {
    mockApi({ "GET /api/auth/me": meAs(teacherUser) });
    renderApp("/login");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/teacher"));
  });

  it("網址帶逾時原因時顯示「登入已逾時，請重新登入」", async () => {
    mockApi({ "GET /api/auth/me": loggedOut });
    renderApp("/login?reason=expired");
    expect(await screen.findByText("登入已逾時，請重新登入")).toBeInTheDocument();
  });
});

describe("學生首頁（US1、US6-4）", () => {
  it("仍使用預設密碼時顯示不阻擋操作的修改建議與連結", async () => {
    mockApi({ "GET /api/auth/me": meAs(studentUser) });
    renderApp("/student");
    expect(await screen.findByText("等待老師開放題目")).toBeInTheDocument();
    expect(screen.getByText(/建議修改密碼/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "修改密碼" })).toHaveAttribute("href", "/account/password");
  });

  it("已改過密碼時不顯示修改建議", async () => {
    mockApi({ "GET /api/auth/me": meAs({ ...studentUser, usesDefaultPassword: false }) });
    renderApp("/student");
    expect(await screen.findByText("等待老師開放題目")).toBeInTheDocument();
    expect(screen.queryByText(/建議修改密碼/)).not.toBeInTheDocument();
  });
});
