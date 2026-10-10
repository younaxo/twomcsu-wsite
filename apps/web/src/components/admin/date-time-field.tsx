'use client';

import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { isoToLocalParts, localPartsToIso } from '@/lib/site/local-datetime';

/// Дата + время в поясе администратора; хранение — ISO (UTC).
export function DateTimeField({
  label,
  value,
  fallbackTime,
  onChange,
}: {
  label: string;
  value: string | null;
  fallbackTime: string;
  onChange: (value: string | null) => void;
}) {
  const parts = isoToLocalParts(value);
  return (
    <div className="flex items-center gap-2">
      <DatePicker
        aria-label={`${label}: дата`}
        placeholder={label}
        value={parts.date}
        clearable
        onChange={(date) => onChange(date ? localPartsToIso(date, parts.time, fallbackTime) : null)}
      />
      <Input
        type="time"
        className="w-28"
        aria-label={`${label}: время`}
        value={parts.time}
        disabled={!parts.date}
        onChange={(event) =>
          parts.date && onChange(localPartsToIso(parts.date, event.target.value, fallbackTime))
        }
      />
    </div>
  );
}
