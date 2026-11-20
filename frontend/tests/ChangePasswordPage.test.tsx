import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudentSummary } from "@se/shared";
import { meAs, mockApi, renderApp, studentUser, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillForm(current: string, next: string, confirm: string) {
  await userEvent.type(await screen.findByLabelText("目前密碼"), current);
  await userEvent.type(screen.getByLabelText("新密碼"), next);
  await userEvent.type(screen.getByLabelText("確認新密碼"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "更新密碼" }));
}

function postedPassword(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.some(([url, init]) => url === "/api/auth/password" && init?.method === "POST");
}

describe("修改密碼頁（US6）", () => {
  it("兩次新密碼不一致時顯示錯誤，且不呼叫 API", async () => {
    const fetchMock = mockApi({ "GET /api/auth/me": meAs(studentUser) });
    renderApp("/account/password");
    await fillForm("current-pass", "new-pass-123", "new-pass-999");
    expect(await screen.findByText("兩次輸入的新密碼不一致")).toBeInTheDocument();
    expect(postedPassword(fetchMock)).toBe(false);
  });

  it("PASSWORD_IS_DEFAULT 時顯示「不得與預設密碼相同」", async () => {
    mockApi({
      "GET /api/auth/me": meAs(studentUser),
      "POST /api/auth/password": () => ({
        status: 400,
        body: {
          error: {
            code: "PASSWORD_IS_DEFAULT",
            message: "新密碼不得與預設密碼相同",
            details: [{ field: "newPassword", message: "新密碼不得與預設密碼相同" }],
          },
        },
      }),
    });
    renderApp("/account/password");
    await fillForm("current-pass", "same-as-default", "same-as-default");
    expect((await screen.findAllByText("新密碼不得與預設密碼相同")).length).toBeGreaterThan(0);
  });

  it("WRONG_CURRENT_PASSWORD 時留在本頁顯示「目前密碼錯誤」，不被登出（分析 F1）", async () => {
    mockApi({
      "GET /api/auth/me": meAs(studentUser),
      "POST /api/auth/password": () => ({
        status: 401,
        body: {
          error: {
            code: "WRONG_CURRENT_PASSWORD",
            message: "目前密碼錯誤",
            details: [{ field: "currentPassword", message: "目前密碼錯誤" }],
          },
        },
      }),
    });
    renderApp("/account/password");
    await fillForm("typo-pass", "new-pass-123", "new-pass-123");
    expect((await screen.findAllByText("目前密碼錯誤")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("location")).toHaveTextContent("/account/password");
    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
  });

  it("成功時顯示成功訊息、清空欄位，學生首頁不再顯示修改建議", async () => {
    mockApi({
      "GET /api/auth/me": meAs(studentUser),
      "POST /api/auth/password": () => ({ status: 204 }),
    });
    renderApp("/account/password");
    await fillForm("current-pass", "new-pass-123", "new-pass-123");
    expect(await screen.findByText("密碼已更新。其他裝置上的登入已被登出。")).toBeInTheDocument();
    expect(screen.getByLabelText("新密碼")).toHaveValue("");
    await userEvent.click(screen.getByRole("link", { name: "回到首頁" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/student"));
    expect(screen.queryByText(/建議修改密碼/)).not.toBeInTheDocument();
  });
});

describe("學生清單的重設密碼（US6-3）", () => {
  const ming: StudentSummary = {
    studentId: "411000001",
    name: "王小明",
    group: null,
    usesDefaultPassword: false,
    createdAt: "2026-11-20T08:00:00.000Z",
  };

  it("需確認才呼叫重設 API，成功後顯示訊息並重新載入清單", async () => {
    let reset = false;
    const fetchMock = mockApi({
      "GET /api/auth/me": meAs(teacherUser),
      "GET /api/students": () => ({
        status: 200,
        body: { students: [{ ...ming, usesDefaultPassword: reset }] },
      }),
      "POST /api/students/411000001/reset-password": () => {
        reset = true;
        return { status: 204 };
      },
    });
    renderApp("/teacher/students");
    const row = await screen.findByTestId("student-411000001");
    expect(row).toHaveTextContent("已自訂密碼");

    await userEvent.click(within(row).getByRole("button", { name: "重設密碼" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "取消" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/reset-password"))).toBe(false);

    await userEvent.click(within(row).getByRole("button", { name: "重設密碼" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "確認重設" }));
    expect(await screen.findByText("已將 411000001（王小明）的密碼重設為預設密碼")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("student-411000001")).toHaveTextContent("仍使用預設密碼"));
  });
});
