import Link from "next/link";

const sections = [
  {
    title: "비공개 테스트 접속",
    body: [
      "TIU World Game은 현재 비공개 알파 테스트 단계입니다. 배포 URL과 접속 비밀번호는 지정된 테스트 인원에게만 공유됩니다.",
      "테스트 중인 기능, 설정, 세션 데이터 구조는 정식 서비스 전까지 변경될 수 있습니다.",
    ],
  },
  {
    title: "계정 및 세션 데이터",
    body: [
      "현재 계정 기능은 임시 테스트 계정 기반입니다. 로그인 상태와 표시 이름은 필요한 쿠키로 유지됩니다.",
      "플레이어 메모, 요약 메모리, 저장 슬롯, 세션 기록은 브라우저 저장소를 우선 사용하며, 로컬 개발 환경에서는 world/session 폴더에 보조 미러를 남깁니다.",
      "Vercel 배포 환경의 파일 저장은 영구 저장소가 아니므로, 다른 기기에서 이어 하기 위해서는 이후 클라우드 DB 연결이 필요합니다.",
    ],
  },
  {
    title: "AI 생성 출력",
    body: [
      "AI-GM 출력은 세계관 탐험을 위한 창작 응답입니다. 출력 내용은 테스트 중 언제든 조정될 수 있습니다.",
      "플레이어가 저장한 메모와 요약 메모리는 진행 맥락을 유지하기 위해 AI 응답에 참조될 수 있습니다.",
      "API 키는 서버 환경변수에만 보관되어야 하며, 세션 파일 가져오기 기능은 API 키나 민감 정보 흔적이 있는 파일을 차단합니다.",
    ],
  },
  {
    title: "이미지 및 사용자 자료",
    body: [
      "현재 장면 이미지는 public/assets/user-scenes 폴더와 manifest.json 설정을 기준으로 매칭됩니다.",
      "사용자가 제공하는 이미지는 테스트 목적과 세계관 플레이에 맞는 범위에서만 사용해야 합니다.",
      "자동 AI 이미지 생성, 크레딧 차감, 공개 라이브러리 반영은 아직 정식 활성화 단계가 아닙니다.",
    ],
  },
  {
    title: "콘텐츠 안전",
    body: [
      "현재 세션 콘텐츠 등급은 teen 기준으로 제한합니다.",
      "민감한 개인정보, NSFW 콘텐츠, 미성년자 관련 성적 콘텐츠, 실제 위해 조언, 범죄 실행 절차, 과도한 고어 묘사는 생성하거나 저장하지 않습니다.",
      "성인 인증, 유료 크레딧 결제, 공개 세션 심사는 별도 안전 장치가 준비된 뒤 검토합니다.",
    ],
  },
];

export default function LegalPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-8 text-zinc-100">
      <section className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-100"
        >
          WORLD SESSION으로 돌아가기
        </Link>
        <div className="mt-6 border-b border-zinc-800 pb-5">
          <p className="text-xs font-semibold tracking-[0.24em] text-emerald-300">TIU TEST POLICY</p>
          <h1 className="mt-3 text-3xl font-black text-zinc-50">테스터 고지 및 기본 정책</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            이 화면은 회원가입, 개인정보, 사용자 자료, AI 생성, 콘텐츠 안전 항목을 현재 비공개 테스트 단계에 맞춰
            정리한 임시 정책입니다.
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-md border border-zinc-800 bg-zinc-900/55 p-4">
              <h2 className="text-base font-bold text-zinc-100">{section.title}</h2>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
