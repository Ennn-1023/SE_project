import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type GroupMember, type GroupOverview } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';

const toApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '操作失敗，請稍後再試');

interface BlockingGroup {
  groupNumber: number;
  members: GroupMember[];
}

function MemberRow({
  member,
  groupCount,
  current,
  disabled,
  onAssign,
}: {
  member: GroupMember;
  groupCount: number;
  current: number | null;
  disabled: boolean;
  onAssign: (studentId: string, groupNumber: number | null) => void;
}) {
  const selectId = `assign-${member.studentId}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cream-300 bg-cream-50 px-3 py-2">
      <span className="min-w-0 break-all">
        <span className="font-mono">{member.studentId}</span> {member.name}
      </span>
      <label htmlFor={selectId} className="sr-only">
        {member.studentId} {member.name} 的組別
      </label>
      <select
        id={selectId}
        value={current === null ? '' : String(current)}
        disabled={disabled}
        onChange={(e) =>
          onAssign(member.studentId, e.target.value === '' ? null : Number(e.target.value))
        }
        className="min-h-11 rounded-md border border-cream-300 bg-cream-100 px-2"
      >
        <option value="">未分配</option>
        {Array.from({ length: groupCount }, (_, i) => i + 1).map((g) => (
          <option key={g} value={String(g)}>
            第 {g} 組
          </option>
        ))}
      </select>
    </li>
  );
}

/** GroupManagePanel：設定組數、組別總覽與調整學生組別（US4、FR-031～FR-038）。 */
export function GroupManagePanel({
  refreshKey = 0,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<GroupOverview | null>(null);
  const [countInput, setCountInput] = useState('');
  const [countError, setCountError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.groupOverview();
      setData(res);
      setCountInput(String(res.groupCount));
    } catch (err) {
      setError(toApiError(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const onSetCount = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = countInput.trim();
    const n = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || n > 50) {
      setCountError('組數必須是 0–50 的整數');
      return;
    }
    setCountError(null);
    setError(null);
    setBusy(true);
    try {
      await api.setGroupCount(n);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (studentId: string, groupNumber: number | null) => {
    setError(null);
    setBusy(true);
    try {
      await api.assignGroup(studentId, groupNumber);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const blocking = (error?.details?.blockingGroups as BlockingGroup[] | undefined) ?? [];
  const groupCount = data?.groupCount ?? 0;

  return (
    <section
      className="rounded-xl border border-cream-300 bg-cream-100 p-4"
      aria-labelledby="group-manage-title"
    >
      <h3 id="group-manage-title" className="mb-3 text-lg font-bold">
        組別管理
      </h3>
      <form
        onSubmit={onSetCount}
        noValidate
        className="grid gap-3 sm:grid-cols-[12rem_auto] sm:items-start"
      >
        <TextField
          id="group-count"
          label="組數（0–50）"
          value={countInput}
          onChange={setCountInput}
          inputMode="numeric"
          error={countError}
          hint={countError ? '請輸入 0 到 50 之間的整數' : null}
        />
        <Button type="submit" disabled={busy} className="sm:mt-7">
          更新組數
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <ErrorMessage message={error.message} hint={error.hint}>
            {blocking.length > 0 ? (
              <ul className="mt-1 text-sm text-ink">
                {blocking.map((g) => (
                  <li key={g.groupNumber}>
                    第 {g.groupNumber} 組：
                    {g.members.map((m) => `${m.studentId} ${m.name}`).join('、')}
                  </li>
                ))}
              </ul>
            ) : null}
          </ErrorMessage>
        </div>
      ) : null}

      {data === null ? (
        <p className="mt-4">載入中…</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {groupCount === 0 ? <p className="lg:col-span-2">尚未設定組別</p> : null}
          {data.groups.map((g) => (
            <div key={g.groupNumber} className="rounded-lg border border-cream-300 bg-cream-50 p-3">
              <h4 className="mb-2 font-bold">
                第 {g.groupNumber} 組（{g.memberCount} 人）
              </h4>
              {g.members.length === 0 ? (
                <p className="text-sm">目前沒有成員</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {g.members.map((m) => (
                    <MemberRow
                      key={m.studentId}
                      member={m}
                      groupCount={groupCount}
                      current={g.groupNumber}
                      disabled={busy}
                      onAssign={onAssign}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="rounded-lg border border-accent bg-cream-50 p-3 lg:col-span-2">
            <h4 className="mb-2 font-bold">未分組（{data.unassigned.length} 人）</h4>
            {data.unassigned.length === 0 ? (
              <p className="text-sm">所有學生都已分組</p>
            ) : (
              <ul className="grid gap-2 lg:grid-cols-2">
                {data.unassigned.map((m) => (
                  <MemberRow
                    key={m.studentId}
                    member={m}
                    groupCount={groupCount}
                    current={null}
                    disabled={busy}
                    onAssign={onAssign}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
