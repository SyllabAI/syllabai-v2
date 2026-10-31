"use client";

/**
 * F-186 — the Strength Battle player (Kognity dossier v1.1 Deep Dive D §8.5
 * row 5; prereg docs/F186-BATTLE-MODE-PLAN.md).
 *
 * The surface law, rendered: the SAME drill bank at one spec-point address
 * (law B1), 3 parts inside a 60-second clock (B2 — the countdown is the
 * affordance, the server clock is the law), opt-in by construction (B8 —
 * the deep link preselects, it never auto-starts), and the INSTANT
 * post-attempt reveal (the answers ride the unchanged drill evidence seam —
 * dossier law 2 covers battles verbatim). The settlement is a pure server
 * projection: your marks vs the seeded bot's coin, over-clock answers
 * disclosed, no leaderboard anywhere (ADR-036 posture).
 *
 * Posture: signed-out visitors get the sign-in CTA; any fetch failure renders
 * the honest empty state, never a fabricated battle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, ChevronRight, Clock, RefreshCw, Swords, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { PartProblem } from "@/components/part-problem";
import { SpecChip } from "@/components/provenance";
import { getToken } from "@/lib/api";
import {
  fetchDrillAddresses,
  postDrillEvidence,
  type DrillAddressesResponse,
  type DrillEvidenceResponse,
} from "@/lib/drill";
import {
  fetchBattleSettlement,
  postBattleStart,
  type BattleSettlementResponse,
  type BattleStartResponse,
} from "@/lib/battle";

const ZERO_STAKES_NOTE =
  "Zero stakes, opt-in only: battles write only the drill's own practice log — never your gradebook — and there is no leaderboard. Your opponent is a fair-coin sparring bot, disclosed as such.";

function topicGroupOf(code: string): string {
  const afterPrefix = code.split("-")[1] ?? code;
  return afterPrefix.split(".")[0] ?? afterPrefix;
}

type Phase = "picker" | "playing" | "settled";

export function BattleClient({ course }: { course: string }) {
  const signedIn = useMemo(() => getToken() !== null, []);

  const [addresses, setAddresses] = useState<DrillAddressesResponse | null>(null);
  const [addressesFailed, setAddressesFailed] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(signedIn);

  const [phase, setPhase] = useState<Phase>("picker");
  const [battle, setBattle] = useState<BattleStartResponse | null>(null);
  const [pos, setPos] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<DrillEvidenceResponse | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [settlement, setSettlement] = useState<BattleSettlementResponse | null>(null);
  const [settleFailed, setSettleFailed] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const partStartedAt = useRef<number>(Date.now());

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    setAddressesFailed(false);
    const data = await fetchDrillAddresses(course);
    if (data) setAddresses(data);
    else setAddressesFailed(true);
    setLoadingAddresses(false);
  }, [course]);

  useEffect(() => {
    if (signedIn) void loadAddresses();
  }, [signedIn, loadAddresses]);

  // The deep link preselects the address (the opt-in law B8: never auto-start).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setPreselect(code);
  }, []);

  // The countdown tick — the affordance; the server clock is the law (B5).
  useEffect(() => {
    if (phase !== "playing" || !battle) return;
    const t = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase, battle]);

  const deadlineMs = battle ? Date.parse(battle.startedAt) + battle.clockMs : 0;
  const msLeft = battle ? Math.max(0, deadlineMs - nowTick) : 0;
  const clockLive = battle && msLeft > 0;

  const settle = useCallback(async () => {
    if (!battle) return;
    const s = await fetchBattleSettlement(battle.drawId);
    if (s) {
      setSettlement(s);
      setSettleFailed(false);
      setPhase("settled");
    } else {
      setSettleFailed(true); // still live (409) or a failure — the honest state, re-askable
    }
  }, [battle]);

  // The clock path (B5): expiry settles the battle even with parts unanswered.
  useEffect(() => {
    if (phase === "playing" && battle && !clockLive) void settle();
  }, [phase, battle, clockLive, settle]);

  const beginBattle = async (code: string) => {
    setSubmitting(true);
    setStartFailed(false);
    const data = await postBattleStart(course, code);
    setSubmitting(false);
    if (!data) {
      setStartFailed(true);
      return;
    }
    setBattle(data);
    setPhase("playing");
    setPos(0);
    setChosen(null);
    setRevealed(null);
    setAnsweredCount(0);
    setSettlement(null);
    setSettleFailed(false);
    partStartedAt.current = Date.now();
  };

  const part = battle?.parts[pos] ?? null;

  const submitAnswer = async () => {
    if (!battle || !part || revealed) return;
    if (!chosen) return;
    setSubmitting(true);
    const ack = await postDrillEvidence(
      battle.drawId,
      part.partId,
      { kind: "choice", label: chosen },
      Math.max(0, Date.now() - partStartedAt.current),
      3,
      false,
    );
    setSubmitting(false);
    if (!ack) {
      setAddressesFailed(true);
      return;
    }
    setRevealed(ack);
    setAnsweredCount((n) => n + 1);
  };

  const nextPart = () => {
    if (!battle) return;
    if (pos + 1 < battle.parts.length) {
      setPos((p) => p + 1);
      setChosen(null);
      setRevealed(null);
      partStartedAt.current = Date.now();
    } else {
      void settle(); // all-answered — the settlement gate opens (Q5)
    }
  };

  const backToPicker = () => {
    setPhase("picker");
    setBattle(null);
    setSettlement(null);
    setSettleFailed(false);
    setAnsweredCount(0);
  };

  const grouped = useMemo(() => {
    const byTopic = new Map<string, NonNullable<DrillAddressesResponse>["addresses"]>();
    for (const a of addresses?.addresses ?? []) {
      const topic = topicGroupOf(a.code);
      const list = byTopic.get(topic) ?? [];
      list.push(a);
      byTopic.set(topic, list);
    }
    return [...byTopic.entries()].sort((x, y) => Number(x[0]) - Number(y[0]) || x[0].localeCompare(y[0]));
  }, [addresses]);

  if (!signedIn) {
    return (
      <div className="space-y-4">
        <BattleHeading />
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              The Strength Battle is an identity-bearing surface: your battle draws and attempt
              evidence key to your learner account. Sign in to battle.
            </p>
            <Button asChild>
              <Link href="/login">Sign in to battle</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingAddresses) {
    return (
      <div className="space-y-4">
        <BattleHeading />
        <p className="text-sm text-muted-foreground">Loading the battle addresses…</p>
      </div>
    );
  }

  if (addressesFailed && !addresses) {
    return (
      <div className="space-y-4">
        <BattleHeading />
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              The battle surface did not answer. It ships only where the spec-tagging census of
              record exists, and it fails closed rather than serve an unpinned bank.
            </p>
            <Button variant="outline" onClick={() => void loadAddresses()}>
              <RefreshCw className="size-4" aria-hidden /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── the settlement view ─────────────────────────────────────────────────────
  if (phase === "settled" && battle && settlement) {
    const verdictLine =
      settlement.verdict === "win"
        ? "You take the battle"
        : settlement.verdict === "loss"
          ? "The bot takes it"
          : "A draw — the coin and you split the marks";
    return (
      <div className="space-y-4">
        <BattleHeading />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{settlement.code}</Badge>
              <span className="text-muted-foreground">
                settled {settlement.clock.closedBy === "clock" ? "on the clock" : "all parts answered"} ·
                zero stakes, of course
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-bold tabular-nums">
              {settlement.score.learner}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                — {settlement.score.bot} · of {settlement.score.possible} marks
              </span>
            </p>
            <p className="text-sm font-medium">{verdictLine}</p>
            <div className="space-y-2">
              {settlement.parts.map((p) => (
                <div key={p.partId} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{p.partId}</span>
                  <span className="text-xs text-muted-foreground">{p.marks} marks</span>
                  {p.learner.answered ? (
                    p.learner.inClock ? (
                      p.learner.correct === true ? (
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="size-3.5" aria-hidden /> you scored
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="size-3.5" aria-hidden /> not credited
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-warn">after the clock — real evidence, zero battle marks</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">unanswered</span>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Bot className="size-3.5" aria-hidden />
                    {p.bot.correct ? `scored (${(p.bot.latencyMs / 1000).toFixed(1)}s)` : "coin missed"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.wonBy}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Opponent: {settlement.opponent.law} — a seeded fair-coin sparring partner, not a model. Over-clock
              answers stay real drill evidence (your strength bars still read them); they simply score zero in the
              battle.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void beginBattle(settlement.code)}>
                <Swords className="size-4" aria-hidden /> Battle {settlement.code} again
              </Button>
              <Button variant="outline" onClick={backToPicker}>
                Pick another spec point
              </Button>
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Battle seed {battle.seed} · eligible pool {battle.poolSize} parts ({battle.freshPoolSize} fresh
          {battle.usedFallback ? " — the thin-pool fallback served the full pool so the address stays playable" : ""}).
        </p>
      </div>
    );
  }

  // ── the battle player ───────────────────────────────────────────────────────
  if (phase === "playing" && battle && part) {
    const secondsLeft = Math.ceil(msLeft / 1000);
    return (
      <div className="space-y-4">
        <BattleHeading />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{battle.code}</Badge>
              {part.specPointCodes.map((cd) => (
                <SpecChip key={cd} code={cd} />
              ))}
              <span
                className={`ml-auto flex items-center gap-1.5 font-mono tabular-nums ${secondsLeft <= 10 ? "text-destructive" : "text-muted-foreground"}`}
              >
                <Clock className="size-4" aria-hidden /> {secondsLeft}s
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PartProblem md={part.problemMd} />
            {part.choices && part.choices.length > 0 ? (
              <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
                {part.choices.map((ch) => (
                  <button
                    key={ch.label}
                    type="button"
                    role="radio"
                    aria-checked={chosen === ch.label}
                    onClick={() => setChosen(ch.label)}
                    className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      chosen === ch.label ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="mt-0.5 font-semibold">{ch.label}</span>
                    <Markdown>{ch.textMd}</Markdown>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This battle part carries no choices — an honest empty state, never a fabricated question.
              </p>
            )}

            {revealed ? (
              <div className="space-y-3 rounded-md border-t pt-3">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {revealed.correct === true && (
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-4" aria-hidden /> Correct
                    </span>
                  )}
                  {revealed.correct === false && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="size-4" aria-hidden /> Not quite
                    </span>
                  )}
                  {revealed.correct === null && <span>Recorded — self-check against the mark scheme</span>}
                  <span className="ml-auto font-normal normal-case">
                    {revealed.marksAwarded === null
                      ? `${revealed.marksPossible} mark${revealed.marksPossible === 1 ? "" : "s"} possible`
                      : `${revealed.marksAwarded}/${revealed.marksPossible}`}
                  </span>
                </p>
                {revealed.markScheme ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3" aria-label="Mark scheme of record">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Mark scheme — the examiner&apos;s points of record ({revealed.markScheme.marksTotal}{" "}
                      {revealed.markScheme.marksTotal === 1 ? "mark" : "marks"})
                    </p>
                    <ul className="space-y-2">
                      {revealed.markScheme.points.map((pt) => (
                        <li key={pt.ref} className="flex items-start gap-2 text-sm">
                          <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[10px]">
                            {pt.ref}
                          </Badge>
                          <span className="min-w-0 flex-1">
                            <Markdown>{pt.textMd}</Markdown>
                          </span>
                          <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                            {pt.marks} {pt.marks === 1 ? "mark" : "marks"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Markdown>{revealed.solutionMd ?? "No solution bundled for this part."}</Markdown>
                <Button onClick={nextPart}>
                  {pos + 1 < battle.parts.length ? (
                    <>
                      Next part <ChevronRight className="size-4" aria-hidden />
                    </>
                  ) : (
                    "See the battle result"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={() => void submitAnswer()} disabled={submitting || !chosen}>
                  <CheckCircle2 className="size-4" aria-hidden /> Lock in &amp; reveal
                </Button>
                <Button variant="ghost" onClick={backToPicker}>
                  Walk away (nothing is scored)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Part {pos + 1} of {battle.parts.length} · {answeredCount} locked in · vs {battle.opponent.law} · the
          server clock is the law: answers landing after {new Date(deadlineMs).toISOString().slice(11, 19)} stay real
          evidence but score zero here.
        </p>
      </div>
    );
  }

  // ── the address picker (opt-in by construction) ────────────────────────────
  const summary = addresses?.summary;
  return (
    <div className="space-y-4">
      <BattleHeading />
      <p className="max-w-2xl text-sm text-muted-foreground">{ZERO_STAKES_NOTE}</p>
      {summary && (
        <p className="text-sm text-muted-foreground">
          Battles inherit the drill&apos;s model-drawn sets: 3 parts inside 60 seconds, head-to-head against the
          disclosed bot. Addresses serve battles only where at least three choice-graded parts exist — the
          battle-eligible floor; thinner addresses stay drill-only.
        </p>
      )}
      {startFailed && (
        <p className="text-sm text-destructive">
          The battle did not start — this address may hold fewer than three battle-eligible parts, or the surface
          refused to serve. Pick another spec point.
        </p>
      )}
      <div className="space-y-4">
        {grouped.map(([topic, rows]) => (
          <Card key={topic} className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Topic {topic}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {rows.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  disabled={submitting}
                  onClick={() => void beginBattle(a.code)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                    preselect === a.code ? "border-primary bg-primary/5" : ""
                  }`}
                  title={`${a.combined} anchored parts — battles serve the choice-graded subset`}
                >
                  <span className="font-mono font-medium">{a.code}</span>
                  <span className="ml-1.5 text-muted-foreground">{a.combined}</span>
                  {preselect === a.code && <span className="ml-1.5 text-primary">ready</span>}
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No battle addresses yet — the corpus is still growing into the spine.
          </p>
        )}
      </div>
      {settleFailed && battle && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4">
            <p className="text-sm text-muted-foreground">
              The battle is still live (the clock has not closed it yet) or the settlement did not answer. It is a
              pure projection — asking again costs nothing.
            </p>
            <Button variant="outline" onClick={() => void settle()}>
              <RefreshCw className="size-4" aria-hidden /> Ask for the result
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BattleHeading() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Swords className="size-5 text-primary" aria-hidden />
        Strength Battle
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Three questions, sixty seconds, head-to-head at one spec-point address — the same real past-paper bank the
        drill serves, with model-drawn sets and the examiner&apos;s mark schemes revealed instantly.
      </p>
    </div>
  );
}
