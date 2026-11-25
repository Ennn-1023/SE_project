import { useState } from 'react';
import { api, ApiError } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';

interface Props {
  disabled?: boolean;
}

/** ExportCsvButton（005 組件圖、contracts/ui-routes.md）：下載最近一場活動的結果 CSV */
export function ExportCsvButton({ disabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.downloadResultsCsv();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { message: e.message, hint: e.hint }
          : { message: '匯出失敗，請稍後再試' },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button variant="primary" disabled={disabled || busy} onClick={() => void download()}>
        {busy ? '匯出中…' : '匯出結果 CSV'}
      </Button>
      <ErrorMessage message={error?.message} hint={error?.hint} />
    </div>
  );
}
