// Строит fixtures/golden.json. Ожидаемые значения ЗАДАНЫ ВРУЧНУЮ (посчитаны на бумаге по CONTRACT.md),
// а не вычислены какой-либо реализацией: это независимый эталон. Запуск: node tools/build-golden.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOW = '2026-11-23T12:00:00Z';
const it = (id, productId, productType, unitPrice, quantity) => ({ id, productId, productType, unitPrice, quantity });
const bundle = (id, unitPrice, quantity) => ({ id, productId: null, productType: null, unitPrice, quantity });
const req = (items, extra = {}) => ({ now: NOW, userCompletedOrders: null, promoCode: null, items, ...extra });
// строка ответа: [cartItemId, productId, quantity, unitPrice, lineSubtotal, bulkDiscount, lineTotal]
const L = (a) => ({
  cartItemId: a[0], productId: a[1], quantity: a[2], unitPrice: a[3],
  lineSubtotal: a[4], bulkDiscount: a[5], lineTotal: a[6],
});
// ответ: lines, subtotal, bulkTotal, loyaltyPct, loyaltyTotal, promoTotal, promoErrorCode|null, discount, total
const ok = (lines, s, b, lp, lt, pt, pe, d, t) => ({
  status: 200,
  body: {
    lines: lines.map(L), subtotal: s, bulkDiscountTotal: b, loyaltyDiscountPercent: lp,
    loyaltyDiscountTotal: lt, promoDiscountTotal: pt, promoError: pe ? { code: pe } : null,
    discountAmount: d, total: t,
  },
});
const err = (code) => ({ status: 400, body: { code } });

const cases = [];
const add = (name, request, expected) => cases.push({ name, request, expected });

add('G01 одна позиция без скидок', req([it('i1', 'p010', 'BADGE', '199.99', 1)]),
  ok([['i1', 'p010', 1, '199.99', '199.99', '0', '199.99']], '199.99', '0', '0', '0', '0', null, '0', '199.99'));
add('G02 объём: процент (p001, 10 шт)', req([it('i1', 'p001', 'KEY', '10.00', 10)]),
  ok([['i1', 'p001', 10, '10', '100', '5', '95']], '100', '5', '0', '0', '0', null, '5', '95'));
add('G03 объём: берётся максимальная из двух (p001, 50 шт)', req([it('i1', 'p001', 'KEY', '2.00', 50)]),
  ok([['i1', 'p001', 50, '2', '100', '10', '90']], '100', '10', '0', '0', '0', null, '10', '90'));
add('G04 объём: фиксированная при minAmount (p002)', req([it('i1', 'p002', 'BADGE', '25.00', 5)]),
  ok([['i1', 'p002', 5, '25', '125', '15', '110']], '125', '15', '0', '0', '0', null, '15', '110'));
add('G05 объём: сумма ниже minAmount, скидки нет', req([it('i1', 'p002', 'BADGE', '10.00', 5)]),
  ok([['i1', 'p002', 5, '10', '50', '0', '50']], '50', '0', '0', '0', '0', null, '0', '50'));
add('G06 объём: minAmount включительно (ровно 100)', req([it('i1', 'p002', 'BADGE', '20.00', 5)]),
  ok([['i1', 'p002', 5, '20', '100', '15', '85']], '100', '15', '0', '0', '0', null, '15', '85'));
add('G07 объём по типу KEY, дробный результат', req([it('i1', 'p020', 'KEY', '33.33', 3)]),
  ok([['i1', 'p020', 3, '33.33', '99.99', '7.49925', '92.49075']], '99.99', '7.49925', '0', '0', '0', null, '7.49925', '92.49075'));
add('G08 объём: BONUS ведёт себя как фиксированная', req([it('i1', 'p030', 'PRIVILEGE', '30.00', 2)]),
  ok([['i1', 'p030', 2, '30', '60', '20', '40']], '60', '20', '0', '0', '0', null, '20', '40'));
add('G09 объём: фиксированная больше суммы строки ограничивается суммой', req([it('i1', 'p040', 'CURRENCY', '1.00', 100)]),
  ok([['i1', 'p040', 100, '1', '100', '100', '0']], '100', '100', '0', '0', '0', null, '100', '0'));
add('G10 объём: неактивное правило игнорируется', req([it('i1', 'p003', 'BADGE', '10.00', 1)]),
  ok([['i1', 'p003', 1, '10', '10', '0', '10']], '10', '0', '0', '0', '0', null, '0', '10'));
add('G11 набор (bundle): скидки за объём нет', req([bundle('i1', '500.00', 2)]),
  ok([['i1', null, 2, '500', '1000', '0', '1000']], '1000', '0', '0', '0', '0', null, '0', '1000'));
add('G12 две строки одного товара: количество по строкам, не суммарно',
  req([it('i1', 'p001', 'KEY', '10.00', 5), it('i2', 'p001', 'KEY', '10.00', 5)]),
  ok([['i1', 'p001', 5, '10', '50', '0', '50'], ['i2', 'p001', 5, '10', '50', '0', '50']], '100', '0', '0', '0', '0', null, '0', '100'));
add('G13 DECORATION 2.5 %', req([it('i1', 'p050', 'DECORATION', '40.00', 1)]),
  ok([['i1', 'p050', 1, '40', '40', '1', '39']], '40', '1', '0', '0', '0', null, '1', '39'));
add('G14 пустая корзина', req([]), ok([], '0', '0', '0', '0', '0', null, '0', '0'));

add('G20 лояльность 5 % (5 заказов)', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { userCompletedOrders: 5 }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '5', '5', '0', null, '5', '95'));
add('G21 лояльность 2.5 %, дробный результат', req([it('i1', 'p010', 'BADGE', '99.99', 1)], { userCompletedOrders: 1 }),
  ok([['i1', 'p010', 1, '99.99', '99.99', '0', '99.99']], '99.99', '0', '2.5', '2.49975', '0', null, '2.49975', '97.49025'));
add('G22 лояльность: неактивный тир пропускается (100 заказов -> 10 %)', req([it('i1', 'p010', 'BADGE', '200.00', 1)], { userCompletedOrders: 100 }),
  ok([['i1', 'p010', 1, '200', '200', '0', '200']], '200', '0', '10', '20', '0', null, '20', '180'));
add('G23 лояльность: 0 заказов, тира нет', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { userCompletedOrders: 0 }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', null, '0', '100'));

add('G30 промокод процент', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'SUMMER10' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '10', null, '10', '90'));
add('G31 промокод в нижнем регистре', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'summer10' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '10', null, '10', '90'));
add('G32 объём + лояльность + промокод (каскад)',
  req([it('i1', 'p001', 'KEY', '10.00', 10)], { userCompletedOrders: 5, promoCode: 'SUMMER10' }),
  ok([['i1', 'p001', 10, '10', '100', '5', '95']], '100', '5', '5', '4.75', '9.025', null, '18.775', '81.225'));
add('G33 промокод фиксированный, порог выполнен', req([it('i1', 'p010', 'BADGE', '150.00', 1)], { promoCode: 'FIX50' }),
  ok([['i1', 'p010', 1, '150', '150', '0', '150']], '150', '0', '0', '0', '50', null, '50', '100'));
add('G34 промокод ниже минимальной суммы (мягкий режим)', req([it('i1', 'p010', 'BADGE', '80.00', 1)], { promoCode: 'FIX50' }),
  ok([['i1', 'p010', 1, '80', '80', '0', '80']], '80', '0', '0', '0', '0', 'PROMO_MIN_AMOUNT', '0', '80'));
add('G35 промокод ниже минимальной суммы (строгий режим -> 400)', req([it('i1', 'p010', 'BADGE', '80.00', 1)], { promoCode: 'FIX50', softPromo: false }),
  err('PROMO_MIN_AMOUNT'));
add('G36 промокод KEYONLY: товар не KEY (мягко)', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'KEYONLY' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_NOT_APPLICABLE', '0', '100'));
add('G37 промокод KEYONLY: товар KEY', req([it('i1', 'p021', 'KEY', '50.00', 1)], { promoCode: 'KEYONLY' }),
  ok([['i1', 'p021', 1, '50', '50', '0', '50']], '50', '0', '0', '0', '10', null, '10', '40'));
add('G38 промокод KEYONLY: только набор -> не применим', req([bundle('i1', '100.00', 1)], { promoCode: 'KEYONLY' }),
  ok([['i1', null, 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_NOT_APPLICABLE', '0', '100'));
add('G39 FIRST15: 0 заказов -> действует', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { userCompletedOrders: 0, promoCode: 'FIRST15' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '15', null, '15', '85'));
add('G40 FIRST15: 2 заказа (мягко)', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { userCompletedOrders: 2, promoCode: 'FIRST15' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '2.5', '2.5', '0', 'PROMO_FIRST_PURCHASE_ONLY', '2.5', '97.5'));
add('G41 FIRST15: анонимный пользователь -> проверка пропускается', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'FIRST15' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '15', null, '15', '85'));
add('G42 промокод истёк', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'OLD1' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_EXPIRED', '0', '100'));
add('G43 промокод ещё не начался', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'FUTURE1' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_NOT_STARTED', '0', '100'));
add('G44 промокод исчерпан', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'USED10' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_EXHAUSTED', '0', '100'));
add('G45 промокод выключен', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'OFF1' }),
  ok([['i1', 'p010', 1, '100', '100', '0', '100']], '100', '0', '0', '0', '0', 'PROMO_NOT_FOUND', '0', '100'));
add('G46 промокод не существует (строго -> 400)', req([it('i1', 'p010', 'BADGE', '100.00', 1)], { promoCode: 'NOSUCH', softPromo: false }),
  err('PROMO_NOT_FOUND'));
add('G47 промокод BONUS ограничен суммой', req([it('i1', 'p010', 'BADGE', '3.00', 1)], { promoCode: 'BONUS5' }),
  ok([['i1', 'p010', 1, '3', '3', '0', '3']], '3', '0', '0', '0', '3', null, '3', '0'));
add('G48 промокод считается от суммы после лояльности и объёма',
  req([it('i1', 'p002', 'BADGE', '25.00', 5)], { userCompletedOrders: 20, promoCode: 'SUMMER10' }),
  // subtotal 125, bulk 15 -> 110; loyalty 10 % = 11 -> 99; promo 10 % = 9.9; discount 15+11+9.9 = 35.9; total 89.1
  ok([['i1', 'p002', 5, '25', '125', '15', '110']], '125', '15', '10', '11', '9.9', null, '35.9', '89.1'));

add('G60 валидация: количество 0', req([it('i1', 'p010', 'BADGE', '10.00', 0)]), err('VALIDATION'));
add('G61 валидация: цена с 3 знаками', req([it('i1', 'p010', 'BADGE', '10.001', 1)]), err('VALIDATION'));
add('G62 валидация: отрицательная цена', req([it('i1', 'p010', 'BADGE', '-1.00', 1)]), err('VALIDATION'));
add('G63 валидация: неизвестный тип товара', req([it('i1', 'p010', 'FOO', '1.00', 1)]), err('VALIDATION'));
add('G64 валидация: промокод с пробелом', req([it('i1', 'p010', 'BADGE', '1.00', 1)], { promoCode: 'A B' }), err('VALIDATION'));
add('G65 валидация: нет now', (() => { const r = req([it('i1', 'p010', 'BADGE', '1.00', 1)]); delete r.now; return r; })(), err('VALIDATION'));
add('G66 валидация: items не массив', req('x'), err('VALIDATION'));
add('G67 позиция: товар без типа', req([it('i1', 'p010', null, '1.00', 1)]), err('CART_ITEM_INVALID'));
add('G68 позиция: набор с типом', req([{ id: 'i1', productId: null, productType: 'KEY', unitPrice: '1.00', quantity: 1 }]), err('CART_ITEM_INVALID'));
add('G69 валидация: userCompletedOrders отрицательное', req([it('i1', 'p010', 'BADGE', '1.00', 1)], { userCompletedOrders: -1 }), err('VALIDATION'));
add('G70 валидация: цена в виде числа, не строки', req([{ id: 'i1', productId: 'p010', productType: 'BADGE', unitPrice: 1.5, quantity: 1 }]), err('VALIDATION'));

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'golden.json');
writeFileSync(out, JSON.stringify({ description: 'Golden-фикстуры (ожидания посчитаны вручную, см. tools/build-golden.mjs)', cases }, null, 2) + '\n');
console.log(`golden.json: ${cases.length} cases`);
