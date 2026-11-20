import { useId, type InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** 有標籤與欄位錯誤訊息的輸入框。 */
export function TextField({ label, error, hint, id, className = "", ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-base text-ink focus:outline-2 focus:outline-primary ${error ? "border-danger" : "border-line"} ${className}`}
        {...props}
      />
      {error ? (
        <p id={messageId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
