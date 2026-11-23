import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Layout } from '../components/Layout';
import { TextField } from '../components/TextField';

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, { message: string; hint?: string }>>;

/** ChangePasswordForm：修改自己的密碼（FR-024；學生與老師皆可）。 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!current) errors.currentPassword = { message: '請輸入目前密碼' };
    if (next.length < 8)
      errors.newPassword = { message: '新密碼至少 8 個字元', hint: '新密碼須為 8–64 個字元' };
    else if (next.length > 64)
      errors.newPassword = { message: '新密碼最多 64 個字元', hint: '新密碼須為 8–64 個字元' };
    if (next !== confirm)
      errors.confirmPassword = {
        message: '兩次輸入的新密碼不一致',
        hint: '請在兩個欄位輸入相同的新密碼',
      };
    setFieldErrors(errors);
    setError(null);
    setDone(false);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await api.changePassword(current, next, confirm);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '修改失敗，請稍後再試');
      if (
        apiErr.field === 'currentPassword' ||
        apiErr.field === 'newPassword' ||
        apiErr.field === 'confirmPassword'
      ) {
        setFieldErrors({ [apiErr.field]: { message: apiErr.message, hint: apiErr.hint } });
      } else {
        setError(apiErr);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="修改密碼">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-cream-300 bg-cream-100 p-4"
      >
        <TextField
          id="current-password"
          label="目前密碼"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          error={fieldErrors.currentPassword?.message}
          hint={fieldErrors.currentPassword?.hint}
        />
        <TextField
          id="new-password"
          label="新密碼"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          error={fieldErrors.newPassword?.message}
          hint={fieldErrors.newPassword?.hint}
        />
        <TextField
          id="confirm-password"
          label="再次輸入新密碼"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={fieldErrors.confirmPassword?.message}
          hint={fieldErrors.confirmPassword?.hint}
        />
        <p className="text-sm">新密碼須為 8–64 個字元，且不可與預設密碼相同。</p>
        <ErrorMessage message={error?.message} hint={error?.hint} />
        {done ? (
          <p
            role="status"
            className="rounded-md border border-accent/30 bg-cream-50 px-3 py-2 font-medium text-accent"
          >
            密碼已更新，下次登入請使用新密碼
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? '更新中…' : '更新密碼'}
        </Button>
      </form>
    </Layout>
  );
}
