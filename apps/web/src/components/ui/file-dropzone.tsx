'use client';

import { CircleAlert, FileText, Upload, X } from 'lucide-react';
import {
  forwardRef,
  useId,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { buttonVariants, IconButton } from './button';

/// FileDropzone — выбор файлов: drag&drop-зона + скрытый `<input type="file">`
/// с настоящей кнопкой-label. Проверяет тип (`accept`) и размер (`maxSizeMb`),
/// показывает список выбранных с размером и удалением. Загрузку на сервер
/// НЕ делает — отдаёт `File[]` через `onFiles`.
/// `id`/`aria-*` попадают на input (так его оборачивает `Field`), `className` — на корень.

export interface FileDropzoneProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'onDrop' | 'onDragEnter' | 'onDragOver' | 'onDragLeave'
> {
  /// Как у `<input accept>`: «image/*», «.png,.jpg», «application/pdf».
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  /// Полный актуальный список после добавления или удаления.
  onFiles: (files: File[]) => void;
  /// Контролируемый список; без него компонент хранит список сам.
  files?: File[];
  disabled?: boolean;
  invalid?: boolean;
  /// Текст в зоне («Перетащите файлы сюда или»).
  label?: ReactNode;
  /// Подсказка о формате/размере под кнопкой.
  hint?: ReactNode;
  name?: string;
  buttonText?: string;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) {
    return true;
  }
  const rules = accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) {
      return name.endsWith(rule);
    }
    if (rule.endsWith('/*')) {
      return type.startsWith(rule.slice(0, -1));
    }
    return type === rule;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${formatNumber(bytes)} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(Math.round(bytes / 1024))} КБ`;
  }
  return `${formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10)} МБ`;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export const FileDropzone = forwardRef<HTMLDivElement, FileDropzoneProps>(
  (
    {
      accept,
      multiple = false,
      maxSizeMb,
      onFiles,
      files: filesProp,
      disabled = false,
      invalid,
      label = multiple ? 'Перетащите файлы сюда или' : 'Перетащите файл сюда или',
      hint,
      name,
      buttonText = multiple ? 'Выбрать файлы' : 'Выбрать файл',
      id: idProp,
      className,
      'aria-describedby': describedByProp,
      'aria-invalid': ariaInvalid,
      'aria-required': ariaRequired,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = idProp ?? generatedId;
    const errorId = `${inputId}-error`;
    const [internalFiles, setInternalFiles] = useState<File[]>([]);
    const files = filesProp ?? internalFiles;
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const dragDepthRef = useRef(0);
    const isInvalid = Boolean(invalid || ariaInvalid === true || ariaInvalid === 'true' || error);
    const describedBy =
      [describedByProp, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

    const update = (next: File[]) => {
      if (filesProp === undefined) {
        setInternalFiles(next);
      }
      onFiles(next);
    };

    const addFiles = (incoming: File[]) => {
      const problems: string[] = [];
      const accepted: File[] = [];
      const known = new Set(files.map(fileKey));
      for (const file of incoming) {
        if (!matchesAccept(file, accept)) {
          problems.push(`${file.name} — неподходящий тип`);
          continue;
        }
        if (maxSizeMb !== undefined && file.size > maxSizeMb * 1024 * 1024) {
          problems.push(`${file.name} — больше ${formatNumber(maxSizeMb)} МБ`);
          continue;
        }
        if (known.has(fileKey(file))) {
          continue;
        }
        known.add(fileKey(file));
        accepted.push(file);
      }
      if (accepted.length > 0) {
        update(multiple ? [...files, ...accepted] : accepted.slice(0, 1));
      }
      setError(
        problems.length > 0 ? `Не добавлено: ${problems.join('; ')}. Выберите другой файл.` : null,
      );
    };

    const removeAt = (index: number) => {
      update(files.filter((_, current) => current !== index));
      setError(null);
    };

    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled) {
        return;
      }
      dragDepthRef.current += 1;
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragging(false);
      }
    };
    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
      /// Без preventDefault браузер откроет файл вместо drop.
      event.preventDefault();
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragging(false);
      if (disabled) {
        return;
      }
      addFiles(Array.from(event.dataTransfer.files ?? []));
    };

    return (
      <div ref={ref} className={cn('flex flex-col gap-3', className)} {...props}>
        <div
          data-dragging={dragging ? '' : undefined}
          data-invalid={isInvalid ? '' : undefined}
          data-disabled={disabled ? '' : undefined}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center',
            'transition-[border-color,background-color] duration-fast',
            'data-[dragging]:border-primary data-[dragging]:bg-primary-soft/40',
            'data-[invalid]:border-destructive',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-60',
          )}
        >
          <Upload aria-hidden className="size-6 text-subtle-foreground" />
          <p className="text-sm text-muted-foreground">{label}</p>
          <input
            id={inputId}
            type="file"
            name={name}
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            aria-invalid={isInvalid || undefined}
            aria-required={ariaRequired}
            aria-describedby={describedBy}
            className="peer sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              /// Сброс — иначе повторный выбор того же файла не вызовет onChange.
              event.target.value = '';
            }}
          />
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'cursor-pointer',
              'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
              'peer-disabled:pointer-events-none peer-disabled:opacity-50',
            )}
          >
            {buttonText}
          </label>
          {hint ? <p className="text-xs text-subtle-foreground">{hint}</p> : null}
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs text-destructive"
          >
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        {files.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border-subtle rounded border border-border bg-surface">
            {files.map((file, index) => (
              <li
                key={fileKey(file)}
                className="flex items-center gap-3 py-1.5 pl-3 pr-1.5 text-sm"
              >
                <FileText aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {formatFileSize(file.size)}
                </span>
                <IconButton
                  size="sm"
                  aria-label={`Удалить ${file.name}`}
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
);
FileDropzone.displayName = 'FileDropzone';
