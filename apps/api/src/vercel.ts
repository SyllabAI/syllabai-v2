/**
 * Vercel Node-lambda entry for the API — the prebuilt-lane adapter.
 *
 * Recovered from the last serving prebuilt deployment
 * (dpl_7Q3CRpcTWavgD6VMbXvSrpshCVKV, 2026-11-04): its `api/index.js` bundle
 * ends in exactly this shape — a default-exported Node `(req, res)` handler
 * that converts to a Web `Request`, calls the Hono app's `fetch`, and streams
 * the Web `Response` back. Vercel routes `/api/v1/(.*)` and
 * `/actuator/health` to this one lambda via the stage `vercel.json`
 * (scripts/api-stage/vercel.json).
 *
 * `app` is the default export of `./index` (the fail-fast boot discipline in
 * env.ts applies: the lambda refuses to boot on blank SYLLABAI_JWT_SECRET /
 * DATABASE_URL — inherited from the frozen core).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./index";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? "GET";
  let body: ReadableStream<Uint8Array> | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = new ReadableStream({
      start(controller) {
        req.on("data", (d: Buffer) => controller.enqueue(new Uint8Array(d)));
        req.on("end", () => controller.close());
        req.on("error", (e: Error) => controller.error(e));
      },
    });
  }

  const response = await app.fetch(
    new Request(url, { method, headers, body, duplex: "half" } as RequestInit),
  );

  const out: Record<string, string | string[]> = {};
  response.headers.forEach((v, k) => {
    out[k] = k === "set-cookie" ? (response.headers.getSetCookie?.() ?? v) : v;
  });
  res.writeHead(response.status, out);

  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}
