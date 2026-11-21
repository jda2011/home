# Drawing is my life

흰 배경과 남색 메뉴, 작품 전시·주문·개인 작업실·온라인 상담을 갖춘 그림 커미션 홈페이지입니다. 화면은 GitHub Pages에 올리고, 계정·주문·상담·이미지 저장은 Supabase에서 처리합니다.

## 시작하기

아직 Supabase 프로젝트와 연결하지 않았다면 사이트에 연결 안내가 표시됩니다. 이 안내는 오류가 아닙니다. 실제 로그인, 주문, 상담 기능을 켜려면 다음 설정을 완료해야 합니다.

1. Supabase에서 새 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**를 열어 `supabase.sql` 전체를 실행합니다. 주문·상담 데이터베이스와 접근 권한, 작품 이미지 저장소가 만들어집니다.
3. Supabase의 **Project Settings → API**에서 **Project URL**과 공개용 **anon** 또는 **publishable** 키를 복사합니다. `config.js`의 예시 값을 아래처럼 교체합니다.

   ```js
   export const SUPABASE_URL = "https://프로젝트ID.supabase.co";
   export const SUPABASE_ANON_KEY = "공개용 anon 또는 publishable 키";
   ```

   `service_role` 키는 관리자 비밀 키이므로 브라우저 코드나 GitHub에 절대로 넣지 마세요.
4. Supabase **Authentication → URL Configuration**에서 사이트 URL과 Redirect URLs를 설정합니다. 로컬 미리보기 주소와 GitHub Pages 주소(예: `https://사용자명.github.io/저장소명/`)를 허용 목록에 추가합니다.
5. GitHub 저장소에 `index.html`, `styles.css`, `app.js`, `config.js`, `supabase.sql`을 올리고 **Settings → Pages**에서 배포합니다. 프런트엔드 파일은 서버 모듈이 필요하므로 `file://`로 열지 말고 로컬 HTTP 서버 또는 GitHub Pages로 확인하세요.
6. 관리자 이메일 두 계정(`8yskvkwj@gmail.com`, `jdaadj0228@gmail.com`)으로 가입한 뒤 이메일 인증을 마치면 관리자 메뉴가 나타납니다. 관리자 권한은 데이터베이스의 RLS 정책에서도 검증됩니다.

## 제공 기능

- 작품 갤러리 및 관리자의 이미지·가격 등록
- 회원가입, 이메일 로그인, 로그아웃
- 맞춤 작업 신청과 개인별 주문 현황·견적·진행 상태 확인
- 주문별 상담과 일반 고객 문의, 관리자 상담함
- Supabase Realtime을 통한 새 상담 메시지 갱신

작품 이미지는 공개 갤러리 표시를 위해 공개 읽기이며, 업로드·수정·삭제는 관리자만 할 수 있습니다. 주문과 상담 내역은 Supabase Row Level Security로 해당 고객과 관리자에게만 공개됩니다. 실제 운영 전에 Supabase 이메일 인증·비밀번호 정책 및 백업 설정을 확인하세요.
