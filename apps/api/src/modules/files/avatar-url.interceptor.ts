import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { StorageService } from './storage.service';

/// Поля `avatar` в ответе → URL (ADR-0115). Связанные пользователи выбираются
/// через `PUBLIC_USER_SELECT` (ADR-0107) — в БД хранится ключ хранилища, а
/// клиенту нужен адрес; для ответов, где авторов много и они вложены (новости,
/// события), один перехватчик надёжнее правки каждого места. Трогает только
/// строковые поля с именем `avatar`; уже абсолютные адреса не меняются.
@Injectable()
export class AvatarUrlInterceptor implements NestInterceptor {
  constructor(private readonly storage: StorageService) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => this.walk(data, 0)));
  }

  private walk(value: unknown, depth: number): unknown {
    if (depth > 8 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value))
      return value.map((item) => this.walk(item, depth + 1));
    // Только простые объекты: Date, Decimal, Buffer и т.п. — как есть.
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return value;
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] =
        key === 'avatar' && typeof nested === 'string'
          ? this.storage.publicUrl(nested)
          : this.walk(nested, depth + 1);
    }
    return result;
  }
}
