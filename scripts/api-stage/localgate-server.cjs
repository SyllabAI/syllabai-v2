#!/usr/bin/env node
/**
 * Local gate for the API prebuilt stage — boot the bundle on loopback and
 * prove it serves before any Vercel deploy.
 *
 * Recovered pattern from the serving lane (dpl_7Q3CRpcTWavgD6VMbXvSrpshCVKV,
 * 2026-11-04): the operator staged the bundle to /tmp/api-stage-r766/ and
 * booted exactly this gate. Parameterised here: stage dir comes from argv[2]
 * (defaults to ../api-stage relative to this file's layout).
 *
 * Usage: node localgate-server.cjs <stage-dir> [port]
 *   requires SYLLABAI_JWT_SECRET + DATABASE_URL in env (fail-fast boot law).
 *   The gate exits 0 only when /actuator/health answers 200 from the bundle.
 */
const http = require("http");
const path = require("path");

const stageDir = process.argv[2];
const port = Number(process.argv[3] || 8971);
if (!stageDir) {
  console.error("[localgate] usage: node localgate-server.cjs <stage-dir> [port]");
  process.exit(2);
}

const handler = require(path.join(stageDir, "api", "index.js")).default;
const server = http.createServer((req, res) => handler(req, res));
server.listen(port, "127.0.0.1", () => {
  console.log(`[localgate] UP on http://127.0.0.1:${port} serving ${stageDir}`);
  // self-probe: the gate is only green when the bundle answers health
  http
    .get(`http://127.0.0.1:${port}/actuator/health`, (r) => {
      let b = "";
      r.on("data", (c) => (b += c));
      r.on("end", () => {
        const ok = r.statusCode === 200;
        console.log(`[localgate] /actuator/health -> ${r.statusCode} ${b.slice(0, 120)}`);
        console.log(ok ? "[localgate] GATE GREEN" : "[localgate] GATE RED");
        server.close();
        process.exit(ok ? 0 : 1);
      });
    })
    .on("error", (e) => {
      console.error("[localgate] self-probe failed:", e.message);
      process.exit(1);
    });
});
