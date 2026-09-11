// Where the time actually goes. Run: node --env-file=.env.local <this file>
import { createClient } from "@libsql/client";
import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";

const url = process.env.LIBSQL_URL;
const host = new URL(url).hostname;
const db = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });

const ms = (n) => Math.round(n * 10) / 10;

async function time(label, fn, runs = 5) {
  await fn(); // warm
  const t = [];
  for (let i = 0; i < runs; i += 1) {
    const s = performance.now();
    await fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  console.log(`${label.padEnd(34)} min ${ms(t[0])}  median ${ms(t[Math.floor(runs / 2)])}`);
}

function rawTcp() {
  return new Promise((res, rej) => {
    const s = performance.now();
    const sock = connect(443, host, () => { sock.end(); res(performance.now() - s); });
    sock.on("error", rej);
  });
}

function rawTls() {
  return new Promise((res, rej) => {
    const s = performance.now();
    const sock = tlsConnect({ host, port: 443, servername: host }, () => {
      const t = performance.now() - s;
      console.log(`  tls protocol: ${sock.getProtocol()}`);
      sock.end();
      res(t);
    });
    sock.on("error", rej);
  });
}

const tcp = [];
for (let i = 0; i < 5; i += 1) tcp.push(await rawTcp());
tcp.sort((a, b) => a - b);
console.log(`${"raw TCP connect".padEnd(34)} min ${ms(tcp[0])}  median ${ms(tcp[2])}`);

const tls = [];
for (let i = 0; i < 3; i += 1) tls.push(await rawTls());
tls.sort((a, b) => a - b);
console.log(`${"raw TCP+TLS connect".padEnd(34)} min ${ms(tls[0])}  median ${ms(tls[1])}`);

await time("1 execute", () => db.execute("SELECT 1"));
await time("5 executes, sequential", async () => {
  for (let i = 0; i < 5; i += 1) await db.execute("SELECT 1");
});
await time("5 executes, Promise.all", () =>
  Promise.all(Array.from({ length: 5 }, () => db.execute("SELECT 1"))));
await time("5 in one batch()", () =>
  db.batch(Array.from({ length: 5 }, () => "SELECT 1"), "read"));
await time("real query (items)", () => db.execute("SELECT * FROM items LIMIT 50"));
