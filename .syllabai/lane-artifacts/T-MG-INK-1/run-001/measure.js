// T-MG-INK-1 run-001 spike — bundle cost measurement (evidence for the SDK decision gate)
// Measures three configurations, all minified ESM, react/react-dom EXTERNAL (hub ships React 19.3.0):
//   A) full tldraw editor (the Tldraw component mount — their stack)
//   B) headless tldraw store+schema only (@tldraw/editor store core — their doc format, our canvas)
//   C) native ink reference implementation (hand-rolled pointer-capture stroke canvas — zero deps)
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("/home/z/my-project/scripts/ink-spike/out", { recursive: true });

async function measure(name, entry, opts = {}) {
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    metafile: true,
    write: false,
    outfile: `out/${name}.js`,
    external: opts.external ?? ["react", "react-dom", "react/jsx-runtime"],
    logLevel: "silent",
  });
  const js = res.outputFiles.find((f) => f.path.endsWith(".js"));
  const raw = js.contents.length;
  const gz = gzipSync(js.contents, { level: 9 }).length;
  writeFileSync(`/home/z/my-project/scripts/ink-spike/out/${name}.js`, js.contents);
  writeFileSync(`/home/z/my-project/scripts/ink-spike/out/${name}.js.gz`, gzipSync(js.contents, { level: 9 }));
  // css bundle if the entry imports css — esbuild emits css output
  const css = res.outputFiles.find((f) => f.path.endsWith(".css"));
  let cssRaw = 0, cssGz = 0;
  if (css) {
    cssRaw = css.contents.length;
    cssGz = gzipSync(css.contents, { level: 9 }).length;
    writeFileSync(`/home/z/my-project/scripts/ink-spike/out/${name}.css`, css.contents);
    writeFileSync(`/home/z/my-project/scripts/ink-spike/out/${name}.css.gz`, gzipSync(css.contents, { level: 9 }));
  }
  console.log(`${name}: js ${raw} B raw / ${gz} B gz` + (css ? ` | css ${cssRaw} B raw / ${cssGz} B gz` : ""));
  return { name, jsRaw: raw, jsGz: gz, cssRaw, cssGz };
}

// A) full editor — their stack
await measure("a-tldraw-full", "./entry-a-full.jsx");

// B) headless store core — their doc format without their UI:
//    store + tlschema + editor core (no react components beyond what the core pulls)
await measure("b-tldraw-headless", "./entry-b-headless.js");

// C) native ink reference implementation (written for this spike, see ink-native-ref.js)
await measure("c-native-ink", "./ink-native-ref.js", { external: [] });
