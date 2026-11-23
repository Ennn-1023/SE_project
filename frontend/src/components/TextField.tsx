import { ErrorMessage } from './ErrorMessage';

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'number';
  autoComplete?: string;
  error?: string | null;
  hint?: string | null;
  inputMode?: 'text' | 'numeric';
}

/** 表單欄位：label、輸入框與錯誤訊息，以 aria-invalid／aria-describedby 連結錯誤。 */
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  error,
  hint,
  inputMode,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-11 w-full min-w-0 rounded-md border bg-cream-50 px-3 py-2 text-ink focus:outline-2 focus:outline-accent ${
          error ? 'border-danger' : 'border-cream-300'
        }`}
      />
      <ErrorMessage id={errorId} message={error} hint={hint} />
    </div>
  );
}
