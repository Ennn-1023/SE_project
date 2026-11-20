import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { changePasswordInput, homePathFor, parseWith, type FieldError } from "@se/shared";
import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { ErrorMessage, SuccessMessage } from "../components/ErrorMessage";
import { Card, PageShell } from "../components/PageShell";
import { TextField } from "../components/TextField";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

function fieldMap(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

/** 修改密碼頁（US6、FR-017）：非強制，老師與學生皆可使用。 */
export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; hint?: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);
    const parsed = parseWith(changePasswordInput, form);
    if (!parsed.ok) {
      setFieldErrors(fieldMap(parsed.errors));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await api.post("/api/auth/password", parsed.data);
      setSuccess(true);
      setForm(EMPTY);
      if (user) setUser({ ...user, usesDefaultPassword: false });
    } catch (error) {
      // WRONG_CURRENT_PASSWORD 雖為 401，但不代表登入失效，留在本頁顯示（contracts/api.md）
      if (error instanceof ApiError) {
        setFieldErrors(fieldMap(error.details));
        setFormError({ message: error.message, hint: error.hint });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell narrow>
      <h1 className="mb-4 text-2xl font-bold">修改密碼</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {success ? <SuccessMessage message="密碼已更新。其他裝置上的登入已被登出。" /> : null}
          <ErrorMessage message={formError?.message} hint={formError?.hint} />
          <TextField
            label="目前密碼"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            error={fieldErrors.currentPassword}
          />
          <TextField
            label="新密碼"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            error={fieldErrors.newPassword}
            hint="8–64 個字元，不可與預設密碼相同"
          />
          <TextField
            label="確認新密碼"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            error={fieldErrors.confirmPassword}
          />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "更新中…" : "更新密碼"}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center">
        <Link to={homePathFor(user.role)} className="inline-flex min-h-11 items-center text-primary underline">
          回到首頁
        </Link>
      </p>
    </PageShell>
  );
}
