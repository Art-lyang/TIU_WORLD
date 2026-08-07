// 규칙 엔진(src/lib/gameEngine.ts) 단위 검증.
//
// HTTP를 타지 않고 순수 함수만 확인하므로 dev 서버도, 유료 모델 호출도 필요 없다.
// Node의 타입 스트리핑으로 .ts를 그대로 불러온다 (Node 22.6+ / 24 기본 활성).
//
// 여기서 지키는 계약:
//   1. 단서는 자기를 언급한 문장에서만 승격된다. 이력 어딘가의 "확인 완료" 하나로
//      같은 루트의 다른 단서가 함께 올라가면 안 된다.
//   2. 공개 게이트는 필요한 단서가 개별적으로 verified가 되어야만 열린다.
//   3. 컨텍스트 윈도가 잘려도 직전 상태를 넘기면 진행이 리셋되지 않는다.
//   4. 루트가 바뀌면 이전 사건의 단서를 이월하지 않는다.

import { buildGameEngineState } from "../src/lib/gameEngine.ts";

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
  }
}

const asResponse = (text) => ({ raw: text, narrative: text });
const barrierClues = (engine) =>
  Object.fromEntries(
    engine.clues.filter((item) => item.id.startsWith("barrier-")).map((item) => [item.id, item.status]),
  );
const firstGate = (engine) => engine.disclosureGates[0]?.status;

// 1. 단서 승격이 옆 단서로 번지지 않는다.
const crossTalk = [
  { role: "user", content: "START_ROUTE:KR_BARRIER_CIVIL_ASSISTANT" },
  { role: "assistant", content: "제12생활구 민원 접수실. 아이 목소리 신고가 접수되었습니다." },
  { role: "user", content: "소아과 예약 알림을 대조한다" },
  { role: "assistant", content: "소아과 예약 알림 대조 완료. 예약자 이름이 비어 있습니다." },
];
const crossTalkState = buildGameEngineState(
  asResponse("소아과 예약 알림 대조 완료."),
  crossTalk,
  undefined,
  "ko",
);
check("언급된 단서만 승격된다", barrierClues(crossTalkState)["barrier-pediatric-alert"], "verified");
check("언급되지 않은 단서는 그대로", barrierClues(crossTalkState)["barrier-no-child-record"], "noticed");
check("게이트는 잠긴 채 유지", firstGate(crossTalkState), "locked");

// 2. 게이트는 필요한 단서가 모두 verified일 때만 열린다.
const halfVerified = [
  { role: "user", content: "START_ROUTE:KR_BARRIER_CIVIL_ASSISTANT" },
  { role: "assistant", content: "아이 목소리 신고 검증 완료." },
];
check("한쪽만 검증되면 가설 단계", firstGate(buildGameEngineState(
  asResponse("아이 목소리 신고 검증 완료."),
  halfVerified,
  undefined,
  "ko",
)), "hypothesis");

const bothVerified = [
  ...halfVerified,
  { role: "user", content: "거주 기록을 대조한다" },
  { role: "assistant", content: "거주 기록 확인 완료. 미성년자 등록 없음." },
];
const unlockedState = buildGameEngineState(
  asResponse("거주 기록 확인 완료."),
  bothVerified,
  undefined,
  "ko",
);
check("양쪽 모두 검증되면 해제", firstGate(unlockedState), "unlocked");

// 3. 컨텍스트가 잘려 루트 신호가 사라져도 진행이 유지된다.
const trimmedWindow = [
  { role: "user", content: "다음 세대를 방문한다" },
  { role: "assistant", content: "복도는 조용합니다." },
];
check("이전 상태가 없으면 진행이 사라진다", firstGate(buildGameEngineState(
  asResponse("복도는 조용합니다."),
  trimmedWindow,
  undefined,
  "ko",
)), "locked");

const carriedState = buildGameEngineState(
  asResponse("복도는 조용합니다."),
  trimmedWindow,
  undefined,
  "ko",
  unlockedState,
);
check("이전 상태를 넘기면 해제 유지", firstGate(carriedState), "unlocked");
check("루트도 유지된다", carriedState.caseState.id, "korean-barrier");
check("단계는 뒤로 가지 않는다", carriedState.caseState.phase, unlockedState.caseState.phase);

// 4. 루트가 바뀌면 이월하지 않는다.
const switchedRoute = [
  { role: "user", content: "이름: 정아랑 / 직업(소속): 마이더스손 괴담 조사 기자" },
  { role: "assistant", content: "편집 데스크에서 연락이 옵니다." },
];
const switchedState = buildGameEngineState(
  asResponse("편집 데스크에서 연락이 옵니다."),
  switchedRoute,
  undefined,
  "ko",
  unlockedState,
);
check("루트 전환이 반영된다", switchedState.caseState.id, "midas-hand");
check("이전 루트 단서는 넘어오지 않는다", switchedState.clues.some((item) => item.id.startsWith("barrier-")), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nGame engine checks passed.");
