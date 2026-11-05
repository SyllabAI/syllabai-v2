/**
 * T-TEACHGENIE-006 · apps/api/test/teach-me/update-session-seam.test.ts
 *
 * The regression gate for the LIVE-pilot blocker of record (T-TEACHGENIE-003
 * run-002 receipt, PR #799): every write path that issues an UPDATE on
 * teach_sessions 500ed on production while INSERTs/SELECTs succeeded. Root
 * cause (proven verbatim): updateSession handed the house sql seam ONE piece
 * containing the whole hand-numbered statement — the seam's toQuery is
 * TAGGED-TEMPLATE ONLY (text = s[0] + "$1" + s[1] + "$2" + …) and appended
 * its own $n trail, producing "…WHERE id = $2$1$2" (a guaranteed Postgres
 * syntax error) on EVERY call. The FakeStore fixtures cannot see this seam —
 * these tests drive the REAL store against a CAPTURING fake seam and replay
 * every captured call through the REAL toQuery, asserting the exact
 * statement text and parameter order the seam must produce.
 */
import { describe, expect, it } from "bun:test";
import { createTeachMeStore } from "../../src/teach-me/sql";
import { toQuery } from "../../src/services/identity/users";
import type { SqlFn } from "../../src/teach-me/types";

type CapturedCall = { strings: string[]; params: unknown[] };

function capturingSeam(): { sql: SqlFn; calls: CapturedCall[] } {
	const calls: CapturedCall[] = [];
	const fn = ((...args: unknown[]) => {
		calls.push({ strings: [...(args[0] as string[])], params: args.slice(1) });
		return Promise.resolve([] as Array<Record<string, unknown>>);
	}) as unknown as SqlFn;
	return { sql: fn, calls };
}

describe("teach-me real store: updateSession goes through the house tagged-template seam correctly (T-TEACHGENIE-006)", () => {
	it("flags-only patch (the sub-floor nudge write) produces the exact single-assignment statement", async () => {
		const { sql, calls } = capturingSeam();
		const store = createTeachMeStore(sql);
		await store.updateSession("sess-uuid", { flags: { subFloorNudges: 1 } });
		expect(calls.length).toBe(1);
		const { text, values } = toQuery(calls[0]!.strings as unknown as TemplateStringsArray, calls[0]!.params);
		expect(text).toBe("UPDATE teach_sessions SET flags = $1::jsonb WHERE id = $2");
		expect(values[0]).toBe(JSON.stringify({ subFloorNudges: 1 }));
		expect(values[1]).toBe("sess-uuid");
	});

	it("the judged-turn counter patch produces the exact three-counter + flags statement", async () => {
		const { sql, calls } = capturingSeam();
		const store = createTeachMeStore(sql);
		await store.updateSession("sess-uuid", {
			messageCount: 3,
			llmCallCount: 2,
			tokensUsed: 4211,
			flags: { objectivesPrompt: "teachme.objectives.v3" },
		});
		expect(calls.length).toBe(1);
		const { text, values } = toQuery(calls[0]!.strings as unknown as TemplateStringsArray, calls[0]!.params);
		expect(text).toBe(
			"UPDATE teach_sessions SET message_count = $1, llm_call_count = $2, tokens_used = $3, flags = $4::jsonb WHERE id = $5",
		);
		expect(values).toEqual([
			3,
			2,
			4211,
			JSON.stringify({ objectivesPrompt: "teachme.objectives.v3" }),
			"sess-uuid",
		]);
	});

	it("the end-session patch (status + ended_at + flags) composes in field order with the id last", async () => {
		const { sql, calls } = capturingSeam();
		const store = createTeachMeStore(sql);
		await store.updateSession("sess-uuid", {
			status: "review_pending",
			endedAt: "2026-11-05T19:30:00.000Z",
			flags: { reviewGenerated: true },
		});
		expect(calls.length).toBe(1);
		const { text, values } = toQuery(calls[0]!.strings as unknown as TemplateStringsArray, calls[0]!.params);
		expect(text).toBe(
			"UPDATE teach_sessions SET status = $1, ended_at = $2, flags = $3::jsonb WHERE id = $4",
		);
		expect(values).toEqual(["review_pending", "2026-11-05T19:30:00.000Z", JSON.stringify({ reviewGenerated: true }), "sess-uuid"]);
	});

	it("an empty patch issues no statement at all", async () => {
		const { sql, calls } = capturingSeam();
		const store = createTeachMeStore(sql);
		await store.updateSession("sess-uuid", {});
		expect(calls.length).toBe(0);
	});

	it("regression pin: the PRE-FIX one-piece form is provably malformed through the real toQuery", () => {
		// Documents the root cause in executable form: the old implementation's
		// call shape (ONE piece carrying the whole hand-numbered statement)
		// trails the seam's own $n numbering — the exact production 500.
		const oldStmt = "UPDATE teach_sessions SET flags = $1::jsonb WHERE id = $2";
		const malformed = toQuery([oldStmt] as unknown as TemplateStringsArray, [{ subFloorNudges: 1 }, "sess-uuid"]);
		expect(malformed.text).toBe("UPDATE teach_sessions SET flags = $1::jsonb WHERE id = $2$1$2");
	});
});
