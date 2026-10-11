import { Award } from 'lucide-react';
import { cn } from '@/lib/cn';
import { safeIcon } from '@/lib/achievements/hooks';

/// Иконка достижения (срез 5.7): картинка администрации или общий значок;
/// не полученное — приглушено.
export function AchievementIcon({
  iconUrl,
  completed,
  size = 'md',
}: {
  iconUrl: string;
  completed: boolean;
  size?: 'md' | 'lg';
}) {
  const src = safeIcon(iconUrl);
  const box = size === 'lg' ? 'size-16' : 'size-10';
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- иконка достижения с CDN/хранилища, задаёт администрация
    <img
      src={src}
      alt=""
      width={size === 'lg' ? 64 : 40}
      height={size === 'lg' ? 64 : 40}
      loading="lazy"
      className={cn(
        box,
        'shrink-0 rounded-md object-contain',
        !completed && 'opacity-40 grayscale',
      )}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        box,
        'flex shrink-0 items-center justify-center rounded-md',
        completed ? 'bg-primary-soft text-primary' : 'bg-surface-sunken text-muted-foreground',
      )}
    >
      <Award className={size === 'lg' ? 'size-8' : 'size-5'} />
    </span>
  );
}
