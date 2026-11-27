# TwoMC Bridge на dev-srv: ШАБЛОН БЕЗ СЕКРЕТОВ. install-bridge.sh подставляет __SITE_URL__ и __KEY_ID__ из
# /home/twomc/bridge-dev-srv.secret.env (вне репозитория). Ключ сервера в этот файл НЕ попадает: он пишется
# отдельным файлом plugins/TwoMCBridge/bridge-key.txt (первая строка, 64 hex, права 600).
# Выдача заказов ВЫКЛЮЧЕНА (на dev-srv тестируются только снимки статистики и инвентаря).

delivery:
  enabled: false
  siteUrl: "__SITE_URL__"
  keyId: "__KEY_ID__"
  keyFile: "bridge-key.txt"
  extraRoots: []
  extraTemplates: []
  maxPerClaim: 5
  keyRetentionDays: 180

# Требует на сайте BRIDGE_ENABLED=true, BRIDGE_STATS_ENABLED=true и у сервера capabilities.player-events.
stats:
  enabled: true
  intervalMinutes: 10
  kills: player
  hits: off

# Требует на сайте BRIDGE_INVENTORY_ENABLED=true и у сервера capabilities.inventory-sync.
inventory:
  enabled: true
  intervalMinutes: 5
  minGapSeconds: 30
  heartbeatMinutes: 30
