import type {
  FinishInput,
  InfoMemory,
  FinishResult,
  InventoryAssemblyStore,
  OfferInput,
  OfferResult,
  ProbeResult,
} from './inventory-assembly.store';
import type { AssemblyMark } from './inventory-assembly.store';
import type { BufferedPart } from './inventory-parts';

/// Минимальный клиент Redis (ioredis подходит через тонкий адаптер).
/// `eval` — `EVAL script numKeys ...keys ...args`; `configGet` — значение
/// `CONFIG GET <name>` или `null`.
export interface InventoryRedisClient {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  configGet(name: string): Promise<string | null>;
  /// Сырой текст `INFO memory`.
  infoMemory(): Promise<string>;
}

const ROOT = 'bridge:inv:';

/// Ключи сервера содержат хэш-тег `{serverId}` (раздел 4.4): один слот в
/// Redis Cluster. Ключи игрока строятся от внутреннего `userId`, UUID в
/// ключах нет. Глобальные `g` и `gts` без тега требуют Redis без кластера.
export function assemblyKey(serverId: string, suffix: string): string {
  return `${ROOT}{${serverId}}:${suffix}`;
}
export const GLOBAL_KEY = `${ROOT}g`;
export const GLOBAL_TS_KEY = `${ROOT}gts`;

/// Общая часть скриптов. Первые пять KEYS: idx, idxb, svc, g, gts. Первые
/// шесть ARGV: префикс ключей сервера, now (мс), TTLsvc (мс), учёт одного
/// служебного ключа снимка (байт), запас учёта `g` (мс), serverId.
/// Скрипт использует ключи по префиксу внутри хэш-тега (как разрешено в
/// Cluster для одного слота).
const PRELUDE = `
local IDX, IDXB, SVC, G, GTS = KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5]
local P = ARGV[1]
local now = tonumber(ARGV[2])
local ttlSvc = tonumber(ARGV[3])
local svcUnit = tonumber(ARGV[4])
local gExtra = tonumber(ARGV[5])
local sid = ARGV[6]

local function alive(id) return redis.call('EXISTS', P .. 'asm:' .. id) == 1 end

local function dropAsm(id)
  local a = P .. 'asm:' .. id
  local u = redis.call('HGET', a, 'm:user')
  local gr = redis.call('HGET', a, 'm:group')
  if u and gr then redis.call('ZREM', P .. 'own:' .. u .. ':' .. gr, id) end
  redis.call('DEL', a)
  redis.call('ZREM', IDX, id)
  redis.call('HDEL', IDXB, id)
end

local function setMark(id, kind)
  redis.call('SET', P .. 'mark:' .. id, kind, 'PX', ttlSvc)
  redis.call('ZADD', SVC, now + ttlSvc, id)
end

local function cleanup()
  for _, id in ipairs(redis.call('ZRANGE', IDX, 0, -1)) do
    if not alive(id) then
      redis.call('ZREM', IDX, id)
      redis.call('HDEL', IDXB, id)
    end
  end
  redis.call('ZREMRANGEBYSCORE', SVC, '-inf', now)
  for _, s in ipairs(redis.call('ZRANGEBYSCORE', GTS, '-inf', now - ttlSvc - gExtra)) do
    redis.call('ZREM', GTS, s)
    redis.call('HDEL', G, s)
  end
end

local function bufferBytes()
  local sum = 0
  for _, v in ipairs(redis.call('HVALS', IDXB)) do sum = sum + tonumber(v) end
  return sum
end

local function svcBytes() return redis.call('ZCARD', SVC) * svcUnit end

local function recompute()
  redis.call('HSET', G, sid, bufferBytes() + svcBytes())
  redis.call('ZADD', GTS, now, sid)
  redis.call('PEXPIRE', G, 2 * ttlSvc)
  redis.call('PEXPIRE', GTS, 2 * ttlSvc)
  redis.call('PEXPIRE', IDX, ttlSvc)
  redis.call('PEXPIRE', IDXB, ttlSvc)
  redis.call('PEXPIRE', SVC, ttlSvc)
end

local function epochCmp(a, b)
  if a:match('^%d+$') and b:match('^%d+$') then
    a = a:gsub('^0+(%d)', '%1')
    b = b:gsub('^0+(%d)', '%1')
    if #a ~= #b then
      if #a < #b then return -1 end
      return 1
    end
  end
  if a < b then return -1 end
  if a > b then return 1 end
  return 0
end
`;

/// Шаги П4.1–П4.7. KEYS 6..11: done, mark, evt, lock, rl, asm.
const OFFER_BODY = `
local DONE, MARK, EVT, LOCK, RL, ASM = KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10], KEYS[11]
-- Аргументы собраны в одну таблицу: у функции Lua 5.1 не более 60 upvalue.
local a = {
  snapId = ARGV[7], token = ARGV[9], userArg = ARGV[10], probedLive = ARGV[11],
  n = ARGV[12], slotGroup = ARGV[13], hash = ARGV[14], slotsJson = ARGV[15],
  partBytes = tonumber(ARGV[16]), partsS = ARGV[17], group = ARGV[18], epoch = ARGV[19],
  rev = ARGV[20], cap = ARGV[21], online = ARGV[22], uh = ARGV[23], expected = ARGV[24],
  asmTtl = tonumber(ARGV[25]), lockTtl = tonumber(ARGV[26]),
  maxAsm = tonumber(ARGV[27]), maxBuf = tonumber(ARGV[28]), maxSvc = tonumber(ARGV[29]),
  maxServer = tonumber(ARGV[30]), maxGlobal = tonumber(ARGV[31]), maxServers = tonumber(ARGV[32]),
  rlMax = tonumber(ARGV[33]), ownMax = tonumber(ARGV[34]),
  maxAsmBytes = tonumber(ARGV[35]), overhead = tonumber(ARGV[36])
}
a.partsN = tonumber(a.partsS)

local function hget(f) return redis.call('HGET', ASM, f) end

local function isComplete()
  local wantCount = 0
  local want = {}
  for w in string.gmatch(a.expected, '[^,]+') do want[w] = true; wantCount = wantCount + 1 end
  local have, count = {}, 0
  for k = 1, a.partsN do
    local sg = hget('g:' .. k)
    if sg then
      if not want[sg] or have[sg] then return false end
      have[sg] = true
      count = count + 1
    end
  end
  return count == wantCount
end

-- Потолки памяти (раздел 4.4, «Память Redis»): буфер сервера, служебная
-- память, число серверов, доля сервера L(N), глобальный потолок. addBuf и
-- addSvc — прирост буфера и служебной памяти; для новой части уже
-- существующей сборки addSvc = 0. Возвращает причину отказа или nil.
-- Проверяется при создании сборки И при записи КАЖДОЙ новой части (M-1):
-- сборка растёт до 32 КБ после создания, а доля сервера L(N) за это время
-- могла сократиться (подключились другие серверы).
local function ceilings(addBuf, addSvc, creating)
  local buf = bufferBytes()
  if buf + addBuf > a.maxBuf then return 'ceiling_buffer' end
  local svcB = svcBytes()
  if addSvc > 0 and svcB + addSvc > a.maxSvc then return 'ceiling_service' end
  local nServers = redis.call('HLEN', G)
  if redis.call('HEXISTS', G, sid) == 0 then
    if creating and nServers >= a.maxServers then return 'ceiling_servers' end
    nServers = nServers + 1
  end
  local share = math.min(a.maxServer, math.floor(a.maxGlobal / nServers))
  if buf + svcB + addBuf + addSvc > share then return 'ceiling_server' end
  local total = 0
  for _, v in ipairs(redis.call('HVALS', G)) do total = total + tonumber(v) end
  local mine = tonumber(redis.call('HGET', G, sid) or '0')
  total = total - mine + buf + svcB + addBuf + addSvc
  if total > a.maxGlobal then return 'ceiling_global' end
  return nil
end

local function create()
  local userId = a.userArg
  if userId == '' then return {'rejected', 'invalid_data', 'no_user'} end
  local rl = tonumber(redis.call('GET', RL) or '0')
  if rl >= a.rlMax then return {'rejected', 'resync_required', 'rate'} end
  if redis.call('ZCARD', IDX) >= a.maxAsm then
    return {'rejected', 'resync_required', 'ceiling_assemblies'}
  end
  local over = ceilings(a.partBytes + a.overhead, svcUnit, true)
  if over then return {'rejected', 'resync_required', over} end

  -- Вытеснение самой старой по firstSeenAt: только после всех проверок.
  local OWN = P .. 'own:' .. userId .. ':' .. a.group
  for _, id in ipairs(redis.call('ZRANGE', OWN, 0, -1)) do
    if not alive(id) then redis.call('ZREM', OWN, id) end
  end
  while redis.call('ZCARD', OWN) >= a.ownMax do
    local oldest = redis.call('ZRANGE', OWN, 0, 0)[1]
    setMark(oldest, 'evicted')
    dropAsm(oldest)
    redis.call('ZREM', OWN, oldest)
  end

  redis.call('HSET', ASM, 'm:parts', a.partsS, 'm:group', a.group, 'm:epoch', a.epoch,
    'm:rev', a.rev, 'm:cap', a.cap, 'm:online', a.online, 'm:uh', a.uh, 'm:user', userId,
    'm:first', tostring(now), 'm:bytes', tostring(a.overhead))
  redis.call('PEXPIRE', ASM, a.asmTtl)
  redis.call('ZADD', IDX, now, a.snapId)
  redis.call('HSET', IDXB, a.snapId, a.overhead)
  redis.call('ZADD', OWN, now, a.snapId)
  redis.call('PEXPIRE', OWN, a.asmTtl)
  redis.call('ZADD', SVC, now + ttlSvc, a.snapId)
  if redis.call('INCR', RL) == 1 then redis.call('PEXPIRE', RL, 60000) end
  return nil
end

local function main()
  -- П4.2: done, evt, mark (между зондом и скриптом они могли появиться)
  if redis.call('EXISTS', DONE) == 1 then return {'duplicate'} end
  if redis.call('EXISTS', EVT) == 1 then return {'duplicate'} end
  local mk = redis.call('GET', MARK)
  if mk then
    if mk == 'poison' then return {'rejected', 'snapshot_mismatch', 'poisoned'} end
    if mk == 'evicted' then return {'rejected', 'resync_required', 'evicted'} end
    return {'stale'}
  end

  -- П4.3: сборки нет
  if redis.call('EXISTS', ASM) == 0 then
    if a.probedLive == '1' then return {'reprobe'} end
    local refusal = create()
    if refusal then return refusal end
  end
  local userId = hget('m:user')

  -- П4.4: заголовки и parts совпадают с meta
  if hget('m:parts') ~= a.partsS or hget('m:group') ~= a.group or hget('m:epoch') ~= a.epoch
    or hget('m:rev') ~= a.rev or hget('m:cap') ~= a.cap or hget('m:online') ~= a.online
    or hget('m:uh') ~= a.uh then
    setMark(a.snapId, 'poison')
    dropAsm(a.snapId)
    return {'rejected', 'snapshot_mismatch', 'header'}
  end

  -- П4.5: повтор части или запись новой
  local existing = hget('h:' .. a.n)
  if existing then
    if existing ~= a.hash then
      setMark(a.snapId, 'poison')
      dropAsm(a.snapId)
      return {'rejected', 'conflict', 'part_differs'}
    end
    if not isComplete() then return {'duplicate'} end
    -- полна, не применена: повтор завершающей части идёт к П4.7
  else
    for k = 1, a.partsN do
      if hget('g:' .. k) == a.slotGroup then
        setMark(a.snapId, 'poison')
        dropAsm(a.snapId)
        return {'rejected', 'conflict', 'slot_group_repeat'}
      end
    end
    local bytes = tonumber(hget('m:bytes'))
    if bytes - a.overhead + a.partBytes > a.maxAsmBytes then
      dropAsm(a.snapId)
      return {'rejected', 'invalid_data', 'assembly_too_large'}
    end
    -- M-1: рост сборки после создания не выходит за потолки и долю сервера.
    local over = ceilings(a.partBytes, 0, false)
    if over then
      dropAsm(a.snapId)
      return {'rejected', 'resync_required', over}
    end
    redis.call('HSET', ASM, 'p:' .. a.n, a.slotsJson, 'h:' .. a.n, a.hash, 'g:' .. a.n, a.slotGroup,
      'm:bytes', tostring(bytes + a.partBytes))
    redis.call('HSET', IDXB, a.snapId, bytes + a.partBytes)
    -- П4.6: неполный комплект; evt пишется после записи части
    if not isComplete() then
      redis.call('SET', EVT, '1', 'PX', ttlSvc)
      redis.call('ZADD', SVC, now + ttlSvc, a.snapId)
      return {'buffered'}
    end
  end

  -- П4.7: комплект полон, done нет: захват применения
  if not redis.call('SET', LOCK, a.token, 'NX', 'PX', a.lockTtl) then
    return {'lock_busy'}
  end
  local out = {'complete', userId}
  for k = 1, a.partsN do
    out[#out + 1] = tostring(k)
    out[#out + 1] = hget('g:' .. k) or ''
    out[#out + 1] = hget('p:' .. k) or ''
  end
  return out
end

cleanup()
local result = main()
recompute()
return result
`;

/// Шаг П6. KEYS 6..10: done, mark, evt, lock, asm.
const FINISH_BODY = `
local DONE, MARK, EVT, LOCK = KEYS[6], KEYS[7], KEYS[8], KEYS[9]
local snapId, token, outcome = ARGV[7], ARGV[9], ARGV[10]
local userId, group, epoch, rev = ARGV[11], ARGV[12], ARGV[13], tonumber(ARGV[14])

local function main()
  if redis.call('GET', LOCK) ~= token then return {'lock_lost'} end
  redis.call('DEL', LOCK)
  if outcome == 'retry' then return {'ok'} end
  if outcome == 'discard' then
    dropAsm(snapId)
    return {'ok'}
  end
  if outcome == 'applied' then
    redis.call('SET', DONE, '1', 'PX', ttlSvc)
  else
    redis.call('SET', MARK, 'stale', 'PX', ttlSvc)
  end
  redis.call('SET', EVT, '1', 'PX', ttlSvc)
  redis.call('ZADD', SVC, now + ttlSvc, snapId)
  dropAsm(snapId)
  if outcome == 'applied' then
    -- Сброс НЕПОЛНЫХ сборок игрока и группы с меньшей свежестью (epoch, rev).
    local OWN = P .. 'own:' .. userId .. ':' .. group
    for _, id in ipairs(redis.call('ZRANGE', OWN, 0, -1)) do
      if id ~= snapId and alive(id) then
        local a = P .. 'asm:' .. id
        local e = redis.call('HGET', a, 'm:epoch')
        local r = tonumber(redis.call('HGET', a, 'm:rev'))
        local c = epochCmp(e, epoch)
        if c < 0 or (c == 0 and r < rev) then
          setMark(id, 'superseded')
          dropAsm(id)
        end
      end
    end
  end
  return {'ok'}
end

cleanup()
local result = main()
recompute()
return result
`;

const PROBE_SCRIPT = `
local mk = redis.call('GET', KEYS[3])
return {
  redis.call('EXISTS', KEYS[1]),
  redis.call('EXISTS', KEYS[2]),
  mk or '',
  redis.call('EXISTS', KEYS[4])
}
`;

export const OFFER_SCRIPT = PRELUDE + OFFER_BODY;
export const FINISH_SCRIPT = PRELUDE + FINISH_BODY;
export { PROBE_SCRIPT };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    throw new Error('assembly: неожиданный ответ Redis');
  return value.map((v) => String(v));
}

function common(
  serverId: string,
  nowMs: number,
  ttlSvcMs: number,
  svcUnit: number,
  gExtraMs: number,
): { keys: string[]; args: string[] } {
  return {
    keys: [
      assemblyKey(serverId, 'idx'),
      assemblyKey(serverId, 'idxb'),
      assemblyKey(serverId, 'svc'),
      GLOBAL_KEY,
      GLOBAL_TS_KEY,
    ],
    args: [
      `${ROOT}{${serverId}}:`,
      String(nowMs),
      String(ttlSvcMs),
      String(svcUnit),
      String(gExtraMs),
      serverId,
    ],
  };
}

/// Реализация порта поверх Redis. Скрипты Lua здесь НЕ проверены
/// автоматически (нужен реальный Redis, в срезе 2 его нет): атомарность и
/// порядок шагов проверяются только на семантически эквивалентной модели в
/// памяти (риск и тест на локальном Redis — задача среза с приёмником).
export class RedisInventoryAssemblyStore implements InventoryAssemblyStore {
  constructor(private readonly redis: InventoryRedisClient) {}

  async probe(
    serverId: string,
    snapshotId: string,
    eventId: string,
  ): Promise<ProbeResult> {
    const raw = asStringArray(
      await this.redis.eval(
        PROBE_SCRIPT,
        4,
        assemblyKey(serverId, `done:${snapshotId}`),
        assemblyKey(serverId, `evt:${eventId}`),
        assemblyKey(serverId, `mark:${snapshotId}`),
        assemblyKey(serverId, `asm:${snapshotId}`),
      ),
    );
    const mark = raw[2];
    return {
      done: raw[0] === '1',
      evt: raw[1] === '1',
      mark:
        mark === 'poison' ||
        mark === 'evicted' ||
        mark === 'superseded' ||
        mark === 'stale'
          ? (mark as AssemblyMark)
          : null,
      live: raw[3] === '1',
    };
  }

  async offer(input: OfferInput): Promise<OfferResult> {
    const c = input.config;
    const base = common(
      input.serverId,
      input.nowMs,
      c.ttlSvcMs,
      c.serviceBytesPerSnapshot,
      c.globalEntryExtraMs,
    );
    const sid = input.serverId;
    const keys = [
      ...base.keys,
      assemblyKey(sid, `done:${input.snapshotId}`),
      assemblyKey(sid, `mark:${input.snapshotId}`),
      assemblyKey(sid, `evt:${input.eventId}`),
      assemblyKey(sid, `lock:${input.snapshotId}`),
      assemblyKey(sid, `rl:${input.userId ?? ''}`),
      assemblyKey(sid, `asm:${input.snapshotId}`),
    ];
    const h = input.header;
    const args = [
      ...base.args,
      input.snapshotId,
      input.eventId,
      input.token,
      input.userId ?? '',
      input.probedLive ? '1' : '0',
      String(input.part.n),
      input.part.slotGroup,
      input.part.hash,
      input.part.slotsJson,
      String(input.part.bytes),
      String(h.parts),
      h.group,
      h.epoch,
      String(h.rev),
      String(h.capturedAtMs),
      h.playerOnline ? '1' : '0',
      h.uuidHash,
      input.expectedGroups.join(','),
      String(c.assemblyTimeoutMs),
      String(c.lockTtlMs),
      String(c.maxAssembliesPerServer),
      String(c.maxBufferBytesPerServer),
      String(c.maxServiceBytesPerServer),
      String(c.maxServerBytes),
      String(c.maxGlobalBytes),
      String(c.maxServers),
      String(c.snapshotsPerMinute),
      String(c.assembliesPerPlayerGroup),
      String(c.maxAssembledBytes),
      String(c.assemblyOverheadBytes),
    ];
    const raw = asStringArray(
      await this.redis.eval(OFFER_SCRIPT, keys.length, ...keys, ...args),
    );
    return this.parseOffer(raw);
  }

  private parseOffer(raw: string[]): OfferResult {
    switch (raw[0]) {
      case 'buffered':
        return { kind: 'buffered' };
      case 'duplicate':
        return { kind: 'duplicate' };
      case 'stale':
        return { kind: 'stale' };
      case 'reprobe':
        return { kind: 'reprobe' };
      case 'lock_busy':
        return { kind: 'lock_busy' };
      case 'rejected':
        return {
          kind: 'rejected',
          code: raw[1] as 'invalid_data',
          reason: raw[2] ?? '',
        };
      case 'complete': {
        const parts: BufferedPart[] = [];
        for (let i = 2; i + 2 < raw.length; i += 3) {
          parts.push({
            part: Number(raw[i]),
            slotGroup: raw[i + 1],
            slotsJson: raw[i + 2],
          });
        }
        return { kind: 'complete', userId: raw[1], parts };
      }
      default:
        throw new Error('assembly: неожиданный ответ скрипта');
    }
  }

  async finish(input: FinishInput): Promise<FinishResult> {
    const c = input.config;
    const base = common(
      input.serverId,
      input.nowMs,
      c.ttlSvcMs,
      c.serviceBytesPerSnapshot,
      c.globalEntryExtraMs,
    );
    const sid = input.serverId;
    const keys = [
      ...base.keys,
      assemblyKey(sid, `done:${input.snapshotId}`),
      assemblyKey(sid, `mark:${input.snapshotId}`),
      assemblyKey(sid, `evt:${input.eventId}`),
      assemblyKey(sid, `lock:${input.snapshotId}`),
      assemblyKey(sid, `asm:${input.snapshotId}`),
    ];
    const args = [
      ...base.args,
      input.snapshotId,
      input.eventId,
      input.token,
      input.outcome,
      input.userId,
      input.group,
      input.epoch,
      String(input.rev),
    ];
    const raw = asStringArray(
      await this.redis.eval(FINISH_SCRIPT, keys.length, ...keys, ...args),
    );
    return raw[0] === 'ok' ? { ok: true } : { ok: false, reason: 'lock_lost' };
  }

  configGet(name: 'maxmemory-policy' | 'maxmemory'): Promise<string | null> {
    return this.redis.configGet(name);
  }

  async infoMemory(): Promise<InfoMemory> {
    const text = await this.redis.infoMemory();
    const fields = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) fields.set(line.slice(0, i), line.slice(i + 1).trim());
    }
    return {
      policy: fields.get('maxmemory_policy') ?? null,
      maxMemory: fields.get('maxmemory') ?? null,
    };
  }
}
