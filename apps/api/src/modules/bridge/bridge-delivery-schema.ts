import {
  DELIVERY_ACK_MAX_ITEMS,
  DELIVERY_ACK_STATUSES,
  DELIVERY_CLAIM_MAX_DEFAULT,
  DELIVERY_CLAIM_MAX_LIMIT,
  DeliveryAckStatus,
} from './bridge.constants';
import { AckInput } from './bridge-delivery.service';

/// Строгий разбор тел `delivery/claim` и `delivery/ack` (0.13, ADR-0194):
/// точное множество ключей, закрытые форматы, никакого свободного текста.
/// Ошибка формы - 422 `invalid_envelope` для всего запроса.

type Parsed<T> = { ok: true; value: T } | { ok: false };

const JOB_ID = /^[A-Za-z0-9_-]{8,40}$/;
const CLAIM_TOKEN = /^[0-9a-fA-F-]{36}$/;
const CODE = /^[a-z0-9_]{1,48}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function onlyKeys(
  obj: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(obj);
  return (
    required.every((k) => keys.includes(k)) &&
    keys.every((k) => required.includes(k) || optional.includes(k))
  );
}

export function parseClaimBody(body: unknown): Parsed<{ max: number }> {
  if (!isPlainObject(body) || !onlyKeys(body, [], ['max'])) {
    return { ok: false };
  }
  if (body.max === undefined) {
    return { ok: true, value: { max: DELIVERY_CLAIM_MAX_DEFAULT } };
  }
  const max = body.max;
  if (
    typeof max !== 'number' ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > DELIVERY_CLAIM_MAX_LIMIT
  ) {
    return { ok: false };
  }
  return { ok: true, value: { max } };
}

export function parseAckBody(body: unknown): Parsed<{ results: AckInput[] }> {
  if (!isPlainObject(body) || !onlyKeys(body, ['results'])) {
    return { ok: false };
  }
  const list = body.results;
  if (
    !Array.isArray(list) ||
    list.length < 1 ||
    list.length > DELIVERY_ACK_MAX_ITEMS
  ) {
    return { ok: false };
  }
  const results: AckInput[] = [];
  const seen = new Set<string>();
  for (const item of list as unknown[]) {
    if (!isPlainObject(item)) return { ok: false };
    if (!onlyKeys(item, ['jobId', 'claimToken', 'status'], ['code'])) {
      return { ok: false };
    }
    const { jobId, claimToken, status, code } = item;
    if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) return { ok: false };
    if (typeof claimToken !== 'string' || !CLAIM_TOKEN.test(claimToken)) {
      return { ok: false };
    }
    if (
      typeof status !== 'string' ||
      !(DELIVERY_ACK_STATUSES as readonly string[]).includes(status)
    ) {
      return { ok: false };
    }
    if (code !== undefined && (typeof code !== 'string' || !CODE.test(code))) {
      return { ok: false };
    }
    if (seen.has(jobId)) return { ok: false };
    seen.add(jobId);
    results.push({
      jobId,
      claimToken,
      status: status as DeliveryAckStatus,
      code: typeof code === 'string' ? code : null,
    });
  }
  return { ok: true, value: { results } };
}
