import { useEffect, useState, type FormEvent } from 'react';
import { parseSheetLink, type SheetTab } from '@buzzer/shared';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';

export interface SheetLinkFormProps {
  /** 未連結 Google 時停用 */
  disabled: boolean;
  busy: boolean;
  /** 可選分頁（讀取後或 SHEET_TAB_NOT_FOUND 時提供） */
  sheets?: SheetTab[];
  selectedSheetId?: number;
  initialLink?: string;
  onSubmit: (link: string, sheetId: number | undefined) => void;
}

/** SheetLinkForm（組件圖 003-component、FR-008）：貼上學習單連結，前端先以 parseSheetLink 驗證。 */
export function SheetLinkForm({
  disabled,
  busy,
  sheets,
  selectedSheetId,
  initialLink = '',
  onSubmit,
}: SheetLinkFormProps) {
  const [link, setLink] = useState(initialLink);
  const [sheetId, setSheetId] = useState<number | undefined>(selectedSheetId);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);

  useEffect(() => setSheetId(selectedSheetId), [selectedSheetId]);
  useEffect(() => {
    if (initialLink) setLink(initialLink);
  }, [initialLink]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSheetLink(link);
    if (!parsed.ok) {
      setError({ message: parsed.message, hint: parsed.hint });
      return;
    }
    setError(null);
    onSubmit(link.trim(), sheets && sheets.length > 0 ? sheetId : undefined);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextField
        id="sheet-link"
        label="學習單連結"
        value={link}
        onChange={(v) => setLink(v)}
        error={error?.message}
        hint={error?.hint}
      />
      {sheets && sheets.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="sheet-tab" className="font-medium">
            分頁
          </label>
          <select
            id="sheet-tab"
            value={sheetId ?? ''}
            onChange={(e) => setSheetId(Number(e.target.value))}
            className="min-h-11 w-full min-w-0 rounded-md border border-cream-300 bg-cream-50 px-3 py-2"
          >
            {sheetId === undefined ? <option value="">請選擇分頁</option> : null}
            {sheets.map((s) => (
              <option key={s.sheetId} value={s.sheetId}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={disabled || busy}>
          {busy ? '讀取中…' : '讀取學習單'}
        </Button>
      </div>
    </form>
  );
}
