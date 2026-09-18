// 03b-output.json 기계 검증 (R01~R10 중 자동 판정 가능한 항목) + 승인 조건 대조
// 사용: node validate-tc.js
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(__dirname + "/03b-output.json", "utf8"));
const profile = JSON.parse(fs.readFileSync(__dirname + "/../../knowledge/format-profile.sample.json", "utf8"));
const req = JSON.parse(fs.readFileSync(__dirname + "/02-answered.json", "utf8"));
const spec = fs.readFileSync(__dirname + "/../../samples/sample-spec.md", "utf8");
const approval = fs.readFileSync(__dirname + "/03a-approval.md", "utf8");

const TC = d.testCases;
const findings = [];
const add = (id, code, level, msg, fix) => findings.push({ id, code, level, msg, fix: fix || "" });

// 큰따옴표 밖 텍스트만 남긴다 (금지어 판정에서 원문 인용 제외)
const outsideQuotes = (s) => s.replace(/"[^"]*"/g, " ");
const quotesIn = (s) => (s.match(/"[^"]*"/g) || []).map((q) => q.slice(1, -1));

const BAN = /정상|올바르|잘 |적절|문제없이|제대로|원활히/;
const ABBR = profile.idAbbreviations;
const ID_RE = /^(.+)-(\d{3})$/;

// 기획서·답변에 실제로 있는 문자열 + 테스터가 정하는 테스트 데이터
const literalPool = [spec, JSON.stringify(req)].join("\n");
const TESTDATA = [
  "거실", "침실", "서재", "거실 리뉴얼", "10번째 방", "방", "내 방 1", "내 방 Room 2", "!@#", "😀",
  "가나다라마바사아자차카타파하가나다라마바", "사", "가나다라마바사아자차카타파하가", "가나다라마바사아자차카타파하가나",
  "2026.09.05", "전체", "2/5", "3/5", "4/5", "5/5",
];

const seen = new Map();
for (const t of TC) {
  const joinedExpected = t.expected.join(" ");

  // R01 금지어
  if (BAN.test(outsideQuotes(t.item + " " + joinedExpected))) add(t.id, "R01", "오류", "금지어 포함");

  // R02 기대결과 "확인" 종결
  t.expected.forEach((e, i) => {
    if (/확인$|확인된다$/.test(e)) add(t.id, "R02", "오류", `기대결과 ${i + 1} 확인 종결`, e.replace(/확인(된다)?$/, "노출된다"));
    if (!/(된다|않는다|닫힌다)$/.test(e)) add(t.id, "R02", "경고", `기대결과 ${i + 1} 종결 어미 확인 필요: ${e.slice(-12)}`);
  });

  // R03 테스트 항목 = 기대결과
  if (t.expected.some((e) => e.replace(/\s/g, "") === t.item.replace(/\s/g, ""))) add(t.id, "R03", "오류", "테스트 항목과 기대결과가 동일");

  // R04 출처 누락
  const s = t.source || {};
  if (!s.doc && !s.figma && !s.rule) add(t.id, "R04", "오류", "요구사항 출처 누락");

  // R05 사전조건 누락
  if (!t.precondition || !t.precondition.length) add(t.id, "R05", "경고", "사전조건 누락");

  // R06 절차에 결과 서술
  t.steps.forEach((st, i) => {
    if (/노출|이동된|된다|열린다/.test(st)) add(t.id, "R06", "경고", `절차 ${i + 1}에 결과 서술: ${st}`);
  });

  // R07 기대결과 과다
  if (t.expected.length > 5) add(t.id, "R07", "경고", `기대결과 ${t.expected.length}개 (5 초과)`);
  if (t.expected.length > profile.granularity.maxExpectedPerTc)
    add(t.id, "R07", "경고", `기대결과 ${t.expected.length}개 — 양식 프로파일 maxExpectedPerTc(${profile.granularity.maxExpectedPerTc}) 초과`);

  // R08 ID
  if (seen.has(t.id)) add(t.id, "R08", "오류", "TC ID 중복");
  seen.set(t.id, t);
  const m = ID_RE.exec(t.id);
  if (!m) add(t.id, "R08", "오류", "ID 패턴 불일치 ({화면약어}-{3자리})");
  else if (!Object.values(ABBR).includes(m[1]))
    add(t.id, "R08", "오류", `양식 프로파일에 없는 화면 약어 "${m[1]}"`, `양식 프로파일 idAbbreviations에 "${t.category[0]}": "${m[1]}" 추가`);

  // 기대결과 ↔ 절차 개수
  if (t.expected.length !== t.steps.length) add(t.id, "대응", "경고", `절차 ${t.steps.length}개 / 기대결과 ${t.expected.length}개 불일치`);

  // evidence
  const idx = new Set(t.evidence.map((e) => e.expectedIndex));
  t.expected.forEach((_, i) => {
    if (!idx.has(i)) add(t.id, "A01", "오류", `기대결과 ${i + 1} 근거 없음`);
  });
  t.evidence.forEach((e) => {
    if (e.quote === null) add(t.id, "A01", "경고", `기대결과 ${e.expectedIndex + 1} quote null (환각 후보)`);
    if (e.inference) add(t.id, "A01", "경고", `기대결과 ${e.expectedIndex + 1} 근거가 유추: ${e.inference}`);
  });

  // R10 인용 문구가 기획서·답변에 실제로 있는가
  t.expected.forEach((e, i) => {
    quotesIn(e).forEach((q) => {
      if (!literalPool.includes(q) && !TESTDATA.includes(q)) add(t.id, "R10", "경고", `기대결과 ${i + 1} 인용 "${q}" 원문에서 찾지 못함`);
    });
  });
}

// R09 사전조건·절차 동일 중복 TC
const sig = new Map();
for (const t of TC) {
  const k = t.precondition.join("|") + "#" + t.steps.join("|");
  if (sig.has(k)) add(t.id, "R09", "경고", `${sig.get(k)}와 사전조건·절차 동일`);
  else sig.set(k, t.id);
}

// 승인 조건 대조 — 채택 O만 TC가 되었는가, 빠진 조건은 없는가
const approvedO = [...approval.matchAll(/^\| O \| (TCON-\d+) \|/gm)].map((m) => m[1]);
const rejectedX = [...approval.matchAll(/^\| X \| (TCON-\d+) \|/gm)].map((m) => m[1]);
const used = TC.map((t) => t.conditionId);
const missing = approvedO.filter((c) => !used.includes(c));
const extra = used.filter((c) => !approvedO.includes(c));
missing.forEach((c) => add(c, "승인", "오류", "채택 O인데 TC 없음"));
extra.forEach((c) => add(c, "승인", "오류", "승인 목록에 없는 조건으로 TC 생성"));
used.forEach((c, i) => {
  if (rejectedX.includes(c)) add(TC[i].id, "승인", "오류", `X 처리된 조건 ${c}로 TC 생성`);
});

const err = findings.filter((f) => f.level === "오류");
const warn = findings.filter((f) => f.level === "경고");
console.log(`TC ${TC.length}건 / 승인 O ${approvedO.length}건 / X ${rejectedX.length}건`);
console.log(`오류 ${err.length}건, 경고 ${warn.length}건`);
console.log("");
for (const f of findings) console.log(`${f.level}\t${f.id}\t${f.code}\t${f.msg}${f.fix ? "\t→ " + f.fix : ""}`);
process.exitCode = 0;
