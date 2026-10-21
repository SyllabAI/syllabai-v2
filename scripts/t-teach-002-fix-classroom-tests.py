#!/usr/bin/env python3
"""T-TEACH-002 test-fixture repair: the class_features grouped read now rides
EVERY classroom view assembly (ADR-CLASS-0001 §1/§6), so the two classroom
test files need the default answer route (the EMPTY table = row-absent =
all ON) appended to their fakeSql route sets. Mechanical, safe: an appended
route only fires when the query actually runs."""
import re, os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "api")

HELPERS = '''
/** T-TEACH-002: the class_features grouped read rides every view assembly
 *  (ADR-CLASS-0001 §1/§6). This wrapper appends the DEFAULT answer — the
 *  EMPTY table (row-absent = all ON) — to a route set; tests that pin
 *  feature rows provide their own explicit route (a later route wins
 *  nothing: fakeSql takes the FIRST match, so put specific routes first). */
const fakeSqlWithFeatures = (routes: Route[]) =>
  fakeSql([...routes, { match: /from class_features/i, rows: [] }]);
'''

# 1) classroom.test.ts — define the wrapper after the fakeSql import and
#    rewire every `= fakeSql([` call site.
p = BASE + "/test/classroom/classroom.test.ts"
src = open(p).read()
anchor = 'import { fakeSql, type Route } from "../assessment/helpers";'
assert anchor in src, "import anchor missing"
src = src.replace(anchor, anchor + "\n" + HELPERS, 1)
n = src.count("= fakeSql([")
src = src.replace("= fakeSql([", "= fakeSqlWithFeatures([")
open(p, "w").write(src)
print(f"{p}: wrapper added, {n} call sites rewired")

# 2) routes.test.ts — the single makeApp assembly gets the appended route.
p = BASE + "/test/classroom/routes.test.ts"
src = open(p).read()
old = "function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {\n  const sql = fakeSql(routes);"
new = (
    "function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {\n"
    "  // T-TEACH-002: the default class_features answer rides every assembly\n"
    "  // (the EMPTY table = row-absent = all ON; specific tests add their own\n"
    "  // feature rows FIRST so fakeSql's first-match law honors them).\n"
    "  const sql = fakeSql([...routes, { match: /from class_features/i, rows: [] }]);"
)
assert old in src, "makeApp anchor missing"
src = src.replace(old, new, 1)
open(p, "w").write(src)
print(f"{p}: makeApp patched")
