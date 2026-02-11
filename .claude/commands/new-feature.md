---
description: 새 기능 개발용 브랜치 생성 및 작업 시작
---

# New Feature Branch: $ARGUMENTS

1. **브랜치 이름 생성**
   - `$ARGUMENTS` 기반으로 영문 kebab-case 브랜치명 생성
   - 형식: `feature/{기능명}-{YYMMDD}` (예: feature/add-login-250202)

2. **브랜치 생성 및 전환**
   - `git checkout -b {브랜치명}` 실행
   - 생성 완료 메시지 출력

3. **작업 시작 안내**
   - 현재 브랜치 확인
   - "작업을 시작하세요!" 메시지 출력
