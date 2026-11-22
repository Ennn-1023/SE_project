import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DevStudent } from '@buzzer/shared';
import { api, ApiError, tokenStore } from '../api/client';

/** dev 專用：選擇 mock 學生登入（FR-024） */
export function DevLoginPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<DevStudent[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    api<DevStudent[]>('/api/dev/students')
      .then((list) => {
        setStudents(list);
        setSelected((cur) => cur || list[0]?.studentId || '');
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e : null));
  }, []);

  const login = async () => {
    setError(null);
    try {
      const res = await api<{ token: string }>('/api/dev/login', { body: { studentId: selected } });
      tokenStore.set(res.token);
      navigate('/');
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    }
  };

  return (
    <section className="card" aria-labelledby="dev-login-title">
      <h2 id="dev-login-title">開發用登入</h2>
      <p className="muted">選擇一位 mock 學生進入搶答頁（僅開發環境）。</p>
      <div className="field">
        <label htmlFor="dev-student">學生</label>
        <select
          id="dev-student"
          className="select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {students.map((s) => (
            <option key={s.studentId} value={s.studentId}>
              {s.studentId} {s.name}（{s.teamName ?? '未分組'}）
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="alert alert-error" role="alert">
          {error.message}
          {error.hint && `：${error.hint}`}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={login} disabled={!selected}>
        以此學生登入
      </button>
    </section>
  );
}
