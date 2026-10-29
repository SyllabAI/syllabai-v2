#!/bin/bash
# run-016 resources push: 4 grid crops -> SyllabAI/syllabai-resources main
# PAT discipline: env-only (GITHUB_PAT_NEW), GIT_ASKPASS helper reads env at call time.
set -euo pipefail
BASE=/home/z/my-project
WRK=$BASE/scratch/resources_r016
CROPS=$BASE/download/t-oeq-mathsb/run016/crops

cat > "$BASE/scratch/askpass_r016.sh" <<'EOS'
#!/bin/bash
case "$1" in
  Username::) echo "x-access-token" ;;
  Password::) echo "${GITHUB_PAT_NEW}" ;;
esac
EOS
chmod 700 "$BASE/scratch/askpass_r016.sh"
export GIT_ASKPASS="$BASE/scratch/askpass_r016.sh"
export GIT_TERMINAL_PROMPT=0

if [ ! -d "$WRK/.git" ]; then
  git clone --depth 1 --single-branch --branch main https://github.com/SyllabAI/syllabai-resources.git "$WRK" 2>&1 | tail -1
fi
cd "$WRK"
git fetch origin main 2>&1 | tail -1
git reset --hard origin/main >/dev/null
git log --oneline -1

DST="Official-ExamQuestion/igcse-maths-b-16"
cp "$CROPS/2020-06_02_asset_8_d_grid.png"   "$DST/2020-06/4MB1-02/assets/asset_8_d_grid.png"
cp "$CROPS/2020-11_02_asset_8_d_grid.png"   "$DST/2020-11/4MB1-02/assets/asset_8_d_grid.png"
cp "$CROPS/2024-11_02_asset_11_e_grid.png"  "$DST/2024-11/4MB1-02/assets/asset_11_e_grid.png"
cp "$CROPS/2023-11_02_asset_8_d_grid.png"   "$DST/2023-11/4MB1-02/assets/asset_8_d_grid.png"
git add "$DST"
git status --short | head -6

git -c user.name="r7a lane" -c user.email="r7a@syllabai.local" commit -m "assets(4MB1): run-016 spare-grid wave — 4 crop-required grid figures (2020-06 8-d p21, 2020-11 8-d p21, 2024-11 11-e p33, 2023-11 8-d p17 replacement for sliver mis-crop asset_8_8-d); T-OEQ-MATHSB-SERVE-1; URL-gate-before-attach" 2>&1 | tail -2
git push origin main 2>&1 | tail -2
git log --oneline -1
echo "PUSH OK"
