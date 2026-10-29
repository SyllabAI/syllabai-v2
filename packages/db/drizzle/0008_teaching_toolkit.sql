-- 0008 — T-TEACH-011 (TEACHING_TOOLKIT_PLAN §5): the Teaching Toolkit
-- append-only results + the per-teacher daily quota counter + the
-- class_features.ai_toolkit gate column (ADR-CLASS-0001 additive column,
-- DEFAULT true = row-absent semantics preserved) + the prompt_versions
-- registry rows T-TEACH-010 defers here (the fence-legal seed home:
-- teaching-toolkit/{lesson-plan,rubric,sow,coach} v1.0 — ORIGINAL prompt
-- engineering, the recreation's token-template grammar {token}; the
-- interpolation + empty-line-collapse law lives in
-- apps/api/src/routes/teaching-toolkit.ts). V2-NATIVE, ADDITIVE-ONLY
-- (BASELINE_DB.md §4): no Flyway-era table is altered beyond the one gate
-- column; smart_mark_results is the append-only posture precedent.
CREATE TABLE "teaching_toolkit_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid,
	"course_slug" varchar(64) NOT NULL,
	"tool_type" varchar(16) NOT NULL,
	"input_metadata" jsonb NOT NULL,
	"output" jsonb,
	"status" varchar(12) DEFAULT 'SUCCESS' NOT NULL,
	"model" varchar(120),
	"provider_name" varchar(40),
	"failure_reason" varchar(500),
	"elapsed_ms" integer,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_toolkit_resources_status" CHECK ((status)::text = ANY ((ARRAY['SUCCESS'::character varying, 'FAILED'::character varying])::text[])),
	CONSTRAINT "ck_toolkit_resources_tool_type" CHECK ((tool_type)::text = ANY ((ARRAY['lesson_plan'::character varying, 'rubric'::character varying, 'sow'::character varying, 'coach'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "teaching_toolkit_usage" (
	"teacher_id" uuid NOT NULL,
	"usage_day" date NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "teaching_toolkit_usage_pkey" PRIMARY KEY("teacher_id","usage_day")
);
--> statement-breakpoint
ALTER TABLE "class_features" ADD COLUMN "ai_toolkit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teaching_toolkit_resources" ADD CONSTRAINT "teaching_toolkit_resources_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_toolkit_resources" ADD CONSTRAINT "teaching_toolkit_resources_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_toolkit_usage" ADD CONSTRAINT "teaching_toolkit_usage_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_toolkit_resources_teacher" ON "teaching_toolkit_resources" USING btree ("teacher_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
INSERT INTO "prompt_versions" ("id", "registry_key", "version", "template", "notes", "created_at")
VALUES (gen_random_uuid(), 'teaching-toolkit/lesson-plan', '1.0',
'You are an expert secondary-school lesson designer for {subject}.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Design ONE lesson on "{topic}" lasting exactly {duration} minutes.
LEARNING OBJECTIVES (use these VERBATIM as overview.learningObjectives, in this order, no rewording):
{objectivesList}
Required JSON shape (all keys mandatory, exact casing):
{
  "overview": { "subject": string, "topic": string, "duration": {duration}, "teachingStyle": string|null, "learningObjectives": string[] (VERBATIM list above), "initialPrompts": string[3] (engaging opening questions) },
  "lessonPlan": {
    "starterActivity": { "description": string (~180 chars), "duration": int (5-10), "materials": string[2-3], "instructions": string[4-5] (each 1-2 sentences) },
    "mainActivities": [ 2-3 items: { "description": string (~150 chars), "duration": int (materials+instructions as below), "materials": string[2-3], "instructions": string[4-6], "differentiation": { "support": string[2], "core": string[2], "extension": string[2] } } ],
    "plenary": { "description": string (~150 chars), "duration": int (5-10), "materials": string[2], "instructions": string[4-5], "teacherFollowUp": string[3], "successIndicators": string[4] }
  },
  "reflectionSuggestions": string[5] (each ~110 chars, teacher reflection after the lesson),
  "differentiationAndSEN": { "differentiation": { "support": string[4-5], "core": string[4], "extension": string[4-5] }, "senSupport": string[4-5] (concrete SEN/EAL accommodations) },
  "crossCurricularLinks": string[3] (each ~60-80 chars, name the other subject),
  "assessmentQuestions": string[4-6] (exam-style questions testing the objectives),
  "additionalNotes": string[3] or string (safety, equipment, context notes)
}
Timing rule: starterActivity.duration + sum(mainActivities[].duration) + plenary.duration must equal exactly {duration}.
{teachingStyleLine}
{abilityLine}
Homework requested: {homework}. If "No", do not include homework anywhere.
Tone: practical, specific, classroom-ready. Descriptions 2-4 sentences; instructions imperative.',
'T-TEACH-010/011: original prompt engineering (ZNotes server prompts unknowable); token-template grammar — interpolate {token} then collapse empty lines', now())
ON CONFLICT (registry_key, version) DO NOTHING;--> statement-breakpoint
INSERT INTO "prompt_versions" ("id", "registry_key", "version", "template", "notes", "created_at")
VALUES (gen_random_uuid(), 'teaching-toolkit/rubric', '1.0',
'You are an expert assessment designer. You write analytical rubrics for school assessment.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Rubric for a {assignmentType} in {subject} on "{topic}".
Task description: {taskDescription}
Assessment type: {assessmentType}. Each criterion is worth {marksPerCriterion} marks.
Criteria to assess (one rubric row each, EXACT names): {criteriaJson}
Required JSON shape (all keys mandatory, exact casing):
{
  "metadata": { "subject": string, "topic": string, "assignmentType": string, "taskDescription": string (reuse, ~130 chars), "assessmentType": string, "assessor": "Teacher", "marksPerCriterion": {marksPerCriterion} },
  "overview": { "assignmentPurpose": string (~95 chars), "submissionFormat": string (~85 chars, concrete format of what students hand in), "criteriaAssessed": {criteriaCount}, "performanceScale": "Emerging -> Basic -> Proficient -> Advanced" },
  "rubric": { "criteria": [ one per criterion: { "name": string (exact criterion name), "criterionIntent": string (~110 chars, what this criterion measures), "levels": { "advanced": { "description": string (~300-380 chars), "feedback": string (~100 chars, feedback a teacher would write) }, "proficient": { same fields, description ~300 chars }, "basic": { same, ~330 chars }, "emerging": { same, ~280 chars } } } ] },
  "moderationGuidance": string[2] (how two markers should align, ~150-190 chars each)
}
Do NOT include "score" fields; they are computed by the app.
Level ladder: advanced = excellent command, proficient = secure, basic = adequate with gaps, emerging = limited/starting. Descriptions must be observable and specific to {assignmentTypeLower} work, not generic.',
'T-TEACH-010/011: original prompt engineering; scores are COMPUTED client/route-side (100/75/50/25 percent of marksPerCriterion) — the model never emits them', now())
ON CONFLICT (registry_key, version) DO NOTHING;--> statement-breakpoint
INSERT INTO "prompt_versions" ("id", "registry_key", "version", "template", "notes", "created_at")
VALUES (gen_random_uuid(), 'teaching-toolkit/sow', '1.0',
'You are an expert head of department writing a scheme of work.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Scheme of work: {totalLessons} lesson(s) of {lessonDuration} minutes each for {level} {subject} ({board}), topic "{topic}". Difficulty: {difficultyLevel}.
{emphasisLine}
{preferencesLine}
Required JSON shape (all keys mandatory, exact casing):
{
  "subject": string, "topic": string,
  "overarchingObjectives": string[3-4] (course-level goals, ~70 chars each),
  "lessons": [ exactly {totalLessons} items: {
    "lessonNumber": int (1-based), "title": string (~55 chars), "duration": {lessonDuration},
    "learningObjectives": string[3-4] (measurable, "By the end... students can..." style, ~70 chars),
    "activities": [3-5 items: { "title": string (~40 chars), "description": string (~200-270 chars), "duration": int, "resources": string[3-4] } ]  // activity durations must sum to {lessonDuration}
    ,
    "assessment": string[3-4] (~70 chars each, concrete checks for understanding),
    "differentiation": { "support": string[3-4], "core": string[3], "extension": string[3] },
    "scaffoldingStrategies": string[3-4] (~70 chars),
    "reflectionPrompts": string[3] (~75 chars, questions the teacher asks students),
    "crossCurricularLinks": string[3] (~60-80 chars, name the other subject),
    "stretchTasks": string[3] (~85 chars, beyond-spec challenge)
  } ],
  "metadata": { "author": "Curriculum Planning Expert", "createdAt": "YYYY-MM-DD", "version": "1.0" }
}
Lessons must build progressively (later lessons assume earlier ones).',
'T-TEACH-010/011: original prompt engineering; metadata.persona fixed by post-processing law (Curriculum Planning Expert / v1.0), not trusted from the model', now())
ON CONFLICT (registry_key, version) DO NOTHING;--> statement-breakpoint
INSERT INTO "prompt_versions" ("id", "registry_key", "version", "template", "notes", "created_at")
VALUES (gen_random_uuid(), 'teaching-toolkit/coach', '1.0',
'You are an expert learning coach for {subject}.
Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.
Task: {taskVerb}, {audienceNote}.
PASSAGE:"""{inputText}"""
Required JSON shape (all keys mandatory, exact casing, snake_case exactly as shown):
{
  "topic": string (~60-75 chars, a descriptive title for the document),
  "main_argument": string (~200-240 chars, the single central claim of the passage, one strong sentence pair),
  "key_concepts": [4-6 items: { "title": string (~30 chars), "importance": "Core" or "Supporting", "description": string (~150-260 chars) } ]  // cover EVERY mechanism in the passage; models named in the passage get their own entries
  ,
  "critical_details": string[3] (~120-140 chars each, precise facts/examinable details that must not be lost),
  "applications_in_practice": [3 items: { "example": string (~40 chars), "description": string (~200-290 chars, concrete classroom/exam/real-world application) } ],
  "thinking_prompt": string (~250-280 chars, ONE rich question + guidance that pushes the audience to reason further),
  "connections": [3 items: { "concept": string (~25 chars, another topic in {subject} or beyond), "relationship": string (~200-230 chars, how it links and why it matters) } ]
}
{modeNote}',
'T-TEACH-010/011: original prompt engineering; clarify/challenge verb + audience note are route-assembled tokens; snake_case keys are the captured contract', now())
ON CONFLICT (registry_key, version) DO NOTHING;
