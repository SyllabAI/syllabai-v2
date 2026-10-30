// B) their doc format, our canvas: headless store core only (no editor UI, no canvas, no tools).
//    Persists exactly the dossier-observed store shape {schema, shapes[]} (A7) so docs stay
//    round-trip compatible with the observed tldraw serialization — but rendering stays ours.
import { createTLSchema } from "@tldraw/tlschema";
import { Store } from "@tldraw/store";
import { createComputedContext, react } from "@tldraw/state";

export function createInkStore() {
  const schema = createTLSchema();
  const store = new Store({ schema });
  const stop = react("watch-shapes", () => {
    void store.allRecords();
  });
  return { store, stop, dispose: () => stop() };
}
