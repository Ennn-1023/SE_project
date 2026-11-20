import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { homePathFor, loginInput, parseWith, type FieldError, type LoginResponse } from "@se/shared";
import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { ErrorMessage } from "../components/ErrorMessage";
import { Card, LoadingScreen, PageShell } from "../components/PageShell";
import { TextField } from "../components/TextField";

function fieldMap(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

/** 登入頁（US1、US2、spec FR-007、FR-008、FR-011）。 */
export function LoginPage() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; hint?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const expired = searchParams.get("reason") === "expired";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseWith(loginInput, { username, password });
    if (!parsed.ok) {
      setFieldErrors(fieldMap(parsed.errors));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await api.post<LoginResponse>("/api/auth/login", parsed.data);
      setUser(result.user);
      navigate(result.redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.details.length > 0) setFieldErrors(fieldMap(error.details));
        setFormError({ message: error.message, hint: error.hint });
      } else {
        setFormError({ message: "系統發生錯誤，請稍後再試" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell narrow>
      <h1 className="mb-6 text-center text-2xl font-bold">課程搶答系統</h1>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {expired && !formError ? (
            <ErrorMessage message="登入已逾時，請重新登入" hint="請重新輸入學號與密碼" />
          ) : null}
          <ErrorMessage message={formError?.message} hint={formError?.hint} />
          <TextField
            label="學號或帳號"
            name="username"
            autoComplete="username"
            inputMode="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={fieldErrors.username}
            hint="學生請輸入 9 位數字學號"
          />
          <TextField
            label="密碼"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "登入中…" : "登入"}
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}
