// Вариант (d): Java 21 (виртуальные потоки, JDK HttpServer, Jackson, BigDecimal). Контракт - ../../CONTRACT.md.
// НЕ СОБИРАЛОСЬ ЛОКАЛЬНО (JDK на ПК запрещён правилами; сборка только на VDS-раннере в Docker).
// Выбор «лёгкого фреймворка»: встроенный com.sun.net.httpserver + Executors.newVirtualThreadPerTaskExecutor()
// (минимум зависимостей и неизвестных API; Jackson только для JSON). Альтернативы (Javalin, Helidon Nima) - при необходимости позже.
package bench;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class Main {
  static final ObjectMapper MAPPER = new ObjectMapper();
  static final int MAX_BODY = 1024 * 1024;
  static final BigDecimal ZERO = BigDecimal.ZERO;
  static final Set<String> TYPES = Set.of(
      "PRIVILEGE", "KEY", "SUBSCRIPTION", "BADGE", "BATTLE_PASS", "BATTLE_PASS_BOOSTER",
      "UNMUTE", "UNBAN", "CURRENCY", "DECORATION", "BUNDLE");
  static final Pattern NOW_RE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z");
  static final Pattern PRICE_RE = Pattern.compile("(0|[1-9][0-9]*)(\\.[0-9]{1,2})?");
  static final Pattern PROMO_RE = Pattern.compile("[A-Za-z0-9_-]{1,32}");

  /** Ошибка 400 с кодом контракта (без стека - дешёвая). */
  static final class ApiError extends RuntimeException {
    final String code;

    ApiError(String code) {
      super(code, null, false, false);
      this.code = code;
    }
  }

  // ---------- данные ----------

  record BulkRule(int minQuantity, BigDecimal minAmount, String discountType, BigDecimal discountValue) {}

  record Tier(int minPurchases, BigDecimal percent) {}

  record Promo(
      String discountType, BigDecimal discountValue, Integer maxUses, int usedCount,
      String validFrom, String validUntil, boolean isActive, List<String> applicableToTypes,
      BigDecimal minOrderAmount, boolean firstPurchaseOnly) {}

  static final class Store {
    final Map<String, List<BulkRule>> byProduct = new HashMap<>();
    final Map<String, List<BulkRule>> byType = new HashMap<>();
    final List<Tier> tiers = new ArrayList<>(); // активные, по убыванию minPurchases
    final Map<String, Promo> promos = new HashMap<>();
    final long latencyMs;

    Store(Path path, long latencyMs) throws IOException {
      this.latencyMs = latencyMs;
      JsonNode raw = MAPPER.readTree(Files.readAllBytes(path));
      for (JsonNode r : raw.get("bulkDiscounts")) {
        if (!r.path("isActive").asBoolean(false)) continue; // where isActive = true делает «БД»
        BulkRule rule = new BulkRule(
            r.path("minQuantity").asInt(0), dec(r.get("minAmount")),
            r.path("discountType").asText(""), dec(r.get("discountValue")));
        if (!r.path("productId").isNull() && r.hasNonNull("productId")) {
          byProduct.computeIfAbsent(r.get("productId").asText(), k -> new ArrayList<>()).add(rule);
        } else if (r.hasNonNull("productType")) {
          byType.computeIfAbsent(r.get("productType").asText(), k -> new ArrayList<>()).add(rule);
        }
      }
      for (JsonNode t : raw.get("loyaltyDiscounts")) {
        if (t.path("isActive").asBoolean(false)) {
          tiers.add(new Tier(t.path("minPurchases").asInt(0), dec(t.get("discountPercent"))));
        }
      }
      tiers.sort(Comparator.comparingInt(Tier::minPurchases).reversed());
      for (JsonNode p : raw.get("promoCodes")) {
        List<String> types = new ArrayList<>();
        for (JsonNode x : p.path("applicableToTypes")) types.add(x.asText());
        promos.put(p.get("code").asText(), new Promo(
            p.path("discountType").asText(""), dec(p.get("discountValue")),
            p.hasNonNull("maxUses") ? p.get("maxUses").asInt() : null, p.path("usedCount").asInt(0),
            p.hasNonNull("validFrom") ? p.get("validFrom").asText() : null,
            p.hasNonNull("validUntil") ? p.get("validUntil").asText() : null,
            p.path("isActive").asBoolean(false), types, dec(p.get("minOrderAmount")),
            p.path("firstPurchaseOnly").asBoolean(false)));
      }
    }

    static BigDecimal dec(JsonNode n) {
      return n == null || n.isNull() ? null : new BigDecimal(n.asText());
    }

    /** Одно «обращение к БД» (виртуальный поток паркуется на время сна, носитель свободен). */
    void trip() throws InterruptedException {
      if (latencyMs > 0) Thread.sleep(latencyMs);
    }

    BigDecimal loyalty(int completed) {
      for (Tier t : tiers) if (t.minPurchases() <= completed) return t.percent();
      return ZERO;
    }

    BigDecimal bulkDiscount(String productId, String productType, int quantity, BigDecimal line) {
      BigDecimal best = null;
      for (List<BulkRule> list : List.of(
          byProduct.getOrDefault(productId, List.of()), byType.getOrDefault(productType, List.of()))) {
        for (BulkRule r : list) {
          if (r.minQuantity() > quantity) continue;
          if (r.minAmount() != null && r.minAmount().compareTo(line) > 0) continue;
          BigDecimal amount = pctOrFixed(r.discountType(), r.discountValue(), line);
          if (best == null || amount.compareTo(best) > 0) best = amount;
        }
      }
      return best == null ? ZERO : best;
    }
  }

  // ---------- арифметика ----------

  /** Точное деление на 100 (сдвиг запятой) - без округления. */
  static BigDecimal div100(BigDecimal a) {
    return a.movePointLeft(2);
  }

  static BigDecimal pctOrFixed(String kind, BigDecimal value, BigDecimal amount) {
    return "PERCENT".equals(kind) ? div100(amount.multiply(value)) : value.min(amount);
  }

  /** Канонический вид (CONTRACT.md): без экспоненты и хвостовых нулей, целое без точки. */
  static String money(BigDecimal d) {
    return d.signum() == 0 ? "0" : d.stripTrailingZeros().toPlainString();
  }

  // ---------- разбор запроса ----------

  record Item(String id, String productId, String productType, BigDecimal unitPrice, int quantity) {}

  record Parsed(String now, Integer uco, String promoCode, boolean soft, List<Item> items) {}

  static boolean isMissing(JsonNode n) {
    return n == null || n.isNull();
  }

  static Parsed parse(JsonNode root) {
    if (root == null || !root.isObject()) throw new ApiError("VALIDATION");
    JsonNode nowN = root.get("now");
    if (nowN == null || !nowN.isTextual() || !NOW_RE.matcher(nowN.asText()).matches()) throw new ApiError("VALIDATION");
    Integer uco = null;
    JsonNode ucoN = root.get("userCompletedOrders");
    if (!isMissing(ucoN)) {
      // CONTRACT.md, «Целые числа»: 5.0 и 1e2 - DoubleNode (isIntegralNumber ложно) -> 400; int32 даёт canConvertToInt
      if (!ucoN.isIntegralNumber() || !ucoN.canConvertToInt() || ucoN.asInt() < 0) throw new ApiError("VALIDATION");
      uco = ucoN.asInt();
    }
    String promo = null;
    JsonNode promoN = root.get("promoCode");
    if (!isMissing(promoN)) {
      if (!promoN.isTextual() || !PROMO_RE.matcher(promoN.asText()).matches()) throw new ApiError("VALIDATION");
      promo = promoN.asText().toUpperCase(Locale.ROOT);
    }
    boolean soft = true;
    JsonNode softN = root.get("softPromo");
    if (!isMissing(softN)) {
      if (!softN.isBoolean()) throw new ApiError("VALIDATION");
      soft = softN.asBoolean();
    }
    JsonNode itemsN = root.get("items");
    if (itemsN == null || !itemsN.isArray() || itemsN.size() > 500) throw new ApiError("VALIDATION");

    List<Item> items = new ArrayList<>(itemsN.size());
    for (JsonNode r : itemsN) {
      if (!r.isObject()) throw new ApiError("VALIDATION");
      JsonNode idN = r.get("id");
      if (idN == null || !idN.isTextual() || idN.asText().isEmpty() || idN.asText().length() > 64) throw new ApiError("VALIDATION");
      String productId = null;
      JsonNode pidN = r.get("productId");
      if (!isMissing(pidN)) {
        if (!pidN.isTextual() || pidN.asText().isEmpty() || pidN.asText().length() > 64) throw new ApiError("VALIDATION");
        productId = pidN.asText();
      }
      String productType = null;
      JsonNode ptN = r.get("productType");
      if (!isMissing(ptN)) {
        if (!ptN.isTextual() || !TYPES.contains(ptN.asText())) throw new ApiError("VALIDATION");
        productType = ptN.asText();
      }
      JsonNode priceN = r.get("unitPrice");
      if (priceN == null || !priceN.isTextual() || !PRICE_RE.matcher(priceN.asText()).matches()) throw new ApiError("VALIDATION");
      JsonNode qN = r.get("quantity");
      if (qN == null || !qN.isIntegralNumber() || !qN.canConvertToInt() || qN.asInt() < 1 || qN.asInt() > 9999) {
        throw new ApiError("VALIDATION");
      }
      if ((productId != null) != (productType != null)) throw new ApiError("CART_ITEM_INVALID");
      items.add(new Item(idN.asText(), productId, productType, new BigDecimal(priceN.asText()), qN.asInt()));
    }
    return new Parsed(nowN.asText(), uco, promo, soft, items);
  }

  // ---------- расчёт ----------

  static String promoRefusal(Promo p, String now, Integer uco, List<String> productTypes, BigDecimal afterLoyalty) {
    if (p == null || !p.isActive()) return "PROMO_NOT_FOUND";
    if (p.validFrom() != null && p.validFrom().compareTo(now) > 0) return "PROMO_NOT_STARTED";
    if (p.validUntil() != null && p.validUntil().compareTo(now) < 0) return "PROMO_EXPIRED";
    if (p.maxUses() != null && p.usedCount() >= p.maxUses()) return "PROMO_EXHAUSTED";
    if (!p.applicableToTypes().isEmpty() && productTypes.stream().noneMatch(p.applicableToTypes()::contains)) {
      return "PROMO_NOT_APPLICABLE";
    }
    if (p.minOrderAmount() != null && afterLoyalty.compareTo(p.minOrderAmount()) < 0) return "PROMO_MIN_AMOUNT";
    if (p.firstPurchaseOnly() && uco != null && uco > 0) return "PROMO_FIRST_PURCHASE_ONLY";
    return null;
  }

  static ObjectNode calculate(JsonNode root, Store st) throws InterruptedException {
    Parsed p = parse(root);

    // Скидки за объём: ОДНО обращение на всю корзину (если есть товарные позиции).
    if (p.items().stream().anyMatch(i -> i.productId() != null)) st.trip();
    BigDecimal subtotal = ZERO;
    BigDecimal bulkTotal = ZERO;
    BigDecimal[] lineSub = new BigDecimal[p.items().size()];
    BigDecimal[] lineBulk = new BigDecimal[p.items().size()];
    for (int i = 0; i < p.items().size(); i++) {
      Item it = p.items().get(i);
      lineSub[i] = it.unitPrice().multiply(BigDecimal.valueOf(it.quantity()));
      lineBulk[i] = it.productId() != null ? st.bulkDiscount(it.productId(), it.productType(), it.quantity(), lineSub[i]) : ZERO;
      subtotal = subtotal.add(lineSub[i]);
      bulkTotal = bulkTotal.add(lineBulk[i]);
    }
    BigDecimal afterBulk = subtotal.subtract(bulkTotal);

    BigDecimal loyaltyPercent = ZERO;
    if (p.uco() != null) {
      st.trip();
      loyaltyPercent = st.loyalty(p.uco());
    }
    BigDecimal loyaltyTotal = div100(afterBulk.multiply(loyaltyPercent));
    BigDecimal afterLoyalty = afterBulk.subtract(loyaltyTotal);

    BigDecimal promoTotal = ZERO;
    JsonNode promoError = MAPPER.nullNode();
    if (p.promoCode() != null) {
      st.trip();
      List<String> types = new ArrayList<>();
      for (Item it : p.items()) if (it.productType() != null) types.add(it.productType());
      Promo promo = st.promos.get(p.promoCode());
      String refusal = promoRefusal(promo, p.now(), p.uco(), types, afterLoyalty);
      if (refusal == null) {
        promoTotal = pctOrFixed(promo.discountType(), promo.discountValue(), afterLoyalty);
      } else if (!p.soft()) {
        throw new ApiError(refusal);
      } else {
        promoError = MAPPER.createObjectNode().put("code", refusal);
      }
    }

    BigDecimal discount = bulkTotal.add(loyaltyTotal).add(promoTotal);
    BigDecimal total = subtotal.subtract(discount);
    if (total.signum() <= 0) total = ZERO;

    ObjectNode out = MAPPER.createObjectNode();
    ArrayNode lines = out.putArray("lines");
    for (int i = 0; i < p.items().size(); i++) {
      Item it = p.items().get(i);
      ObjectNode l = lines.addObject();
      l.put("cartItemId", it.id());
      if (it.productId() == null) l.putNull("productId");
      else l.put("productId", it.productId());
      l.put("quantity", it.quantity());
      l.put("unitPrice", money(it.unitPrice()));
      l.put("lineSubtotal", money(lineSub[i]));
      l.put("bulkDiscount", money(lineBulk[i]));
      l.put("lineTotal", money(lineSub[i].subtract(lineBulk[i])));
    }
    out.put("subtotal", money(subtotal));
    out.put("bulkDiscountTotal", money(bulkTotal));
    out.put("loyaltyDiscountPercent", money(loyaltyPercent));
    out.put("loyaltyDiscountTotal", money(loyaltyTotal));
    out.put("promoDiscountTotal", money(promoTotal));
    out.set("promoError", promoError);
    out.put("discountAmount", money(discount));
    out.put("total", money(total));
    return out;
  }

  // ---------- HTTP ----------

  static void send(HttpExchange ex, int status, byte[] body) throws IOException {
    ex.getResponseHeaders().set("Content-Type", "application/json");
    ex.sendResponseHeaders(status, body.length);
    try (OutputStream os = ex.getResponseBody()) {
      os.write(body);
    }
  }

  static void sendJson(HttpExchange ex, int status, JsonNode node) throws IOException {
    send(ex, status, MAPPER.writeValueAsBytes(node));
  }

  static void sendError(HttpExchange ex, int status, String code) throws IOException {
    sendJson(ex, status, MAPPER.createObjectNode().put("code", code).put("message", code));
  }

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    Path dataset = Path.of(System.getenv().getOrDefault("DATASET_PATH", "fixtures/dataset.json"));
    long latency = Long.parseLong(System.getenv().getOrDefault("DB_LATENCY_MS", "0"));
    Store store = new Store(dataset, latency);

    HttpServer server = HttpServer.create(new InetSocketAddress(port), 1024);
    server.createContext("/health", ex -> {
      try (ex) {
        if (!"GET".equals(ex.getRequestMethod())) {
          sendError(ex, 404, "NOT_FOUND");
          return;
        }
        send(ex, 200, "{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8));
      }
    });
    server.createContext("/store/cart/calculate", ex -> {
      try (ex) {
        if (!"POST".equals(ex.getRequestMethod())) {
          sendError(ex, 404, "NOT_FOUND");
          return;
        }
        byte[] body = ex.getRequestBody().readNBytes(MAX_BODY + 1);
        if (body.length > MAX_BODY) {
          sendError(ex, 413, "PAYLOAD_TOO_LARGE");
          return;
        }
        JsonNode root;
        try {
          root = MAPPER.readTree(body);
        } catch (IOException e) {
          sendError(ex, 400, "VALIDATION");
          return;
        }
        try {
          sendJson(ex, 200, calculate(root, store));
        } catch (ApiError e) {
          sendError(ex, 400, e.code);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          sendError(ex, 500, "INTERNAL");
        } catch (RuntimeException e) {
          sendError(ex, 500, "INTERNAL");
        }
      }
    });
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.start();
    System.out.println("java listening on " + port);
  }
}
