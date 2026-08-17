# 데이터베이스 준비

`migrations/001_initial.sql`은 PostgreSQL 15 이상을 기준으로 작성한 초기 스키마입니다.

기본 로컬 실행은 인메모리 저장소를 사용합니다. PostgreSQL 저장소 구현은 완료돼 있으며 다음 순서로 활성화합니다.

1. 개발·검증·운영 데이터베이스를 분리한다.
2. 마이그레이션 전용 계정과 앱 실행 계정을 분리한다.
3. 앱 계정에는 스키마 변경 권한을 주지 않는다.
4. `npm run db:migrate`로 스키마를 적용한다.
5. 회사 인증 사용자와 팀을 `users`, `teams`, `user_roles`에 연결한다.
6. `STORAGE_PROVIDER=postgres`, `DATABASE_URL`, `DATABASE_TEAM_ID`를 설정한다.
7. 백업 복구와 감사 로그 보존 기간을 확인한다.

`created_by`, `assignee_id`, 승인자와 감사 주체는 `users.id` UUID를 사용한다. 따라서 회사 인증 매핑 전에 PostgreSQL 모드로 전환하면 안 된다. 앱 실행 계정에는 테이블 읽기·쓰기만 허용하고 스키마 변경은 마이그레이션 계정으로 분리한다.
