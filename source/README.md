# HYO-Web 원본 (빌드 소스)

`python3 build.py` 로 페이지를 만듭니다. (필요: Python 3, `pip install fonttools brotli`)

| 만들 것 | 명령 |
|---|---|
| 전시용 페이지 → 저장소 루트 `index.html` | `HYO_URL="https://seunginryu.github.io/HYO-Web/hyodoer/" HYO_OUT=../index.html python3 build.py` |
| 휴대폰 편지 보기 → `hyodoer/index.html` | `HYO_VIEWER=1 HYO_OUT=../hyodoer/index.html python3 build.py` |

- `src/` 화면 구조(body.html), 스타일(style.css), 동작(app.js)
- `assets/` 피그마에서 가져온 로고·봉투·편지지 SVG, 배경, 폰트(서브셋)
- `stickers/` 영문 이니셜 스티커 28개 SVG
- `keys/master.json` 마스터 암호로 잠근 열쇠(방명록 본문 복호화용). 마스터 암호를 바꾸려면 이 파일을 새로 만들어야 합니다.
- 방명록 저장소: Firebase 프로젝트 `hyodoer` (Firestore `guestbook` 컬렉션)
