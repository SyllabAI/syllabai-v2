#!/usr/bin/env python3
"""UIUX-TIER-B run-005: named-target patches (ANNEX + deferrals), fail-closed exact-match.
Law: every patch eyes-on verified against QP/MS renders of record (render/ dir)."""
import json, sys, copy

REPO='/home/z/my-project/ws/syllabai-v2'
B=f'{REPO}/apps/hub/content/igcse-maths-b-16/questions.json'

raw=open(B, encoding='utf-8').read()
bundle=json.loads(raw)
orig=copy.deepcopy(bundle)
sets={s['slug']:s for s in bundle}
by_order=lambda s,q: [x for x in s['questions'] if x.get('order')==q-1][0]

E5='https://raw.githubusercontent.com/SyllabAI/syllabai-resources/7576c78fa6315f613dfa5821e0afd2ed47761f78/SME-ExamQuestion/igcse-maths-b-16/past-papers/2025-11/02/assets'
Q11_STEM=('The function f has domain $-8 \\le x \\le 8$\n\n'
 'Figure 5 shows the graph of $y = f(x)$, which consists of a line segment from $(-8, 3)$ to $(-4, 0)$ '
 'and a line segment from $(-4, 0)$ to $(8, 9)$\n\n'
 f'![Figure 5 modulus graph x drawn]({E5}/005-q11-figure-5-modulus-graph-x-drawn.png)\n\n'
 f'![Figure 5 modulus graph x 4]({E5}/006-q11-figure-5-modulus-graph-x-4.png)\n\n'
 f'![Figure 5 f line graph]({E5}/007-q11-figure-5-f-line-graph.png)\n\n')

log=[]
def repl(slug,q,part,field,old,new,label):
    s=sets[slug]; p=by_order(s,q)['parts'][part]
    t=p[field]
    n=t.count(old)
    assert n==1, f'FAIL-CLOSED {label}: {n} occurrences of old in {slug} q{q}p{part} {field}'
    p[field]=t.replace(old,new)
    log.append((label,slug,q,part,field))

def full(slug,q,part,field,new,label):
    s=sets[slug]; p=by_order(s,q)['parts'][part]
    assert p[field] is not None, f'FAIL {label}: field None'
    p[field]=new
    log.append((label,slug,q,part,field))

S25='2025-11-4mb1-02--exam-questions'
# 1. q5p0 simultaneous equations (QP p12 visual)
full(S25,5,0,'problemMd',
 'Solve the simultaneous equations\n\n$4x^2 - y^2 = 27$\n\n$x + 2y = 3$\n\nShow clear algebraic working.',
 'r5-a1-q5p0-stem')
# 2. q8p2 matrix M (QP p22 visual: M = (1 0; 0 -1))
repl(S25,8,2,'problemMd',
 'matrix M where\n\n1\n\n0\n\n\x1a\n\nM\n\n\x1b\n\n\x19\x18\n\n0\n\n1',
 'matrix M where\n\n$M = \\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}$',
 'r5-a2-q8p2-matrix')
# 3. q9p0 table (QP p26 visual; GFM style per 2019-06-02R q7 precedent)
full(S25,9,0,'problemMd',
 'Complete the table of values for $y = 2x^3 - 9x^2 + 3x + 7$\n\n'
 '| $x$ | $-1$ | $0$ | $0.25$ | $1$ | $2$ | $3$ | $4$ |\n'
 '| --- | --- | --- | --- | --- | --- | --- | --- |\n'
 '| $y$ |  | $7$ | $7.22$ |  |  | $-11$ |  |',
 'r5-a3-q9p0-table')
# 4. q9p3 equation (QP p26 visual (d))
full(S25,9,3,'problemMd',
 'Use your graph, to estimate, to one decimal place, the solutions of the equation\n\n$2x^3 - 9x^2 + 3x + 7 = 0$',
 'r5-a4-q9p3-eq')
# 5. q9p4 inequality (QP p26 visual (e))
full(S25,9,4,'problemMd',
 'By drawing a suitable straight line on the grid, find an estimate for the range of values of x, '
 'to one decimal place, in the interval $0 < x \\le 4$ for which\n\n$4x - 18 + \\dfrac{38}{x^2} < 0$'
 '\n\nShow clear algebraic working.',
 'r5-a5-q9p4-ineq')
# 6-9. q11 p0-p3 whole-stem family (QP p34 visual; embeds preserved per ARTWORK law)
full(S25,11,0,'problemMd', Q11_STEM +
 'Write down the range of the function f\n\nThe function g is defined as\n\n$g : x \\mapsto \\dfrac{3x - 1}{x + 1}$',
 'r5-a6-q11p0-stem')
full(S25,11,1,'problemMd', Q11_STEM +
 'State the value of x which must be excluded from any domain of the function g',
 'r5-a7-q11p1-stem')
full(S25,11,2,'problemMd', Q11_STEM + 'Find gf(0)',
 'r5-a8-q11p2-stem')
full(S25,11,3,'problemMd', Q11_STEM +
 'Find the inverse function $g^{-1}$ in the form $g^{-1}(x) = \\ldots$\n\nGive your answer in its simplest form.',
 'r5-a9-q11p3-stem')
# 10. q12p0 fraction 46/91 (QP p36 visual) + formula-box/furniture strip
full(S25,12,0,'problemMd',
 'A bag contains $n$ sweets.\n\nThere are 9 orange sweets in the bag.\n\nThe rest of the sweets are purple.\n\n'
 'Mina takes at random a sweet from the bag and eats it.\n\nStuart then takes at random a sweet from the bag and eats it.\n\n'
 'The probability that Mina and Stuart both eat a sweet of the same colour is $\\dfrac{46}{91}$\n\n'
 'Find the probability that all 9 orange sweets remain in the bag.\n\nShow clear algebraic working.',
 'r5-a10-q12p0-frac')
# 11. 2019-01-01R q13p0 surds (QP p8 visual)
full('2019-01-4mb1-01r--exam-questions',13,0,'problemMd',
 'Without using a calculator and showing all your working, express\n\n$\\sqrt{605} - \\sqrt{80}$'
 '\n\nin the form $\\sqrt{n}$ where $n$ is an integer.',
 'r5-b1-1901-01r-q13-surd')
# 12. 2018-06-01 q7 problemMd math (QP p5 visual: 7/8 - (1/3 x 2 1/4); MS p6: 9/4, 3/4, 1/8)
repl('2018-06-4mb1-01--exam-questions',7,0,'problemMd',
 '$\\frac{7}{8}\\left(\\frac{1}{3} \\times 2\\frac{4}{5}\\right)$',
 '$\\frac{7}{8} - \\left(\\frac{1}{3} \\times 2\\frac{1}{4}\\right)$',
 'r5-b2-1806-01-q7-math')
# 13. 2018-06-01 q7 solutionMd rebuild (MS p6 visual) + q8-bleed line dropped
full('2018-06-4mb1-01--exam-questions',7,0,'solutionMd',
 '**P1** (1 mark)\n- Note: $2\\frac{1}{4} = \\frac{9}{4}$\n\n'
 '**P2** (1 mark)\n- Note: $\\frac{1}{3} \\times \\frac{9}{4} = \\frac{3}{4}$ Correctly multiplying $\\frac{1}{3}$\n'
 '- Note: and their "$\\frac{9}{4}$"\n\n'
 '**P3** (1 mark)\n- Note: $\\frac{7}{8} - \\frac{3}{4} = \\frac{1}{8}$',
 'r5-b3-1806-01-q7-smd')
# 14. 2019-06-02 q9p0 italic misreads (MS p15 visual: 2x+y=5; -4x^2+4x+97=25+4x^2-20x)
S0602='2019-06-4mb1-02--exam-questions'
repl(S0602,9,0,'solutionMd','oe e.g. 2r + s = 5','oe e.g. $2x + y = 5$','r5-c1-1906-02-q9p0-italic-p2')
repl(S0602,9,0,'solutionMd','Eg. \u22124r 2 + 4r + 97 = 25 + 4r 2 \u2212 20r',
 'Eg. $-4x^2 + 4x + 97 = 25 + 4x^2 - 20x$','r5-c2-1906-02-q9p0-italic-p3')
# 15. 2019-06-02 q10p1 stem rebuild + P4 answer cell (QP p28 + MS p17 visuals)
full(S0602,10,1,'problemMd',
 'The curve C has equation $y = 2x^3 + ax^2 + bx + 10$ where $a$ and $b$ are constants.\n\n'
 'The point A, with coordinates $(1, 3)$, lies on C.\n\n'
 'The tangent to C at the point A has gradient $-8$\n\nShow that $2a + b = -14$',
 'r5-c3-1906-02-q10p1-stem')
repl(S0602,10,1,'solutionMd','**P4** (1 mark) Note that answer given in question',
 '**P4** (1 mark) $2a + b = -14$\n- Note: Note that answer given in question',
 'r5-c4-1906-02-q10p1-cell')

# ---- gates ----
def counts(b):
    sets_n=len(b); q=sum(len(s['questions']) for s in b)
    parts=sum(len(qq['parts']) for s in b for qq in s['questions'])
    marks=sum(pp['marks'] for s in b for qq in s['questions'] for pp in qq['parts'])
    choices=sum(len(pp['choices']) for s in b for qq in s['questions'] for pp in qq['parts'] if pp.get('choices'))
    return sets_n,q,parts,marks,choices
c0,c1=counts(orig),counts(bundle)
print('structure BEFORE:',c0)
print('structure AFTER :',c1)
assert c0==c1 and c0[:4]==(65,1270,2412,6500), 'STRUCTURE LAW VIOLATION'

changed=0
for s0,s1 in zip(orig,bundle):
    for q0,q1 in zip(s0['questions'],s1['questions']):
        for p0,p1 in zip(q0['parts'],q1['parts']):
            assert p0['marks']==p1['marks'], f"MARKS CHANGED {p0['id']}"
            for fld in ('problemMd','solutionMd'):
                if p0.get(fld)!=p1.get(fld): changed+=1
print('fields changed:',changed)
assert changed==len(set((l[1],l[2],l[3],l[4]) for l in log)), f'log {len(log)} vs distinct changed {changed}'

ufffd=sum((p.get('problemMd','')+' '+(p.get('solutionMd') or '')).count('\ufffd') for s in bundle for qq in s['questions'] for p in qq['parts'])
print('UFFFD count:',ufffd); assert ufffd==0

out=json.dumps(bundle,ensure_ascii=False,separators=(',',':'))
open(B,'w',encoding='utf-8').write(out)
print('WROTE',B,len(out),'bytes')
for l in log: print('PATCHED',*l[:1],l[1],f"q{l[2]}p{l[3]}",l[4])
