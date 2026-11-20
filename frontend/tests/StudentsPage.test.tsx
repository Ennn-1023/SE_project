import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudentSummary } from "@se/shared";
import { bodyOf, meAs, mockApi, renderApp, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ming: StudentSummary = {
  studentId: "411000001",
  name: "王小明",
  group: "A",
  usesDefaultPassword: true,
  createdAt: "2026-11-20T08:00:00.000Z",
};

function studentsApi(initial: StudentSummary[]) {
  let list = [...initial];
  return mockApi({
    "GET /api/auth/me": meAs(teacherUser),
    "GET /api/students": () => ({ status: 200, body: { students: list } }),
    "POST /api/students": (init) => {
      const body = bodyOf(init) as { studentId: string; name: string; group?: string };
      if (list.some((s) => s.studentId === body.studentId)) {
        return {
          status: 409,
          body: { error: { code: "ACCOUNT_EXISTS", message: `學號 ${body.studentId} 已存在`, details: [{ field: "studentId", message: `學號 ${body.studentId} 已存在` }] } },
        };
      }
      const student = { ...ming, studentId: body.studentId, name: body.name, group: body.group || null };
      list = [...list, student];
      return { status: 201, body: { student } };
    },
    "DELETE /api/students/411000001": () => {
      list = list.filter((s) => s.studentId !== "411000001");
      return { status: 204 };
    },
  });
}

describe("學生帳號管理頁（US3）", () => {
  it("列出學生的學號、姓名、組別與是否仍用預設密碼", async () => {
    studentsApi([ming]);
    renderApp("/teacher/students");
    const row = await screen.findByTestId("student-411000001");
    expect(row).toHaveTextContent("王小明");
    expect(row).toHaveTextContent("A");
    expect(row).toHaveTextContent("預設密碼");
  });

  it("欄位錯誤在送出前顯示，不呼叫新增 API", async () => {
    const fetchMock = studentsApi([]);
    renderApp("/teacher/students");
    await userEvent.type(await screen.findByLabelText("學號"), "41100001");
    await userEvent.click(screen.getByRole("button", { name: "新增學生" }));
    expect(await screen.findByText("學號須為 9 位數字")).toBeInTheDocument();
    expect(screen.getByText("請輸入姓名")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/students" && init?.method === "POST")).toBe(false);
  });

  it("新增成功後顯示訊息並更新清單（US3-1）", async () => {
    studentsApi([]);
    renderApp("/teacher/students");
    await userEvent.type(await screen.findByLabelText("學號"), "411000002");
    await userEvent.type(screen.getByLabelText("姓名"), "李小華");
    await userEvent.click(screen.getByRole("button", { name: "新增學生" }));
    expect(await screen.findByText("已新增學生 411000002（李小華）")).toBeInTheDocument();
    expect(await screen.findByTestId("student-411000002")).toBeInTheDocument();
    expect(screen.getByLabelText("學號")).toHaveValue("");
  });

  it("學號已存在時顯示 409 錯誤（US3-2）", async () => {
    studentsApi([ming]);
    renderApp("/teacher/students");
    await userEvent.type(await screen.findByLabelText("學號"), "411000001");
    await userEvent.type(screen.getByLabelText("姓名"), "王小明");
    await userEvent.click(screen.getByRole("button", { name: "新增學生" }));
    expect(await screen.findAllByText("學號 411000001 已存在")).not.toHaveLength(0);
  });

  it("刪除前顯示確認對話框；取消不呼叫 API，確認才刪除（US3-7、US3-8）", async () => {
    const fetchMock = studentsApi([ming]);
    renderApp("/teacher/students");
    const row = await screen.findByTestId("student-411000001");

    await userEvent.click(within(row).getByRole("button", { name: "刪除" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("411000001");
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    await userEvent.click(within(row).getByRole("button", { name: "刪除" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "確認刪除" }));
    await waitFor(() => expect(screen.queryByTestId("student-411000001")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  });
});
