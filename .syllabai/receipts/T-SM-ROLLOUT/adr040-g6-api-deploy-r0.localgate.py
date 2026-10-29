#!/usr/bin/env python3
"""
G-6 lane copy of the of-record localgate
  .syllabai/receipts/T-MIG-093/tools/localgate_bundle.py (run-009 lineage)
DIFFERENCES: STAGE path (session file-path law) + probe-identity class
  g6-localgate-<ts>@example.invalid (census class, disclosed).
Boots the G-6 bundle under a real Node http server on the of-record production
wire (stage/.env.localgate 0600) with a LOCAL-ONLY 44-char JWT secret, then
probes the 8-leg wire shape. Net rows: one probe learner (of record).
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error

STAGE = "/home/z/my-project/tmp/api-stage"
PORT = 8971
BASE = f"http://127.0.0.1:{PORT}"

local_secret = "R0-local-gate-key-44-raw-bytes-abc1234567"[:44].ljust(44, "0")
env = dict(os.environ)
env.update({"DATABASE_URL": "", "SYLLABAI_JWT_SECRET": local_secret, "PORT": str(PORT)})
for line in open(f"{STAGE}/.env.localgate"):
    k, _, v = line.strip().partition("=")
    if k == "DATABASE_URL":
        env["DATABASE_URL"] = v
assert env["DATABASE_URL"], "no wire staged"

server_js = f"""
const handler = require('{STAGE}/api/index.js').default;
const http = require('http');
const server = http.createServer((req, res) => handler(req, res));
server.listen({PORT}, '127.0.0.1', () => console.log('UP'));
"""
open(f"{STAGE}/localgate-server.cjs", "w").write(server_js)

proc = subprocess.Popen(
    ["node", f"{STAGE}/localgate-server.cjs"],
    env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)
ok = False
try:
    for _ in range(80):
        line = proc.stdout.readline()
        if "UP" in line:
            ok = True
            break
        if proc.poll() is not None:
            print("server died:", proc.stdout.read())
            sys.exit(1)
        time.sleep(0.1)
    if not ok:
        print("server never came up")
        sys.exit(1)

    def call(method, path, token=None, body=None):
        req = urllib.request.Request(BASE + path, method=method)
        if token:
            req.add_header("authorization", "Bearer " + token)
        data = None
        if body is not None:
            req.add_header("content-type", "application/json")
            data = json.dumps(body).encode()
        try:
            r = urllib.request.urlopen(req, data=data, timeout=30)
            return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    results = []
    s, b = call("GET", "/actuator/health")
    results.append(("health", s, 200, b[:120]))
    s, b = call("POST", "/api/v1/auth/login", body={"email": "nope", "password": ""})
    results.append(("login-malformed", s, 400, b[:160]))
    email = f"g6-localgate-{int(time.time())}@example.invalid"
    s, b = call("POST", "/api/v1/auth/register", body={
        "email": email, "password": "G6-local-gate#20261027x", "displayName": "G6 local gate"})
    results.append(("register", s, 201, b[:80]))
    token = json.loads(b).get("accessToken") if s in (200, 201) else None
    s, b = call("POST", "/api/v1/tutor/sessions", token=token)
    results.append(("tutor-create", s, 201, b[:100]))
    sid = json.loads(b).get("sessionId") if s == 201 else None
    s, b = call("GET", "/api/v1/tutor/sessions", token=token)
    results.append(("tutor-list-nonempty (L06 fix)", s, 200, b[:260]))
    s, b = call("GET", "/api/v1/tutor/sessions/latest", token=token)
    results.append(("tutor-latest", s, 200, b[:80]))
    s, b = call("DELETE", f"/api/v1/tutor/sessions/{sid}", token=token)
    results.append(("tutor-delete", s, 204, b[:40]))
    s, b = call("GET", "/api/v1/tutor/sessions", token=token)
    results.append(("tutor-list-after-delete", s, 200, b[:40]))

    all_pass = True
    for name, got, want, body in results:
        verdict = "PASS" if got == want else "FAIL"
        if got != want:
            all_pass = False
        print(f"{name}: {got} (want {want}) {verdict} {body.decode(errors='replace') if isinstance(body, bytes) else body}")
    print("LOCAL GATE:", "ALL PASS" if all_pass else "FAIL")
    sys.exit(0 if all_pass else 1)
finally:
    proc.send_signal(signal.SIGTERM)
