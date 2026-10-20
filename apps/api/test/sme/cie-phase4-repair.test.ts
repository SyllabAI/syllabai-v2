/**
 * The run-002 repair program — the ORCHESTRATOR-side laws (the CIE phase-4
 * fleet's repair tranche). The seed-law widenings pin in
 * test/curriculum/bundle-seed.test.ts; this file pins:
 *
 *   - the tx-flatten seam (defect class "tx-seam", 16 slugs): the frozen
 *     ingest service's full Sql seam (tagged template + .transaction) served
 *     by a bare postgres.js tx — statements forward, .transaction flattens
 *     onto the slug tx, nested .transaction flattens recursively;
 *   - the bare-asset-ref externalization (defect class "asset missing"): the
 *     pre-pass completes the corpus's OWN hotlink form for the bare
 *     `(assets/<file>)` refs using the committed per-slug asset-map of
 *     record, fail-closed on an unmapped ref, inert on full URLs and prose;
 *   - the committed asset-map coherence (schema/slug/importRef/repo law) for
 *     every map in the hub content tree, plus the manifest-ref pin.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  externalizeBareAssetRefs,
  flattenTxForFrozenServices,
  loadAssetMap,
} from "../../scripts/cie-phase4-apply";
import type { SqlFn } from "../../src/services/curriculum/sql";

// ── the tx-flatten seam ──────────────────────────────────────────────────────

function fakeTx(log: string[]): SqlFn {
  return (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    log.push(strings.join("?").replace(/\s+/g, " ").trim() + " :: " + params.join(","));
    return [{ n: 1 }];
  }) as unknown as SqlFn;
}

describe("run-002 repair — the tx-flatten seam (the frozen ingest's full Sql seam on a bare tx)", () => {
  test("tagged templates forward to the slug tx verbatim", async () => {
    const log: string[] = [];
    const tx = fakeTx(log);
    const shim = flattenTxForFrozenServices(tx);
    const rows = await shim`select 1 where x = ${42}`;
    expect(rows).toEqual([{ n: 1 }]);
    expect(log).toEqual(["select 1 where x = ? :: 42"]);
  });

  test(".transaction flattens onto the slug tx — no nested BEGIN, statements join", async () => {
    const log: string[] = [];
    const tx = fakeTx(log);
    const shim = flattenTxForFrozenServices(tx);
    const out = await shim.transaction(async (inner) => {
      const r = await inner`insert into t values (${1})`;
      expect(r).toEqual([{ n: 1 }]);
      return "ok";
    });
    expect(out).toBe("ok");
    expect(log).toEqual(["insert into t values (?) :: 1"]);
  });

  test("nested .transaction flattens recursively to the SAME tx (the service never sees a nesting seam)", async () => {
    const log: string[] = [];
    const shim = flattenTxForFrozenServices(fakeTx(log));
    await shim.transaction(async (outer) => {
      await outer.transaction(async (inner) => {
        await inner`select 2`;
      });
    });
    expect(log).toEqual(["select 2 :: "]);
    // the inner seam carries the SAME flattening law (one tx, no hierarchy)
    let forwarded: string[] = [];
    await shim.transaction(async (outer) => {
      await outer.transaction(async (inner) => {
        await inner`select 3`;
      });
      await outer`select 4`;
      forwarded = log.slice();
    });
    expect(forwarded).toEqual(["select 2 :: ", "select 3 :: ", "select 4 :: "]);
  });
});

// ── the bare-asset-ref externalization pre-pass ─────────────────────────────

const MAP = {
  schema: "syllabai-demo.asset-map/1.0",
  slug: "cie-mini",
  importRef: "0fe5f77210f74aaeb3f6c491dfe0263d12db738c",
  upstreamRepo: "SyllabAI/syllabai-resources",
  refs: {
    "002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg":
      "SME-ExamQuestion/cie-mini/28-chemistry-of-transition-elements/assets/002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg",
  },
};

function setFixture(problemMd: string) {
  return [
    {
      name: "set-1",
      questions: [
        {
          totalMarks: 2,
          difficulty: null,
          parts: [{ problemMd, solutionMd: null, marks: 2, commandWord: "State", specPointCodes: [], choices: null }],
        },
      ],
    },
  ];
}

describe("run-002 repair — the bare-asset-ref externalization pre-pass", () => {
  test("a bare (assets/<file>) ref becomes the pinned hotlink URL (the corpus's own form)", () => {
    const sets = setFixture("![the complex](assets/002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg)");
    externalizeBareAssetRefs(sets, MAP);
    const md = sets[0]!.questions[0]!.parts[0]!.problemMd as string;
    expect(md).toBe(
      "![the complex](https://raw.githubusercontent.com/SyllabAI/syllabai-resources/0fe5f77210f74aaeb3f6c491dfe0263d12db738c/SME-ExamQuestion/cie-mini/28-chemistry-of-transition-elements/assets/002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg)",
    );
  });

  test("full hotlink URLs and prose pass through untouched (inert outside the bare-ref law)", () => {
    const md =
      "see ![x](https://raw.githubusercontent.com/SyllabAI/syllabai-resources/0fe5f77210f74aaeb3f6c491dfe0263d12db738c/SME-ExamQuestion/cie-mini/a/assets/002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg) and the firm's (assets: current assets) listing";
    const sets = setFixture(md);
    externalizeBareAssetRefs(sets, MAP);
    expect(sets[0]!.questions[0]!.parts[0]!.problemMd).toBe(md);
  });

  test("a bare ref absent from the map throws BEFORE any DB contact (fail-closed, never silent)", () => {
    const sets = setFixture("![y](assets/not-in-the-map.png)");
    expect(() => externalizeBareAssetRefs(sets, MAP)).toThrow(/not in the map of record/);
  });

  test("the ingest's own ref law can never see a bare ref after the pre-pass (no assets ship, the global question_asset store stays untouched)", () => {
    // the frozen ASSET_REF (services/sme/index.ts :68) over the rewritten
    // corpus: zero matches — the package is asset-less by construction
    const ASSET_REF = /\(assets\/([^)\s]+)\)/g;
    const sets = setFixture("![z](assets/002-cis-and-trans-isomers-of-cr-nh3-4cl2-showing-the.jpeg)");
    externalizeBareAssetRefs(sets, MAP);
    const md = sets[0]!.questions[0]!.parts[0]!.problemMd as string;
    expect([...md.matchAll(ASSET_REF)]).toEqual([]);
  });
});

// ── the committed asset-map coherence (the per-slug maps of record) ─────────

describe("run-002 repair — the committed asset-map coherence law", () => {
  const HUB = join(import.meta.dir, "../../../hub/content");
  const maps = readdirSync(HUB)
    .filter((slug) => {
      try {
        return readFileSync(join(HUB, slug, "asset-map.json"), "utf8") != null;
      } catch {
        return false;
      }
    })
    .sort();

  test("exactly the three bare-ref slugs carry a map, schema law verbatim", () => {
    expect(maps).toEqual(["cie-a-level-chemistry-25", "cie-a-level-computer-science-19", "cie-igcse-computer-science-23"]);
  });

  for (const slug of maps) {
    test(slug + ": schema/slug/importRef/repo laws + every path is slug-scoped upstream", () => {
      const map = JSON.parse(readFileSync(join(HUB, slug, "asset-map.json"), "utf8")) as {
        schema: string; slug: string; importRef: string; upstreamRepo: string; refs: Record<string, string>;
      };
      const manifest = JSON.parse(readFileSync(join(HUB, slug, "manifest.json"), "utf8")) as {
        importSource: { repo: string; ref: string };
      };
      expect(map.schema).toBe("syllabai-demo.asset-map/1.0");
      expect(map.slug).toBe(slug);
      expect(map.upstreamRepo).toBe("SyllabAI/syllabai-resources");
      // the map's pin IS the manifest's pin (provenance-consistent)
      expect(map.importRef).toBe(manifest.importSource.ref.replace(/^main@/, ""));
      expect(Object.keys(map.refs).length).toBeGreaterThan(0);
      for (const upstream of Object.values(map.refs)) {
        expect(upstream.startsWith("SME-ExamQuestion/" + slug + "/")).toBe(true);
        expect(upstream).toContain("/assets/");
      }
      // the loader law round-trips clean against the real manifest pin
      expect(loadAssetMap(join(HUB, slug), { slug, importRef: manifest.importSource.ref.replace(/^main@/, "") })).not.toBeNull();
    });
  }

  test("no bundle carries a BARE (assets/<file>) ref outside its map (the fleet can never hit an unmapped ref)", () => {
    const ASSET_REF = /\(assets\/([^)\s]+)\)/g;
    const bundles = readdirSync(HUB).filter((s) => s.startsWith("cie-"));
    for (const slug of bundles) {
      let raw: string;
      try {
        raw = readFileSync(join(HUB, slug, "questions.json"), "utf8");
      } catch {
        continue; // stubs/skeletons carry no questions.json
      }
      const names = [...new Set([...raw.matchAll(ASSET_REF)].map((m) => m[1]!))];
      if (names.length === 0) continue;
      const map = JSON.parse(readFileSync(join(HUB, slug, "asset-map.json"), "utf8")) as {
        refs: Record<string, string>;
      };
      const unmapped = names.filter((n) => map.refs[n] == null);
      expect(unmapped).toEqual([]);
    }
  });
});
