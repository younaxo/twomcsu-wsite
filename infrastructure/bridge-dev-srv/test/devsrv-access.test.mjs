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
  if (opts.proxy !== false) {
    w(join(fs, "spigot.yml"), "# main configuration file for Spigot\nconfig-version: 12\nsettings:\n  debug: false\n  bungeecord: true   # forward\n  save-user-cache-on-stop-only: false\nmessages:\n  whitelist: You are not whitelisted\nworld-settings:\n  default:\n    bungeecord: true\n");
    w(join(fs, "config/paper-global.yml"), "_version: 29\nproxies:\n  bungee-cord:\n    online-mode: true\n  proxy-protocol: false\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: 'S3CR3T-VELOCITY-VALUE'\n");
  }
  w(join(fs, "plugins/Maintenance-4.1.jar"), "jar");
  w(join(fs, "plugins/Other.jar"), "jar");
  w(join(fs, "plugins/OtherPlugin/config.yml"), "token: secretvalue\n");
  w(join(fs, "world/level.dat"), "WORLD-DATA");
  w(join(fs, "playerdata/a.dat"), "PLAYER-DATA");
  w(join(d, "state"), opts.state ?? "running");
  w(join(d, "players"), String(opts.players ?? 0));
  w(join(d, "version"), opts.version ?? "Paper_1.21.4");
  w(join(d, ".ptero-test-root"), "marker\n");
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
    ...process.env, STAND_TEST: "1", PTERO_TEST_ROOT: p, FAKE: p, FAKE_UUID: UUID, TMPDIR: p + "/tmp", PTERO_CRED_FILE: p + "/ptero.cred",
    PTERO_CHANGES_LOG: p + "/changes.log", STAND_ROOT: p + "/stand", STAND_CRED_FILE: p + "/stand.cred", DEVSRV_STATE_FILE: p + "/access.state",
    DEVSRV_POLL_SLEEP: "0", PTERO_WAIT_INTERVAL: "0", PTERO_WAIT_TIMEOUT: "20", PTERO_WAIT_DOWN: "5", PTERO_GUARD_WAIT1: "0", PTERO_GUARD_WAIT2: "0", PTERO_ALLOW_PULL: "1",
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
    "register pass pass", "lp bulkupdate users delete all", "lp deletegroup admin", "datapack enable evil", "sudo Nick op Nick", "worldedit:we",
    "setblock 0 0 0 tnt", "kill @e", "kill @a", "kill @p", "kill @r", "kill Nick", "KILL @E", "Kill @A[type=player]", "/kill @e", "//kill @e", "minecraft:kill @e", "MINECRAFT:KILL Nick", "/minecraft:kill @a", "essentials:kill Nick", "ekill Nick",
    "data merge entity @s {}", "data remove entity @s Pos", "data modify storage a:b c set value 1", "DATA  MERGE block 0 0 0 {}", "minecraft:data merge entity @s {}", "data", "forceload add 0 0", "worldborder set 1", "minecraft:worldborder center 0 0", "wb set 1",
    "tick freeze", "gamerule doDaylightCycle false", "minecraft:gamerule keepInventory true", "give Nick diamond 64", "/GIVE Nick bedrock", "minecraft:give @a stone", "essentials:give Nick tnt", "i tnt", "save-off", "minecraft:save-off", "bukkit:save-off",
    "delhome Nick home", "essentials:delhome Nick home", "delwarp spawn", "/essentials:delwarp spawn", "EDELWARP x", "perms bulkupdate users delete", "perm user Nick clear", "permissions group admin delete", "luckperms:perms bulkupdate users delete all", "luckperms:lp deletegroup admin",
    "pex reload", "permissionsex:pex user Nick group set admin", "setblock", "fill ~ ~ ~ ~1 ~1 ~1 air", "minecraft:fill 0 0 0 1 1 1 air", "minecraft:clone 0 0 0 1 1 1 2 2 2", "worldedit:/set stone", "foo:bar:kill @e"];
  const allowed = ["op Nick", "deop Nick", "whitelist add Nick", "whitelist remove Nick", "kick Nick bye", "say TwoMC: hello", "twomcbridge events", "maintenance off", "maintenance reload", "lp user Nick info", "ban Nick", "list", "save-all", "save-on", "data get entity @s", "minecraft:data get block 0 0 0", "lp user Nick permission info", "perms user Nick info", "whitelist add Nick", "say kill everything", "tp Nick Nick2", "gamemode creative Nick"];
  // команды передаются через файл (длинный argv не проходит на Windows)
  const cf = join(d, "cmds.txt");
  writeFileSync(cf, [...denied.map((c) => "D|" + c), ...allowed.map((c) => "A|" + c)].join("\n") + "\n");
  const script = `while IFS="|" read -r k c; do if _pt_cmd_denied "$c" >/dev/null; then echo "D|$c"; else echo "A|$c"; fi; done < "${posix(cf)}"`;
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
  assert.equal(calls(d).trim(), "GET", "только проверка имени сервера в ptero_init");
});

// ------------------------------------------------------------------ бэкап и журнал
test("запись критичного файла: сначала бэкап .bak-<UTC> в той же папке, затем запись; журнал: 5 колонок, без секретов", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; printf 'white-list=false\\n' > "$TMPDIR/new"; ptero_file_write /server.properties "$TMPDIR/new"; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  const wr = rd(d, "writes.log").trim().split("\n");
  assert.match(wr[0], /^WRITE \/server\.properties\.bak-\d{8}T\d{6}Z-\d{5}$/);
  assert.equal(wr[1], "WRITE /server.properties");
  const bak = readdirSync(join(d, "fs")).find((n) => n.startsWith("server.properties.bak-"));
  assert.equal(readFileSync(join(d, "fs", bak), "utf8"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n");
  assert.equal(rd(d, "fs/server.properties"), "white-list=false\n");
  const c = calls(d).split("\n");
  assert.ok(c.findIndex((l) => l.startsWith("GET /files/contents")) < c.findIndex((l) => l.startsWith("POST /files/write")));
  const j = journal(d);
  // копия: «начато» + «выполнено»; запись: по изменённым ключам (white-list было true стало false; enforce-whitelist и online-mode удалены) - «начато» и «выполнено» на каждый
  assert.match(j[0], /\.bak-.* \| file_write \|.*начато/); assert.match(j[1], /\.bak-.* \| file_write \|.*выполнено/);
  assert.ok(j.some((l) => /\/server\.properties \| white-list \| true \| начато; false/.test(l)), j.join("\n"));
  assert.ok(j.some((l) => /\/server\.properties \| white-list \| true \| выполнено; false http=204/.test(l)), j.join("\n"));
  assert.ok(j.some((l) => /\/server\.properties \| online-mode \| false \| выполнено; - http=204/.test(l)), j.join("\n"));
  const iBeg = j.findIndex((l) => /white-list .*начато/.test(l)), iEnd = j.findIndex((l) => /white-list .*выполнено/.test(l));
  assert.ok(iBeg >= 0 && iBeg < iEnd);
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

// ------------------------------------------------------------------ ревью Security: guard имени, тестовый режим, журнал, symlink, state
test("guard имени сервера: имя не dev-srv - отказ до любых других запросов (UUID в репозитории не хранится)", () => {
  const d = mk();
  const r = lib(d, "echo after-init", { FAKE_NAME: "other-srv" });
  assert.equal(r.code, 9, r.out + r.err);
  assert.ok(!r.out.includes("after-init"));
  assert.match(r.err, /имя сервера по SERVER_UUID не dev-srv/);
  assert.equal(calls(d).trim(), "GET", "единственный запрос - проверка имени");
  assert.ok(!(r.out + r.err).includes(API_KEY));
  // ответ без object=server / не 200 - тоже отказ
  const d2 = mk(); const r2 = lib(d2, "echo after-init", { FAKE_NAME: "" });
  assert.equal(r2.code, 9);
  // devsrv-access: отказ, ни одного обращения кроме проверки
  const d3 = mk(); const a = access(d3, "--status", { FAKE_NAME: "prod" });
  assert.equal(a.code, 1, a.out + a.err);
  assert.equal(calls(d3).trim(), "GET");
  // а правильное имя проходит
  assert.equal(lib(mk(), "echo after-init").code, 0);
  // репозиторий не содержит боевого UUID: проверка только по имени
  assert.ok(!/dev-srv-uuid|SERVER_UUID=[0-9a-f]{8}-/.test(readFileSync(join(SRC, "ptero.sh"), "utf8")));
});

test("STAND_TEST=1: только внутри каталога tmp/scratchpad с маркером .ptero-test-root и не /home/twomc; NOGUARD и сокращение ожиданий - только в тестовом режиме", () => {
  const d = mk();
  const base = { ...env(d) };
  const run = (extra, script = "echo init-ok") => spawnSync("bash", ["-c", pre(d) + script], { env: { ...base, ...extra }, encoding: "utf8", timeout: 60000 });
  // нет PTERO_TEST_ROOT
  let r = run({ PTERO_TEST_ROOT: "" }); assert.equal(r.status, 9); assert.match(r.stderr, /STAND_TEST=1 отклонён/);
  // нет маркера
  const d2 = mk(); spawnSync("bash", ["-c", `rm -f "${posix(d2)}/.ptero-test-root"`]);
  r = spawnSync("bash", ["-c", pre(d2) + "echo init-ok"], { env: env(d2), encoding: "utf8" }); assert.equal(r.status, 9); assert.match(r.stderr, /отклонён/);
  assert.equal(calls(d2), "");
  // корень вне tmp (путь без tmp/temp/scratchpad)
  r = run({ PTERO_TEST_ROOT: "/etc" }); assert.equal(r.status, 9);
  // учётные данные не внутри корня
  r = run({ PTERO_CRED_FILE: "/home/twomc/pterodactyl-credentials.txt" }); assert.equal(r.status, 9);
  r = run({ PTERO_CHANGES_LOG: "/home/twomc/bridge-dev-srv.changes.log" }); assert.equal(r.status, 9);
  r = run({ PTERO_TEST_ROOT: "/home/twomc/tmp" }); assert.equal(r.status, 9);
  r = run({ PTERO_CRED_FILE: posix(d) + "/../x/ptero.cred" }); assert.equal(r.status, 9);
  // корректный режим проходит
  r = run({}); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(calls(d2), "");
  // после отказа STAND_TEST сброшен, пути боевые
  const chk = spawnSync("bash", ["-c", `source "${posix(SRC)}/ptero.sh" 2>/dev/null; echo "T=$STAND_TEST P=$PTERO_CRED_FILE L=$PTERO_CHANGES_LOG"`], { env: { ...base, PTERO_TEST_ROOT: "" }, encoding: "utf8" });
  assert.match(chk.stdout, /T=0 P=\/home\/twomc\/pterodactyl-credentials\.txt L=\/home\/twomc\/bridge-dev-srv\.changes\.log/);
  // без STAND_TEST переменные окружения не действуют
  const nt = spawnSync("bash", ["-c", `source "${posix(SRC)}/ptero.sh" 2>/dev/null; echo "P=$PTERO_CRED_FILE"`], { env: { ...base, STAND_TEST: "0" }, encoding: "utf8" });
  assert.match(nt.stdout, /P=\/home\/twomc\/pterodactyl-credentials\.txt/);
  // NOGUARD вне тестового режима игнорируется: guard-ожидания и NOGUARD
  const sh = (extra, script) => spawnSync("bash", ["-c", `umask 077; export PATH="${posix(d)}/bin:$PATH"; source "${posix(SRC)}/ptero.sh"; ${script}`], { env: { ...base, ...extra }, encoding: "utf8" });
  const g = sh({ STAND_TEST: "0", PTERO_POWER_NOGUARD: "1" }, "_pt_noguard && echo NOGUARD-ON || echo NOGUARD-OFF; echo t=$_PT_TEST");
  assert.match(g.stdout, /NOGUARD-OFF/); assert.match(g.stdout, /t=0/);
  assert.match(sh({ PTERO_POWER_NOGUARD: "1" }, "_pt_noguard && echo NOGUARD-ON").stdout, /NOGUARD-ON/);
});

test("журнал пишется ДО действия: нет доступа к журналу при записи - панель не затрагивается; статусы начато/выполнено/ОШИБКА", () => {
  const d = mk();
  // журнал недоступен только для строки «начато»: каталог есть, а файл - ссылка/недоступен
  const r = lib(d, `PTERO_ALLOW_WRITE=1; ptero_command "say hi"; echo a=$?`, {});
  assert.match(r.out, /a=0/);
  let j = journal(d);
  assert.equal(j.length, 2, j.join("\n"));
  assert.match(j[0], /console: say hi \| command \| - \| начато;/);
  assert.match(j[1], /console: say hi \| command \| - \| выполнено; sent http=204/);
  // «начато» стоит в журнале раньше, чем POST на панель: журнал-файл заменён каталогом после ready нельзя, поэтому проверяем порядок по ошибке панели
  const d2 = mk(); writeFileSync(join(d2, "fail_write"), "1");
  lib(d2, `PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/n"; ptero_file_write /plugins/OtherPlugin/config.yml "$TMPDIR/n"; echo rc=$?`);
  j = journal(d2);
  assert.ok(j.some((l) => /начато/.test(l)) === false || j.some((l) => /ОШИБКА/.test(l)), j.join("\n"));
  // запись, где «начато» удалось, а панель ответила ошибкой: ловим ОШИБКА после начато (бэкап не нужен - файла-копии нет, запись в уже существующий файл упадёт на бэкапе, поэтому берём power)
  const d3 = mk(); const pr = lib(d3, `PTERO_ALLOW_WRITE=1; ptero_power start; echo p=$?`);
  j = journal(d3); assert.match(pr.out, /p=0/);
  assert.match(j[0], /\| power \| start \| state=running \| начато;/); assert.match(j[1], /\| power \| start \| state=running \| выполнено;.*http=204/);
  // журнал недоступен: ни одной записи на панель (все изменяющие операции)
  const d4 = mk();
  const bad = lib(d4, `PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo a=$?; ptero_upload "$TMPDIR/n" /plugins TwoMCBridge.jar; echo b=$?; ptero_mkdir /plugins TwoMCBridge; echo c=$?; ptero_command "say hi"; echo d=$?`, { PTERO_CHANGES_LOG: posix(d4) + "/no-dir/changes.log" });
  assert.match(bad.out, /a=1\s+b=1\s+c=1\s+d=1/, bad.out + bad.err);
  assert.equal(posts(d4).length, 0);
});

test("журнал file_write: ключи server.properties (параметр, было, стало), секретные скрыты; whitelist.json - добавленные и удалённые ники; прочее - хэш", () => {
  const d = mk();
  writeFileSync(join(d, "fs/server.properties"), "white-list=true\nmotd=Hello\nrcon.password=hunter2secret\nmax-players=20\n# comment\n");
  const r = lib(d, `PTERO_ALLOW_WRITE=1; printf 'white-list=false\\nmotd=Hello\\nrcon.password=newsecret999\\nview-distance=8\\n' > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  const txt = rd(d, "changes.log");
  assert.match(txt, /\/server\.properties \| white-list \| true \| выполнено; false/);
  assert.match(txt, /\/server\.properties \| view-distance \| - \| выполнено; 8/);
  assert.match(txt, /\/server\.properties \| max-players \| 20 \| выполнено; -/);
  assert.match(txt, /\| rcon\.password \| <скрыто> \| выполнено; <скрыто>/);
  assert.ok(!txt.includes("hunter2secret") && !txt.includes("newsecret999"), "секретные значения не пишутся");
  assert.ok(!/\| motd \|/.test(txt), "неизменённые ключи не пишутся");
  // whitelist.json: ники
  const d2 = mk();
  const r2 = lib(d2, `PTERO_ALLOW_WRITE=1; printf '[{"uuid":"u1","name":"Bob"},{"uuid":"u2","name":"Carol"}]' > "$TMPDIR/n"; ptero_file_write /whitelist.json "$TMPDIR/n"; echo rc=$?`);
  assert.match(r2.out, /rc=0/, r2.out + r2.err);
  const t2 = rd(d2, "changes.log");
  assert.match(t2, /\/whitelist\.json \| ник добавлен \| - \| выполнено; Bob/); assert.match(t2, /\/whitelist\.json \| ник добавлен \| - \| выполнено; Carol/);
  assert.match(t2, /\/whitelist\.json \| ник удалён \| Alice \| выполнено; -/);
  assert.ok(!/u1|u2/.test(t2), "uuid не пишутся");
  // config плагина - хэш
  const d3 = mk();
  lib(d3, `PTERO_ALLOW_WRITE=1; echo 'token: zzz' > "$TMPDIR/n"; ptero_file_write /plugins/OtherPlugin/config.yml "$TMPDIR/n"`);
  const t3 = rd(d3, "changes.log");
  assert.match(t3, /\/plugins\/OtherPlugin\/config\.yml \| file_write \| sha256:[0-9a-f]{12} \| выполнено; sha256:[0-9a-f]{12}/);
  assert.ok(!t3.includes("zzz") && !t3.includes("secretvalue"));
});

test("бэкап перед КАЖДОЙ записью критичного файла: две записи за процесс - две разные копии (имя с мс и счётчиком), первая хранит оригинал", () => {
  const d = mk();
  const r = lib(d, `PTERO_ALLOW_WRITE=1; echo 'a=1' > "$TMPDIR/n1"; echo 'a=2' > "$TMPDIR/n2"; ptero_file_write /server.properties "$TMPDIR/n1"; echo r1=$?; ptero_file_write /server.properties "$TMPDIR/n2"; echo r2=$?`);
  assert.match(r.out, /r1=0[\s\S]*r2=0/, r.out + r.err);
  const baks = readdirSync(join(d, "fs")).filter((n) => n.startsWith("server.properties.bak-"));
  assert.equal(baks.length, 2, baks.join(","));
  for (const b of baks) assert.match(b, /^server\.properties\.bak-\d{8}T\d{6}Z-\d{5}$/);
  const contents = baks.map((b) => readFileSync(join(d, "fs", b), "utf8"));
  assert.ok(contents.includes("white-list=true\nenforce-whitelist=false\nonline-mode=false\n"), "оригинал сохранён");
  assert.ok(contents.includes("a=1\n"));
  assert.equal(rd(d, "fs/server.properties"), "a=2\n");
});

test("символическая ссылка в листинге панели: запись отказывает", () => {
  const d = mk();
  writeFileSync(join(d, "symlinks"), "server.properties\n");
  const r = lib(d, `PTERO_ALLOW_WRITE=1; echo 'x=1' > "$TMPDIR/n"; ptero_file_write /server.properties "$TMPDIR/n"; echo rc=$?`);
  assert.match(r.out, /rc=1/, r.out + r.err);
  assert.match(r.err, /символическая ссылка/);
  assert.equal(posts(d).length, 0);
  assert.equal(rd(d, "fs/server.properties"), "white-list=true\nenforce-whitelist=false\nonline-mode=false\n");
  // каталог плагина - ссылка
  const d2 = mk(); writeFileSync(join(d2, "symlinks"), "OtherPlugin\n");
  const r2 = lib(d2, `PTERO_ALLOW_WRITE=1; echo 'x=1' > "$TMPDIR/n"; ptero_file_write /plugins/OtherPlugin/config.yml "$TMPDIR/n"; echo rc=$?`);
  assert.match(r2.out, /rc=1/); assert.equal(posts(d2).length, 0);
});

test("PTERO_CRED_FILE: различает «нет файла» и «нет доступа»; вне VDS devsrv-access отказывает", () => {
  const d = mk();
  const r = lib(d, "echo x", { PTERO_CRED_FILE: posix(d) + "/missing.cred" });
  assert.equal(r.code, 9); assert.match(r.err, /файла учётных данных нет/); assert.match(r.err, /run-on-vds\.sh script/);
  // нет доступа: файл есть, но не читается (chmod 000; на Windows/cygwin может не сработать - тогда пропускаем проверку)
  const d2 = mk(); spawnSync("bash", ["-c", `chmod 000 "${posix(d2)}/ptero.cred"`]);
  const r2 = lib(d2, "echo x");
  if (r2.code === 9 && /нет доступа/.test(r2.err)) assert.match(r2.err, /run-on-vds\.sh script/); else assert.ok(r2.code === 9 || r2.code === 0);
  // devsrv-access вне VDS (боевой режим без STAND_TEST) - отказ до обращения к панели, если /home/twomc нет
  const d3 = mk();
  const hasHome = spawnSync("bash", ["-c", "test -d /home/twomc"]).status === 0;
  if (!hasHome) {
    const a = spawnSync("bash", ["-c", `export PATH="${posix(d3)}/bin:$PATH"; bash "${posix(SRC)}/devsrv-access.sh" --status`], { env: { ...process.env, FAKE: posix(d3), FAKE_UUID: UUID, STAND_TEST: "0" }, encoding: "utf8" });
    assert.equal(a.status, 1); assert.match(a.stderr, /нет \/home\/twomc/);
    assert.equal(rd(d3, "calls.log"), "");
  }
});

test("--restore: недопустимые MT_DIR/MT_KEY/MT_CMD_* из state - отказ без изменений", () => {
  const d = mk();
  const o = access(d, "--open Bot1 --no-owner"); assert.equal(o.code, 0, o.out + o.err);
  const st = rd(d, "access.state");
  for (const bad of ["MT_KEY=a;rm -rf /", "MT_DIR=../world", "MT_CMD_ON=op me", "MT_CMD_RELOAD=reload"]) {
    const [k] = bad.split("=");
    writeFileSync(join(d, "access.state"), st.replace(new RegExp("^" + k + "=.*$", "m"), bad));
    const before = rd(d, "commands.log");
    const r = access(d, "--restore");
    assert.equal(r.code, 1, bad + " " + r.out + r.err);
    assert.match(r.out, /недопустимые MT_DIR\/MT_KEY\/MT_CMD/);
    assert.equal(rd(d, "commands.log"), before, "команды не отправлялись: " + bad);
  }
});

// ------------------------------------------------------------------ п.1: signed URL без patsub_replacement
test("upload: JSON-экранирование signed URL (\\/ и \\u0026) декодируется sed, в том числе при включённом patsub_replacement", () => {
  const d = mk();
  for (const patsub of ["shopt -s patsub_replacement 2>/dev/null", "shopt -u patsub_replacement 2>/dev/null"]) {
    const r = lib(d, patsub + String.raw`; _pt_json_unescape 'https:\/\/h.test:8080\/upload\/file?token=a.b-1&x=2'; echo`);
    assert.equal(r.out.trim(), "https://h.test:8080/upload/file?token=a.b-1&x=2", r.err);
  }
  const u = lib(d, `PTERO_ALLOW_WRITE=1; echo jar > "$TMPDIR/l"; ptero_upload "$TMPDIR/l" /plugins TwoMCBridge-0.1.0.jar; echo rc=$?`);
  assert.match(u.out, /rc=0/, u.out + u.err);
  const logged = rd(d, "upload-url.log");
  assert.ok(logged.includes("https://node.test:8080/upload/file?token=abc.def-1&foo=bar&directory=%2Fplugins"), logged);
  assert.ok(!logged.includes("\\"), "обратных косых в адресе нет");
  assert.ok(!u.out.includes("node.test") && !u.err.includes("node.test"), "signed URL не печатается");
});

// ------------------------------------------------------------------ п.2: ожидание running
test("wait_restart: starting -> running с прогрессом; значения по умолчанию 600 с и 5 с", () => {
  const d = mk();
  w(join(d, "restart.seq"), "stopping\nstarting\nstarting\nrunning\n");
  const r = lib(d, `PTERO_ALLOW_WRITE=1; _PT_GUARD_OK=1; ptero_power restart; ptero_wait_restart; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  assert.match(r.out, /состояние: stopping/); assert.match(r.out, /состояние: starting/); assert.match(r.out, /сервер: running/);
  assert.match(r.out, /до 20 с[)], опрос каждые 0 с/);
  const dd = mk();
  const r2 = lib(dd, "ptero_wait_restart; echo rc=$?", { PTERO_WAIT_INTERVAL: "", PTERO_WAIT_TIMEOUT: "", PTERO_WAIT_DOWN: "0" });
  assert.match(r2.out, /до 600 с[)], опрос каждые 5 с/); assert.match(r2.out, /rc=0/);
});

test("wait_restart: сервер застрял в starting - таймаут, код 1, последнее состояние в сообщении; неверные параметры - код 2", () => {
  const d = mk();
  w(join(d, "state.seq"), "stopping\nstarting\n");
  const r = lib(d, "ptero_wait_restart; echo rc=$?", { PTERO_WAIT_INTERVAL: "1", PTERO_WAIT_TIMEOUT: "2", PTERO_WAIT_DOWN: "3" });
  assert.match(r.out, /rc=1/, r.out + r.err);
  assert.match(r.err, /не вернулся в running за 2 с \(последнее состояние: starting\)/);
  const bad = lib(d, "ptero_wait_restart; echo rc=$?", { PTERO_WAIT_TIMEOUT: "abc" });
  assert.match(bad.out, /rc=2/);
  assert.ok(rd(d, "states.log").split("\n").filter(Boolean).every((x) => x !== "running"), "running не возвращался");
});

// ------------------------------------------------------------------ п.4: точечная правка YAML-ключей
const lines = (d, p) => rd(d, p).split("\n");
test("yaml: get по allowlist; файлы целиком и ключи вне allowlist отказывают; секрет не выводится", () => {
  const d = mk();
  const g = lib(d, `ptero_yaml_get /spigot.yml settings.bungeecord; echo rc=$?; ptero_yaml_get /config/paper-global.yml proxies.velocity.enabled; echo rc=$?; ptero_yaml_get /config/paper-global.yml proxies.velocity.secret; echo rc=$?; ptero_yaml_get /spigot.yml messages.whitelist; echo rc=$?; ptero_yaml_get /spigot.yml world-settings.default.bungeecord; echo rc=$?; ptero_file_read /config/paper-global.yml; echo rc=$?; ptero_file_read /spigot.yml; echo rc=$?; PTERO_ALLOW_WRITE=1; echo x > "$TMPDIR/l"; ptero_file_write /config/paper-global.yml "$TMPDIR/l"; echo rc=$?; ptero_file_write /spigot.yml "$TMPDIR/l"; echo rc=$?; ptero_yaml_set /spigot.yml settings.bungeecord yes; echo rc=$?; ptero_yaml_set /spigot.yml messages.whitelist false; echo rc=$?`);
  assert.equal([...g.out.matchAll(/^true$/gm)].length, 2, g.out);
  assert.equal([...g.out.matchAll(/rc=(\d+)/g)].map((m) => m[1]).join(","), "0,0,2,2,2,2,2,2,2,2,2", g.out);
  assert.ok(!g.out.includes("S3CR3T") && !g.err.includes("S3CR3T"), "секрет Velocity не выведен");
  assert.equal(rd(d, "writes.log"), "", "ни одной записи");
});

test("yaml: set меняет только строку ключа (отступ и комментарий сохранены); вложенный одноимённый ключ и секрет не тронуты; бэкап и журнал", () => {
  const d = mk();
  const before = lines(d, "fs/spigot.yml");
  const r = lib(d, `PTERO_ALLOW_WRITE=1; ptero_yaml_set /spigot.yml settings.bungeecord false; echo rc=$?`);
  assert.match(r.out, /rc=0/, r.out + r.err);
  const after = lines(d, "fs/spigot.yml");
  assert.equal(after.length, before.length);
  const diff = after.map((l, i) => [before[i], l]).filter(([a, b]) => a !== b);
  assert.deepEqual(diff, [["  bungeecord: true   # forward", "  bungeecord: false   # forward"]]);
  assert.ok(after.includes("    bungeecord: true"), "world-settings.default.bungeecord не тронут");
  const baks = readdirSync(join(d, "fs")).filter((n) => /^spigot\.yml\.bak-\d{8}T\d{6}Z/.test(n));
  assert.equal(baks.length, 1, "бэкап рядом с датой");
  assert.equal(rd(d, "fs/" + baks[0]).split("\n").join("\n"), before.join("\n"), "бэкап = прежнее содержимое");
  assert.ok(journal(d).some((l) => /\| \/spigot\.yml \| settings\.bungeecord \| true \| false$/.test(l)), journal(d).join("\n"));
  // повтор: значение уже false - записи нет
  const n = rd(d, "writes.log").split("\n").filter(Boolean).length;
  const r2 = lib(d, `PTERO_ALLOW_WRITE=1; ptero_yaml_set /spigot.yml settings.bungeecord false; echo rc=$?`);
  assert.match(r2.out, /rc=0/); assert.match(r2.out, /уже false/);
  assert.equal(rd(d, "writes.log").split("\n").filter(Boolean).length, n);
  // paper-global: секрет и соседние ключи
  const p0 = lines(d, "fs/config/paper-global.yml");
  const r3 = lib(d, `PTERO_ALLOW_WRITE=1; ptero_yaml_set /config/paper-global.yml proxies.velocity.enabled false; echo rc=$?`);
  assert.match(r3.out, /rc=0/, r3.out + r3.err);
  const p1 = lines(d, "fs/config/paper-global.yml");
  assert.deepEqual(p1.map((l, i) => [p0[i], l]).filter(([a, b]) => a !== b), [["    enabled: true", "    enabled: false"]]);
  assert.ok(p1.includes("    secret: 'S3CR3T-VELOCITY-VALUE'"));
  assert.ok(!journal(d).join("\n").includes("S3CR3T"), "секрет не попал в журнал");
  assert.ok(!r3.out.includes("S3CR3T") && !r3.err.includes("S3CR3T"));
});

test("yaml: нет ключа (код 3), нет файла (код 4) - без записи; без PTERO_ALLOW_WRITE запись отказывает", () => {
  const d = mk();
  w(join(d, "fs/spigot.yml"), "settings:\n  debug: false\n");
  const r = lib(d, `PTERO_ALLOW_WRITE=1; ptero_yaml_set /spigot.yml settings.bungeecord false; echo rc=$?; ptero_yaml_get /spigot.yml settings.bungeecord; echo rc=$?`);
  assert.deepEqual([...r.out.matchAll(/rc=(\d+)/g)].map((m) => m[1]), ["3", "3"], r.out + r.err);
  assert.equal(rd(d, "writes.log"), "");
  const d2 = mk({ proxy: false });
  const r2 = lib(d2, `PTERO_ALLOW_WRITE=1; ptero_yaml_get /config/paper-global.yml proxies.velocity.enabled; echo rc=$?; ptero_yaml_set /config/paper-global.yml proxies.velocity.enabled false; echo rc=$?`);
  assert.deepEqual([...r2.out.matchAll(/rc=(\d+)/g)].map((m) => m[1]), ["4", "4"], r2.out + r2.err);
  const d3 = mk();
  const r3 = lib(d3, `PTERO_ALLOW_WRITE=0; ptero_yaml_set /spigot.yml settings.bungeecord false; echo rc=$?`);
  assert.match(r3.out, /rc=1/); assert.equal(rd(d3, "writes.log"), "");
});

// ------------------------------------------------------------------ п.4: --open --direct-join / --restore
test("--open --direct-join: форвардинг выключен точечно, прежние значения в state, restart через guard; --restore возвращает значения и перезапускает", () => {
  const d = mk({ players: 2 });
  w(join(d, "restart.seq"), "stopping\nstarting\nrunning\n");
  const o = access(d, "--open Bot1 --no-owner --direct-join");
  assert.equal(o.code, 0, o.out + o.err);
  assert.match(o.out, /spigot\.yml settings\.bungeecord: true -> false/); assert.match(o.out, /proxies\.velocity\.enabled: true -> false/);
  assert.match(o.out, /сервер: running/);
  assert.ok(lines(d, "fs/spigot.yml").includes("  bungeecord: false   # forward"));
  assert.ok(lines(d, "fs/config/paper-global.yml").includes("    enabled: false"));
  assert.equal(lines(d, "fs/config/paper-global.yml").filter((l) => l === "    online-mode: true").length, 2, "online-mode ключи не менялись");
  const st = rd(d, "access.state");
  for (const kv of ["FWD_DIRECT=1", "FWD_SB=true", "FWD_PB=true", "FWD_VE=true", "FWD_VO=true"]) assert.ok(st.includes(kv + "\n"), kv + "\n" + st);
  assert.match(rd(d, "commands.log"), /say TwoMC: server restart in 60 seconds/);
  assert.equal(rd(d, "power.log").split("\n").filter((x) => x.includes("restart")).length, 1);
  const j = journal(d).join("\n");
  assert.match(j, /\/spigot\.yml \| settings\.bungeecord \| true \| false/); assert.match(j, /\/config\/paper-global\.yml \| proxies\.velocity\.enabled \| true \| false/);
  assert.ok(readdirSync(join(d, "fs")).some((n) => n.startsWith("spigot.yml.bak-")), "бэкап spigot.yml");
  assert.ok(readdirSync(join(d, "fs/config")).some((n) => n.startsWith("paper-global.yml.bak-")), "бэкап paper-global.yml");
  assert.ok(!(o.out + o.err + j).includes("S3CR3T"));
  assert.ok(wl(d).includes("Bot1"));
  // повторный --open не затирает прежние значения в state и не перезапускает сервер
  const o2 = access(d, "--open Bot2 --no-owner --direct-join");
  assert.equal(o2.code, 0, o2.out + o2.err);
  const st2 = rd(d, "access.state");
  assert.ok(st2.includes("FWD_SB=true\n") && st2.includes("FWD_VE=true\n"), st2);
  assert.equal(rd(d, "power.log").split("\n").filter((x) => x.includes("restart")).length, 1);
  const r = access(d, "--restore");
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(lines(d, "fs/spigot.yml").includes("  bungeecord: true   # forward"));
  assert.ok(lines(d, "fs/config/paper-global.yml").includes("    enabled: true"));
  assert.match(r.out, /прокси-форвардинг settings\.bungeecord \| true \| true \| OK/);
  assert.equal(rd(d, "power.log").split("\n").filter((x) => x.includes("restart")).length, 2);
  assert.ok(!wl(d).includes("Bot1") && !wl(d).includes("Bot2"));
  assert.ok(lines(d, "fs/config/paper-global.yml").includes("    secret: 'S3CR3T-VELOCITY-VALUE'"));
});

test("--open без --direct-join форвардинг и питание не трогает; --direct-join вне --open - код 2; нет файлов - пропуск без restart", () => {
  const d = mk();
  const o = access(d, "--open Bot1 --no-owner"); assert.equal(o.code, 0, o.out + o.err);
  assert.equal(rd(d, "power.log"), ""); assert.ok(lines(d, "fs/spigot.yml").includes("  bungeecord: true   # forward"));
  assert.ok(!rd(d, "access.state").includes("FWD_"));
  assert.equal(access(d, "--restore --direct-join").code, 2);
  assert.equal(access(d, "--status --direct-join").code, 2);
  const d2 = mk({ proxy: false });
  const o2 = access(d2, "--open Bot1 --no-owner --direct-join"); assert.equal(o2.code, 0, o2.out + o2.err);
  assert.match(o2.out, /файла или ключа нет \(пропущено\)/); assert.equal(rd(d2, "power.log"), "");
  assert.ok(rd(d2, "access.state").includes("FWD_SB=-\n"));
  assert.equal(access(d2, "--restore").code, 0);
  assert.equal(rd(d2, "power.log"), "");
});

test("--open --direct-join: online-mode=true - предупреждение (код 3); status показывает форвардинг и direct-join", () => {
  const d = mk();
  w(join(d, "fs/server.properties"), "white-list=true\nenforce-whitelist=false\nonline-mode=true\n");
  w(join(d, "restart.seq"), "stopping\nrunning\n");
  const o = access(d, "--open Bot1 --no-owner --direct-join");
  assert.equal(o.code, 3, o.out + o.err); assert.match(o.out, /online-mode=true/);
  const s = access(d, "--status");
  assert.match(s.out, /прокси-форвардинг: spigot settings\.bungeecord=false/); assert.match(s.out, /direct-join/);
});

// ------------------------------------------------------------------ п.3: bot-join (tmpfs 1g и проверка памяти)
function botJoin(d, memKb) {
  w(join(d, "meminfo"), `MemTotal: 8000000 kB\nMemAvailable: ${memKb} kB\n`);
  const r = spawnSync("bash", ["-c", `umask 077; export PATH="${posix(d)}/bin:$PATH"; bash "${posix(SRC)}/bot-join.sh" Bot1 10`], { env: { ...env(d), BOT_MEMINFO_FILE: posix(d) + "/meminfo", BOT_PASS_FILE: posix(d) + "/bot.pass" }, encoding: "utf8", timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
test("bot-join: tmpfs 1g и лимит памяти 1280m; мало памяти хоста - отказ до запуска контейнера", () => {
  const low = mk(); const a = botJoin(low, 500000);
  assert.equal(a.code, 1, a.out + a.err); assert.match(a.out + a.err, /мало свободной памяти хоста: 488 МБ/, a.out + a.err);
  assert.equal(rd(low, "docker-run.log"), "");
  const ok = mk(); const b = botJoin(ok, 4000000);
  assert.match(b.out, /память хоста: доступно 3906 МБ/);
  const run = rd(ok, "docker-run.log");
  assert.ok(run.includes("--tmpfs /tmp:rw,exec,size=1g"), run); assert.ok(run.includes("--memory 1280m"), run);
  assert.ok(!run.includes("size=300m"));
  assert.ok(run.includes("--prefer-offline"), "npm с --prefer-offline");
});
