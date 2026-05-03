# TIU AI Game Master Starting Scenarios

작성일: 2026-04-30
상태: 테스트 가능 초안
용도: TIU AI GM 시작 루트와 첫 장면 템플릿

관련 문서:

- `TIU-AI-GM-PLAY-LOOP-UI.md`
- `16. CANON-LAYERS/FRANCHISE-INCIDENT-GENERATOR.md`
- `16. CANON-LAYERS/TIU-RANDOM-EVENT-SEED-TABLE.md`
- `16. CANON-LAYERS/TIU-EVENT-TRUTH-LAYERS.md`
- `16. CANON-LAYERS/TIU-ORACLE-LIMITATION-RULES.md`
- `16. CANON-LAYERS/TIU-CORE-TECH-LIMITATIONS.md`
- `5. WORLD/1. 지표 L1/1. KOREA-BALANCED/TIU-KOREA-CIVILIAN-LIFE.md`
- `5. WORLD/1. 지표 L1/5. RUSSIA-BALANCED/TIU-RUSSIA-CIVILIAN-LIFE.md`
- `5. WORLD/1. 지표 L1/2. EU-BALANCED/TIU-EU-CIVILIAN-LIFE.md`
- `5. WORLD/1. 지표 L1/8. AUSTRALIA-BALANCED/TIU-AUS-CIVILIAN-LIFE.md`
- `6. ENTERPRISE/1. MERIDIAN-BALANCED/TIU-MERIDIAN-CORPORATE-LIFE.md`
- `9. MAPS/TIU-KOREA-PLAYABLE-ZONES.md`

---

## 0. 목적

이 문서는 TIU AI GM 세션을 바로 시작하기 위한 시작 루트 모음이다.

원칙:

- 최상위 우주론으로 시작하지 않는다.
- 생활, 문서, 현장, 봉쇄, 이상징후에서 시작한다.
- 플레이어는 처음부터 영웅이 아니라 관찰자, 기록자, 계약직, 현지 협력자, 생존자에 가깝다.
- 시작 장면은 PUBLIC 또는 낮은 RESTRICTED까지만 열어둔다.
- PRIVATE 정보는 절대 첫 장면에서 직접 공개하지 않는다.
- 첫 사건은 `지역 + 세력 + 이상현상 + 민간 피해 + 은폐 방식 + 윤리적 선택 + 후속 떡밥` 공식으로 확장할 수 있어야 한다.
- 일반 시민, 민간 조사원, 대부분의 기관 루트는 ORACLE의 존재 자체를 모른다. 시작 UI에는 `ORACLE Classification`을 표시하지 않고 `Visible Classification` 또는 `중앙 분류`만 표시한다.

---

## 1. 시작 루트 목록

| 번호 | 루트 | 톤 | 난이도 | 추천 공개 등급 |
|---|---|---|---|---|
| 1 | 한국 방벽 내부 민간 조사 보조원 | 생활/봉쇄/사회 압박 | 낮음 | PUBLIC |
| 2 | KR-INIT-001 잔여 문서 기록 관리자 | 문서/음모/삭제 로그 | 중간 | PUBLIC -> RESTRICTED |
| 3 | L3 현장 파견 계약 분석관 | 현장/지도/격리 | 중간 | RESTRICTED |
| 4 | 소바리 주변부 실종 조사팀 현지 협력자 | 탐사/증언/고대 흔적 | 중간 | PUBLIC -> RESTRICTED |
| 5 | Philadelphia 누락 지도 복원 기술자 | 지도 계층/기록 오류 | 높음 | RESTRICTED |
| 6 | Ashfall 봉쇄구역 물자 운반 민간인 | 생존/봉쇄/도시 폐허 | 중간 | PUBLIC -> RESTRICTED |
| 7 | Meridian 하청 데이터 정리원 | 기업/데이터/추적 | 중간 | PUBLIC -> RESTRICTED |
| 8 | SHED 계열 문서에서 자기 이름을 발견한 사람 | 심리/문서/관측 | 높음 | RESTRICTED -> OBSERVER |
| 9 | 러시아 시베리아 보급 열차 통신 담당자 | 혹한/보급/군사 통신 | 중간 | PUBLIC -> RESTRICTED |
| 10 | EU 검역선 절차 연락관 | 권리/절차/국경 정치 | 낮음~중간 | PUBLIC -> RESTRICTED |
| 11 | 호주 Outback 시민 신고 배정관 | 대륙 격리/좌표/금기 | 중간 | PUBLIC -> RESTRICTED |
| 12 | Meridian 계약 비용 감사 보조원 | 기업/청구서/책임 회피 | 중간 | PUBLIC -> RESTRICTED |

첫 테스트는 1~4번을 권장한다.  
5~8번은 세계관 이해도가 조금 쌓인 뒤 쓰는 편이 좋다.  
9~12번은 국가별 생활감과 사건 생성기를 연결하는 확장 루트다.

---

## 2. 공통 시작 질문

플레이어에게 아래 중 필요한 것만 묻는다.

```text
시작 전에 세 가지만 정해주세요.

1. 캐릭터 이름:
2. 나이대: 성인으로만 설정합니다.
3. 성향: 조심스러움 / 호기심 많음 / 냉소적 / 책임감 강함 중 하나
```

주의:

- 캐릭터는 성인으로 고정한다.
- 연령이 불명확하면 성적 장면은 자동 차단한다.
- 시작 장면에서는 전투보다 조사 선택지를 우선한다.

---

## 3. 루트 1: 한국 방벽 내부 민간 조사 보조원

### 3.1 개요

플레이어는 한국 방벽 내부에서 민간 조사 보조원으로 일한다.  
공식 업무는 주민 신고 정리와 현장 동행이다. 비공식 업무는 "설명되지 않는 신고"를 조용히 분류하는 일이다.

### 3.2 시작 상태

```json
{
  "route": "KR_BARRIER_CIVIL_ASSISTANT",
  "region": "Korea",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "observer_attention": "calm",
  "oracle_classification": "unclassified",
  "boundary_stability": "stable",
  "infection_exposure": "none",
  "faction_heat": {
    "KR_BARRIER_AUTHORITY": "none",
    "LOCAL_RESIDENTS": "watching"
  }
}
```

### 3.3 첫 장면

```text
[Scene]
비가 오는 오전 7시 40분.
방벽 내부 제12생활구 민원 접수실에는 젖은 우산 냄새와 오래된 소독약 냄새가 섞여 있습니다.

당신의 단말기에 새 신고가 올라옵니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정

[Choices]
1. 신고자에게 먼저 전화한다.
2. 현장 동행 요청을 넣는다.
3. 옆집 주소의 거주 기록을 조회한다.
4. 신고 문장을 메모해 둔다.
```

### 3.4 첫 단서

- 거주 기록상 해당 호수는 8년째 공실
- 신고자는 전화를 받지만 자기 신고를 기억하지 못함
- 같은 문장이 3년 전 다른 생활구 신고에도 남아 있음

---

## 3-A. 커스텀 루트: 마이더스손 괴담 조사 기자

### 3-A.1 개요

플레이어가 기자, 취재, 괴담, 마이더스손 관련 캐릭터를 직접 만들면 이 루트로 시작한다.  
이 루트는 한국 방벽 내부의 아이 목소리 신고와 별개다. 두 사건을 섞지 않는다.

플레이어는 마이더스손 관련 도시전설을 추적하는 민간 기자 또는 독립 취재자다.  
마이더스손은 "돈을 주는 손"이 아니라 "기록과 소유권을 바꾸는 손"으로 소문난다.

### 3-A.2 시작 장면 핵심

```text
[Scene]
플레이어는 아직 쓰지 않은 기사 초안이 세 번 삭제된 기록을 받는다.
기사 제목은 "마이더스손은 사람을 죽이지 않는다. 소유주를 바꾼다."

첨부 파일:
- 삭제된 기사 복구 로그
- 광고 계약서 스캔본
- 폐상가 3층 라커 17번 사진

편집 데스크 윤서하는 플레이어의 기사 초안이 CMS에서 사라졌고, 광고팀에는 같은 제목의 협찬 제안서가 올라왔다고 알려준다.
계약서 서명란에는 플레이어 이름의 초성이 들어가 있다.
제보자는 03:10 전에 라커를 열지 않으면 기사가 다른 사람 이름으로 발행된다고 경고한다.

[State]
Disclosure Level: PUBLIC
Visible Classification: 민간 괴담 / 확인 보류
Faction Heat: 마이더스손 주변 계정 주시

[Choices]
1. 삭제된 기사 초안의 복구 로그를 확인한다.
2. 윤서하에게 협찬 제안서 원본을 보내달라고 한다.
3. 제보자 계정 AfterGold_0310의 접속 위치를 추적한다.
4. 폐상가 3층 라커 17번으로 향한다.
```

### 3-A.3 진행 원칙

- 마이더스손 기자 루트에서 갑자기 아이 목소리 신고, KR-INIT-001, L3 파견 사건으로 전환하지 않는다.
- 다른 사건은 플레이어가 직접 연결하거나 명확한 단서가 쌓인 뒤에만 교차시킨다.
- 초반 단서는 삭제된 글, 광고 계약, 소액 입금, 계정 추적, 주민등록/소유권 기록 변화처럼 공개 레벨에서 다룬다.
- 대화가 필요하면 윤서하, AfterGold_0310, 광고팀 담당자, 폐상가 관리인처럼 이미 생긴 인물을 재사용한다.

---

## 4. 루트 2: KR-INIT-001 잔여 문서 기록 관리자

### 4.1 개요

플레이어는 폐기 문서 색인을 정리하는 계약직 기록 관리자다.  
오늘, 폐기된 줄 알았던 `KR-INIT-001` 색인이 내부 검색망에 다시 나타난다.

### 4.2 시작 상태

```json
{
  "route": "KR_INIT_001_RECORDS",
  "region": "Korea",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "observer_attention": "calm",
  "oracle_classification": "unclassified",
  "boundary_stability": "stable",
  "infection_exposure": "none",
  "faction_heat": {
    "KR_BARRIER_AUTHORITY": "none",
    "ORACLE_PROXY": "none",
    "ARCHIVE_SECURITY": "none"
  }
}
```

### 4.3 첫 장면

```text
[Scene]
제3기록보존실의 조명은 늘 한 박자 늦게 깜박입니다.
당신은 폐기 예정 문서 색인을 검수하던 중, 존재하면 안 되는 항목 하나를 발견합니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정

[Choices]
1. 문서 제목을 클릭한다.
2. 복원 로그를 먼저 확인한다.
3. 열람 등급 불일치 사유를 조회한다.
4. 화면을 캡처한 뒤 접속을 끊는다.
```

### 4.4 첫 단서

- 복원 요청자는 존재하지 않는 부서 코드
- 삭제 승인 시각이 3개 문서에서 동일
- 접속 로그에 플레이어 이름이 이미 어제 찍혀 있음

---

## 5. 루트 3: L3 현장 파견 계약 분석관

### 5.1 개요

플레이어는 L3 현장 파견을 앞둔 계약 분석관이다.  
업무는 현장 자료 해석이지만, 파견 전 교육 자료의 지도와 실제 도로명이 맞지 않는다.

### 5.2 시작 상태

```json
{
  "route": "L3_FIELD_ANALYST",
  "region": "Korea",
  "map_layer": "L3",
  "disclosure_level": "RESTRICTED",
  "observer_attention": "calm",
  "oracle_classification": "observed",
  "boundary_stability": "unstable",
  "infection_exposure": "none",
  "faction_heat": {
    "L3_FIELD_OFFICE": "watching",
    "KR_BARRIER_AUTHORITY": "watching"
  }
}
```

### 5.3 첫 장면

```text
[Scene]
파견 전 교육실에는 창문이 없습니다.
벽면 스크린에는 L3 진입 경로가 표시되어 있지만, 지도 오른쪽 아래의 축척이 계속 바뀝니다.

강사는 아무렇지 않게 말합니다.

"현장에서 길이 다르면, 지도보다 길을 믿지 마십시오."

당신의 책상 위 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 관찰
Internal GM Flag: oracle_classification=observed

[Choices]
1. 강사에게 17쪽의 문장을 묻는다.
2. 같은 교육 자료를 받은 사람들의 책자를 확인한다.
3. L3 진입 경로의 이전 버전을 조회한다.
4. 문장을 사진으로 남긴다.
```

### 5.4 첫 단서

- 17쪽 문장은 플레이어 책자에만 있음
- 이전 파견자 중 한 명이 같은 표지판을 언급
- 지도 축척 변화가 CCTV 프레임과 일치하지 않음

---

## 6. 루트 4: 소바리 주변부 실종 조사팀 현지 협력자

### 6.1 개요

플레이어는 소바리 주변부에서 현지 언어와 지형을 아는 협력자다.  
외부 조사팀이 산악 지대에 들어간 뒤, 마지막 무전에서 자기들이 아직 출발 전이라고 말했다.

### 6.2 시작 상태

```json
{
  "route": "SOVARI_LOCAL_CONTACT",
  "region": "Sovari",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "observer_attention": "calm",
  "oracle_classification": "unclassified",
  "boundary_stability": "stable",
  "infection_exposure": "none",
  "faction_heat": {
    "SOVARI_FIELD_TEAM": "watching",
    "LOCAL_AUTHORITY": "watching"
  }
}
```

### 6.3 첫 장면

```text
[Scene]
소바리 외곽의 작은 무전소.
낮인데도 산 능선 위에는 별처럼 보이는 빛이 세 개 떠 있습니다.

실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정

[Choices]
1. 마지막 무전 좌표를 지도에 표시한다.
2. 조사팀 출발 기록을 확인한다.
3. 현지 노인에게 산 능선의 빛에 대해 묻는다.
4. 무전 원본 파일을 복사한다.
```

### 6.4 첫 단서

- 무전 파일 생성 시간이 미래
- 현지인은 "그 산은 길을 기억한다"고 말함
- 조사팀의 출발 영상에는 한 명이 더 찍혀 있음

---

## 7. 루트 5: Philadelphia 누락 지도 복원 기술자

### 7.1 개요

플레이어는 누락된 Philadelphia 지도 계층을 복원하는 기술자다.  
문제는 지도에 없는 길이 실제 교통 로그에는 매일 기록된다는 점이다.

### 7.2 첫 장면

```text
[Scene]
복원 서버의 지도는 흰색 공백으로 가득합니다.
그런데 공백 위로 매일 같은 시간, 같은 경로의 이동 기록이 지나갑니다.

차량 번호는 없습니다.
운전자 이름도 없습니다.
목적지만 남아 있습니다.

"ASHFALL 이전의 문."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림

[Choices]
1. 이동 기록의 출발지를 추적한다.
2. 목적지 명칭을 검색한다.
3. 공백 지도 위에 과거 지도를 겹친다.
4. 복원 서버 로그를 백업한다.
```

---

## 8. 루트 6: Ashfall 봉쇄구역 물자 운반 민간인

### 8.1 개요

플레이어는 Ashfall 이후 봉쇄구역 인근으로 물자를 운반하는 민간인이다.  
정상 운송품은 식량과 약품이지만, 오늘 화물 목록에는 "수취인 없음"이라는 항목이 있다.

### 8.2 첫 장면

```text
[Scene]
검문소의 병사는 당신의 화물 목록을 세 번 확인합니다.
마지막 줄에서 손가락이 멈춥니다.

품목: 개인 물품 상자
수취인: 없음
반송지: 현 위치

병사는 당신을 보지 않고 말합니다.
"이 상자는 열지 마십시오. 특히 안에서 두드리는 소리가 나도."

[State]
Disclosure Level: PUBLIC
Faction Heat: 검문소 주시

[Choices]
1. 상자를 싣고 봉쇄구역 안으로 들어간다.
2. 병사에게 수취인 없음의 의미를 묻는다.
3. 화물 목록의 이전 버전을 확인한다.
4. 운송을 거부한다.
```

---

## 9. 루트 7: Meridian 하청 데이터 정리원

### 9.1 개요

플레이어는 Meridian 하청 업체에서 오래된 데이터를 정리한다.  
업무는 단순 삭제였지만, 오늘 삭제 대상 폴더 안에 플레이어의 신분증 스캔본이 들어 있다.

### 9.2 첫 장면

```text
[Scene]
삭제 대상 폴더명은 무작위 숫자처럼 보입니다.
그러나 열람 로그의 마지막 접근자는 당신입니다.

당신은 이 폴더를 연 적이 없습니다.

폴더 안에는 오래된 의료 기록, 출입증 사진, 그리고 아직 촬영하지 않은 당신의 내일 출근 기록이 들어 있습니다.

[State]
Disclosure Level: RESTRICTED
Visible Classification: 관찰
Internal GM Flag: oracle_classification=observed
Faction Heat: Meridian 주시

[Choices]
1. 폴더를 삭제한다.
2. 내일 출근 기록을 연다.
3. 접근 로그 원본을 복사한다.
4. 상급자에게 보고한다.
```

---

## 10. 루트 8: SHED 계열 문서에서 자기 이름을 발견한 사람

### 10.1 개요

플레이어는 우연히 SHED 계열 문서에서 자신의 이름을 발견한다.  
문제는 문서 작성일이 플레이어가 태어나기 전이라는 점이다.

### 10.2 첫 장면

```text
[Scene]
문서의 첫 페이지는 평범한 인사 기록처럼 보입니다.
두 번째 페이지에는 당신의 이름이 있습니다.
세 번째 페이지에는 아직 하지 않은 선택들이 표로 정리되어 있습니다.

문서 작성일은 당신이 태어나기 9년 전입니다.

마지막 줄은 손으로 쓴 것처럼 보입니다.

"이번에는 읽게 두어도 된다."

[State]
Disclosure Level: RESTRICTED -> OBSERVER
Observer Attention: 주목
Canon Drift: 미세차이

[Choices]
1. 표에 적힌 첫 번째 선택을 확인한다.
2. 문서 작성자를 찾는다.
3. 문서를 닫고 원래 위치에 돌려놓는다.
4. 마지막 문장의 필체를 분석한다.
```

---

## 11. 국가별 생활감 확장 루트

이 섹션은 비한국권 생활감 문서를 실제 AI GM 시작점으로 변환한다.

공통 원칙:

- 시작 장면에서 최상위 진실을 설명하지 않는다.
- 국가별 제도와 생활 비용이 먼저 보인다.
- ORACLE 명칭은 표시하지 않는다.
- `Visible Classification`, `중앙 분류`, `자동 위험도`, `본부 보류`를 사용한다.

---

### 11.1 러시아 루트: 시베리아 보급 열차 통신 담당자

```json
{
  "route": "RU_SIBERIAN_SUPPLY_TRAIN_COMMS",
  "region": "Russia",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "boundary_stability": "stable",
  "infection_exposure": "none",
  "faction_heat": {
    "LOCAL_COMMAND": "watching",
    "RAIL_CREW": "neutral"
  }
}
```

```text
[현재 위치]
시베리아 보급 열차 / 4번 통신칸

[장면]
중앙 발표에 따르면 북동부 격리 도시는 모두 안정 상태입니다.
하지만 새벽 3시 17분, 군용 주파수로 구조 신호가 들어옵니다.

신호의 발신 기록은 11년 전입니다.
문제는 목소리가 방금 같은 객차에서 내린 정비사의 이름을 부른다는 점입니다.

[상태]
Visible Classification: 통신 오류 / 확인 보류
Temperature Risk: 위험
Supply Delay: 41분

[추천 행동]
1. 구조 신호를 녹음해 별도 저장한다.
2. 기관사에게 열차 정지를 요청한다.
3. 군 통신망에 공식 보고한다.
4. 자유 입력
```

---

### 11.2 EU 루트: 검역선 절차 연락관

```json
{
  "route": "EU_QUARANTINE_SHIP_LIAISON",
  "region": "EU",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "boundary_stability": "stable",
  "infection_exposure": "suspected",
  "faction_heat": {
    "PORT_AUTHORITY": "watching",
    "NGO": "pressuring",
    "JBDF": "monitoring"
  }
}
```

```text
[현재 위치]
지중해 검역선 / 임시 절차 사무실

[장면]
검역기는 같은 국적 표식의 승객에게만 세 번째 재검을 요구합니다.
항만 당국은 절차를 이유로 입항을 미룹니다.
갑판 아래에서는 해열제가 떨어졌다는 보고가 올라옵니다.

[상태]
Visible Classification: 검역 재심사
Civil Trust: 불안
Medical Supply: 부족

[추천 행동]
1. 검역기 원시 로그를 요청한다.
2. 항구 개방을 위한 임시 책임 각서를 작성한다.
3. NGO 대표와 승객 명단을 대조한다.
4. 자유 입력
```

---

### 11.3 호주 루트: Outback 시민 신고 배정관

```json
{
  "route": "AU_OUTBACK_REPORT_DISPATCHER",
  "region": "Australia",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "boundary_stability": "unstable",
  "infection_exposure": "none",
  "faction_heat": {
    "ABBC": "watching",
    "LOCAL_COMMUNITY": "guarded"
  }
}
```

```text
[현재 위치]
ABBC 지방 신고 센터 / 야간 배정실

[장면]
광산 숙소에서 들어온 신고 좌표가 지도에 세 번 다른 이름으로 저장됩니다.
현지 원주민 자문관은 그 좌표를 지도에 올리지 말라고 말합니다.

신고 앱은 이미 자동 배정을 시작했습니다.

[상태]
Visible Classification: 현장 확인
Boundary Stability: 불안정
Access Route: 제한

[추천 행동]
1. 좌표 자동 배정을 보류한다.
2. 현지 자문관에게 금기 사유를 묻는다.
3. 광산 회사의 마지막 통신을 확인한다.
4. 자유 입력
```

---

### 11.4 Meridian 루트: 계약 비용 감사 보조원

```json
{
  "route": "MERIDIAN_CONTRACT_AUDIT_ASSISTANT",
  "region": "Meridian Contract Zone",
  "map_layer": "L1",
  "disclosure_level": "PUBLIC",
  "boundary_stability": "stable",
  "infection_exposure": "none",
  "faction_heat": {
    "MERIDIAN": "watching",
    "HOSPITAL_VENDOR": "nervous"
  }
}
```

```text
[현재 위치]
Meridian 하청 감사실 / 비용 정산 서버

[장면]
존재하지 않는 격리 병동의 월간 비용 청구서가 올라옵니다.
청구 대상자는 이미 8개월 전 사망 처리된 사람입니다.

송장 번호는 폐쇄구역 회수품 거래 코드와 한 자리만 다릅니다.

[상태]
Visible Classification: 회계 오류
Contract Risk: 상승
Disclosure Level: PUBLIC

[추천 행동]
1. 청구서를 반려한다.
2. 병동 위치 코드를 역추적한다.
3. 사망 처리 문서를 확인한다.
4. 자유 입력
```

---

## 12. 첫 테스트 추천 루프

AI GM 첫 테스트는 아래 순서가 좋다.

1. 루트 2 `KR-INIT-001 잔여 문서 기록 관리자`로 시작한다.
2. 플레이어가 문서 제목을 클릭하게 한다.
3. PRIVATE가 아닌 RESTRICTED 단서만 공개한다.
4. 접속 로그에 플레이어 이름이 어제 찍혀 있음을 보여준다.
5. Observer Attention을 `평온`에서 `주목`으로 올릴지 판단한다.
6. 플레이어가 위험한 질문을 하면 Disclosure Rules로 우회한다.

---

## 13. 시스템 프롬프트 삽입용 요약

```text
Starting Scenarios:
Do not start from cosmic truth. Start from grounded human-scale routes.
Preferred starting routes:
1. Korean barrier civilian investigation assistant.
2. KR-INIT-001 residual document records manager.
3. L3 field assignment contract analyst.
4. Sovari missing investigation team local contact.
Optional advanced routes:
5. Philadelphia missing map restoration technician.
6. Ashfall quarantine supply courier.
7. Meridian subcontract data cleaner.
8. Person who finds their own name in a SHED document.
Expansion routes:
9. Russian Siberian supply train communications officer.
10. EU quarantine ship procedure liaison.
11. Australian Outback report dispatcher.
12. Meridian contract audit assistant.
All player characters must be adults. Start with PUBLIC or low RESTRICTED information only. Never reveal PRIVATE lore in the opening scene.
```
