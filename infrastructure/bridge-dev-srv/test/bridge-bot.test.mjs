// node --test infrastructure/bridge-dev-srv/test/
// bridgefix3: host-сеть бота, диагностика connect-timeout, причины kick, права файла пароля, verify-bridge --log, devsrv-access --changes.
// Сухие прогоны на заглушках curl/docker (test/stubs); реальная панель и VDS не затрагиваются.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = resolve(HERE, "..");
const posix = (p) => resolve(p).replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());
const BASE = mkdtempSync(join(tmpdir(), "devsrv-bot-test-"));
const UUID = "11111111-2222-3333-4444-555555555555";
const API_KEY = "ptlc_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";
let counter = 0;
const w = (p, s) => { mkdirSync(resolve(p, ".."), { recursive: true }); writeFileSync(p, s); };

function mk() {
  const d = join(BASE, `b${Date.now() % 1e7}-${++counter}`);
  for (const s of ["bin", "tmp", "fs/plugins/Maintenance", "fs/world", "stand"]) mkdirSync(join(d, s), { recursive: true });
  for (const s of ["curl", "docker"]) { copyFileSync(join(HERE, "stubs", s), join(d, "bin", s)); chmodSync(join(d, "bin", s), 0o755); }
  w(join(d, "fs/server.properties"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n");
  w(join(d, "fs/plugins/Maintenance/config.yml"), "maintenance-enabled: false\n");
  w(join(d, "state"), "running"); w(join(d, "players"), "0"); w(join(d, "version"), "Paper_1.21.4");
  w(join(d, ".ptero-test-root"), "marker\n");
  w(join(d, "ptero.cred"), `PANEL_URL=https://panel.test/account/api\nSERVER_UUID=${UUID}\nCLIENT_API_KEY=${API_KEY}\n`);
  spawnSync("bash", ["-c", `chmod 600 "${posix(d)}/ptero.cred"`]);
  return d;
}
function env(d) {
  const p = posix(d);
  return {
    ...process.env, STAND_TEST: "1", PTERO_TEST_ROOT: p, FAKE: p, FAKE_UUID: UUID, TMPDIR: p + "/tmp", PTERO_CRED_FILE: p + "/ptero.cred",
    PTERO_CHANGES_LOG: p + "/changes.log", STAND_ROOT: p + "/stand", STAND_CRED_FILE: p + "/stand.cred", DEVSRV_STATE_FILE: p + "/access.state",
    DEVSRV_POLL_SLEEP: "0", PTERO_ALLOW_PULL: "1",
  };
}
const rd = (d, p) => (existsSync(join(d, p)) ? readFileSync(join(d, p), "utf8") : "");
const calls = (d) => rd(d, "calls.log");
function sh(d, script, extra = {}) {
  const r = spawnSync("bash", ["-c", `umask 077; export PATH="${posix(d)}/bin:$PATH"; ${script}`], { env: { ...env(d), ...extra }, encoding: "utf8", timeout: 90000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function bjRun(d, args, extra = {}) {
  w(join(d, "meminfo"), "MemTotal: 8000000 kB\nMemAvailable: 4000000 kB\n");
  return sh(d, `bash "${posix(SRC)}/bot-join.sh" ${args}`, { BOT_MEMINFO_FILE: posix(d) + "/meminfo", BOT_PASS_FILE: posix(d) + "/bot.pass", ...extra });
}
const access = (d, args) => sh(d, `bash "${posix(SRC)}/devsrv-access.sh" ${args}`);
const logRun = (d, args) => sh(d, `source "${posix(SRC)}/ptero.sh"; source "${posix(SRC)}/verify-bridge.sh" ${args}`);
const listen = () => new Promise((res) => { const s = net.createServer((c) => c.destroy()); s.listen(0, "127.0.0.1", () => res(s)); });

test("bash -n: все скрипты каталога", () => {
  for (const f of ["bot-join.sh", "verify-bridge.sh", "devsrv-access.sh", "ptero.sh", "slp-check.sh"]) {
    const r = spawnSync("bash", ["-n", join(SRC, f).replace(/\\/g, "/")], { encoding: "utf8" });
    assert.equal(r.status, 0, f + ": " + r.stderr);
  }
});

test("bot-join: сеть host по умолчанию, --net bridge для отладки, неверное значение - код 2", () => {
  const d = mk();
  const a = bjRun(d, "Bot1 10");
  assert.match(rd(d, "docker-run.log"), /--network host/); assert.doesNotMatch(rd(d, "docker-run.log"), /--network bridge/);
  assert.match(a.out, /контейнер в сети host/);
  const d2 = mk(); bjRun(d2, "Bot1 10 --net bridge");
  assert.match(rd(d2, "docker-run.log"), /--network bridge/); assert.doesNotMatch(rd(d2, "docker-run.log"), /--network host/);
  const d3 = mk(); const c = bjRun(d3, "Bot1 10 --net overlay");
  assert.equal(c.code, 2); assert.equal(rd(d3, "docker-run.log"), "");
});

test("bot-join: connect-timeout - диагностика TCP хост/контейнер, указан рабочий путь", async () => {
  const srv = await listen(); const port = srv.address().port;
  const d = mk(); w(join(d, "port"), String(port)); w(join(d, "bot.out"), "ERROR connect-timeout (45s)\n"); w(join(d, "bot.rc"), "1"); w(join(d, "tcp.bridge"), "TCP-FAIL:timeout\n");
  const r = bjRun(d, "Bot1 10");
  srv.close();
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /ERROR connect-timeout/); assert.match(r.out, /DIAG: с хоста \(bash \/dev\/tcp\): OK/);
  assert.match(r.out, /сеть host: OK/); assert.match(r.out, /сеть bridge: FAIL:timeout/); assert.match(r.out, /РАБОЧИЙ ПУТЬ: --net host/);
  const d2 = mk(); const dead = await listen(); const p2 = dead.address().port; await new Promise((x) => dead.close(x));
  w(join(d2, "port"), String(p2)); w(join(d2, "bot.out"), "ERROR connect-timeout (45s)\n"); w(join(d2, "bot.rc"), "1"); w(join(d2, "tcp.bridge"), "TCP-FAIL:ECONNREFUSED\n"); w(join(d2, "tcp.host"), "TCP-FAIL:ECONNREFUSED\n");
  const q = bjRun(d2, "Bot1 10");
  assert.match(q.out, /с хоста \(bash \/dev\/tcp\): FAIL/); assert.match(q.out, /не слушает или порт закрыт/);
  const d3 = mk(); w(join(d3, "bot.out"), "STAGE connected\nSTAGE left\n"); const ok = bjRun(d3, "Bot1 10");
  assert.doesNotMatch(ok.out, /DIAG:/); assert.equal(ok.code, 0, ok.out + ok.err);
});

test("bot-join: причины kick/end/error из вывода бота печатаются, посторонние строки отсекаются", () => {
  const d = mk(); w(join(d, "fs/plugins/AuthMe.jar"), "jar");
  w(join(d, "bot.out"), "STAGE connected\nERROR kicked phase=spawned: You are banned\nERROR connection-ended phase=spawned reason=disconnect.quitting\nnoise line\nERROR error phase=start ECONNRESET\n"); w(join(d, "bot.rc"), "1");
  const r = bjRun(d, "Bot1 10");
  assert.match(r.out, /ERROR kicked phase=spawned: You are banned/); assert.match(r.out, /reason=disconnect\.quitting/); assert.match(r.out, /ERROR error phase=start ECONNRESET/);
  assert.doesNotMatch(r.out, /noise line/);
});

test("bot-join: права каталога и файла пароля, без Permission denied; пароль не в argv и не в выводе", () => {
  const d = mk(); w(join(d, "fs/plugins/AuthMe.jar"), "jar");
  const r = bjRun(d, "Bot1 10");
  assert.doesNotMatch(r.out + r.err, /Permission denied/);
  assert.match(rd(d, "botpass.stat"), /dir=\d+ file=\d+/);
  assert.match(r.out, /права копии пароля: каталог \d+, файл \d+; контейнер uid=/);
  const pw = readFileSync(join(d, "bot.pass"), "utf8").trim(); assert.match(pw, /^[0-9a-f]{20}$/);
  assert.ok(!rd(d, "docker-run.log").includes(pw), "пароль не должен быть в argv"); assert.ok(!r.out.includes(pw) && !r.err.includes(pw));
  assert.match(rd(d, "docker-run.log"), /-v [^ ]+\/p:\/botpass/);
  const d2 = mk(); w(join(d2, "fs/plugins/AuthMe.jar"), "jar");
  const o = bjRun(d2, "Bot1 10", { BOT_CONTAINER_UID: "4242", BOT_CONTAINER_GID: "4242" });
  assert.match(rd(d2, "docker-run.log"), /--user 4242:4242/); assert.match(o.out, /контейнер uid=4242/);
  if (process.platform !== "win32") { assert.match(rd(d, "botpass.stat"), /dir=700 file=600/); assert.match(rd(d2, "botpass.stat"), /dir=777 file=644/); }
  assert.equal(bjRun(mk(), "Bot1 10", { BOT_CONTAINER_UID: "x1" }).code, 2);
  // без плагина авторизации каталог p всё равно создаёт хост (иначе docker создаёт его от root -> Permission denied)
  const d3 = mk(); const n = bjRun(d3, "Bot1 10");
  assert.match(rd(d3, "botpass.stat"), /dir=\d+ file=none/); assert.doesNotMatch(n.out + n.err, /Permission denied/);
});

test("bot.js: причины kick/end/error разбираются из компонентов, ники других игроков, IP и UUID маскируются, hideErrors=false", () => {
  const src = readFileSync(join(SRC, "bot-join.sh"), "utf8");
  const js = /<<'BOT_JS_EOF'\n([\s\S]*?)\nBOT_JS_EOF/.exec(src)?.[1]; assert.ok(js);
  const d = mk(); const nm = join(d, "nm/mineflayer"); mkdirSync(nm, { recursive: true });
  w(join(nm, "index.js"), `const { EventEmitter } = require('events');
exports.createBot = (o) => { require('fs').writeFileSync(process.env.OPTS_FILE, JSON.stringify(o));
  const b = new EventEmitter(); b._client = new EventEmitter(); b.players = { BotX: {}, Griefer: {}, Other_1: {} }; b.quit = () => {}; b.clearControlStates = () => {};
  setTimeout(() => {
    b.emit('kicked', JSON.stringify({ text: 'You are banned, ', extra: [{ text: 'Griefer', color: 'red' }, { text: ' from 10.1.2.3:25565 uuid 123e4567-e89b-12d3-a456-426614174000 ' }, { translate: 'bye' }] }), true);
    b.emit('kicked', { type: 'compound', value: { text: { type: 'string', value: 'NBT Other_1 reason' } } }, false);
    b._client.emit('disconnect', { reason: '{"text":"proxy says Griefer"}' });
    b.emit('error', Object.assign(new Error('boom'), { code: 'ECONNRESET' }));
    b.emit('end', 'socketClosed');
  }, 20); return b; };`);
  const f = join(d, "bot.js"); writeFileSync(f, js);
  const r = spawnSync(process.execPath, [f], { env: { PATH: process.env.PATH, NODE_PATH: join(d, "nm"), OPTS_FILE: join(d, "opts.json"), BOT_HOST: "127.0.0.1", BOT_PORT: "25565", BOT_NICK: "BotX", BOT_SECS: "10", BOT_VERSION: "1.21.4", BOT_AUTH: "0" }, encoding: "utf8", timeout: 20000 });
  assert.match(r.stdout, /ERROR kicked phase=start: You are banned, <player> from <ip> uuid <uuid> bye/);
  assert.match(r.stdout, /ERROR kicked phase=start \(login\): NBT <player> reason/);
  assert.match(r.stdout, /ERROR disconnect-packet phase=start: proxy says <player>/);
  assert.match(r.stdout, /ERROR error phase=start ECONNRESET/);
  assert.doesNotMatch(r.stdout, /Griefer|Other_1|10\.1\.2\.3|123e4567/);
  assert.equal(JSON.parse(readFileSync(join(d, "opts.json"), "utf8")).hideErrors, false);
});

const LOGLINES = [
  "[10:00:01] [Server thread/INFO]: Starting minecraft server",
  "[10:00:02] [Server thread/INFO]: [TwoMCBridge] Enabled, handshake ok key-id dev-srv.1",
  "[10:01:00] [User Authenticator #1/INFO]: UUID of player Griefer is 123e4567-e89b-12d3-a456-426614174000",
  "[10:01:01] [Server thread/INFO]: Griefer[/203.0.113.7:51234] logged in with entity id 77 at (1.0, 2.0, 3.0)",
  "[10:01:02] [Server thread/INFO]: Griefer joined the game",
  "[10:01:05] [Server thread/INFO]: BotX joined the game",
  "[10:01:09] [Server thread/INFO]: [TwoMCBridge] snapshot for Griefer sent ok",
  "[10:02:00] [Server thread/INFO]: unrelated noise line",
  "[10:02:10] [Server thread/INFO]: Disconnecting Griefer (/203.0.113.7:51234): Kicked for flying",
  "[10:02:11] [Server thread/INFO]: Griefer lost connection: Kicked for flying",
  "[10:02:12] [Server thread/INFO]: BotX lost connection: Disconnected from 2001:db8:85a3:0:0:8a2e:370:7334",
  "[10:02:13] [Server thread/INFO]: [TwoMCBridge] token deadbeefdeadbeefdeadbeefdeadbeef01 rejected",
];
test("verify-bridge --log: только TwoMCBridge/join/kick/disconnect, ники кроме бота, IP, UUID и hex замаскированы, без записи на панель", () => {
  const d = mk(); w(join(d, "fs/logs/latest.log"), LOGLINES.join("\n") + "\n");
  const r = logRun(d, "--log 50 --bot BotX");
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /BotX joined the game/); assert.match(r.out, /BotX lost connection/); assert.match(r.out, /\[TwoMCBridge\] Enabled/);
  assert.match(r.out, /<player> joined the game/); assert.match(r.out, /snapshot for <player> sent ok/); assert.match(r.out, /Disconnecting <player> \(\/<ip>\)/);
  assert.doesNotMatch(r.out, /Griefer|203\.0\.113\.7|123e4567|2001:db8|deadbeefdead/);
  assert.doesNotMatch(r.out, /noise line|Starting minecraft/);
  assert.match(r.out, /token <hex> rejected/);
  assert.doesNotMatch(calls(d), /POST |\/websocket/);
  const all = logRun(d, "--log 3"); assert.doesNotMatch(all.out, /BotX/); assert.equal(all.out.split("\n").filter((l) => l.startsWith("[10:")).length, 3);
  assert.equal(logRun(d, "--log 0").code, 2); assert.equal(logRun(d, "--log 201").code, 2); assert.equal(logRun(d, "--bot x").code, 2);
});

test("devsrv-access --changes [N]: последние N строк локального журнала, IP и длинные токены замаскированы, панель не вызывается", () => {
  const d = mk();
  w(join(d, "changes.log"), ["2026-11-28T10:00:00Z | /whitelist.json | whitelist: Alice | absent | added", "2026-11-28T10:00:05Z | cmd | from 198.51.100.4 | - | ok",
    "2026-11-28T10:00:06Z | x | y | " + "a".repeat(45) + " | z", "2026-11-28T10:00:07Z | /whitelist.json | whitelist: Alice | added | removed"].join("\n") + "\n");
  const r = access(d, "--changes 3");
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.out.split("\n").filter((l) => l.startsWith("2026-")).length, 3);
  assert.doesNotMatch(r.out, /198\.51\.100\.4|aaaaaaaaaaaaaaaaaaaa/); assert.match(r.out, /<ip>/); assert.match(r.out, /<redacted>|<hex>/);
  assert.doesNotMatch(r.out, /absent \| added/); assert.equal(calls(d), "");
  assert.equal(access(d, "--changes").out.split("\n").filter((l) => l.startsWith("2026-")).length, 4);
  assert.equal(access(d, "--changes 500").code, 2); assert.equal(access(d, "--changes 0").code, 2);
  assert.equal(access(d, "--open Alice --changes").code, 2);
  const none = mk(); const n = access(none, "--changes"); assert.equal(n.code, 0); assert.match(n.out, /журнала изменений нет/);
});
