# TIU Assets

게임에서 바로 참조할 수 있는 공개 에셋 폴더입니다.

- `tiu/`: 현재 세계관 이미지 에셋
- `tiu-card/`: `C:\Users\Administrator\TIU_CARD\assets`에서 복사한 카드/배경/캐릭터 에셋
- `user-scenes/`: 플레이 중 장면에 자동 매칭할 사용자 추가 이미지

Next.js 화면에서는 `/assets/tiu/파일명.webp` 또는 `/assets/tiu-card/...` 경로로 사용할 수 있습니다.

`user-scenes/manifest.json`에 파일별 `keywords`, `title`, `detail`, `priority`를 넣으면 채팅 장면, 단서, 인물, 로그 문장에 맞춰 먼저 매칭됩니다.
