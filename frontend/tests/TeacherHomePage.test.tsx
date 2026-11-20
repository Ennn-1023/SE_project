import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meAs, mockApi, renderApp, teacherUser } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("老師管理首頁（US2）", () => {
  it("顯示歡迎文字與前往學生帳號管理的連結", async () => {
    mockApi({ "GET /api/auth/me": meAs(teacherUser) });
    renderApp("/teacher");
    expect(await screen.findByRole("heading", { name: "老師管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /學生帳號管理/ })).toHaveAttribute("href", "/teacher/students");
  });
});
