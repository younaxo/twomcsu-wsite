// node --test infrastructure/bridge-dev-srv/test/slp.test.mjs
// SLP-скрипт извлекается из ptero.sh (_PT_SLP_JS) и запускается против фиктивного TCP-сервера.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../ptero.sh", import.meta.url)), "utf8");
const js = /_PT_SLP_JS='([^']*)'/.exec(src)?.[1];
assert.ok(js, "_PT_SLP_JS не найден");

const vi = (n) => { const b = []; do { let x = n & 127; n >>>= 7; if (n) x |= 128; b.push(x); } while (n); return Buffer.from(b); };
const statusPacket = (obj) => { const s = Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)); const body = Buffer.concat([vi(0), vi(s.length), s]); return Buffer.concat([vi(body.length), body]); };

function serve(onData) {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => { sock.on("error", () => {}); sock.on("data", (d) => onData(sock, d)); });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
function run(port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["-e", js], { env: { PT_HOST: "127.0.0.1", PT_PORT: String(port), PT_TIMEOUT_MS: String(timeoutMs) } });
    let out = ""; p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out: out.trim() }));
  });
}

test("корректный status JSON: online/max/version, handshake с next state 1", async () => {
  let first;
  const srv = await serve((sock, d) => { first ??= d; sock.write(statusPacket({ version: { name: "Paper 1.21.11", protocol: 774 }, players: { max: 20, online: 3, sample: [] } })); });
  const r = await run(srv.address().port);
  srv.close();
  assert.equal(r.code, 0);
  assert.equal(r.out, "players=3 max=20 version=Paper_1.21.11");
  assert.equal(first[first.length - 3], 1); // ... next state=1, затем status request (01 00)
  assert.deepEqual([...first.subarray(first.length - 2)], [1, 0]);
});

test("ответ частями (фрагментация TCP)", async () => {
  const srv = await serve(async (sock) => { const p = statusPacket({ version: { name: "1.21" }, players: { max: 5, online: 0 } }); sock.write(p.subarray(0, 3)); await new Promise((r) => setTimeout(r, 50)); sock.write(p.subarray(3)); });
  const r = await run(srv.address().port);
  srv.close();
  assert.equal(r.out, "players=0 max=5 version=1.21");
});

for (const [name, reply] of [
  ["мусор", () => Buffer.from("HTTP/1.1 400 Bad Request\r\n\r\n")],
  ["не JSON", () => statusPacket("not json")],
  ["нет players", () => statusPacket({ version: { name: "x" } })],
  ["online не число", () => statusPacket({ players: { online: "3", max: 1 } })],
  ["огромная длина", () => Buffer.from([0xff, 0xff, 0xff, 0x7f, 0x00])],
]) {
  test(`отказ: ${name}`, async () => {
    const srv = await serve((sock) => sock.write(reply()));
    const r = await run(srv.address().port);
    srv.close();
    assert.equal(r.code, 1);
    assert.equal(r.out, "");
  });
}

test("таймаут: сервер молчит", async () => {
  const srv = await serve(() => {});
  const t0 = Date.now();
  const r = await run(srv.address().port, 800);
  srv.close();
  assert.equal(r.code, 1);
  assert.ok(Date.now() - t0 < 4000);
});

test("отказ: порт закрыт", async () => {
  const srv = await serve(() => {}); const port = srv.address().port; await new Promise((r) => srv.close(r));
  assert.equal((await run(port)).code, 1);
});
