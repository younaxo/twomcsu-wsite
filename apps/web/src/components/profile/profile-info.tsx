import { CalendarDays, Cake, MapPin, Mars, NonBinary, Venus, type LucideIcon } from 'lucide-react';
import { formatDate } from '@/lib/format';

/// «Информация» профиля (ADR-0100) — метаданные отдельно от «О себе»: город,
/// день рождения, пол, дата регистрации. Данные уже отфильтрованы сервером по
/// приватности: чего нет в ответе — того и нет в блоке (ничего не выдумываем).

export interface ProfileBirthday {
  day: number;
  month: number;
  /// null — владелец показывает только день и месяц.
  year: number | null;
}

/// Пол — SVG-иконки lucide, не emoji. «Не указывать» не показывается.
export const GENDER_VIEW: Record<string, { label: string; icon: LucideIcon }> = {
  MALE: { label: 'Мужской', icon: Mars },
  FEMALE: { label: 'Женский', icon: Venus },
  OTHER: { label: 'Другой', icon: NonBinary },
};

export function formatBirthday(birthday: ProfileBirthday): string {
  const date = new Date(Date.UTC(birthday.year ?? 2000, birthday.month - 1, birthday.day));
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(birthday.year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(date);
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

export function ProfileInfoSection({
  city,
  country,
  birthday,
  gender,
  createdAt,
}: {
  city?: string | null;
  country?: string | null;
  birthday?: ProfileBirthday | null;
  gender?: string | null;
  createdAt?: string | null;
}) {
  const location = [city, country].filter(Boolean).join(', ');
  const genderView = gender ? GENDER_VIEW[gender] : undefined;
  const hasAny = Boolean(location || birthday || genderView || createdAt);
  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
      aria-label="Информация"
      data-testid="profile-info"
    >
      <h2 className="text-sm font-semibold">Информация</h2>
      {hasAny ? (
        <dl className="flex flex-col gap-2 text-sm">
          {location ? (
            <Row icon={MapPin} label="Город">
              {location}
            </Row>
          ) : null}
          {birthday ? (
            <Row icon={Cake} label="День рождения">
              {formatBirthday(birthday)}
            </Row>
          ) : null}
          {genderView ? (
            <Row icon={genderView.icon} label="Пол">
              {genderView.label}
            </Row>
          ) : null}
          {createdAt ? (
            <Row icon={CalendarDays} label="Регистрация">
              {`На twomc.su с ${formatDate(createdAt)}`}
            </Row>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Игрок не указал информацию о себе.</p>
      )}
    </section>
  );
}
