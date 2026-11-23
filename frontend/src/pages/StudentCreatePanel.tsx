import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type StudentListItem } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';

export const groupLabel = (g: number | null) => (g === null ? '未分配' : `第 ${g} 組`);

const toApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '操作失敗，請稍後再試');

/** StudentCreatePanel：老師建立學生帳號（學號＋姓名）與學生清單（FR-010、FR-012、FR-026）。 */
export function StudentCreatePanel({
  onChanged,
  refreshKey = 0,
}: {
  onChanged?: () => void;
  refreshKey?: number;
}) {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [listError, setListError] = useState<ApiError | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listStudents();
      setStudents(res.students);
      setListError(null);
    } catch (err) {
      setListError(toApiError(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const onReset = async (st: StudentListItem) => {
    const ok = window.confirm(
      `確定要將 ${st.studentId} ${st.name} 的密碼重設為預設密碼嗎？該學生所有裝置都會被登出。`,
    );
    if (!ok) return;
    setResetting(st.studentId);
    setError(null);
    setSuccess(null);
    try {
      await api.resetPassword(st.studentId);
      setSuccess(`已將 ${st.studentId} ${st.name} 的密碼重設為預設密碼`);
      await refresh();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setResetting(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.createStudent(studentId, name);
      setSuccess(`已建立 ${res.student.studentId} ${res.student.name}`);
      setStudentId('');
      setName('');
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string) => (error?.field === field ? error.message : null);
  const fieldHint = (field: string) => (error?.field === field ? error.hint : null);

  return (
    <section
      className="rounded-xl border border-cream-300 bg-cream-100 p-4"
      aria-labelledby="student-create-title"
    >
      <h3 id="student-create-title" className="mb-3 text-lg font-bold">
        學生帳號
      </h3>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <TextField
          id="create-student-id"
          label="學號"
          value={studentId}
          onChange={setStudentId}
          autoComplete="off"
          error={fieldError('studentId')}
          hint={fieldHint('studentId')}
        />
        <TextField
          id="create-student-name"
          label="姓名"
          value={name}
          onChange={setName}
          autoComplete="off"
          error={fieldError('name')}
          hint={fieldHint('name')}
        />
        <Button type="submit" disabled={submitting} className="sm:mt-7">
          {submitting ? '建立中…' : '建立'}
        </Button>
      </form>
      <div className="mt-3 space-y-2">
        {error && !error.field ? <ErrorMessage message={error.message} hint={error.hint} /> : null}
        {success ? (
          <p
            role="status"
            className="rounded-md border border-primary/30 bg-cream-50 px-3 py-2 font-medium text-primary"
          >
            {success}
          </p>
        ) : null}
        <ErrorMessage message={listError?.message} hint={listError?.hint} />
      </div>

      <h4 className="mt-6 mb-2 font-bold">學生清單（{students.length} 人）</h4>
      {students.length === 0 ? (
        <p className="text-sm">尚未建立任何學生帳號</p>
      ) : (
        <div className="overflow-x-auto">
          <ul className="flex flex-col gap-2" aria-label="學生清單">
            <li
              className="hidden grid-cols-[8rem_1fr_6rem_6rem_7rem] gap-2 px-3 text-sm font-bold sm:grid"
              aria-hidden="true"
            >
              <span>學號</span>
              <span>姓名</span>
              <span>組別</span>
              <span>密碼</span>
              <span>操作</span>
            </li>
            {students.map((st) => (
              <li
                key={st.studentId}
                className="grid grid-cols-2 items-center gap-x-2 gap-y-1 rounded-md border border-cream-300 bg-cream-50 px-3 py-2 sm:grid-cols-[8rem_1fr_6rem_6rem_7rem]"
              >
                <span className="font-mono break-all">{st.studentId}</span>
                <span className="min-w-0 break-words">{st.name}</span>
                <span>{groupLabel(st.groupNumber)}</span>
                <span className="text-sm">{st.usingDefaultPassword ? '預設密碼' : '已自訂'}</span>
                <Button
                  variant="ghost"
                  className="col-span-2 text-sm sm:col-span-1"
                  disabled={resetting !== null}
                  aria-label={`重設 ${st.studentId} 的密碼`}
                  onClick={() => onReset(st)}
                >
                  {resetting === st.studentId ? '重設中…' : '重設密碼'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
