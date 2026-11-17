import {
  MAX_REASON_LENGTH,
  REDACTED,
  sanitizeLabel,
  sanitizeReason,
} from './text-sanitizer';

/// Всё, что считается IP или контактом, обязано исчезнуть из вывода.
function expectHidden(input: string, leaks: string[]) {
  const out = sanitizeReason(input) ?? '';
  for (const leak of leaks) {
    expect(out).not.toContain(leak);
  }
  expect(out).toContain(REDACTED);
}

describe('sanitizeReason: базовое поведение', () => {
  it('null, undefined и пустая строка дают null', () => {
    expect(sanitizeReason(null)).toBeNull();
    expect(sanitizeReason(undefined)).toBeNull();
    expect(sanitizeReason('')).toBeNull();
    expect(sanitizeReason('   \n\t ')).toBeNull();
  });

  it('обычный текст не меняется', () => {
    expect(sanitizeReason('Использование читов (killaura)')).toBe(
      'Использование читов (killaura)',
    );
  });

  it('сохраняет переводы строк и убирает лишние пустые', () => {
    expect(sanitizeReason('Первая\r\nвторая\n\n\n\nтретья')).toBe(
      'Первая\nвторая\n\nтретья',
    );
  });

  it('обрезает до 2048 символов', () => {
    const out = sanitizeReason('а'.repeat(5000)) as string;
    expect(Array.from(out).length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(Array.from(out).length).toBe(MAX_REASON_LENGTH);
  });

  it('не рвёт суррогатные пары при обрезке', () => {
    const out = sanitizeReason('😀'.repeat(3000)) as string;
    expect(Array.from(out).length).toBe(MAX_REASON_LENGTH);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('sanitizeReason: цветовые коды', () => {
  it.each([
    ['&cКрасный &lжирный&r конец', 'Красный жирный конец'],
    ['§aЗелёный§r', 'Зелёный'],
    ['&#FF8800Оранжевый', 'Оранжевый'],
    ['&x&f&f&8&8&0&0Hex', 'Hex'],
    ['§x§f§f§8§8§0§0Hex', 'Hex'],
    ['<#ff8800>Hex<#00ff00>', 'Hex'],
    ['{#ff8800}Hex', 'Hex'],
    ['одиночный § знак', 'одиночный знак'],
    ['＆cПолноширинный амперсанд', 'Полноширинный амперсанд'],
    ['&\u200Bc обход нулевой шириной', 'обход нулевой шириной'],
  ])('%p', (input, expected) => {
    expect(sanitizeReason(input)).toBe(expected);
  });
});

describe('sanitizeReason: управляющие и bidi-символы', () => {
  it.each([
    ['a\u202Ebc', 'abc'],
    ['a\u202Abc\u202C', 'abc'],
    ['a\u2066b\u2069c', 'abc'],
    ['a\u200Bb\u200Cc\u200Dd\uFEFFe', 'abcde'],
    ['a\u200Eb\u200Fc', 'abc'],
    ['a\u0000b\u0007c\u001Bd\u007Fe', 'abcde'],
    ['a\u0085b', 'a\nb'],
    ['мягкий\u00ADперенос', 'мягкийперенос'],
    ['a\u2060b', 'ab'],
    ['a\u{E0041}b', 'ab'],
    ['a\uFE0Fb', 'ab'],
  ])('%p -> %p', (input, expected) => {
    expect(sanitizeReason(input)).toBe(expected);
  });

  it('табуляция становится пробелом', () => {
    expect(sanitizeReason('a\tb')).toBe('a b');
  });
});

describe('sanitizeReason: IPv4', () => {
  it.each([
    ['бан за 192.168.0.1 вход', ['192.168.0.1']],
    ['ip 8.8.8.8', ['8.8.8.8']],
    ['IP:127.0.0.1', ['127.0.0.1']],
    ['с адреса 10.0.0.255:25565 зашёл', ['10.0.0.255', '25565']],
    ['сеть 192.168.1.0/24', ['192.168.1.0', '/24']],
    ['192 . 168 . 0 . 1', ['192', '168']],
    ['192,168,0,1', ['192,168']],
    ['192[.]168[.]0[.]1', ['192']],
    ['192(.)168(.)0(.)1', ['168']],
    ['192{dot}168{dot}0{dot}1', ['168']],
    ['192[dot]168[dot]0[dot]1', ['168']],
    ['192．168．0．1', ['168']],
    ['192。168。0。1', ['168']],
    ['192․168․0․1', ['168']],
    ['192·168·0·1', ['168']],
    ['１９２.１６８.０.１', ['168']],
    ['١٩٢.١٦٨.٠.١', ['168']],
    ['192\u200B.168.0.\u200B1', ['168']],
    ['1́.2.3.4', ['2.3']],
    ['&c192.&a168.&e0.&f1', ['168']],
    ['IP.1.2.3.4', ['1.2.3.4']],
    ['001.002.003.004', ['002']],
    ['маска 127.0.0.%', ['127.0.0']],
    ['маска 10.0.*', ['10.0']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });

  it('не трогает версии из трёх чисел и обычные числа', () => {
    expect(sanitizeReason('версия 1.20.4, 3 дня')).toBe('версия 1.20.4, 3 дня');
    expect(sanitizeReason('мут на 24 часа')).toBe('мут на 24 часа');
  });
});

describe('sanitizeReason: IPv6', () => {
  it.each([
    ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', ['2001', '7334']],
    ['2001:db8::1', ['db8']],
    ['ip 2001:db8:85a3::8a2e:370:7334 бан', ['85a3']],
    ['fe80::1', ['fe80']],
    ['::1', ['::1']],
    ['[2001:db8::1]:25565', ['db8', '25565']],
    ['[::1]', ['::1']],
    ['::ffff:192.168.0.1', ['192.168']],
    ['fe80::1%eth0', ['fe80', 'eth0']],
    ['ip:2001:db8::1', ['db8']],
    ['2001:DB8::ABCD', ['DB8']],
    ['2001：db8：：1', ['db8']],
    ['1:2:3:4:5:6:7:8', ['1:2:3']],
    ['2001:db8:0:0:0:0:0:1', ['db8']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });

  it('не трогает время и двоеточия в тексте', () => {
    expect(sanitizeReason('в 12:30:45 по МСК')).toBe('в 12:30:45 по МСК');
    expect(sanitizeReason('Причина: читы')).toBe('Причина: читы');
    expect(sanitizeReason('Примечание:: см. правила')).toBe(
      'Примечание:: см. правила',
    );
  });
});

describe('sanitizeReason: e-mail', () => {
  it.each([
    ['пиши user@example.com', ['user@', 'example']],
    ['USER.name+tag@Mail.Example.Org', ['USER', 'Example']],
    ['user [at] example [dot] com', ['example']],
    ['user(at)example(dot)com', ['example']],
    ['user{at}example{.}com', ['example']],
    ['user[@]example[.]com', ['example']],
    ['user ＠ example ． com', ['example']],
    ['user@пример.рф', ['пример']],
    ['u@x.co', ['u@x']],
    ['user\u200B@exa\u200Bmple.com', ['exa']],
    ['user@mail.ru, пиши', ['mail']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });
});

describe('sanitizeReason: URL и домены', () => {
  it.each([
    ['см. https://example.com/path?x=1', ['example', 'path']],
    ['http://1.2.3.4:8080/a', ['1.2.3.4']],
    ['hxxp://evil[.]com', ['evil']],
    ['www.example.com', ['example']],
    ['example.com', ['example']],
    ['EXAMPLE.COM', ['EXAMPLE']],
    ['пример.рф', ['пример']],
    ['заходи на cheats.ru/buy', ['cheats']],
    ['example[.]com', ['example']],
    ['example (dot) com', ['example']],
    ['example . com', ['example']],
    ['example。com', ['example']],
    ['sub.domain.example.org', ['domain']],
    ['discord.gg/abcdef', ['discord.gg', 'abcdef']],
    ['t.me/someone', ['someone']],
    ['vk.com/id123', ['id123']],
    ['mc.server.su:25565', ['server']],
    ['mailto:user@example.com', ['user@']],
    ['ftp://files.example.net', ['files']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });

  it('не трогает слова с точкой без доменной зоны', () => {
    expect(sanitizeReason('т.е. нарушение правил')).toBe(
      'т.е. нарушение правил',
    );
    expect(sanitizeReason('Нарушение. Повторное')).toBe('Нарушение. Повторное');
  });
});

describe('sanitizeReason: телефоны', () => {
  it.each([
    ['+7 (999) 123-45-67', ['999', '123']],
    ['8 999 123 45 67', ['999']],
    ['89991234567', ['9991234567']],
    ['+7.999.123.45.67', ['999']],
    ['+79991234567', ['9991234567']],
    ['+7-999-123-4567', ['999']],
    ['+٧ ٩٩٩ ١٢٣ ٤٥ ٦٧', ['999']],
    ['８９９９１２３４５６７', ['9991234567']],
    ['+1 555 1234', ['555']],
    ['звони 7 999 123 45 67 срочно', ['999']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });

  it('не трогает короткие числа и даты', () => {
    expect(sanitizeReason('бан на 30 дней')).toBe('бан на 30 дней');
    expect(sanitizeReason('дата 17.11.2026')).toBe('дата 17.11.2026');
    expect(sanitizeReason('дата 2026-11-17')).toBe('дата 2026-11-17');
  });
});

describe('sanitizeReason: контактные идентификаторы', () => {
  it.each([
    ['discord: SomeUser', ['SomeUser']],
    ['Discord - some_user', ['some_user']],
    ['дискорд: user', ['user']],
    ['дс = игрок2', ['игрок2']],
    ['тг @someone', ['someone']],
    ['tg: @someone_01', ['someone_01']],
    ['telegram:someone', ['someone']],
    ['вк: id12345', ['id12345']],
    ['skype: live.nick', ['live.nick']],
    ['whatsapp +123456789', ['123456789']],
    ['Player#1234', ['Player', '1234']],
    ['пиши @someone', ['someone']],
    ['@some.user_1', ['some.user_1']],
    ['почта: вася', ['вася']],
    ['телефон: 12345', ['12345']],
  ])('%p', (input, leaks) => {
    expectHidden(input, leaks);
  });

  it('не прячет обычные слова, совпадающие с названиями платформ без идентификатора', () => {
    expect(sanitizeReason('спам про discord в чате')).toBe(
      'спам про discord в чате',
    );
  });
});

describe('sanitizeReason: комбинации и устойчивость', () => {
  it('прячет несколько контактов в одном тексте', () => {
    const out = sanitizeReason(
      '&cЧиты. ip 1.2.3.4, mail a@b.com, дс: user, +7 999 123 45 67, https://x.io',
    ) as string;
    for (const leak of ['1.2.3.4', 'a@b', 'user', '999', 'x.io']) {
      expect(out).not.toContain(leak);
    }
    expect(out.startsWith('Читы.')).toBe(true);
  });

  it('вывод идемпотентен', () => {
    const once = sanitizeReason('ip 1.2.3.4 и &cчиты') as string;
    expect(sanitizeReason(once)).toBe(once);
  });

  it('контакт на границе обрезки входа не остаётся хвостом', () => {
    const out = sanitizeReason(`${'а '.repeat(2100)}user@example.com`) ?? '';
    expect(out).not.toContain('example');
  });

  it('вывод не содержит управляющих и bidi-символов', () => {
    const out = sanitizeReason('a\u202Eb\u0000c\u2067d\u200Be') as string;
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(
      /[\u0000-\u0008\u200B-\u200F\u202A-\u202E\u2066-\u2069]/,
    );
  });

  it.each([
    ['длинное слово', 'a'.repeat(4096)],
    ['цепочка меток', 'a.'.repeat(2048)],
    ['цифры и пробелы', '1 '.repeat(2048)],
    ['двоеточия', ':'.repeat(4096)],
    ['группы', 'ab:'.repeat(1365)],
    ['собаки', 'a@'.repeat(2048)],
    ['скобки', '[.'.repeat(2048)],
    ['цифры с точками', '1.'.repeat(2048)],
    ['метки платформ', 'ds '.repeat(1365)],
  ])('не зависает на %s', (_name, input) => {
    const started = Date.now();
    sanitizeReason(input);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe('sanitizeLabel', () => {
  it('склеивает строки в одну и убирает цвета и bidi', () => {
    expect(sanitizeLabel('&cAdmin\u202E\nName')).toBe('Admin Name');
  });

  it('прячет контакты в имени выдавшего', () => {
    expect(sanitizeLabel('Admin user@example.com') ?? '').not.toContain(
      'example',
    );
  });

  it('обрезает до 128 и возвращает null для пустого', () => {
    expect(Array.from(sanitizeLabel('x'.repeat(500)) as string).length).toBe(
      128,
    );
    expect(sanitizeLabel('&c')).toBeNull();
  });

  it('обычный ник не меняется', () => {
    expect(sanitizeLabel('TestPlayer_001')).toBe('TestPlayer_001');
  });
});

describe('sanitizeReason: IPv6 со встроенным IPv4 и портом (ревью HIGH-1)', () => {
  it.each([
    ['::ffff:1.2.3.4', ['1.2.3.4', 'ffff']],
    ['::ffff:10.0.0.5', ['10.0.0.5', '0.5']],
    ['64:ff9b::192.0.2.1', ['192.0.2.1', '2.1', '64:ff9b']],
    ['::192.0.2.1', ['192.0.2.1', '2.1']],
    ['[::ffff:1.2.3.4]:25565', ['1.2.3.4', '25565', '.4']],
    ['2001:db8::1:25565', ['25565', '2001', ':5']],
  ])('%p', (input, leaks) => {
    const out = sanitizeReason(input) ?? '';
    expect(out).toBe(REDACTED);
    for (const leak of leaks) expect(out).not.toContain(leak);
  });

  it('IPv6 внутри текста скрывается целиком, без хвоста', () => {
    expect(sanitizeReason('ip ::ffff:1.2.3.4 бан')).toBe(`ip ${REDACTED} бан`);
  });
});

describe('sanitizeReason: домены с любыми зонами (ревью MEDIUM-2)', () => {
  it.each([
    'a.fm',
    'a.gd',
    'a.sk',
    'a.fi',
    'a.se',
    'a.no',
    'a.dk',
    'a.at',
    'a.ch',
    'a.is',
    'a.moe',
    'a.lol',
    'a.page',
    'a.zip',
    'a.mov',
    'a.gay',
    'site.xn--p1ai',
    'cheats.zz',
  ])('%p скрывается', (input) => {
    expect(sanitizeReason(`заходи на ${input} там`)).toBe(
      `заходи на ${REDACTED} там`,
    );
  });

  it('обычный текст с точками не затрагивается', () => {
    expect(sanitizeReason('ban for hacking.')).toBe('ban for hacking.');
    expect(sanitizeReason('Banned for hacking. Appeal later.')).toBe(
      'Banned for hacking. Appeal later.',
    );
    expect(sanitizeReason('Грубое нарушение. Повторно.')).toBe(
      'Грубое нарушение. Повторно.',
    );
    expect(sanitizeReason('e.g. fly hacks, i.e. cheats')).toBe(
      'e.g. fly hacks, i.e. cheats',
    );
    expect(sanitizeReason('версия 1.20.4')).toBe('версия 1.20.4');
  });
});

describe('sanitizeReason: IPv4 с разделителями (ревью MEDIUM-3)', () => {
  it.each([
    ['192 168 1 1', ['192', '168']],
    ['1 9 2 . 1 6 8 . 0 . 1', ['1 9 2', '1 6 8']],
    ['192 dot 168 dot 0 dot 1', ['192', '168']],
    ['192-168-0-1', ['192', '168']],
    ['192_168_0_1', ['192', '168']],
    ['192/168/0/1', ['192', '168']],
    ['192 . 168 . 0 . 1', ['192', '168']],
  ])('%p', (input, leaks) => {
    const out = sanitizeReason(`ip ${input} бан`) ?? '';
    expect(out).toBe(`ip ${REDACTED} бан`);
    for (const leak of leaks) expect(out).not.toContain(leak);
  });

  it('обычные числа и даты не затрагиваются', () => {
    expect(sanitizeReason('бан на 1 2 3 4 дня')).toBe('бан на 1 2 3 4 дня');
    expect(sanitizeReason('дата 17-11-2024')).toBe('дата 17-11-2024');
    expect(sanitizeReason('счёт 2024 10 12')).toBe('счёт 2024 10 12');
    expect(sanitizeReason('значения 300 400 500')).toBe('значения 300 400 500');
  });
});
