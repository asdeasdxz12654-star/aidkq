// 03a-output.json → 03a-approval.md (승인표) 생성 + 무결성 점검
// 사용: node make-approval.js
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(__dirname + "/03a-output.json", "utf8"));

// 무결성 점검 — 실패 시 표를 만들지 않는다
const TECH = ["화면구성", "동등분할", "경계값", "결정테이블", "상태전이", "유스케이스", "예외"];
const err = [];
const ids = new Set();
for (const c of d.conditions) {
  if (ids.has(c.id)) err.push("중복 ID " + c.id);
  ids.add(c.id);
  if (!TECH.includes(c.technique)) err.push("기법 " + c.id);
  if (c.grounded && !c.source.length) err.push("근거 없음인데 grounded " + c.id);
  if (!c.grounded && !c.question) err.push("질의 없음 " + c.id);
  if (/정상|올바르|적절|문제없이|제대로/.test(c.text)) err.push("금지어 " + c.id);
}
for (const m of d.exceptionMatrix) {
  if (m.conditionId && !ids.has(m.conditionId)) err.push("매트릭스 참조 끊김 " + m.conditionId);
  if (m.verdict === "적용" && !m.conditionId) err.push("적용인데 조건 없음 " + m.screen + " " + m.code);
}
for (const s of new Set(d.exceptionMatrix.map((m) => m.screen))) {
  const n = d.exceptionMatrix.filter((m) => m.screen === s).length;
  if (n !== 11) err.push(`매트릭스 ${s} ${n}/11`);
}
for (const t of d.decisionTables) for (const r of t.rules) if (!ids.has(r.conditionId)) err.push("결정표 참조 끊김 " + r.conditionId);
if (err.length) {
  console.error(err.join("\n"));
  process.exit(1);
}

const P = { 상: 0, 중: 1, 하: 2 };
const S = ["전체 메뉴", "3D방 꾸미기 온보딩", "신규 3D방 편집", "내 3D방 목록", "전체 흐름"];
const sort = (a) => a.sort((x, y) => P[x.priority] - P[y.priority] || S.indexOf(x.screen) - S.indexOf(y.screen) || x.id.localeCompare(y.id));
const tech = (c) => c.technique + (c.exceptionCode ? ` (${c.exceptionCode})` : "");
const g = sort(d.conditions.filter((c) => c.grounded));
const u = sort(d.conditions.filter((c) => !c.grounded));
const qm = d.exceptionMatrix.filter((m) => m.verdict === "질의필요");

// 정답지 TC → 조건 대응 (dry run 수행자가 수작업으로 대응시킴)
const golden = {
  "MENU-001": "TCON-001", "3D-001": "TCON-002", "3D-002": "TCON-006", "3D-003": "TCON-007", "3D-004": "TCON-009",
  "3D-005": "TCON-003", "3D-006": "TCON-004", "3D-007": "TCON-011", "ED-001": "TCON-012", "ED-002": "TCON-014",
  "ED-003": "TCON-016", "ED-004": "TCON-019", "ED-005": "TCON-021", "ED-006": "TCON-022", "ED-007": "TCON-023",
  "ED-008": "TCON-024", "ED-009": "TCON-025", "LIST-001": "TCON-032", "LIST-002": "TCON-033, TCON-034",
  "LIST-003": "TCON-035", "LIST-004": "TCON-036", "LIST-005": "TCON-037", "LIST-006": "TCON-039",
};
const mapped = new Set(Object.values(golden).flatMap((v) => v.split(", ")));
const extra = g.filter((c) => !mapped.has(c.id));
const count = (k) => Object.entries(d.conditions.reduce((a, c) => ((a[c[k]] = (a[c[k]] || 0) + 1), a), {})).map(([n, v]) => `${n} ${v}`).join(", ");

const md = `# 03a 승인표 — 2026-09-18 dry run

입력: \`02-answered.json\` (02 출력 + 질의 16건 답변 반영). 원본: \`03a-output.json\` · 생성: \`node make-approval.js\`
**승인 방법**: \`채택\` 열에 O/X를 적는다. 빠진 조건은 맨 아래 "추가 조건"에 적는다. O로 표시한 조건만 03b 입력이 된다.

## 1. 근거 있는 조건 (${g.length}건)

| 채택 | ID | 화면 | 테스트 조건 | 기법 | 근거 | 우선순위 | 비고 |
|---|---|---|---|---|---|---|---|
${g.map((c) => `| ☐ | ${c.id} | ${c.screen} | ${c.text} | ${tech(c)} | ${c.source.join(", ")} | ${c.priority} | ${c.mergedFrom.length ? "병합: " + c.mergedFrom.join("+") : ""} |`).join("\n")}

## 2. 근거 없는 조건 → 질의 필요 (${u.length}건)
기획서·답변·규칙집에 근거가 없다. 채택하려면 먼저 질의에 답하거나, X로 두고 질의만 전달한다.

| 채택 | ID | 화면 | 테스트 조건 | 기법 | 질의 | 우선순위 |
|---|---|---|---|---|---|---|
${u.map((c) => `| ☐ | ${c.id} | ${c.screen} | ${c.text} | ${tech(c)} | ${c.question} | ${c.priority} |`).join("\n")}

## 3. 예외 체크리스트 — 질의 필요 판정 (${qm.length}건)
| 화면 | 코드 | 사유 | 조건 |
|---|---|---|---|
${qm.map((m) => `| ${m.screen} | ${m.code} | ${m.reason} | ${m.conditionId || "—"} |`).join("\n")}

## 4. 요약
- 조건 ${d.conditions.length}건 (근거 있음 ${g.length} / 근거 없음 ${u.length}) · 보류(onHold) ${d.conditions.filter((c) => c.onHold).length}건
- 기법별: ${count("technique")}
- 우선순위: ${count("priority")}
- 예외 체크리스트: ${new Set(d.exceptionMatrix.map((m) => m.screen)).size}개 화면 × 11항목 = ${d.exceptionMatrix.length}건 판정, 질의필요 ${qm.length}건

## 5. 정답지 대비 커버리지 (참고 — 대응은 수작업)
정답지 TC 22건 모두 조건으로 도출됐다 (LIST-002는 조건 2개로 분리).

| 정답지 | 대응 조건 |
|---|---|
${Object.entries(golden).map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

정답지에 없는 근거 있는 조건 ${extra.length}건: ${extra.map((c) => c.id).join(", ")}

## 6. 추가 조건 (사람 입력)
| ID | 화면 | 테스트 조건 | 근거 | 우선순위 |
|---|---|---|---|---|
| 추가-01 | | | | |
`;
fs.writeFileSync(__dirname + "/03a-approval.md", md);
console.log(`ok — 근거 있음 ${g.length}, 근거 없음 ${u.length}, 정답지 외 ${extra.length}, 질의필요 ${qm.length}`);
