// 03b-output.json → 03b-tc-table.md (회사 양식 표). 컬럼 순서는 format-profile을 따른다.
// 사용: node make-tc-table.js
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(__dirname + "/03b-output.json", "utf8"));
const profile = JSON.parse(fs.readFileSync(__dirname + "/../../knowledge/format-profile.sample.json", "utf8"));

const cols = profile.columns.map((c) => c.name);
const num = (a) => a.map((v, i) => `${i + 1}. ${v}`).join("<br>");
const src = (t) => [t.source.doc, t.source.figma ? `피그마 "${t.source.figma}"` : null, t.source.rule].filter(Boolean).join(" / ");
const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "\\|");

const row = (t) =>
  "| " +
  [
    t.id,
    t.category[0],
    t.category[1],
    t.item,
    t.precondition.join("<br>"),
    num(t.steps),
    num(t.expected),
    t.priority,
    src(t),
    "",
    "",
    t.note,
  ]
    .map(cell)
    .join(" | ") +
  " |";

const md = `# 03b TC 표 — 2026-09-18 dry run

입력: \`03a-approval.md\` 채택 O ${d.testCases.length}건 · 원본: \`03b-output.json\` · 생성: \`node make-tc-table.js\`
컬럼 순서는 \`knowledge/format-profile.sample.json\` v${profile.profileVersion}을 따른다. 결과 컬럼(AOS·iOS)은 비워 둔다.
검증 결과는 \`03b-validation.md\` 참고. **오류가 남아 있으면 이 표를 그대로 내보내지 않는다.**

| ${cols.join(" | ")} |
|${cols.map(() => "---").join("|")}|
${d.testCases.map(row).join("\n")}
`;
fs.writeFileSync(__dirname + "/03b-tc-table.md", md);
console.log(`ok — TC ${d.testCases.length}건, 컬럼 ${cols.length}개`);
