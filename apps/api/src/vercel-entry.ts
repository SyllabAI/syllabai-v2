/**
 * Vercel Node-runtime entry — deploy-bundle ONLY (never imported by app code,
 * tests or the composition root). The composition root's default export
 * (apps/api/src/index.ts) is a Web-fetch handler; the Vercel Node runtime
 * hands us (Node req, Node res) and expects the response written through
 * `res` — hono/vercel's handle() computes a Web Response but never writes
 * it to res (the launcher warns "You likely meant the Web fetch-style API"
 * and the request hangs). This adapter converts explicitly:
 *   Node req → Web Request → app.fetch() → Web Response → res.writeHead+end.
 * The Node shim MUST stay the first import (see vercel-node-shim.ts).
 */
import "./vercel-node-shim";
import app from "./index";

type NodeReq = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator](): AsyncIterableIterator<unknown>;
};
type NodeRes = {
  writeHead: (status: number, headers: Record<string, string>) => unknown;
  setHeader: (name: string, value: string | string[]) => unknown;
  end: (body?: Buffer | string) => unknown;
};

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<unknown>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const all = Buffer.concat(chunks);
    if (all.length > 0) body = all;
  }
  const origin = `http://${String(req.headers?.host ?? "localhost")}`;
  const webReq = new Request(new URL(req.url ?? "/", origin), {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const webRes = await app.fetch(webReq);
  const out: Record<string, string> = {};
  webRes.headers.forEach((v, k) => {
    if (k === "set-cookie") return;
    out[k] = v;
  });
  const getCookies = (webRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getCookies === "function") {
    const cookies = (webRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie();
    if (cookies.length > 0) res.setHeader("Set-Cookie", cookies);
  }
  res.writeHead(webRes.status, out);
  res.end(Buffer.from(await webRes.arrayBuffer()));
}
