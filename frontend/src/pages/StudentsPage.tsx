import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { createStudentInput, parseWith, type FieldError, type StudentSummary } from "@se/shared";
import { ApiError, api } from "../api/client";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorMessage, SuccessMessage } from "../components/ErrorMessage";
import { Card, PageShell } from "../components/PageShell";
import { TextField } from "../components/TextField";

type Notice = { kind: "success"; message: string } | { kind: "error"; message: string; hint?: string };

interface PendingAction {
  kind: "delete" | "reset";
  student: StudentSummary;
}

const DIALOG = {
  delete: {
    title: "刪除學生帳號",
    confirmLabel: "確認刪除",
    message: (s: StudentSummary) =>
      `確定要刪除學生 ${s.studentId}（${s.name}）嗎？刪除後該學生無法登入，需重新新增。`,
  },
  reset: {
    title: "重設學生密碼",
    confirmLabel: "確認重設",
    message: (s: StudentSummary) =>
      `確定要將 ${s.studentId}（${s.name}）的密碼重設為預設密碼嗎？該學生所有裝置會被登出。`,
  },
} as const;

function fieldMap(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

/** 學生帳號管理頁（US3：新增、清單、刪除；US6：重設密碼）。 */
export function StudentsPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ studentId: "", name: "", group: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await api.get<{ students: StudentSummary[] }>("/api/students");
      setStudents(data.students);
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError) setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const parsed = parseWith(createStudentInput, form);
    if (!parsed.ok) {
      setFieldErrors(fieldMap(parsed.errors));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const { student } = await api.post<{ student: StudentSummary }>("/api/students", {
        studentId: parsed.data.studentId,
        name: parsed.data.name,
        group: parsed.data.group ?? "",
      });
      setNotice({ kind: "success", message: `已新增學生 ${student.studentId}（${student.name}）` });
      setForm({ studentId: "", name: "", group: "" });
      await reload();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(fieldMap(error.details));
        setNotice({ kind: "error", message: error.message, hint: error.hint });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    const { student, kind } = pending;
    try {
      if (kind === "delete") {
        await api.delete(`/api/students/${student.studentId}`);
        setNotice({ kind: "success", message: `已刪除學生 ${student.studentId}（${student.name}）` });
      } else {
        await api.post(`/api/students/${student.studentId}/reset-password`);
        setNotice({
          kind: "success",
          message: `已將 ${student.studentId}（${student.name}）的密碼重設為預設密碼`,
        });
      }
      await reload();
    } catch (error) {
      if (error instanceof ApiError) setNotice({ kind: "error", message: error.message, hint: error.hint });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const cancelPending = useCallback(() => setPending(null), []);

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">學生帳號管理</h1>
        <Link to="/teacher" className="inline-flex min-h-11 items-center text-primary underline">
          回老師管理
        </Link>
      </div>

      <div className="mb-4">
        {notice?.kind === "success" ? <SuccessMessage message={notice.message} /> : null}
        {notice?.kind === "error" ? <ErrorMessage message={notice.message} hint={notice.hint} /> : null}
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">新增學生</h2>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleCreate} noValidate>
          <TextField
            label="學號"
            inputMode="numeric"
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            error={fieldErrors.studentId}
            hint="9 位數字"
          />
          <TextField
            label="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={fieldErrors.name}
          />
          <TextField
            label="組別（選填）"
            value={form.group}
            onChange={(e) => setForm({ ...form, group: e.target.value })}
            error={fieldErrors.group}
          />
          <div className="sm:col-span-3">
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "新增中…" : "新增學生"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-sm text-ink-soft">新增的學生以學號登入，密碼為全班共用的預設密碼。</p>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">學生清單（{students.length} 人）</h2>
      <ErrorMessage message={loadError} />
      {students.length === 0 && !loadError ? (
        <p className="text-ink-soft">目前還沒有學生帳號。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {students.map((student) => (
            <li
              key={student.studentId}
              data-testid={`student-${student.studentId}`}
              className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap gap-x-3 font-semibold">
                  <span className="font-mono">{student.studentId}</span>
                  <span>{student.name}</span>
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm text-ink-soft">
                  <span>組別：{student.group ?? "未指定"}</span>
                  <span>{student.usesDefaultPassword ? "仍使用預設密碼" : "已自訂密碼"}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setPending({ kind: "reset", student })}>
                  重設密碼
                </Button>
                <Button variant="ghost" onClick={() => setPending({ kind: "delete", student })}>
                  刪除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? DIALOG[pending.kind].title : ""}
        message={pending ? DIALOG[pending.kind].message(pending.student) : ""}
        confirmLabel={pending ? DIALOG[pending.kind].confirmLabel : ""}
        busy={busy}
        onConfirm={() => void confirmPending()}
        onCancel={cancelPending}
      />
    </PageShell>
  );
}
