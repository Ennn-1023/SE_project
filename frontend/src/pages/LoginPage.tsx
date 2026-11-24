import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError, type Role } from '../api/apiClient';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';

export const homePathFor = (role: Role) => (role === 'TEACHER' ? '/teacher' : '/student');

interface FieldErrors {
  account?: string;
  password?: string;
}

/** LoginPage：學號／帳號與密碼登入，成功後依角色導向（FR-017）。 */
export function LoginPage() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={homePathFor(user.role)} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!account.trim()) errors.account = '請輸入學號或帳號';
    if (!password) errors.password = '請輸入密碼';
    setFieldErrors(errors);
    setError(null);
    if (errors.account || errors.password) return;

    setSubmitting(true);
    try {
      const res = await api.login(account, password);
      setUser(res.user);
      navigate(homePathFor(res.user.role), { replace: true });
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '登入失敗，請稍後再試');
      setError(apiErr);
      if (apiErr.field === 'account' || apiErr.field === 'password') {
        setFieldErrors({ [apiErr.field]: apiErr.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-cream-50 px-4 py-10 text-ink sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-cream-300 bg-cream-100 p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold">課程搶答系統</h1>
        <p className="mb-6 text-sm">請以學號（老師請用老師帳號）與密碼登入</p>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            id="login-account"
            label="學號／帳號"
            value={account}
            onChange={setAccount}
            autoComplete="username"
            error={fieldErrors.account}
          />
          <TextField
            id="login-password"
            label="密碼"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            error={fieldErrors.password}
          />
          {error && !error.field ? (
            <ErrorMessage message={error.message} hint={error.hint} />
          ) : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '登入中…' : '登入'}
          </Button>
        </form>
      </div>
    </div>
  );
}
