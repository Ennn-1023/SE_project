import type { ReactNode } from 'react';

/** ErrorMessage（組件圖）：一致的錯誤訊息樣式，顯示原因與修正方式；children 可附加補充內容。 */
export interface ErrorMessageProps {
  message?: string | null;
  hint?: string | null;
  id?: string;
  children?: ReactNode;
}

export function ErrorMessage({ message, hint, id, children }: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      className="rounded-md border border-danger/40 bg-cream-100 px-3 py-2 text-danger break-words"
    >
      <p className="font-medium">{message}</p>
      {hint ? <p className="text-sm text-ink">{hint}</p> : null}
      {children}
    </div>
  );
}
