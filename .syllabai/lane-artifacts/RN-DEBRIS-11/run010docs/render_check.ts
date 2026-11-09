import { normalizeSpecText } from "/home/z/my-project/work/syllabai-v2/apps/hub/src/lib/spec-text";
const titles = [
  "Classification of businesses", "Business and the international economy",
  "Government objectives and policies", "What makes a business successful?",
  "Internal and external communication", "Recruitment and selection process",
  "Motivation and rewards", "Organisation structure and employees",
  "Business finance – sources", "Costs and break-even analysis",
  "Economies and diseconomies of scale",
  "The development of Islam; origins of Sunni and Shiʿah",
  "The Qurʾan; different ways in which Muslims understand and interpret it",
  "ʿUmrah", "ʿId al-Adha (feast of sacrifice)", "ʿId al-Fitr (the end of Ramadan)",
  "Shariʿah (‘straight path’) as a code of behaviour and ethics for Muslims; as a legal system",
];
let ok = true;
for (const t of titles) {
  const n = normalizeSpecText(t);
  const faithful = n === t;
  if (!faithful) ok = false;
  console.log(`${faithful ? "FAITHFUL" : "MANGLED"} «${t.slice(0, 52)}» -> «${n.slice(0, 52)}»`);
}
console.log("RENDER CHECK:", ok ? "PASS (17/17 byte-faithful)" : "FAIL");
