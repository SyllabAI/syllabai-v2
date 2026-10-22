"use client";

/**
 * F-182 — the per-spec-point drill player (Kognity dossier v1.1 Deep Dive D
 * §8.5 row 1; prereg docs/F182-DRILL-BUILD-PLAN.md).
 *
 * The surface law, rendered: 5-part randomized draw keyed to ONE spec-point
 * address (the fail-closed picker serves only drillable addresses — policy
 * P3), zero stakes (nothing here feeds gradebook/progress — the drill writes
 * its own evidence lane only), retakable with a fresh draw (every retake is a
 * new server-drawn seed — policy P5), and the INSTANT post-attempt reveal
 * (the solution rides the evidence ack; F-183 is the landed reveal law: the
 * examiner's MS of record renders verbatim with the Smart Mark method-credit
 * verdicts on structured parts).
 *
 * Posture: signed-out visitors get the sign-in CTA (the drill is an
 * identity-bearing surface — draws and evidence key to the learner); any
 * fetch failure renders the honest empty state, never a fabricated draw.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Atom, CheckCircle2, ChevronRight, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AnswerTextarea, answerPlaceholder } from "@/components/answer-textarea";
import { Markdown } from "@/components/markdown";
import { PartProblem } from "@/components/part-problem";
import { SpecChip } from "@/components/provenance";
import { getToken } from "@/lib/api";
import {
  fetchDrillAddresses,
  postDrillDraw,
  postDrillEvidence,
  type DrillAddressesResponse,
  type DrillDrawResponse,
  type DrillEvidenceResponse,
} from "@/lib/drill";

const ZERO_STAKES_NOTE =
  "Zero stakes by construction: drills never touch your gradebook, progress rings or recommendations — only the drill's own practice log.";

function topicGroupOf(code: string): string {
  // "4CH1-1.25" -> topic "1"; "4CH1-2.33C" -> "2"
  const afterPrefix = code.split("-")[1] ?? code;
  return afterPrefix.split(".")[0] ?? afterPrefix;
}

/** F-183: the examiner-facing point label — the corpus point id's M-suffix ("2019-06-2-a-MP1" -> "MP1"). */
function msPointLabel(ref: string): string {
  const suffix = ref.split("-").pop() ?? ref;
  return suffix.startsWith("MP") || suffix.startsWith("M") ? suffix : ref;
}

interface SessionLogEntry {
  partId: string;
  marksPossible: number;
  marksAwarded: number | null;
  correct: boolean | null;
}

export function DrillClient({ course }: { course: string }) {
  const signedIn = useMemo(() => getToken() !== null, []);

  const [addresses, setAddresses] = useState<DrillAddressesResponse | null>(null);
  const [addressesFailed, setAddressesFailed] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(signedIn);

  const [draw, setDraw] = useState<DrillDrawResponse | null>(null);
  const [pos, setPos] = useState(0);
  const [answer, setAnswer] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [selfDoubt, setSelfDoubt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<DrillEvidenceResponse | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);
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

  const part = draw?.parts[pos] ?? null;

  const startPartTimer = () => {
    partStartedAt.current = Date.now();
  };

  const beginDraw = async (code: string) => {
    setSubmitting(true);
    const data = await postDrillDraw(course, code);
    setSubmitting(false);
    if (!data) {
      setAddressesFailed(true);
      return;
    }
    setDraw(data);
    setPos(0);
    setAnswer("");
    setChosen(null);
    setConfidence(3);
    setSelfDoubt(false);
    setRevealed(null);
    setSessionLog([]);
    startPartTimer();
  };

  const submitEvidence = async () => {
    if (!draw || !part || revealed) return;
    const response =
      part.choices
        ? chosen
          ? ({ kind: "choice", label: chosen } as const)
          : null
        : answer.trim()
          ? ({ kind: "text", text: answer.trim() } as const)
          : null;
    if (!response) return;
    setSubmitting(true);
    const ack = await postDrillEvidence(
      draw.drawId,
      part.partId,
      response,
      Math.max(0, Date.now() - partStartedAt.current),
      confidence,
      selfDoubt,
    );
    setSubmitting(false);
    if (!ack) {
      setAddressesFailed(true);
      return;
    }
    setRevealed(ack);
    setSessionLog((prev) => [
      ...prev,
      {
        partId: part.partId,
        marksPossible: ack.marksPossible,
        marksAwarded: ack.marksAwarded,
        correct: ack.correct,
      },
    ]);
  };

  const nextPart = () => {
    if (!draw) return;
    if (pos + 1 < draw.parts.length) {
      setPos((p) => p + 1);
      setAnswer("");
      setChosen(null);
      setConfidence(3);
      setSelfDoubt(false);
      setRevealed(null);
      startPartTimer();
    } else {
      setDraw({ ...draw, parts: draw.parts }); // stay on the last part; the summary shows below
      setRevealed(null);
      setPos(draw.parts.length); // enters the done summary
    }
  };

  const retake = () => {
    if (!draw) return;
    void beginDraw(draw.code); // no seed — the server draws a fresh one (the retake law)
  };

  const grouped = useMemo(() => {
    const byTopic = new Map<string, typeof addresses extends null ? never[] : NonNullable<typeof addresses>["addresses"]>();
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
        <DrillHeading />
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              The spec-point drill is an identity-bearing surface: your draws and attempt evidence key to
              your learner account. Sign in to drill.
            </p>
            <Button asChild>
              <Link href="/login">Sign in to drill</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingAddresses) {
    return (
      <div className="space-y-4">
        <DrillHeading />
        <p className="text-sm text-muted-foreground">Loading the drillable addresses…</p>
      </div>
    );
  }

  if (addressesFailed && !addresses) {
    return (
      <div className="space-y-4">
        <DrillHeading />
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              The drill surface did not answer. It ships only where the spec-tagging census of record
              exists, and it fails closed rather than serve an unpinned bank.
            </p>
            <Button variant="outline" onClick={() => void loadAddresses()}>
              <RefreshCw className="size-4" aria-hidden /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── the done summary ──────────────────────────────────────────────────────
  if (draw && pos >= draw.parts.length) {
    const graded = sessionLog.filter((l) => l.correct !== null);
    const marks = sessionLog.reduce((acc, l) => acc + (l.marksAwarded ?? 0), 0);
    const possible = sessionLog.reduce((acc, l) => acc + l.marksPossible, 0);
    const correctCount = graded.filter((l) => l.correct === true).length;
    return (
      <div className="space-y-4">
        <DrillHeading />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{draw.code}</Badge>
              <span className="text-muted-foreground">drill complete — zero stakes, of course</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-bold tabular-nums">
              {marks}
              <span className="text-base font-normal text-muted-foreground"> / {possible} marks</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {correctCount} of {graded.length} server-graded MCQ parts correct
              {graded.length < sessionLog.length
                ? ` · ${sessionLog.length - graded.length} structured part${sessionLog.length - graded.length === 1 ? "" : "s"} recorded ungraded (self-check against the revealed solutions)`
                : ""}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void retake()}>
                <RefreshCw className="size-4" aria-hidden /> Retake — fresh draw
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDraw(null);
                  setSessionLog([]);
                }}
              >
                Pick another spec point
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── the drill player ──────────────────────────────────────────────────────
  if (draw && part) {
    const isMcq = part.choices !== null && part.choices.length > 0;
    return (
      <div className="space-y-4">
        <DrillHeading />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{draw.code}</Badge>
              {part.commandWord && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {part.commandWord}
                </Badge>
              )}
              {part.specPointCodes.map((c) => (
                <SpecChip key={c} code={c} />
              ))}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                part {pos + 1} of {draw.parts.length} · {part.marks} mark{part.marks === 1 ? "" : "s"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PartProblem md={part.problemMd} />

            {isMcq && !revealed && (
              <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
                {part.choices!.map((ch) => (
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
            )}

            {!isMcq && !revealed && (
              <AnswerTextarea
                id="drill-answer"
                label="Your answer"
                value={answer}
                onChange={setAnswer}
                ariaLabel="Your drill answer"
                placeholder={answerPlaceholder(part.problemMd)}
                marks={part.marks}
                onSubmitShortcut={() => void submitEvidence()}
              />
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
                      {revealed.markScheme.points.map((pt) => {
                        const verdict = revealed.methodCredit?.allocations.find((a) => a.ref === pt.ref);
                        return (
                          <li key={pt.ref} className="flex items-start gap-2 text-sm">
                            <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[10px]">
                              {msPointLabel(pt.ref)}
                            </Badge>
                            <span className="min-w-0 flex-1">
                              <Markdown>{pt.textMd}</Markdown>
                            </span>
                            <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                              {pt.marks} {pt.marks === 1 ? "mark" : "marks"}
                            </span>
                            {verdict && (
                              <span
                                className={`ml-1 shrink-0 whitespace-nowrap text-xs ${
                                  verdict.methodCredited ? "text-success" : "text-muted-foreground"
                                }`}
                              >
                                {verdict.methodCredited ? "method credited" : "no method credit"}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {revealed.methodCredit && (
                      <p className="text-xs text-muted-foreground">
                        Smart Mark method credit: {revealed.methodCredit.creditsTotal}/{revealed.markScheme.points.length}{" "}
                        points · {revealed.methodCredit.pipelineVersion}
                      </p>
                    )}
                  </div>
                ) : null}
                <Markdown>{revealed.solutionMd ?? "No solution bundled for this part."}</Markdown>
                <Button onClick={nextPart}>
                  {pos + 1 < draw.parts.length ? (
                    <>
                      Next part <ChevronRight className="size-4" aria-hidden />
                    </>
                  ) : (
                    "See the drill summary"
                  )}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Confidence: <span className="font-medium">{confidence}/5</span>
                  </Label>
                  <Slider
                    value={[confidence]}
                    onValueChange={([v]) => setConfidence(v)}
                    min={1}
                    max={5}
                    step={1}
                    aria-label="Confidence level"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch id="drill-doubt" checked={selfDoubt} onCheckedChange={setSelfDoubt} />
                  <Label htmlFor="drill-doubt" className="text-sm">
                    Flag self-doubt
                  </Label>
                </div>
              </div>
            )}

            {!revealed && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void submitEvidence()}
                  disabled={submitting || (isMcq ? !chosen : !answer.trim())}
                >
                  <CheckCircle2 className="size-4" aria-hidden /> Submit &amp; reveal
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraw(null);
                    setSessionLog([]);
                  }}
                >
                  Abandon (nothing is scored)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Draw seed {draw.seed} · pool {draw.poolSize} parts ({draw.freshPoolSize} fresh
          {draw.usedFallback ? " — retake fell back to the full pool so a thin address stays retakable" : ""}).
        </p>
      </div>
    );
  }

  // ── the address picker ────────────────────────────────────────────────────
  const summary = addresses?.summary;
  return (
    <div className="space-y-4">
      <DrillHeading />
      <p className="max-w-2xl text-sm text-muted-foreground">{ZERO_STAKES_NOTE}</p>
      {summary && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{summary.drillable}</span> of{" "}
          {summary.specPointAddresses} spec points are drillable today ({summary.covered} carry parts,{" "}
          {summary.thin} are still thin, {summary.uncovered} await content). Every address below holds at
          least five anchored parts — the fail-closed floor.
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
                  onClick={() => void beginDraw(a.code)}
                  className="rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50 disabled:opacity-50"
                  title={`${a.combined} anchored parts (official ${a.official} · topic ${a.topic})`}
                >
                  <span className="font-mono font-medium">{a.code}</span>
                  <span className="ml-1.5 text-muted-foreground">{a.combined}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No drillable addresses yet — the corpus is still growing into the spine.
          </p>
        )}
      </div>
    </div>
  );
}

function DrillHeading() {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Atom className="size-5 text-primary" aria-hidden />
        Spec-point drill
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Five random parts at one syllabus address, drawn from the tagged corpus of record. Answer, reveal
        the solution instantly, retake forever — the strength-test habit, zero stakes.
      </p>
    </div>
  );
}
