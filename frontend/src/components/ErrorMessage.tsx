/** 顯示錯誤原因與修正方式（憲章原則 II）。 */
export function ErrorMessage({ message, hint }: { message?: string | null; hint?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger bg-danger-soft px-4 py-3 text-danger">
      <p className="font-semibold">{message}</p>
      {hint ? <p className="text-sm">{hint}</p> : null}
    </div>
  );
}

export function SuccessMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="rounded-lg border border-success bg-success-soft px-4 py-3 text-success">
      {message}
    </div>
  );
}
