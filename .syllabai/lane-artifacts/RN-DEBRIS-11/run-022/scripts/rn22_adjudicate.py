#!/usr/bin/env python3
"""RN-DEBRIS-11 run-022 — the open-dispositions adjudication of record.

Assembles the run-022 filing addendum from the computed census + option deltas:
per-item live options, computed verdicts, the lane's evidence-backed
RECOMMENDATION (labeled; not applied), and the one-line ruling surface.
Zero content bytes touched — this is a desk-support artifact.
"""
import json
from pathlib import Path

ART = Path('/home/z/my-project/work/rn22')
OUT = ART / 'out'
CLONE = ART / 'clone'

BASE_TIP = '0cb0161809765d871b34c1f3e12136f188463184'

def main():
    census = json.loads((OUT / 'rn22_census_r0.json').read_text())
    deltas = json.loads((OUT / 'rn22_option_deltas_r0.json').read_text())
    assert census['baseTip'] == BASE_TIP and deltas['baselineOrdGate']['ok']

    adj = {
        'artifact': 'rn11-run-022-open-dispositions-adjudication-r0',
        'status': 'ADJUDICATION-OF-RECORD (apply-readiness filing; NOTHING applied — every item remains a desk call)',
        'authority': 'operator order "run-022" (trace 1a1d0d9a1d636c91) executed per the lane\'s zero-invention discipline: the run-019 filing\'s suggestedDispositionOrder steps 1-2 are landed (D1 run-021 #959; D2+D6-adds run-020 #953); every REMAINING item (D3/D4/D5 + the D6 disposition half 1.3.1a/1.3.2a) is a multi-option structural desk call per the run-017 boundary law ("structural re-code/re-parent/deletion of corpus rows is desk territory") and the run-020 discipline ("D6-adds only; dispositions byte-untouched") — so this run completes their APPLY-READINESS instead of inventing a ruling: computed state census, per-option mechanical deltas, tag/re-anchor maps, recommendations, and a one-line ruling surface for the desk',
        'baseTip': BASE_TIP,
        'computed': {
            'censusArtifact': '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/state_census_r0.json',
            'deltasArtifact': '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/option_deltas_r0.json',
            'officialPinAsserts': census['officialPinAsserts'],
            'spineParity38': all(census['spineParity'].values()),
            'kgPointTextMirror': all(v['kgPointTextEqualsTitle'] for v in census['kgMirrorState'].values()),
            'denseOrderLaw': 'curriculum SPEC_POINT order == array position 1..114, zero violations (computed)',
            'baselineOrdGate': deltas['baselineOrdGate'],
        },
        'items': [],
    }

    cs = census['cs23']
    refs = cs['refsPerCode']
    d = deltas['options']

    adj['items'].append({
        'id': 'D3_811a_recode',
        'stateOfRecord': {
            'corpus_8_1_1a_title': cs['openItemRows']['8.1.1a']['curriculum']['title'],
            'byteEqual_official_8_1_4f': census['duplicationVerdicts']['D3']['byteEqual_official'],
            'blob_8_1_4_carries': '(a)-(e) ONLY — the official (f) component is NOT in the blob (computed); corpus 8.1.4 is INCOMPLETE vs the official blob and (f)\'s sole carrier is the mis-coded 8.1.1a',
            'loadBearing': {'C47-CON-OPERATORS': '8.1.1a (prereq concept — same-change re-anchor required under ANY option)'},
            'tagRefs': '0 questions / 0 flashcards / 0 notes on 8.1.1a (computed) — re-pin free'},
        'options': {
            '1': {'name': 're-code 8.1.1a -> 8.1.4f (sub-row of row 8.1.4)', 'delta': d['D3']['opt1_recocode_8_1_4f']},
            '2': {'name': 'fold into 8.1.4 (blob restored to the doc-verbatim (a)-(f) form; 8.1.1a removed)', 'delta': d['D3']['opt2_fold_into_8_1_4']},
            '3': {'name': 'retain 8.1.1a with disclosed provenance note', 'delta': d['D3']['opt3_retain']},
        },
        'laneRecommendation': 'OPTION 1 (re-code -> 8.1.4f) — grounds computed, not invented: (a) the re-code creates ZERO duplication (the 8.1.4 blob carries only (a)-(e); the family completes as blob(a-e) + dedicated 8.1.4f); (b) zero tag refs to re-point; (c) census-neutral (114 points, no KG/index count change); (d) the title pin is of record (run-017 census subRows[8.1.4f], byte-exact); (e) consistent with the fleet\'s dedicated-lettered-row treatment landed by run-020 (8.1.6a/8.1.6b/8.1.6c). Option 2 is also well-defined (restores the doc-verbatim blob byte-exact from the census) but mixes the blob/lettered representation classes inside one family.',
    })

    adj['items'].append({
        'id': 'D4_misfiled_section7_rows_reparent',
        'stateOfRecord': {
            'filingOption1_inPlaceReparent': 'MOOT post-run-021 (computed): the six carriers are byte-equal to the LANDED official rows (6.3.4a==7.4, 6.3.6==7.6, 6.3.7==7.7, 6.3.8==7.8, 6.3.9==7.9; 6.3.5 == the official 7.5 (a)/(b) blob whose components byte-equal the landed 7.5a/7.5b) — re-parenting in place would DUPLICATE rows that already exist under T7',
            'liveDuplication': 'the D4-flagged duplication class is LIVE in the corpus of record since run-021: same statements carried twice (SUB6.3 carriers orders 72-77 vs T7 landed orders 83-89)',
            'loadBearing': {c: refs['prereqConcepts'][c] for c in ('6.3.5', '6.3.6', '6.3.7', '6.3.8', '6.3.9')},
            'tagRefs': {c: {'qParts': refs['questions'].get(c, 0), 'flashcards': refs['flashcards'].get(c, 0), 'notes': refs['notes'].get(c, 0)} for c in ('6.3.4a', '6.3.5', '6.3.6', '6.3.7', '6.3.8', '6.3.9')},
            'rePointCollisionCensus': '0 double-tag collisions after the 1:1 re-point classes (computed)',
        },
        'options': {
            '1': {'name': 'remove the six carriers + same-change re-point of every tag to the landed official rows + prereq re-anchor (5 concepts)', 'delta': d['D4']['opt1_remove6_repoin_reanchor']},
            '2': {'name': 'retain, disclose (the duplication of record stays)', 'delta': d['D4']['opt2_retain_disclose']},
        },
        'laneRecommendation': 'OPTION 1 (remove + re-point + re-anchor) — grounds computed: the carriers are byte-duplicates of landed official rows; every re-point class except 6.3.5 is a byte-exact 1:1 map with zero collisions; the five prereq concepts re-anchor 1:1 onto the landed rows\' codes. THE ONE JUDGMENT CLASS: 6.3.5\'s 14 q-parts / 27 flashcards / 2 notes split across the landed PAIR 7.5a/7.5b — the desk either assigns per-tag or delegates run-023 with a disclosed per-item rule (the tagged question set is literally named "validation-and-verification--exam-questions", the semantic witness of record).',
    })

    adj['items'].append({
        'id': 'D5_63_nonrow_debris',
        'stateOfRecord': {
            'rows': {c: {'title': cs['openItemRows'][c]['curriculum']['title'], 'order': cs['openItemRows'][c]['curriculum']['order']} for c in ('6.3.1a', '6.3.2a', '6.3.3a', '6.3.4')},
            'loadBearing': {c: refs['prereqConcepts'][c] for c in ('6.3.1a', '6.3.2a', '6.3.3a')},
            'tagRefs': {'6.3.1a': 0, '6.3.2a': 0, '6.3.3a': 0, '6.3.4': {'qParts': refs['questions'].get('6.3.4', 0), 'notes': refs['notes'].get('6.3.4', 0), 'flashcards': refs['flashcards'].get('6.3.4', 0)}},
        },
        'options': {
            '1': {'name': 'remove as non-rows + same-change prereq re-anchor (3 concepts) + dispose 6.3.4\'s 6 q-part/2-note tags', 'delta': d['D5']['opt1_remove4_reanchor3']},
            '2': {'name': 're-file as non-point metadata (codes preserved, points-census excluded) — requires the kg_export v1.8 metadata-class shape decision (exporter code-change run, desk territory per the D1 precedent)', 'delta': d['D5']['opt2_refile_metadata']},
            '3': {'name': 'retain as-is with disclosed provenance', 'delta': d['D5']['opt3_retain']},
        },
        'laneRecommendation': 'OPTION 1 (remove + re-anchor) — grounds computed: the four rows are doc-verbatim non-rows (run-017 F3 of record); the three pointer concepts re-anchor with single computed candidates (LOGIC-GATE-SYMBOLS -> 10.1 byte-semantic; FLOWCHART-SYMBOLS and PSEUDOCODE-FORMAT -> 7.9, the only corpus row whose official title carries that content — co-anchor class disclosed); 6.3.4\'s tags re-point or drop with desk-owned targets (its 6 tagged parts carry other codes too — census r0). Option 2 is a larger, separate exporter code-change run (v1.8 metadata class) — if the desk wants the metadata class it should rule it as its own run; the removal option does not preclude it (the four texts stay recoverable from the doc pins of record).',
    })

    d6b = census['duplicationVerdicts']['D6b_pure1']
    adj['items'].append({
        'id': 'D6b_131a_132a_disposition (the run-020 untouched half of D6)',
        'stateOfRecord': {
            'bothCourses': 'cie-a-level-maths-20-pure-1 and cie-as-maths-20-pure-1 carry the identical debris rows (mirror parity computed)',
            '1_3_1a': 'pure debris: upstream fragment "1 problems" + fleet-glued head of official 1.3.3 — its only official content is now carried byte-exact by the LANDED dedicated 1.3.3 row (run-020)',
            '1_3_2a': 'pure duplicate debris post-run-020: the blob carries ONLY fragments of official 1.3.3/1.3.4/1.3.5 (all three landed as dedicated rows) + corrupted-spacing debris; zero unique official 1.3.2 content (row 1.3.2 carries it byte-exact per the run-018 titleMap)',
            'loadBearing': {'MAP1-CON-LINE-EQUATION': '1.3.1a', 'MAP1-CON-CIRCLE-EQUATION': '1.3.2a'},
            'tagRefs': '0 questions / 0 flashcards / 0 notes on both codes in both courses (computed) — re-pin free; both codes are off the serve planes per the run-020 UGM law',
        },
        'options': {
            '1': {'name': 'remove 1.3.1a + 1.3.2a + same-change prereq re-anchor (2 concepts, targets computed)', 'delta': d['D6b']},
            '2': {'name': 'retain with disclosed provenance', 'delta': 'none'},
        },
        'laneRecommendation': 'OPTION 1 (remove + re-anchor) — grounds computed: both rows are 100% redundant post-run-020; the re-anchor targets are the landed dedicated rows themselves (LINE-EQUATION -> 1.3.1, CIRCLE-EQUATION -> 1.3.3, byte-semantic); zero tag impact; mirror-identical surgery in both courses (36 -> 34 points each).',
    })

    adj['interactions'] = {
        'combined_D4opt1_plus_D5opt1': d['combined_D4opt1_plus_D5opt1'],
        'note': 'all four items are mutually independent except the shared dense-order renumber (computed per option and combined); SUB6.3 post-combination = exactly official 6.3.1-6.3.3',
    }
    adj['rulingSurface'] = (
        'ONE-LINE RULING SURFACE (desk replies with one token per item; run-023 then executes the chosen combination mechanically '
        'per the run-016/017/018/020/021 dump law): '
        'D3=1|2|3  D4=1|2  D5=1|2|3  D6b=1|2   '
        '(lane recommendations: D3=1, D4=1, D5=1, D6b=1)'
    )
    adj['zeroBytesLaw'] = ('run-022 applied NOTHING: zero content/src/docs bytes; the only tree changes are '
                           '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/** (this adjudication + census + deltas + scripts), '
                           '.syllabai/receipts/RN-DEBRIS-11/run-022-open-dispositions-adjudication.json, and the two append-only worklogs')

    out = ART / 'out' / 'rn22_adjudication_r0.json'
    out.write_text(json.dumps(adj, indent=1, ensure_ascii=False))
    print('adjudication written:', out, out.stat().st_size, 'bytes')
    print(adj['rulingSurface'])

if __name__ == '__main__':
    main()
