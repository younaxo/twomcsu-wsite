import { Socket } from 'net';
import { decodeVarInt, encodeVarInt, encodeVarIntString } from './varint';

export interface SlpPlayerSample {
  name: string;
  id: string;
}

export interface SlpStatus {
  online: true;
  playerCount: number;
  maxPlayers: number;
  players: SlpPlayerSample[];
  versionName: string | null;
  protocol: number | null;
  motd: string | null;
  ping: number;
}

export interface SlpOffline {
  online: false;
  reason: string;
}

export type SlpResult = SlpStatus | SlpOffline;

function buildHandshakePacket(host: string, port: number): Buffer {
  const payload = Buffer.concat([
    encodeVarInt(0x00),
    encodeVarInt(-1), // protocol version — сервер отвечает статусом независимо от значения, -1 означает "не важно"
    encodeVarIntString(host),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(port, 0);
      return b;
    })(),
    encodeVarInt(0x01), // next state: status
  ]);
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

function buildStatusRequestPacket(): Buffer {
  const payload = encodeVarInt(0x00);
  return Buffer.concat([encodeVarInt(payload.length), payload]);
}

function buildPingPacket(payload: bigint): Buffer {
  const body = Buffer.alloc(8);
  body.writeBigInt64BE(payload, 0);
  const inner = Buffer.concat([encodeVarInt(0x01), body]);
  return Buffer.concat([encodeVarInt(inner.length), inner]);
}

/// Читает из накопленного буфера один полный пакет (VarInt length-prefix +
/// тело) — TCP может доставить данные несколькими фрагментами или
/// склеенными пакетами, поэтому буферизуем, пока не наберётся достаточно.
class PacketReader {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  tryReadPacket(): Buffer | null {
    const lengthResult = decodeVarInt(this.buffer, 0);
    if (!lengthResult) {
      return null;
    }
    const totalLength = lengthResult.bytesRead + lengthResult.value;
    if (this.buffer.length < totalLength) {
      return null;
    }
    const packet = this.buffer.subarray(lengthResult.bytesRead, totalLength);
    this.buffer = this.buffer.subarray(totalLength);
    return packet;
  }
}

/// Server List Ping (wiki.vg/Server_List_Ping) — реальный протокол, не
/// мок: handshake → status request → читаем JSON-ответ сервера, затем
/// ping/pong для измерения задержки. Не требует RCON/credentials — тот же
/// протокол, что использует ванильный клиент Minecraft в списке серверов.
export function pingServer(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<SlpResult> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const reader = new PacketReader();
    let settled = false;
    let stage: 'status' | 'ping' = 'status';
    let parsedStatus: Omit<SlpStatus, 'ping' | 'online'> | null = null;
    const pingPayload = BigInt(Date.now());
    const pingSentAt = Date.now();

    const finish = (result: SlpResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish({ online: false, reason: 'timeout' }));
    socket.once('error', (err) =>
      finish({ online: false, reason: err.message }),
    );

    socket.connect(port, host, () => {
      socket.write(buildHandshakePacket(host, port));
      socket.write(buildStatusRequestPacket());
    });

    socket.on('data', (chunk) => {
      reader.push(chunk);
      let packet = reader.tryReadPacket();
      while (packet) {
        if (stage === 'status') {
          const packetIdResult = decodeVarInt(packet, 0);
          if (!packetIdResult) {
            packet = reader.tryReadPacket();
            continue;
          }
          const jsonLengthResult = decodeVarInt(
            packet,
            packetIdResult.bytesRead,
          );
          if (!jsonLengthResult) {
            packet = reader.tryReadPacket();
            continue;
          }
          const jsonStart =
            packetIdResult.bytesRead + jsonLengthResult.bytesRead;
          const jsonBuf = packet.subarray(
            jsonStart,
            jsonStart + jsonLengthResult.value,
          );
          try {
            const parsed = JSON.parse(jsonBuf.toString('utf8'));
            parsedStatus = {
              playerCount: parsed?.players?.online ?? 0,
              maxPlayers: parsed?.players?.max ?? 0,
              players: Array.isArray(parsed?.players?.sample)
                ? parsed.players.sample.map(
                    (p: { name: string; id: string }) => ({
                      name: p.name,
                      id: p.id,
                    }),
                  )
                : [],
              versionName: parsed?.version?.name ?? null,
              protocol:
                typeof parsed?.version?.protocol === 'number'
                  ? parsed.version.protocol
                  : null,
              motd:
                typeof parsed?.description === 'string'
                  ? parsed.description
                  : (parsed?.description?.text ?? null),
            };
          } catch {
            finish({ online: false, reason: 'invalid_response' });
            return;
          }
          stage = 'ping';
          socket.write(buildPingPacket(pingPayload));
        } else {
          finish({
            ...(parsedStatus as Omit<SlpStatus, 'ping' | 'online'>),
            online: true,
            ping: Date.now() - pingSentAt,
          });
          return;
        }
        packet = reader.tryReadPacket();
      }
    });
  });
}
