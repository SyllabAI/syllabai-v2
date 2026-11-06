/**
 * Debug probe — replicate the progress union fixture step by step.
 */
process.env.NEXT_PUBLIC_API_V2_BASE_URL ??= "https://v2.example";

const winStore = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => winStore.get(k) ?? null,
    setItem: (k: string, v: string) => void winStore.set(k, String(v)),
    removeItem: (k: string) => void winStore.delete(k),
    clear: () => winStore.clear(),
    get length() {
      return winStore.size;
    },
    key: (i: number) => [...winStore.keys()][i] ?? null,
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
(globalThis as { CustomEvent?: unknown }).CustomEvent = class CustomEvent {
  constructor(public type: string) {}
};

const { api } = await import("./apps/hub/src/lib/api");

const ME = "me@example.edu";
winStore.set("syllabai.token", "test-token");
winStore.set(
  "syllabai.user",
  JSON.stringify({ id: "u1", email: ME, displayName: "Me", roles: ["STUDENT"] }),
);

let listDocs: Array<{ key: string; value: unknown; updatedAt: string }> = [];
const putCalls: Array<{ key: string; value: unknown }> = [];
api.workspaceDocs = async () => ({ documents: listDocs });
api.putWorkspaceDoc = async (key: string, value: unknown) => {
  putCalls.push({ key, value });
  return { key, value, updatedAt: "2026-11-06T00:00:00.000Z" };
};

const { resetAccountDocs, hydrateAccountDocs, __flushAllForTests, readDoc } = await import(
  "./apps/hub/src/lib/account-docs"
);
const progress = await import("./apps/hub/src/lib/progress");
const { readIdentitySnapshot } = await import("./apps/hub/src/lib/identity");

const course = "igcse-chemistry-90";
resetAccountDocs();
progress.__setProgressForTests(course, {
  ...progress.emptyProgress(),
  flashcards: { c1: { subtopic: null, rating: "still-learning", at: 10 } },
  notesRead: { n1: { subtopic: null, at: 5 } },
});
console.log("identity:", readIdentitySnapshot()?.email);
console.log("snapshot flashcards:", Object.keys(progress.getProgressSnapshot(course).flashcards));

listDocs = [
  {
    key: `progress:${course}`,
    value: { flashcards: { c1: { subtopic: null, rating: "know", at: 20 } } },
    updatedAt: "2026-11-06T00:00:00.000Z",
  },
];
await hydrateAccountDocs(ME);
console.log("after hydrate, engine doc:", JSON.stringify(readDoc(`progress:${course}`)));
console.log("after hydrate, live flashcards:", progress.getProgressSnapshot(course).flashcards);
await __flushAllForTests();
console.log("putCalls:", JSON.stringify(putCalls).slice(0, 400));
console.log("live flashcards after flush:", progress.getProgressSnapshot(course).flashcards);
