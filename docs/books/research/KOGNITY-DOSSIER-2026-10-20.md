# Kognity Competitive Research Dossier — Deep Dives of Record

**Status:** v1.0 · 2026-10-20 · research session trace `1a15b545c5277949` · compiled for the SyllabAI master pack (`syllabai` repo, research dossiers lineage)
**Scope:** full competitor dossier — company profile, commercial model, reception, plus three deep dives: **(A)** interactive textbooks, **(B)** assignment & analytics engine, **(C)** NGSS storyline format.
**Method:** live web research against vendor pages, third-party review platforms, press coverage, and community sources. All sources logged in Appendix A with access dates. No product access, no trial account, no internal Kognity documents were available; vendor claims are labeled as vendor claims.
**Confidence key:** ✅ verified via 2+ independent sources · ⚠️ single-source or vendor-claim-only · ❓ contradictory / unresolved

---

## 0. Executive summary (verdict up front)

> **VERDICT OF RECORD:** Kognity is a school-licensed, syllabus-atomic interactive textbook platform with a genuinely well-coupled assessment → analytics loop. Its moats are **institutional, not algorithmic**: Cambridge endorsement, IB co-publishing, examiner authorship, Edlink-powered LMS distribution (50+ platforms), and a SOC 2 Type II / ISO 27001 trust posture. It has **no learner model, no spaced-repetition engine, no tutor, and no student-facing AI** — despite two real AI developments this research confirmed: **AI-assisted scoring** (suggests an IB-aligned score with reasoning; teacher decides) and an **AI-assisted content pipeline** (machine-drafted, human-reviewed). Every differentiator SyllabAI is built on — diagnosis of struggle, grounded tutoring with resolvable citations, learner modeling (BKT/BDT/decay), and real past-paper assessment — remains unoccupied territory. The threat vector is distribution and trust infrastructure, not product depth.

Three structural facts drive most of the analysis below:

1. **The syllabus section is the atomic unit** of everything Kognity ships — reading, questions, strength tests, analytics all key off the same section address space. This coupling, not the widgets, is what teachers pay for.
2. **Auto-correction is engineered around exact-answer matching.** Questions are written by Kognity-employed authors specifically so answers "match exactly and can be marked online without teacher input" (student-community observation, r/IBO). Method/working is not assessed; format mismatches produce false negatives.
3. **Kognity does not use real past papers.** Its banks are original questions (35,000+ for IB DP) written *to* exam criteria. Teachers explicitly wish for past-paper-derived practice in verified reviews — SyllabAI's canonical corpus is a direct answer to a documented demand.

---

## 1. Company profile & market position

Kognity is a Swedish edtech company founded in 2014, HQ Stockholm, celebrating its 10th year of operation. It positions as an "interactive teaching and learning platform" — the phrase "more than a textbook: comprehensive resource + built-in assessment" is its own framing of the category it tries to occupy. Reported scale: **2,000+ schools, 130+ countries, 1,000,000+ teachers and students reached** (vendor homepage claims, ⚠️), and "1 in 3 IB schools worldwide" (vendor claim repeated on the IB DP assessment page, ⚠️).

### 1.1 Curricula served

| Curriculum | Offering | Endorsement / authority position | Confidence |
|---|---|---|---|
| Cambridge IGCSE™ | 14 subjects (sciences, math, humanities, ICT/CS, languages) | **Every subject Cambridge-endorsed**; vendor claims "only digital-first endorsed resource" for IGCSE | ✅ endorsement stated on all subject pages |
| IB Diploma Programme | Full DP subject range incl. FE2025 Biology/Chemistry/Physics rewrites | **IB's only digital-first publishing partner**; selected subjects (Biology, Chemistry, Physics, ESS, Business Management, Psychology) **co-published with the IB** | ✅ |
| IB Middle Years Programme | New (2025–26 era) | Early-stage | ⚠️ |
| NGSS (US High School Science) | Biology, Chemistry, Physics, Earth & Space Science | Crafted by original NGSS writers; **ESSA Level IV "Demonstrates a Rationale"** evidence designation | ✅ |

### 1.2 Content production model

Author teams are practicing examiners and assessment specialists (e.g., a Cambridge Assessment International Education assessment specialist who is also an IB DP English Literature examiner; an original NGSS writer cohort for the US line). Two production facts matter for competitive analysis:

- **AI-assisted content pipeline (⚠️ vendor-confirmed, 2026):** Kognity's IGCSE FAQ states it has "an advanced and robust infrastructure based on AI technology that creates and quality-assures our content," claiming higher quality from "AI workflows in combination with reviews from authors and subject experts than with authors alone," with all content passing "a rigid review by human subject experts." This **updates** the third-party picture: EdTech Impact's AI-usage field still reads "The Kognity team has not stated whether it uses AI." The accurate current position: AI drafts and QA-assists content; humans review; **no student-facing AI product features were found anywhere**.
- **Continuous update doctrine:** digital-first books are patched in place against syllabus changes (e.g., IGCSE First Language English FE2027 live; IGCSE CS FE2029 resource in development) and user-reported errata — the "never needs replacing" pitch against print.

### 1.3 What this means for SyllabAI

- The endorsement wall is real and slow to climb: Cambridge endorsement and IB co-publishing are the two institutional assets SyllabAI cannot quickly replicate, and they anchor school trust. If school distribution is ever a SyllabAI channel, endorsement pathways are a multi-year lead-time item to plan deliberately — or deliberately not compete on.
- Kognity's AI use is confined to **content production and scoring suggestions**. SyllabAI's student-facing, citation-grounded tutor is not matched and not obviously being matched; their public positioning (webinars on "responsible AI") treats AI as a classroom-policy topic, not a product surface.
- "1 in 3 IB schools" as a claimed install base means organic teacher familiarity with their interaction patterns (strength tests, section questions) — fast-follower UX on those patterns is cheap for SyllabAI, while inventing the categories Kognity lacks remains the differentiating play.

---

## 2. Commercial model & pricing

**Model:** B2B only. Subscriptions are purchased at organizational level (school, school group, district), priced **per student, per year**, scaled by the number of subjects each student accesses (this per-subject multiplier does not apply to NGSS partners). **Teacher accounts are always free.** No public price list anywhere; pricing is demo-gated and "tailored to each school." A **30-day free trial** (no commitment, no credit card) covers each product line.

**Contract mechanics:** subscriptions run on a rolling contract with auto-renewal. This generated one of the most substantive negative verified reviews on record (an IBDP coordinator, Nexus International School Singapore): schools "can get stuck into a package that isn't relevant to your current cohort" with "no flexibility if you miss the deadline." Kognity's public reply acknowledged the rolling-contract structure as deliberate and upfront.

**Distribution & integration stack (the quiet moat):** Kognity has partnered with **Edlink** to expose **50+ LMS/SIS integrations**, with four featured platforms (Google Classroom, Microsoft Teams, Canvas, Schoology) at full depth: rostering, SSO, task management (assignments appear natively in the LMS), and **automatic grade passback**. Clever and ClassLink cover rostering + SSO. Setup is quoted at ~48 hours, no additional cost. Compliance posture: **SOC 2 Type II and ISO/IEC 27001** — a hard procurement gate for US/international schools.

**Support & enablement as part of the sale:** personalized training (in-person or online), on-demand PD library and webinars, 24/5 human support (EdTech Impact lists 24/7 live rep), school-leader usage monitoring, and per-subject educator guides (lesson plans, feature walkthroughs). Onboarding includes a kick-off session run by Kognity staff.

> **What this means for SyllabAI:**
> - **Transparent pricing is an open flank.** Demo-gated opaque pricing plus rolling-contract lock-in is a recurring irritant in the review record. A transparent, self-serve pricing page is a cheap wedge for SyllabAI if it ever sells to schools; even for direct-to-learner distribution, "no lock-in" is a marketable contrast.
> - **Grade passback + rostering are table stakes for school deals** — any SyllabAI school motion needs an Edlink-class integration story or the deal friction is fatal.
> - **SOC 2 / ISO 27001 are procurement prerequisites**, not differentiators, in this segment. Budget for them early if the school channel is real.

---

## 3. Reception & verified evidence

**Aggregate:** **4.3/5 from 54 verified reviews** on EdTech Impact (all-time; zero reviews in the six months before access date). Impact metrics as measured by the platform: reduce teacher workload 89% · build student knowledge 88% · improve attainment 83% (of reviewers marking the claim as met).

**Vendor marketing statistics (⚠️, internally inconsistent):** "86% of teachers save at least 5 hours a week" (homepage), "teachers can save up to 2 hours a week" (EdTech Impact profile text), "saves teachers up to 10 hours a week" (IB DP assessment page). Three different workload claims on three surfaces; treat all as marketing, not evidence. The "90% of students would recommend" and "9 out of 10 teachers say students are better prepared" claims are likewise uncorroborated.

**What teachers consistently praise (verified review corpus):**

| Praise theme | Representative evidence |
|---|---|
| Strength tests as diagnostic tools | "Strength tests have become a critical tool to measure progress" (school director, Bremen); "students who take the time to do the readings and then go back for strengths tests make marked improvement" (IB Bio/Chem teacher, 3–4 yrs) |
| Workload reduction via auto-correction | "Reduced time preparing for classes, shorter grading times and less paperwork" (IB teacher, Japan); "I don't have to grade homework or find problems" (Dakar) |
| Syllabus fidelity | "It follows the syllabus guide beautifully" (physics teacher, Malta); "content is topical, relevant and a wider range than I see with some textbooks" |
| Everything-in-one-place | Reading + questions + review + data in one system; "I can't imagine teaching TOK without Kognity" |
| Measured outcomes | "Overall IB scores were better than they have ever been" (US, year-2 adopter, self-reported attribution ⚠️) |

**What teachers consistently criticize (verified review corpus + community):**

| Complaint theme | Representative evidence |
|---|---|
| Marking rigidity / false negatives | "A student may write the correct answer but not in a form expected by Kognity and it will be marked incorrectly… the method is more important than the answers" (IB sciences teacher, 3–4 yrs); "some of the right answers are rendered as wrong" (English teacher, Argentina) |
| No method/working credit | Auto-correction "looks only at the answer… rather than the method used to get the answer"; sciences teachers hand Kognity questions out but grade manually |
| Wants real past papers | "I would expect to have more topic-specific practice questions taken from the past papers" (biology teacher, India) |
| Reading-assignment data is shallow | "There is no place where to assess the end-of-section short activity… only a progress bar" (English teacher, Argentina) |
| No content control | "I can't modify the textbook by choosing what to show students, they get to see everything including SL assignments (I teach HL)" |
| Content error variance | English B book "still needs revising for mistakes… many of them" (2021; since then errata-fixing is claimed continuous ⚠️) |
| Contract lock-in | Rolling contract, renewal deadline inflexibility (Singapore DP coordinator) |

> **What this means for SyllabAI:**
> - The three loudest negative themes — **format-rigid marking, no method credit, no real past papers** — are precisely Smart Mark against actual mark schemes + the canonical past-paper corpus. This is not speculative positioning; it is documented, repeated user demand.
> - "Progress-bar reading data" complaints define the bar for SyllabAI's reading analytics: per-activity response visibility, not click-through.
> - Review volume is modest (54, and stale — none in 6 months). Kognity's reputation runs on institutional relationships and endorsement, not public review velocity; SyllabAI should not read their market position from ratings.

---

## 4. Deep Dive A — Interactive textbooks

> **DIVE VERDICT:** The textbook is not a PDF and not a media wrapper — it is a **syllabus-addressed content graph** with a tightly coupled assessment loop. The interactive layer itself is commodity tech (H5P, Trinket, JW Player); the moat-grade elements are (1) section-level atomization shared by content/questions/tests/data, (2) examiner authorship + endorsement, (3) an EAL-grade reading-support layer engineered for their 130+ country market. Weak points: shallow reading-activity assessment, no teacher content control, no adaptivity.

### 4.1 Content model

- **Born-digital, syllabus-atomic.** Books are structured to mirror the syllabus (sub-section granularity, e.g. "Chapter 1.2.4"); the same address space drives section questions, strength tests, assignments, and analytics. Full coverage claims: Core & Extended for IGCSE, SL/HL for DP, IA guidance included, TOK / international-mindedness / learner-profile links embedded.
- **Bite-sized structure** is a stated design principle ("making it easier to learn"), with questions after each section as the built-in comprehension gate.
- **Storyline framing** on the NGSS line (Deep Dive C); applied-learning and real-world-connection framing across the rest.
- **Authority stack:** examiner/assessment-specialist author teams; Cambridge endorsement per subject; IB co-publishing on selected DP subjects; original NGSS writers on the US line.

### 4.2 The interactive layer

| Element | Detail |
|---|---|
| Rich media | Videos, animations, simulations, 3D models; replayable at student pace |
| Applet embeds | **H5P** interactive packages (quizzes, interactive video, courseware) across subjects; **Trinket** live-coding applets in Computer Science |
| In-line exercise types | Drag-and-drop, fill-in-the-blanks, dropdowns — explicitly positioned as **standardized-testing technique practice** |
| Scaffolding | Concept boxes, guiding questions, linking questions, investigations, worked examples |
| Metacognition blocks | Dedicated study-strategy + cross-curricular-connection sections (IGCSE line) |

Engineering reality check: H5P and Trinket are off-the-shelf embeddable interactives; a media library of 220+ videos / 740 images / 650 interactives (NGSS line, ⚠️ vendor count) is a content-acquisition achievement, not a technology one. **The widgets are replicable in weeks; the atomization discipline and the authoring pipeline are not.**

### 4.3 The reading-support layer (EAL-grade)

Built for students studying in a second or third language — the default condition of their core international-school market:

- **Interactive glossary:** alphabet-navigated sidebar (empty letters grayed), text filtering; originally built in **Vue.js** with full keyboard navigation, VoiceOver/screen-reader support, ARIA labeling — Kognity engineering publicized this single component in detail, indicating accessibility is treated as an engineering discipline, not a checklist.
- **Text-to-speech with rate adjustment, line focus, display controls;** reading-assistance tool covering **130+ languages**; in-text vocabulary support and picture dictionary ("resolve language issues without leaving the page" — physics head-of-department, Shanghai).
- **Notebook + highlighter** with centralized note collection; per-section progress bars.
- Field effect (customer story, SUIS Gubei Shanghai): language interruptions that previously stalled lessons are absorbed by the tooling; students "love" the independence it gives them.

### 4.4 The loop that makes it a product

Read section → section questions → **Strength Test** (per-section diagnostic; the single most-praised feature in the review corpus) → gaps surface in teacher Insights → targeted assignment → re-test. Each syllabus section carries its own progress state for the student and its own performance roll-up for the teacher. This is the mechanism that converts a textbook from a reference into a *measurable instruction surface* — and it is Kognity's genuine product insight.

### 4.5 Known breakdown points

1. Reading-assignment assessment degrades to a progress bar for in-book activities (no per-response visibility for some activity types).
2. No teacher control over what students see (HL material visible to SL students; no curation).
3. No adaptivity: sequence is fixed by the book; performance data informs the *teacher*, not the *next content item* shown to the student.
4. Error variance in newer books (documented 2021-era English B complaints; claimed continuous errata pipeline since).

> **What this means for SyllabAI (A):**
> - **Adopt the atomization discipline.** Make the syllabus section the shared address space of SyllabAI content maps, questions, diagnostics, and analytics — Kognity demonstrates this coupling is what converts content into instruction infrastructure. SyllabAI's KG spine is already the stronger substrate for it.
> - **Parity checklist for international credibility:** glossary, TTS (rate control), translation at scale, reading assistance, notebook/highlighter, per-section progress. None are moats; all are procurement checkboxes.
> - **Skip the widgets arms race.** H5P-class interactives are commodity; SyllabAI's anchored tutor *inside the reading experience* is a surface Kognity does not have — a student who can interrogate the section they are stuck on beats one who can replay a video.
> - **The adaptivity vacuum is the structural opening:** their loop ends at "teacher sees the gap." SyllabAI's learner model (BKT/BDT/computed decay, ADR-031) closes the loop at "system changes what the student does next" — a category they have not entered.

---

## 5. Deep Dive B — Assignment & analytics engine

> **DIVE VERDICT:** This is Kognity's operational core and where its newest engineering is landing. The bank is large (35,000+ for IB DP), assignment types are well-differentiated, and the Autumn-2024 wave added **AI-supported scoring** — the first student-relevant AI feature in their stack. But the engine's ceiling is structural: questions are *written to be machine-markable* (exact-answer matching), scoring suggestions remain teacher-decision aids, and analytics are **descriptive dashboards, not diagnostic models**. The loop still terminates at the teacher.

### 5.1 Question bank architecture

- **35,000+ questions** for IB DP, built by subject experts, "grouped by paper type and written to IB criteria" — i.e., organized along the same paper-structure axis as real assessment (knowledge checks → multi-part exam-style questions).
- Per-book bank scales: 1,000+ (DP Biology), 700+ (IGCSE Computer Science), 300+ (IGCSE First Language English) — depth is **uneven across subjects**, confirmed by reviews.
- Two quality tiers per topic are reported by long-term users (recall-level vs. applied), plus "hundreds of full, multi-part exam-style questions exactly as they appear on real IB papers" (⚠️ vendor phrasing — these are exam-*style*, authored to the same shape; **not past papers**).
- Community mechanic worth noting (r/IBO, student-side): Kognity-employed authors write questions "so that the answers match exactly and can be marked online without teacher input." Machine-markability is a **property designed into the questions at authoring time**, not a capability of a flexible marker.

### 5.2 Assignment taxonomy & workflow

| Assignment type | Mechanics |
|---|---|
| Reading assignment | Sections assigned with due date; completion tracked via progress bars; in-book activity responses largely invisible to teacher (documented complaint) |
| Question assignment | Teacher picks questions from the bank (by chapter/subtopic down to "1.2.4" granularity) or adds custom questions; auto-corrected; differentiated variants supported |
| Exam-style question assignment | Multi-part, exam-condition tasks; students submit digitally (no print/scan); teachers grade **in-platform** (Autumn 2024 upgrade) |
| Scheduling & scale | Assignments can be scheduled ahead; multi-class send in one action (Autumn 2024) |

Feedback mechanics (post-Autumn-2024 state): teachers can **reveal solutions after each question** so students self-correct mid-assignment; personalized teacher feedback and next-steps guidance attach to submissions; scores and feedback are released to students **together** (gated release); students are auto-notified; teachers can see **how answers improved across attempts**.

### 5.3 AI-supported scoring (the new element)

From the IB DP assessment page (2026): AI "suggests IB-aligned scores for teacher review," provides "reasoning behind each suggested score," the teacher "can confirm or change any suggested score," and the feature is **optional and can be turned off**. Their own slogan: **"AI suggests; teachers decide the final grade."**

Reading of record: this is AI-assisted *teacher* marking — a confidence-and-workload device, not autonomous assessment. It is nonetheless a meaningful signal: Kognity is willing to put LLM judgment inside the marking loop as long as (a) a human owns the grade and (b) the school can switch it off. That is the same posture SyllabAI's Smart Mark takes on human-override — but SyllabAI grounds its marking in **actual mark schemes from the actual papers**, while Kognity's suggestions grade against their own authored criteria.

### 5.4 Insights (analytics)

- **Descriptive layer:** real-time completion (reading + assignments) and performance data; class-level and student-level drill-down; "where students are confident and where gaps are forming"; each student's latest work and scores; statistical views teachers use for flipped-classroom prep and intervention targeting.
- **No modeling layer found anywhere in the public record:** no mastery estimation, no knowledge tracing, no decay/retention model, no predictive signal. "Gaps" are computed as aggregate performance by syllabus section — a heatmap, not a diagnosis of *why*.
- School-leader usage monitoring sits above the teacher layer (adoption/consistency tracking).

### 5.5 Distribution plumbing (counts as product here)

Assignments appear **natively in the LMS** (Google Classroom, Teams, Canvas, Schoology) and **grades pass back automatically** — for school buyers this is often the decisive feature, and it rides the Edlink 50+ platform network (§2). The assignment engine is effectively *distributed* through the LMS rather than demanding its own surface.

> **What this means for SyllabAI (B):**
> - **The engine's ceiling is SyllabAI's floor.** Kognity marks exact answers because its questions are authored to be markable; SyllabAI's Smart Mark grades method against real mark schemes — the documented teacher complaint (§3) is the demand signal. Lead comparisons with "method credit" as the wedge.
> - **"AI suggests; teacher decides" is now an established, safety-shaped pattern** in mainstream school edtech. SyllabAI should position Smart Mark against it explicitly: same human-override posture, stronger grounding (real mark schemes vs. authored criteria), plus student-facing formative use — which Kognity's optional, teacher-only scorer does not attempt.
> - **Their analytics stop at the heatmap.** SyllabAI's struggle diagnosis + BKT/BDT/decay learner model + graded-evidence→KG join (T-MIG-137) is a generation beyond "performance by section." If teacher-facing, the pitch is *"not just where the gaps are — what they mean and what to do next."*
> - **Attempt-over-attempt improvement tracking is a good, cheap idea** — worth a parity look in SyllabAI's marking queue UX.
> - **Exam-style in-platform submission + gated feedback release** (scores arrive with feedback, students self-correct per-question when allowed) are workflow patterns worth copying regardless of positioning.

---

## 6. Deep Dive C — NGSS storyline format

> **DIVE VERDICT:** The NGSS line is Kognity's most architecturally ambitious product and its testing ground for a different content organization: instead of books mirroring a syllabus document, units are organized as **phenomena-based storylines** with a curated **Driving Question Board**, 3D assessment wired to the NGSS's three dimensions (DCI/CCC/SEP), and a 180-day pacing spine. It is also the line where **blended (print/digital) teacher enablement** is deepest. For SyllabAI, this line matters as a preview of what "content organized around inquiry" looks like when a textbook company does it — and as evidence that even their newest architecture keeps the teacher, not the model, as the adapting agent.

### 6.1 Courses & standards architecture

- Four courses: **Biology, Chemistry, Physics**, plus **Earth & Space Science** (launched school year 2024–25; a standalone ESS program alongside integrated ESS threads in the other three).
- Written by a cohort including **original NGSS writers**, professional-learning specialists, and veteran science educators; "every unit reviewed against NGSS performance expectations."
- **ESSA Level IV ("Demonstrates a Rationale")** evidence designation — a US procurement-relevant credential (logic-model justification rather than randomized-trial evidence).
- Content produced via the same **AI-assisted workflow with mandatory human expert review** confirmed for the IGCSE line (§1.2).

### 6.2 The storyline architecture

| Layer | What it is |
|---|---|
| **Anchoring phenomena** | Real-world phenomena root every lesson and unit; students explain them progressively as the unit builds knowledge |
| **Driving Question Board (DQB)** | A curated board of student questions that "inspires a student-led and teacher-guided classroom" — Kognity calls it a "stepping stone into phenomena-based learning"; it anchors unit inquiry and gives students agency in the sequence |
| **Storyline sequencing** | Lessons chain from the anchoring phenomenon (observe → question → investigate → explain), rather than following the textbook's chapter order |
| **3D assessment** | Tasks require students to combine **Disciplinary Core Ideas (DCIs)**, **Crosscutting Concepts (CCCs)**, and **Science & Engineering Practices (SEPs)** — including "3D transfer tasks" that ask students to explain *new* phenomena with what the unit built |
| **Embedded dimension tags** | Performance expectations, CCCs, SEPs, DCIs are **embedded and color-coded throughout** the content, making the standard visible at the exact point of use |
| **Formative set** | DQB contributions, knowledge-check questions, formative assessments, open-ended reflection tasks — all embedded in the curriculum flow |

### 6.3 Teacher enablement & pacing

- **Pacing guides calibrated for 180 school days**, explicitly accounting for unit transitions, review periods, and assessment windows — the product ships with a *calendar*, not just content.
- **Blended-learning resource wave (July 2025, rolling release into 2026):** editable slide decks for the anchoring-phenomena routine and lessons, **supplemental hands-on labs**, printable worksheets aligned to lessons and performance tasks; embedded videos, discussion prompts, facilitation and pacing guidance, speaker notes, recommended differentiation techniques. Accessed via a **Filters tool** on the class overview page; positioned as low-tech / blended / fully-digital flexibility.
- Media library scale (line-wide, ⚠️ vendor counts): 220+ videos, 740 images, 650 interactives; reading assistance in 130+ languages.
- Implementation flexibility is a first-class claim: "spark ideas or adopt fully" — Kognity explicitly does **not** force full replacement of existing lesson plans on this line.
- Professional learning: structured sessions + monthly educator community sessions; shared pedagogical framework across a science department.

### 6.4 How it differs from the IB/IGCSE products

| Axis | IB DP / IGCSE line | NGSS line |
|---|---|---|
| Organizing principle | Syllabus document (section-atomic) | Phenomenon / storyline (inquiry-atomic) |
| Sequence authority | The book (fixed order) | The storyline + DQB (student questions steer emphasis; teacher guides) |
| Assessment frame | Exam-criteria alignment (papers 1–2 style, mark schemes) | 3D performance (DCI×CCC×SEP transfer tasks) |
| Teacher kit | Educator guides, PD webinars | Full blended kit: slide decks, hands-on labs, pacing calendar, filters tool |
| Evidence credential | Cambridge endorsement / IB co-publish | ESSA Level IV |

The constant across both: **content and assessment are the same object** (every content unit carries its formative layer), and **analytics serve teacher decisions**. What changes is the organizing spine — which is exactly the axis SyllabAI's own content-maps work (CIE spines → content maps → bundles) sits on.

> **What this means for SyllabAI (C):**
> - **The storyline pattern is directly portable to IGCSE/IAL.** Anchoring phenomenon → student questions → investigation chain → transfer task maps cleanly onto SyllabAI's struggle-diagnosis model: the anchoring phenomenon is a *motivated reason to need the syllabus content*, and the DQB is a curated, student-owned question backlog. A pilot "storyline view" layered on an existing SyllabAI content map (e.g., 4MA1 or 4PH1) is a cheap, differentiating experiment — Kognity only does this on the US line.
> - **Color-coded standards-at-point-of-use** is a pattern worth stealing for syllabus/assessment-objective tagging in SyllabAI content: make the AO or spec point visible exactly where the student is working, not just in the KG.
> - **Pacing calendar as product** (180-day guides, review/assessment windows): teachers adopt calendars faster than they adopt content. A SyllabAI teacher surface that lays the course map onto the exam-series calendar (the CIE exam-series calendar band already exists in the hub) is the same move — finish it and advertise it.
> - **Transfer tasks validate the "apply to a new phenomenon" assessment genre** — analogous to SyllabAI's unseen-application questioning; their 3D framing is a useful reference for multi-dimension scoring rubrics in Smart Mark.
> - **Their newest architecture still keeps the teacher as the adaptive agent.** Even the storyline line has no student model deciding what comes next. The open flank persists across their entire portfolio.

---

## 7. Cross-cutting verdicts, limitations & source log

### 7.1 Consolidated verdict table

| Capability area | Kognity state of record | Classification | SyllabAI position |
|---|---|---|---|
| Content organization | Syllabus-atomic (IB/IGCSE) + storyline-atomic (NGSS); endorsement-backed authorship | **Moat** (authorship/endorsement), replicable pattern (atomization) | KG spine + content maps; add storyline view as experiment |
| Interactive widgets | H5P/Trinket/3D/simulations at scale | **Commodity** | Do not race; invest in tutor-in-context instead |
| Reading support / accessibility | Glossary, TTS, 130+ language translation, reading tools, a11y engineering | **Table stakes, well executed** | Parity backlog item for international credibility |
| Auto-marking | Exact-answer matching designed at authoring time; format-rigid; no method credit | **Structurally weak (documented)** | Smart Mark vs. real mark schemes = direct counter |
| AI scoring | New (2024+): suggests IB-aligned score + reasoning; teacher decides; optional | **Credible, teacher-side only** | Same override posture, stronger grounding + student-facing use |
| Real past papers | Absent; exam-*style* originals only; #1 documented teacher wish | **Absent** | Canonical corpus + provenance = unique asset |
| Analytics | Descriptive (completion + performance by section), heatmap-grade | **Structurally limited** | Learner model (BKT/BDT/decay) + KG join = generational gap |
| Adaptivity | None; loop terminates at teacher | **Absent** | Computed-decay recommendations close the loop at the student |
| Distribution | 50+ LMS integrations via Edlink; grade passback; SSO; SOC 2 / ISO 27001 | **Moat for school channel** | Prerequisite list if/when school motion starts |
| Commercial model | Opaque per-student × subject pricing; rolling contract; heavy enablement | **Mixed** (works, resented) | Transparent pricing as wedge if selling to schools |

### 7.2 Honest limitations of this research

1. **No product access.** Everything comes from vendor marketing surfaces, a review platform, press, and community threads. UI claims (glossary behavior, Insights layout) are corroborated but not hands-on-verified; the Glossary engineering detail is first-hand (Kognity's own engineering blog) but dated 2022.
2. **Vendor statistics are internally inconsistent** (three different workload-saving claims on three pages) and were treated as marketing, not evidence, throughout.
3. **The review corpus is modest and stale** (54 verified reviews; none in the six months to access date). Absence of recent reviews is itself a finding, but it bounds how much sentiment change can be tracked publicly.
4. **Pricing internals are unknowable from outside** — deal sizes, discounts, and the per-subject multiplier's actual range are not public.
5. **The AI-scoring feature set may be broader than documented** — only the IB DP assessment page describes it; IGCSE/NGSS equivalents were not confirmed either way.
6. **IB MYP product is too new** for any meaningful public record; it was scoped out of the deep dives.

### Appendix A — source log (all accessed 2026-10-20)

| # | Source | What it evidences |
|---|---|---|
| 1 | kognity.com (homepage) | Scale claims (2,000+ schools, 130+ countries, 1M+ users), curriculum list, marketing statistics |
| 2 | kognity.com/products/igcse | IGCSE product pillars (textbooks/assessment/analytics/practice), 10,000+ questions, endorsement claim, contributor bios |
| 3 | kognity.com/our-subjects/igcse + per-subject pages (first-language-english, computer-science) | 14-subject list, per-book bank sizes, FE2027/FE2029 pipeline, H5P/Trinket details, metacognition sections |
| 4 | kognity.com/products/overview | Storyline framing, drag-and-drop exercise types, "never needs replacing" update doctrine |
| 5 | kognity.com/learning-principles | Four official learning principles (active/inclusive/applied/formative) |
| 6 | kognity.com/products/ibdp/features/assessment | 35,000+ question bank, paper-type grouping, AI-supported scoring mechanics, 1-in-3 IB schools claim, 10h/week claim |
| 7 | kognity.com/resources/whats-new-with-kognity-for-ib-dp-autumn-2024 | Multi-class send, exam-style in-platform grading, per-question solutions reveal, gated feedback release |
| 8 | kognity.com/our-subjects/ibdp/biology | DP Biology co-publishing (FE2025), 1,000+ questions, TOK/IA integration |
| 9 | kognity.com/products/ngss + /our-subjects/ngss | NGSS course list, 3D assessments (DCI/CCC/SEP), transfer tasks, DQB, 180-day pacing guides, original-NGSS-writer authorship, ESSA Level IV |
| 10 | edtechdigest.com (2024-07-19) | Media library counts, DQB framing, LMS integration breadth, ESSA designation |
| 11 | kognity.com/resources/announcing-new-blended-learning-resources-for-science-teachers | Slide decks, hands-on labs, worksheets, Filters tool, rolling release into 2026 |
| 12 | kognity.com/products/integrations | Edlink partnership, 50+ platforms, 4-way integration depth, Clever/ClassLink, SOC 2 Type II + ISO 27001, 48h setup |
| 13 | kognity.com/pricing | B2B subscription model, per-student/year, teacher-free, 30-day trial, demo-gated pricing |
| 14 | edtechimpact.com/products/kognity | 4.3/5 (54 reviews), impact percentages, full verified review corpus (praise + complaints), AI-usage "not stated" field, setup/support metadata |
| 15 | thejournal.com (2025-08-19) | Blended-learning launch press coverage |
| 16 | revisiondojo.com/comparison/revisiondojo-vs-kognity | Third-party positioning contrast (textbook-first vs revision-first), co-publishing subject list, feature table |
| 17 | kognity.com/resources/how-kognity-makes-monday-mornings-more-manageable-at-suis-gubei | EAL reading-support field evidence (Shanghai physics dept) |
| 18 | blog.logrocket.com/building-accessible-glossary-vanilla-javascript | First-hand engineering detail of glossary component (Vue.js, a11y implementation) |
| 19 | reddit.com/r/IBO (threads on Kognity pricing/questions) | Student-side observations: question authorship model, exact-answer marking, price opacity |
| 20 | kognity.com IGCSE FAQ (via products/igcse) | AI-assisted content pipeline confirmation + human-review claim |

