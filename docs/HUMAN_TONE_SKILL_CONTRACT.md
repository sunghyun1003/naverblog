# 사람 말투 Skill Runner 계약

## 입력

```ts
interface HumanToneInput {
  title: string;
  body: string;
  protectedTerms: string[];
  toneProfile: string;
  contentId: string;
  versionId: string;
}
```

## 출력

```ts
interface HumanToneOutput {
  title: string;
  body: string;
  changedProtectedTerms: string[];
  diffSummary: string[];
  warnings: string[];
  skillName: string;
  skillVersion: string;
}
```

## 필수 규칙

- 수치, 법령, 약관 문구, 상품명, 직접 인용, 필수 고지를 보호 문구로 전달한다.
- 보호 문구가 하나라도 사라지거나 바뀌면 파이프라인을 실패 처리한다.
- 원문 버전을 덮어쓰지 않고 `human_tone` 새 버전을 만든다.
- skill 이름과 버전을 원고 메타데이터에 기록한다.
- 실행 시간 제한과 최대 재시도 횟수는 작업 실행기에서 관리한다.
- 말투 보정 이후 사실·수치 검사를 다시 수행한다.

현재 `mock-human-tone` 어댑터와 보호 문구 변경 실패 테스트가 이 계약을 검증한다.
