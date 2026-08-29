-- 대시보드에서 원고를 삭제할 때 원문과 이력을 보존하는 소프트 삭제 상태를 허용한다.
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_state_check;
ALTER TABLE contents ADD CONSTRAINT contents_state_check CHECK (
  state IN ('idea', 'researching', 'brief_ready', 'drafting', 'review_ready', 'approved', 'scheduled', 'published', 'measured', 'deleted')
);
