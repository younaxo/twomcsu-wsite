// Вариант (c): Rust (axum + tokio + rust_decimal). Контракт - ../../CONTRACT.md.
// НЕ СОБИРАЛОСЬ ЛОКАЛЬНО (тулчейн Rust на ПК запрещён правилами; сборка только на VDS-раннере в Docker).
// Источник данных - fixtures/dataset.json в памяти; DB_LATENCY_MS моделирует обращения к БД (скидки: одно на корзину).
use std::cmp::min;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use rust_decimal::Decimal;
use serde_json::{json, Value};

type Resp = (StatusCode, Value);
type R<T> = Result<T, Resp>;

fn bad(code: &str) -> Resp {
    (StatusCode::BAD_REQUEST, json!({ "code": code, "message": code }))
}

const PRODUCT_TYPES: [&str; 11] = [
    "PRIVILEGE", "KEY", "SUBSCRIPTION", "BADGE", "BATTLE_PASS", "BATTLE_PASS_BOOSTER",
    "UNMUTE", "UNBAN", "CURRENCY", "DECORATION", "BUNDLE",
];

// ---------- арифметика (проверяемые операции; переполнение -> 400) ----------

fn mulr(a: Decimal, b: Decimal) -> R<Decimal> {
    a.checked_mul(b).ok_or_else(|| bad("VALIDATION"))
}
fn addr(a: Decimal, b: Decimal) -> R<Decimal> {
    a.checked_add(b).ok_or_else(|| bad("VALIDATION"))
}
fn subr(a: Decimal, b: Decimal) -> R<Decimal> {
    a.checked_sub(b).ok_or_else(|| bad("VALIDATION"))
}
fn div100(a: Decimal) -> R<Decimal> {
    a.checked_div(Decimal::ONE_HUNDRED).ok_or_else(|| bad("VALIDATION"))
}
/// Канонический вид (CONTRACT.md): без хвостовых нулей и экспоненты.
fn money(d: Decimal) -> Value {
    Value::String(d.normalize().to_string())
}
fn pct_or_fixed(kind: &str, value: Decimal, amount: Decimal) -> R<Decimal> {
    if kind == "PERCENT" {
        div100(mulr(amount, value)?)
    } else {
        Ok(min(value, amount))
    }
}

// ---------- данные ----------

struct BulkRule {
    min_quantity: i64,
    min_amount: Option<Decimal>,
    discount_type: String,
    discount_value: Decimal,
}
struct Tier {
    min_purchases: i64,
    percent: Decimal,
}
struct Promo {
    discount_type: String,
    discount_value: Decimal,
    max_uses: Option<i64>,
    used_count: i64,
    valid_from: Option<String>,
    valid_until: Option<String>,
    is_active: bool,
    applicable_to_types: Vec<String>,
    min_order_amount: Option<Decimal>,
    first_purchase_only: bool,
}

struct Store {
    rules: Vec<BulkRule>,
    by_product: HashMap<String, Vec<usize>>,
    by_type: HashMap<String, Vec<usize>>,
    tiers: Vec<Tier>, // активные, по убыванию min_purchases
    promos: HashMap<String, Promo>,
    latency: Duration,
}

fn dec_opt(v: &Value) -> Option<Decimal> {
    v.as_str().map(|s| Decimal::from_str(s).expect("decimal в dataset"))
}

impl Store {
    fn load(path: &str, latency_ms: u64) -> Store {
        let text = std::fs::read_to_string(path).expect("чтение dataset");
        let raw: Value = serde_json::from_str(&text).expect("JSON dataset");
        let mut rules = Vec::new();
        let mut by_product: HashMap<String, Vec<usize>> = HashMap::new();
        let mut by_type: HashMap<String, Vec<usize>> = HashMap::new();
        for r in raw["bulkDiscounts"].as_array().expect("bulkDiscounts") {
            if !r["isActive"].as_bool().unwrap_or(false) {
                continue; // where isActive = true делает «БД»
            }
            let idx = rules.len();
            rules.push(BulkRule {
                min_quantity: r["minQuantity"].as_i64().unwrap_or(0),
                min_amount: dec_opt(&r["minAmount"]),
                discount_type: r["discountType"].as_str().unwrap_or("").to_string(),
                discount_value: dec_opt(&r["discountValue"]).expect("discountValue"),
            });
            if let Some(p) = r["productId"].as_str() {
                by_product.entry(p.to_string()).or_default().push(idx);
            } else if let Some(t) = r["productType"].as_str() {
                by_type.entry(t.to_string()).or_default().push(idx);
            }
        }
        let mut tiers: Vec<Tier> = raw["loyaltyDiscounts"]
            .as_array()
            .expect("loyaltyDiscounts")
            .iter()
            .filter(|t| t["isActive"].as_bool().unwrap_or(false))
            .map(|t| Tier {
                min_purchases: t["minPurchases"].as_i64().unwrap_or(0),
                percent: dec_opt(&t["discountPercent"]).expect("discountPercent"),
            })
            .collect();
        tiers.sort_by(|a, b| b.min_purchases.cmp(&a.min_purchases));
        let mut promos = HashMap::new();
        for p in raw["promoCodes"].as_array().expect("promoCodes") {
            promos.insert(
                p["code"].as_str().expect("code").to_string(),
                Promo {
                    discount_type: p["discountType"].as_str().unwrap_or("").to_string(),
                    discount_value: dec_opt(&p["discountValue"]).expect("discountValue"),
                    max_uses: p["maxUses"].as_i64(),
                    used_count: p["usedCount"].as_i64().unwrap_or(0),
                    valid_from: p["validFrom"].as_str().map(String::from),
                    valid_until: p["validUntil"].as_str().map(String::from),
                    is_active: p["isActive"].as_bool().unwrap_or(false),
                    applicable_to_types: p["applicableToTypes"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                        .unwrap_or_default(),
                    min_order_amount: dec_opt(&p["minOrderAmount"]),
                    first_purchase_only: p["firstPurchaseOnly"].as_bool().unwrap_or(false),
                },
            );
        }
        Store { rules, by_product, by_type, tiers, promos, latency: Duration::from_millis(latency_ms) }
    }

    /// Одно «обращение к БД».
    async fn trip(&self) {
        if !self.latency.is_zero() {
            tokio::time::sleep(self.latency).await;
        }
    }

    fn loyalty(&self, completed: i64) -> Decimal {
        self.tiers
            .iter()
            .find(|t| t.min_purchases <= completed)
            .map(|t| t.percent)
            .unwrap_or(Decimal::ZERO)
    }

    fn bulk_discount(&self, product_id: &str, product_type: &str, quantity: i64, line: Decimal) -> R<Decimal> {
        let candidates = self
            .by_product
            .get(product_id)
            .into_iter()
            .flatten()
            .chain(self.by_type.get(product_type).into_iter().flatten());
        let mut best: Option<Decimal> = None;
        for &i in candidates {
            let r = &self.rules[i];
            if r.min_quantity > quantity {
                continue;
            }
            if let Some(m) = r.min_amount {
                if m > line {
                    continue;
                }
            }
            let amount = pct_or_fixed(&r.discount_type, r.discount_value, line)?;
            best = Some(match best {
                Some(b) if b >= amount => b,
                _ => amount,
            });
        }
        Ok(best.unwrap_or(Decimal::ZERO))
    }
}

// ---------- разбор запроса ----------

struct Item {
    id: String,
    product_id: Option<String>,
    product_type: Option<String>,
    unit_price: Decimal,
    quantity: i64,
}
struct Parsed {
    now: String,
    uco: Option<i64>,
    promo_code: Option<String>, // уже в верхнем регистре
    soft: bool,
    items: Vec<Item>,
}

fn valid_now(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 20
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            10 => *c == b'T',
            13 | 16 => *c == b':',
            19 => *c == b'Z',
            _ => c.is_ascii_digit(),
        })
}
fn valid_price(s: &str) -> bool {
    let (int, frac) = match s.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (s, None),
    };
    if int.is_empty() || !int.bytes().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if int.len() > 1 && int.starts_with('0') {
        return false;
    }
    match frac {
        None => true,
        Some(f) => (1..=2).contains(&f.len()) && f.bytes().all(|c| c.is_ascii_digit()),
    }
}
fn valid_promo(s: &str) -> bool {
    (1..=32).contains(&s.len()) && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn parse_request(v: &Value) -> R<Parsed> {
    let obj = v.as_object().ok_or_else(|| bad("VALIDATION"))?;
    let now = match obj.get("now").and_then(|x| x.as_str()) {
        Some(s) if valid_now(s) => s.to_string(),
        _ => return Err(bad("VALIDATION")),
    };
    let uco = match obj.get("userCompletedOrders") {
        None | Some(Value::Null) => None,
        Some(x) => match x.as_i64() {
            // CONTRACT.md: целое 0..=2147483647, записанное целым литералом (5.0 и 1e2 для serde_json - f64, as_i64 даёт None)
            Some(n) if (0..=i64::from(i32::MAX)).contains(&n) => Some(n),
            _ => return Err(bad("VALIDATION")),
        },
    };
    let promo_code = match obj.get("promoCode") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if valid_promo(s) => Some(s.to_ascii_uppercase()),
        _ => return Err(bad("VALIDATION")),
    };
    let soft = match obj.get("softPromo") {
        None | Some(Value::Null) => true,
        Some(Value::Bool(b)) => *b,
        _ => return Err(bad("VALIDATION")),
    };
    let arr = match obj.get("items") {
        Some(Value::Array(a)) if a.len() <= 500 => a,
        _ => return Err(bad("VALIDATION")),
    };
    let mut items = Vec::with_capacity(arr.len());
    for r in arr {
        let o = r.as_object().ok_or_else(|| bad("VALIDATION"))?;
        let id = match o.get("id").and_then(|x| x.as_str()) {
            Some(s) if (1..=64).contains(&s.chars().count()) => s.to_string(),
            _ => return Err(bad("VALIDATION")),
        };
        let product_id = match o.get("productId") {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) if (1..=64).contains(&s.chars().count()) => Some(s.clone()),
            _ => return Err(bad("VALIDATION")),
        };
        let product_type = match o.get("productType") {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) if PRODUCT_TYPES.contains(&s.as_str()) => Some(s.clone()),
            _ => return Err(bad("VALIDATION")),
        };
        let unit_price = match o.get("unitPrice").and_then(|x| x.as_str()) {
            Some(s) if valid_price(s) => Decimal::from_str(s).map_err(|_| bad("VALIDATION"))?,
            _ => return Err(bad("VALIDATION")),
        };
        let quantity = match o.get("quantity").and_then(|x| x.as_i64()) {
            Some(q) if (1..=9999).contains(&q) => q,
            _ => return Err(bad("VALIDATION")),
        };
        if product_id.is_some() != product_type.is_some() {
            return Err(bad("CART_ITEM_INVALID"));
        }
        items.push(Item { id, product_id, product_type, unit_price, quantity });
    }
    Ok(Parsed { now, uco, promo_code, soft, items })
}

// ---------- расчёт ----------

fn promo_refusal(
    promo: Option<&Promo>,
    now: &str,
    uco: Option<i64>,
    product_types: &[&str],
    after_loyalty: Decimal,
) -> Option<&'static str> {
    let promo = match promo {
        Some(p) if p.is_active => p,
        _ => return Some("PROMO_NOT_FOUND"),
    };
    if let Some(f) = &promo.valid_from {
        if f.as_str() > now {
            return Some("PROMO_NOT_STARTED");
        }
    }
    if let Some(u) = &promo.valid_until {
        if u.as_str() < now {
            return Some("PROMO_EXPIRED");
        }
    }
    if let Some(m) = promo.max_uses {
        if promo.used_count >= m {
            return Some("PROMO_EXHAUSTED");
        }
    }
    if !promo.applicable_to_types.is_empty()
        && !product_types.iter().any(|t| promo.applicable_to_types.iter().any(|a| a.as_str() == *t))
    {
        return Some("PROMO_NOT_APPLICABLE");
    }
    if let Some(m) = promo.min_order_amount {
        if after_loyalty < m {
            return Some("PROMO_MIN_AMOUNT");
        }
    }
    if promo.first_purchase_only && matches!(uco, Some(n) if n > 0) {
        return Some("PROMO_FIRST_PURCHASE_ONLY");
    }
    None
}

async fn calculate(st: &Store, v: &Value) -> R<Value> {
    let p = parse_request(v)?;

    // Скидки за объём: ОДНО обращение на всю корзину (если есть товарные позиции).
    if p.items.iter().any(|i| i.product_id.is_some()) {
        st.trip().await;
    }
    let mut subtotal = Decimal::ZERO;
    let mut bulk_total = Decimal::ZERO;
    let mut line_rows: Vec<(Decimal, Decimal)> = Vec::with_capacity(p.items.len()); // (lineSubtotal, bulk)
    for it in &p.items {
        let line_sub = mulr(it.unit_price, Decimal::from(it.quantity))?;
        let bulk = match (&it.product_id, &it.product_type) {
            (Some(pid), Some(pt)) => st.bulk_discount(pid, pt, it.quantity, line_sub)?,
            _ => Decimal::ZERO,
        };
        subtotal = addr(subtotal, line_sub)?;
        bulk_total = addr(bulk_total, bulk)?;
        line_rows.push((line_sub, bulk));
    }
    let after_bulk = subr(subtotal, bulk_total)?;

    let loyalty_percent = match p.uco {
        Some(n) => {
            st.trip().await;
            st.loyalty(n)
        }
        None => Decimal::ZERO,
    };
    let loyalty_total = div100(mulr(after_bulk, loyalty_percent)?)?;
    let after_loyalty = subr(after_bulk, loyalty_total)?;

    let mut promo_total = Decimal::ZERO;
    let mut promo_error = Value::Null;
    if let Some(code) = &p.promo_code {
        st.trip().await;
        let product_types: Vec<&str> = p.items.iter().filter_map(|i| i.product_type.as_deref()).collect();
        let promo = st.promos.get(code);
        match promo_refusal(promo, &p.now, p.uco, &product_types, after_loyalty) {
            None => {
                let pr = promo.expect("промокод найден");
                promo_total = pct_or_fixed(&pr.discount_type, pr.discount_value, after_loyalty)?;
            }
            Some(refusal) => {
                if !p.soft {
                    return Err(bad(refusal));
                }
                promo_error = json!({ "code": refusal });
            }
        }
    }

    let discount = addr(addr(bulk_total, loyalty_total)?, promo_total)?;
    let total = subr(subtotal, discount)?;
    let total = if total > Decimal::ZERO { total } else { Decimal::ZERO };

    let lines: Vec<Value> = p
        .items
        .iter()
        .zip(line_rows.iter())
        .map(|(it, (sub, bulk))| {
            json!({
                "cartItemId": it.id,
                "productId": it.product_id,
                "quantity": it.quantity,
                "unitPrice": money(it.unit_price),
                "lineSubtotal": money(*sub),
                "bulkDiscount": money(*bulk),
                "lineTotal": money(*sub - *bulk),
            })
        })
        .collect();
    Ok(json!({
        "lines": lines,
        "subtotal": money(subtotal),
        "bulkDiscountTotal": money(bulk_total),
        "loyaltyDiscountPercent": money(loyalty_percent),
        "loyaltyDiscountTotal": money(loyalty_total),
        "promoDiscountTotal": money(promo_total),
        "promoError": promo_error,
        "discountAmount": money(discount),
        "total": money(total),
    }))
}

// ---------- HTTP ----------

type JsonResponse<T> = (StatusCode, [(header::HeaderName, &'static str); 1], T);

async fn health() -> JsonResponse<&'static str> {
    (StatusCode::OK, [(header::CONTENT_TYPE, "application/json")], "{\"status\":\"ok\"}")
}

async fn calc_handler(State(st): State<Arc<Store>>, body: Bytes) -> JsonResponse<String> {
    let (status, value) = match serde_json::from_slice::<Value>(&body) {
        Err(_) => bad("VALIDATION"),
        Ok(v) => match calculate(&st, &v).await {
            Ok(r) => (StatusCode::OK, r),
            Err(e) => e,
        },
    };
    (status, [(header::CONTENT_TYPE, "application/json")], value.to_string())
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);
    let dataset = std::env::var("DATASET_PATH").unwrap_or_else(|_| "fixtures/dataset.json".to_string());
    let latency: u64 = std::env::var("DB_LATENCY_MS").ok().and_then(|s| s.parse().ok()).unwrap_or(0);
    let store = Arc::new(Store::load(&dataset, latency));
    let app = Router::new()
        .route("/health", get(health))
        .route("/store/cart/calculate", post(calc_handler))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(store);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind");
    println!("rust listening on {port}");
    axum::serve(listener, app).await.expect("serve");
}
