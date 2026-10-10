/// Строгая маска e-mail для восстановления по нику (A13): первый и последний
/// символ имени, первый символ домена и зона — `younaxo@icloud.com` →
/// `y***o@i*****.com`. Полный адрес по одному нику не раскрывается никогда.
export function maskEmailStrict(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const name =
    local.length <= 2 ? `${local[0] ?? ''}***` : `${local[0]}***${local[local.length - 1]}`;
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const zone = dot > 0 ? domain.slice(dot) : '';
  return `${name}@${host[0] ?? ''}*****${zone}`;
}
