/// Кодирование/декодирование VarInt и VarInt-префиксованных строк —
/// Minecraft Server List Ping protocol (wiki.vg/Server_List_Ping).
/// Чистые функции без side-effects — легко unit-тестировать отдельно от
/// сетевого кода.

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let temp = v & 0b0111_1111;
    v >>>= 7;
    if (v !== 0) {
      temp |= 0b1000_0000;
    }
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

export interface VarIntReadResult {
  value: number;
  bytesRead: number;
}

/// Возвращает null, если в buffer (начиная с offset) недостаточно байт для
/// полного VarInt — вызывающий код должен подождать ещё данных из сокета.
export function decodeVarInt(
  buffer: Buffer,
  offset = 0,
): VarIntReadResult | null {
  let result = 0;
  let shift = 0;
  let position = offset;
  for (let i = 0; i < 5; i += 1) {
    if (position >= buffer.length) {
      return null;
    }
    const byte = buffer[position];
    position += 1;
    result |= (byte & 0b0111_1111) << shift;
    if ((byte & 0b1000_0000) === 0) {
      return { value: result >>> 0, bytesRead: position - offset };
    }
    shift += 7;
  }
  throw new Error('VarInt длиннее 5 байт — повреждённый пакет');
}

export function encodeVarIntString(value: string): Buffer {
  const content = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarInt(content.length), content]);
}
