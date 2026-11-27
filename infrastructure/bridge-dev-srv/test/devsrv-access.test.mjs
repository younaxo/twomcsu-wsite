// node --test infrastructure/bridge-dev-srv/test/*.mjs
// Сухие прогоны ptero.sh и devsrv-access.sh на заглушках curl/docker (test/stubs): реальная панель и VDS не затрагиваются.
// Рабочий каталог заглушек: DEVSRV_TEST_DIR (по умолчанию временный). Нужны bash, sha256sum, stat, flock не обязателен.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = resolve(HERE, "..");
const posix = (p) => resolve(p).replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());
const BASE = process.env.DEVSRV_TEST_DIR ? resolve(process.env.DEVSRV_TEST_DIR) : mkdtempSync(join(tmpdir(), "devsrv-test-"));
mkdirSync(BASE, { recursive: true });
const UUID = "11111111-2222-3333-4444-555555555555";
const API_KEY = "ptlc_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";
let counter = 0;

const w = (p, s) => { mkdirSync(resolve(p, ".."), { recursive: true }); writeFileSync(p, s); };

function mk(opts = {}) {
  const d = join(BASE, `t${Date.now() % 1e7}-${++counter}`);
  const fs = join(d, "fs");
  for (const s of ["bin", "tmp", "fs/plugins/Maintenance", "fs/plugins/OtherPlugin", "fs/world", "fs/playerdata", "stand"]) mkdirSync(join(d, s), { recursive: true });
  for (const s of ["curl", "docker"]) { copyFileSync(join(HERE, "stubs", s), join(d, "bin", s)); chmodSync(join(d, "bin", s), 0o755); }
  w(join(fs, "server.properties"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n");
  w(join(fs, "whitelist.json"), '[\n  {"uuid": "u-Alice", "name": "Alice"}\n]\n');
  w(join(fs, "plugins/Maintenance/config.yml"), `maintenance-enabled: ${opts.maintenance ?? "true"}\nkick: true\n`);
  w(join(fs, "plugins/Maintenance-4.1.jar"), "jar");
  w(join(fs, "plugins/Other.jar"), "jar");
  w(join(fs, "plugins/OtherPlugin/config.yml"), "token: secretvalue\n");
  w(join(fs, "world/level.dat"), "WORLD-DATA");
  w(join(fs, "playerdata/a.dat"), "PLAYER-DATA");
  w(join(d, "state"), opts.state ?? "running");
  w(join(d, "players"), String(opts.players ?? 0));
  w(join(d, "version"), opts.version ?? "Paper_1.21.4");
  w(join(d, "ptero.cred"), `PANEL_URL=https://panel.test/account/api\nSERVER_UUID=${UUID}\nCLIENT_API_KEY=${API_KEY}\n`);
  w(join(d, "stand/stand.env"), "POSTGRES_USER=u\nPOSTGRES_DB=d\nPOSTGRES_PASSWORD=p\nNODE_ENV=development\n");
  w(join(d, "stand/.release"), "abcdef012345\n");
  w(join(d, "stand.cred"), "[админ]\nlogin: admin\n\n[игрок]\nlogin: testplayer\n");
  if (opts.owner !== false) w(join(d, "psql.out"), "OwnerNick|11111111-1111-3111-8111-111111111111\n");
  // права 600 ставит bash (chmodSync из node на Windows не меняет режим cygwin)
  spawnSync("bash", ["-c", `chmod 600 "${posix(d)}/ptero.cred" "${posix(d)}/stand.cred"`]);
  return d;
}

function env(d) {
  const p = posix(d);
  return {
    ...process.env, STAND_TEST: "1", FAKE: p, FAKE_UUID: UUID, TMPDIR: p + "/tmp", PTERO_CRED_FILE: p + "/ptero.cred",
    PTERO_CHANGES_LOG: p + "/changes.log", STAND_ROOT: p + "/stand", STAND_CRED_FILE: p + "/stand.cred", DEVSRV_STATE_FILE: p + "/access.state",
    DEVSRV_POLL_SLEEP: "0", PTERO_GUARD_WAIT1: "0", PTERO_GUARD_WAIT2: "0", PTERO_ALLOW_PULL: "1",
  };
}
// umask 077: на Git Bash (noacl) режим файлов вычисляется из umask, иначе проверка «права ровно 600» не пройдёт
const pre = (d) => `umask 077; export PATH="${posix(d)}/bin:$PATH"; source "${posix(SRC)}/ptero.sh"; source "${posix(SRC)}/stand-lib.sh"; ptero_init || exit 9; `;
function lib(d, script, extra = {}) {
  const r = spawnSync("bash", ["-c", pre(d) + script], { env: { ...env(d), ...extra }, encoding: "utf8", timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function access(d, args, extra = {}) {
  const r = spawnSync("bash", ["-c", `export PATH="${posix(d)}/bin:$PATH"; bash "${posix(SRC)}/devsrv-access.sh" ${args}`], { env: { ...env(d), ...extra }, encoding: "utf8", timeout: 120000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const rd = (d, p) => (existsSync(join(d, p)) ? readFileSync(join(d, p), "utf8") : "");
const calls = (d) => rd(d, "calls.log");
const posts = (d) => calls(d).split("\n").filter((l) => /^POST /.test(l));
const journal = (d) => rd(d, "changes.log").split("\n").filter(Boolean);
const fsHas = (d, prefix) => readdirSync(join(d, "fs", ...prefix.split("/").slice(0, -1).filter(Boolean))).some((n) => n.startsWith(prefix.split("/").pop()));
const wl = (d) => [...rd(d, "fs/whitelist.json").matchAll(/"name": "([^"]*)"/g)].map((m) => m[1]);

// ------------------------------------------------------------------ санитизация и денайлист команд
test("команды: санитизация (перевод строки, табуляция, управляющие, не ASCII, длина) отказывает до обращения к панели", () => {
  const d = mk();
  const cases = ["say a\\nop evil", "say a\\tb", "say a\\x01b", "say привет", "x".repeat(257), "", " say hi"];
  for (const c of cases) {
    const r = lib(d, `c=$(printf '${c.replace(/'/g, "")}'); ptero_command "$c"; echo rc=$?`);
    assert.match(r.out, /rc=[12]/, `команда должна быть отвергнута: ${JSON.stringify(c).slice(0, 40)}`);
  }
  assert.equal(posts(d).length, 0, "ни одного POST к панели");
  assert.equal(journal(d).length, 0);
});

test("команды: JSON-экранирование кавычек и обратной косой; журнал с вычисткой hex", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; ptero_command 'say a "q" b\\c'; echo rc=$?; ptero_command 'say ${"ab".repeat(32)}'; echo rc=$?`);
  assert.match(r.out, /rc=0\s+rc=0/);
  const cmds = rd(d, "commands.log");
  assert.ok(cmds.includes('say a \\"q\\" b\\\\c'), cmds);
  const j = journal(d).join("\n");
  assert.ok(j.includes("<hex>") && !j.includes("ab".repeat(32)), "hex вычищен из журнала");
});

test("денайлист: плагины, reload, мир, данные игроков, обёртки; op и deop разрешены", () => {
  const d = mk();
  const denied = ["plugman load Evil", "plugman unload Foo", "plugins unload Foo", "pl load Evil", "bukkit:plugins disable X", "pm disable X", "plugin delete X", "reload", "reload confirm", "bukkit:reload", "rl", "minecraft:execute as @a run say hi",
    "execute run op me", "function evil:run", "//set stone", "/we", "mv delete world", "mvremove world", "fill 0 0 0 9 9 9 air", "clear Nick", "authme register Nick pass pass",
    "register pass pass", "lp bulkupdate users delete all", "lp deletegroup admin", "datapack enable evil", "sudo Nick op Nick", "worldedit:we"];
  const allowed = ["op Nick", "deop Nick", "whitelist add Nick", "whitelist remove Nick", "kick Nick bye", "say TwoMC: hello", "twomcbridge events", "maintenance off", "maintenance reload", "lp user Nick info", "ban Nick", "list", "save-all"];
  const script = [
    ...denied.map((c) => `if _pt_cmd_denied '${c}' >/dev/null; then echo "D|${c}"; else echo "A|${c}"; fi`),
    ...allowed.map((c) => `if _pt_cmd_denied '${c}' >/dev/null; then echo "D|${c}"; else echo "A|${c}"; fi`),
  ].join("; ");
  const out = lib(d, script).out.split("\n").filter(Boolean);
  for (const c of denied) assert.ok(out.includes(`D|${c}`), `должна быть запрещена: ${c}`);
  for (const c of allowed) assert.ok(out.includes(`A|${c}`), `должна быть разрешена: ${c}`);
});

test("консольные stop/restart и power restart/stop/kill требуют restart_guard; start и ошибочные сигналы", () => {
  const d = mk();
  const r1 = lib(d, `PTERO_ALLOW_WRITE=1; ptero_command stop; echo c=$?; ptero_command restart; echo c=$?; ptero_power restart; echo p=$?; ptero_power stop; echo p=$?; ptero_power kill; echo p=$?; ptero_power reboot; echo p=$?`);
  assert.match(r1.out, /c=2\s+c=2\s+p=1\s+p=1\s+p=1\s+p=2/);
  assert.equal(posts(d).length, 0);
  const r2 = lib(d, `PTERO_ALLOW_WRITE=1; ptero_power start; echo p=$?`);
  assert.match(r2.out, /p=0/);
  const r3 = lib(d, `PTERO_ALLOW_WRITE=1; ptero_restart_guard access; echo g=$?; ptero_power restart; echo p=$?; ptero_power restart; echo p2=$?`);
  assert.match(r3.out, /g=0\s+p=0\s+p2=1/, r3.out + r3.err);
  assert.match(rd(d, "power.log"), /"signal":"start"[\s\S]*"signal":"restart"/);
  const r4 = lib(d, `PTERO_ALLOW_WRITE=1; PTERO_POWER_NOGUARD=1 ptero_power kill; echo p=$?`);
  assert.match(r4.out, /p=0/);
  assert.ok(journal(d).some((l) => /\| power \| kill \|.*NOGUARD/.test(l)), journal(d).join("\n"));
});

// ------------------------------------------------------------------ пути
test("пути: запись и загрузка в world*, playerdata, чужие jar и произвольные файлы отказывают; разрешённые проходят", () => {
  const d = mk();
  const denied = ["/world/level.dat", "/world_nether/region/r.0.0.mca", "/WORLD/x.yml", "/playerdata/a.dat", "/stats/a.json", "/level.dat", "/plugins/Other.jar", "/plugins/Other.jar.disabled-20260101T000000Z",
    "/plugins/OtherPlugin/data.yml", "/plugins/OtherPlugin/config.yml.disabled-20260101T000000Z", "/eula.txt", "/logs/latest.log", "/plugins/../world/x", "/plugins/world/config.yml",
    "/plugins/Foo.jar/config.yml", "/plugins//x/config.yml", "/plugins/.hidden/config.yml", "/spigot.yml", "/plugins/TwoMCBridge/other.txt"];
  const allowed = ["/server.properties", "/whitelist.json", "/ops.json", "/plugins/Maintenance/config.yml", "/plugins/OtherPlugin/config.yml", "/plugins/TwoMCBridge/config.yml", "/plugins/TwoMCBridge/bridge-key.txt",
    "/server.properties.bak-20260101T000000Z", "/whitelist.json.bak-20260101T000000Z", "/plugins/Maintenance/config.yml.bak-20260101T000000Z", "/plugins/TwoMCBridge/bridge-key.txt.bak-20260101T000000Z",
    "/plugins/TwoMCBridge/config.yml.disabled-20260101T000000Z"];
  const script = [...denied, ...allowed].map((p) => `if _pt_path_allowed write '${p}' 2>/dev/null; then echo "A|${p}"; else echo "D|${p}"; fi`).join("; ");
  const out = lib(d, script).out.split("\n").filter(Boolean);
  for (const p of denied) assert.ok(out.includes(`D|${p}`), `запись должна быть запрещена: ${p}`);
  for (const p of allowed) assert.ok(out.includes(`A|${p}`), `запись должна быть разрешена: ${p}`);
  const up = lib(d, `for n in TwoMCBridge-0.1.0.jar TwoMCBridge-0.2.0.jar TwoMCBridge.jar Other.jar Evil.jar TwoMCBridge.sh TwoMCBridge..jar; do if _pt_path_allowed upload "/plugins/$n" 2>/dev/null; then echo "A|$n"; else echo "D|$n"; fi; done`).out;
  assert.match(up, /A\|TwoMCBridge-0.1.0.jar/); assert.match(up, /A\|TwoMCBridge-0.2.0.jar/); assert.match(up, /A\|TwoMCBridge.jar/);
  assert.match(up, /D\|Other.jar/); assert.match(up, /D\|Evil.jar/); assert.match(up, /D\|TwoMCBridge.sh/);
  // реальные вызовы: ни одного POST
  const r = lib(d, `PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/l"; ptero_file_write /world/level.dat "$TMPDIR/l"; echo a=$?; ptero_file_write /plugins/Other.jar "$TMPDIR/l"; echo b=$?; ptero_upload "$TMPDIR/l" /plugins Other.jar; echo c=$?; ptero_upload "$TMPDIR/l" /world x.jar; echo d=$?; ptero_rename /plugins Other.jar Other.jar.disabled-20260101T000000Z; echo e=$?`);
  assert.match(r.out, /a=2\s+b=2\s+c=2\s+d=2\s+e=2/, r.out + r.err);
  assert.equal(posts(d).length, 0);
  assert.equal(rd(d, "fs/world/level.dat"), "WORLD-DATA");
});

test("эндпоинты: удаление, копирование, архивы и чужой сервер недостижимы", () => {
  const d = mk();
  const r = lib(d, `for s in /files/delete /files/copy /files/compress /files/decompress /files/pull /backups /users /settings /schedules "/../../../servers/other/power" "/files/write/../delete"; do _pt_req GET "$s"; echo "rc=$? $s"; done`);
  assert.equal((r.out.match(/rc=1 /g) || []).length, 11, r.out);
  assert.equal(calls(d), "");
});

// ------------------------------------------------------------------ бэкап и журнал
test("запись критичного файла: сначала бэкап .bak-<UTC> в той же папке, затем запись; журнал: 5 колонок, без секретов", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; printf 'white-list=false\\n' > "$TMPDIR/new"; ptero_file_write /server.properties "$TMPDIR/new"; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  const wr = rd(d, "writes.log").trim().split("\n");
  assert.match(wr[0], /^WRITE \/server\.properties\.bak-\d{8}T\d{6}Z$/);
  assert.equal(wr[1], "WRITE /server.properties");
  const bak = readdirSync(join(d, "fs")).find((n) => n.startsWith("server.properties.bak-"));
  assert.equal(readFileSync(join(d, "fs", bak), "utf8"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n");
  assert.equal(rd(d, "fs/server.properties"), "white-list=false\n");
  const c = calls(d).split("\n");
  assert.ok(c.findIndex((l) => l.startsWith("GET /files/contents")) < c.findIndex((l) => l.startsWith("POST /files/write")));
  const j = journal(d);
  assert.equal(j.length, 2);
  for (const l of j) { assert.equal(l.split(" | ").length, 5, l); assert.match(l, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \| /); }
  assert.ok(!rd(d, "changes.log").includes(API_KEY));
  const mode = spawnSync("bash", ["-c", `umask 077; stat -c %a "${posix(d)}/changes.log"`], { encoding: "utf8" }).stdout.trim();
  assert.equal(mode, "600");
});

test("бэкап: файла нет - копировать нечего, запись проходит; бэкап не удался - записи нет", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; echo '[]' > "$TMPDIR/o"; ptero_file_write /ops.json "$TMPDIR/o"; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  assert.ok(!readdirSync(join(d, "fs")).some((n) => n.startsWith("ops.json.bak")));
  assert.equal(rd(d, "fs/ops.json").trim(), "[]");
  const d2 = mk();
  writeFileSync(join(d2, "fail_write"), "1");
  const r2 = lib(d2, `PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo rc=$?`);
  assert.match(r2.out, /rc=1/);
  assert.equal(rd(d2, "fs/server.properties"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n", "оригинал не тронут");
});

test("журнал недоступен - изменяющая операция не выполняется", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo a=$?; ptero_command "say hi"; echo b=$?; ptero_power start; echo c=$?`, { PTERO_CHANGES_LOG: posix(d) + "/no-such-dir/changes.log" });
  assert.match(r.out, /a=1\s+b=1\s+c=1/, r.out + r.err);
  assert.equal(posts(d).length, 0);
});

test("запись выключена по умолчанию (PTERO_ALLOW_WRITE!=1): ничего не уходит на панель", () => {
  const d = mk();
  const r = lib(d, `echo x > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo a=$?; ptero_command "say hi"; echo b=$?; ptero_power start; echo c=$?; ptero_backup /server.properties; echo d=$?`);
  assert.match(r.out, /a=1\s+b=1\s+c=1\s+d=1/, r.out + r.err);
  assert.equal(posts(d).length, 0);
});

// ------------------------------------------------------------------ devsrv-access.sh
test("--status: только GET, показывает whitelist, техработы, плагин, онлайн, ник владельца", () => {
  const d = mk();
  const r = access(d, "--status");
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /white-list=true enforce-whitelist=false online-mode=false/);
  assert.match(r.out, /whitelist\.json: записей 1: Alice/);
  assert.match(r.out, /плагин=Maintenance-4\.1\.jar каталог=Maintenance ключ=maintenance-enabled значение=true/);
  assert.match(r.out, /онлайн: 0 из 20/);
  assert.match(r.out, /ник владельца.*: OwnerNick/);
  assert.match(r.out, /state: нет/);
  assert.equal(posts(d).length, 0, "статус - только чтение");
  assert.ok(!r.out.includes(API_KEY) && !r.out.includes("secretvalue") && !r.out.includes("11111111-1111-3111"));
});

test("--status: ник владельца не найден - пропущен; фиктивный StandPlayer не считается ником", () => {
  const d = mk({ owner: false });
  assert.match(access(d, "--status").out, /ник владельца.*: не найден/);
  const d2 = mk(); writeFileSync(join(d2, "psql.out"), "StandPlayer|de30c0de-0000-4000-8000-0000005747a4\n");
  assert.match(access(d2, "--status").out, /ник владельца.*: не найден/);
});

test("--open: бэкап, whitelist add (ники + владелец), техработы выключены, state 600, журнал; --restore возвращает всё по state", () => {
  const d = mk();
  const o = access(d, "--open TwoMCStandBot Alice");
  assert.equal(o.code, 0, o.out + o.err);
  assert.deepEqual(wl(d).sort(), ["Alice", "OwnerNick", "TwoMCStandBot"]);
  assert.match(rd(d, "fs/plugins/Maintenance/config.yml"), /maintenance-enabled: false/);
  assert.ok(fsHas(d, "whitelist.json.bak-"), "бэкап whitelist.json");
  assert.ok(fsHas(d, "plugins/Maintenance/config.yml.bak-"), "бэкап config техработ");
  const bak = readdirSync(join(d, "fs/plugins/Maintenance")).find((n) => n.startsWith("config.yml.bak-"));
  assert.match(readFileSync(join(d, "fs/plugins/Maintenance", bak), "utf8"), /maintenance-enabled: true/);
  const st = rd(d, "access.state");
  assert.match(st, /STATUS=open/); assert.match(st, /WL_ADDED=TwoMCStandBot,OwnerNick/); assert.match(st, /WL_PRE=Alice/); assert.match(st, /MT_WAS=true/);
  assert.equal(spawnSync("bash", ["-c", `umask 077; stat -c %a "${posix(d)}/access.state"`], { encoding: "utf8" }).stdout.trim(), "600");
  const cmds = rd(d, "commands.log");
  assert.ok(cmds.includes("whitelist add TwoMCStandBot") && cmds.includes("whitelist add OwnerNick") && cmds.includes("maintenance off"));
  assert.ok(!cmds.includes("whitelist add Alice"), "уже бывший ник не добавляется");
  const j = journal(d).join("\n");
  assert.match(j, /\/whitelist\.json \| whitelist: TwoMCStandBot \| absent \| added/);
  assert.match(j, /\/plugins\/Maintenance\/config\.yml \| maintenance-enabled \| true \| false/);
  assert.ok(!j.includes(API_KEY));
  // мир и данные игроков не тронуты
  assert.equal(rd(d, "fs/world/level.dat"), "WORLD-DATA"); assert.equal(rd(d, "fs/playerdata/a.dat"), "PLAYER-DATA");

  // повторный --open ничего не ломает и не затирает прежние значения в state
  const o2 = access(d, "--open TwoMCStandBot");
  assert.equal(o2.code, 0, o2.out + o2.err);
  const st2 = rd(d, "access.state");
  assert.match(st2, /WL_ADDED=TwoMCStandBot,OwnerNick/); assert.match(st2, /MT_WAS=true/); assert.match(st2, /WL_PRE=Alice/);

  const r = access(d, "--restore");
  assert.equal(r.code, 0, r.out + r.err);
  assert.deepEqual(wl(d), ["Alice"]);
  assert.match(rd(d, "fs/plugins/Maintenance/config.yml"), /maintenance-enabled: true/);
  assert.ok(!rd(d, "commands.log").includes("whitelist remove Alice"));
  assert.match(r.out, /whitelist добавленные нами убраны \| нет \| нет \| OK/);
  assert.match(r.out, /техработы \| true \| true \| OK/);
  assert.ok(!r.out.includes("DIFF"));
  assert.ok(!existsSync(join(d, "access.state")) && readdirSync(d).some((n) => n.startsWith("access.state.restored-")), "state переименован, не удалён");
  assert.match(journal(d).join("\n"), /whitelist: TwoMCStandBot \| added \| removed/);
  // повторный --restore: нечего восстанавливать
  assert.match(access(d, "--restore").out, /нечего восстанавливать/);
});

test("--open при выключенных техработах: плагин не трогается; ник Alice уже в whitelist не попадёт в WL_ADDED", () => {
  const d = mk({ maintenance: "false" });
  const o = access(d, "--open Alice --no-owner");
  assert.equal(o.code, 0, o.out + o.err);
  assert.ok(!rd(d, "commands.log").includes("maintenance"));
  assert.ok(!fsHas(d, "plugins/Maintenance/config.yml.bak-"));
  assert.match(rd(d, "access.state"), /WL_ADDED=\n/);
  const r = access(d, "--restore");
  assert.equal(r.code, 0, r.out + r.err);
  assert.deepEqual(wl(d), ["Alice"]);
  assert.ok(!rd(d, "commands.log").includes("whitelist remove"), "чужие записи не удаляются");
});

test("--open/--restore при остановленном сервере: отказ, к панели ничего не уходит", () => {
  const d = mk({ state: "offline" });
  const o = access(d, "--open Bot1");
  assert.equal(o.code, 4, o.out + o.err);
  assert.equal(posts(d).length, 0);
  assert.equal(access(d, "--restore").code, 0);
});

test("devsrv-access: аргументы проверяются", () => {
  const d = mk();
  assert.equal(access(d, "").code, 2);
  assert.equal(access(d, "--open 'a;b'").code, 2);
  assert.equal(access(d, "--status Bob").code, 2);
  assert.equal(access(d, "--status --open Bob").code, 2);
  assert.equal(access(d, "--open --no-owner").code, 2);
  assert.equal(access(d, "--bogus").code, 2);
  assert.equal(calls(d), "");
});
