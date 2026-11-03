#!/bin/bash
# run-016 landing: fetch-first, branch r7a-pp-spare-grid-016, single commit, push.
# PAT env-only via GIT_ASKPASS helper reading GITHUB_PAT_NEW at call time.
set -euo pipefail
REPO=/home/z/my-project/repos/syllabai-v2
BASE=/home/z/my-project
ASK=$BASE/scratch/askpass_r016b.sh

cat > "$ASK" <<'EOS'
#!/bin/bash
case "$1" in
  Username::) echo "x-access-token" ;;
  Password::) echo "${GITHUB_PAT_NEW}" ;;
esac
EOS
chmod 700 "$ASK"
export GIT_ASKPASS="$ASK"
export GIT_TERMINAL_PROMPT=0

cd "$REPO"
git fetch origin main 2>&1 | tail -1
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
echo "local=$LOCAL remote=$REMOTE"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "main moved — ff-merging"
  git checkout main >/dev/null 2>&1
  git merge --ff-only origin/main
fi

BRANCH=r7a-pp-spare-grid-016
git checkout -B "$BRANCH" origin/main >/dev/null 2>&1
# re-apply working tree changes (carry over from main checkout)
git checkout main -- . 2>/dev/null || true
git checkout "$BRANCH" >/dev/null 2>&1
# bring the modified files onto the branch (they live in the working tree)
git add apps/hub/content/igcse-maths-b-16/official-papers.json \
        .syllabai/receipts/T-OEQ-MATHSB-SERVE-1/run-016-spare-grid-rebuilds.json \
        .syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016 \
        .syllabai/docs/PLAYBOOK-CONTENT-QUALITY.md \
        .syllabai/worklog.md
git status --short | head -8

git -c user.name="r7a lane" -c user.email="r7a@syllabai.local" \
  commit -m "content(4MB1): T-OEQ-MATHSB-SERVE-1 run-016 spare-grid wave — 53 fused problemMd blocks rebuilt/stripped from printed-page evidence (39 strips + 14 rebuilds incl. 8 KaTeX formula boxes), 4 crop-required grids measured+pushed+attached (URL gate 56/56), katex 117/117, census 66/1281/2443/6600 EXACT, plane eabd5ca8b643f93f -> 5fc8abdba88325e8; receipt + playbook laws 21-23 + lane artifacts; fetch-first, no force" \
  2>&1 | tail -2

git push origin "$BRANCH" 2>&1 | tail -2
git log --oneline -1
rm -f "$ASK"
echo "PUSH OK"
