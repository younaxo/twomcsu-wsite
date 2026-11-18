/// NODE_ENV fail-closed (ADR-0164): пустой/не заданный NODE_ENV и любое
/// неизвестное значение (staging и т. п.) считаются production. Ослабление
/// security-проверок допускается только при явных `development` или `test`.
export const RELAXED_NODE_ENVS: readonly string[] = ['development', 'test'];

export function isProductionLike(nodeEnv: string | undefined | null): boolean {
  const value = (nodeEnv ?? '').trim().toLowerCase();
  return !RELAXED_NODE_ENVS.includes(value);
}
