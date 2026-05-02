export const FORBIDDEN_KEYWORDS: readonly string[] = [
  "시간 멈",
  "시간 정지",
  "시간 되돌",
  "즉사",
  "무적",
  "불사",
  "불멸",
  "전지",
  "전능",
  "무한",
  "절대",
  "모든 것을",
  "카룬탈을 부",
  "오라클을 노예",
  "관측자 종",
];

export function checkForbidden(input: string): {
  rejected: boolean;
  reason?: string;
} {
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (input.includes(kw)) {
      return {
        rejected: true,
        reason: `'${kw}' 영역은 인간의 권능이 아닙니다.`,
      };
    }
  }
  return { rejected: false };
}
