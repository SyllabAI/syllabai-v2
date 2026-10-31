import { describe, expect, test } from "bun:test";

import { BATTLE_SERVED_COURSES, battleCourse, battleServedFor } from "./battle-course";

/**
 * F-186 rollout law pins (T-BATTLE-CARD-1 run-001): the served-course list of
 * record the battle page and the course-page card both key on — one law, one
 * place. If the battle ever learns per-course serving, the list grows here
 * and the course-page card flips automatically.
 */
describe("battle-course rollout law", () => {
  test("the pinned 4CH1 pilot is the served course of record", () => {
    expect(BATTLE_SERVED_COURSES).toEqual(["igcse-chemistry-19"]);
    expect(battleCourse()).toBe("igcse-chemistry-19");
  });

  test("battleServedFor: live on the pilot, honest roadmap elsewhere", () => {
    expect(battleServedFor("igcse-chemistry-19")).toBe(true);
    expect(battleServedFor("igcse-physics-19")).toBe(false);
    expect(battleServedFor("igcse-maths-b-16")).toBe(false);
    expect(battleServedFor("")).toBe(false);
  });
});
