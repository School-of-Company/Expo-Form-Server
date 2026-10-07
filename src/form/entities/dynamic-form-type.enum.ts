/**
 * 필드가 신청 처리 로직에서 고정된 의미로 참조되는지 표시.
 * NAME/PHONE_NUMBER/TRAINING_ID/OCCUPATION/SCHOOL은 값이 직접 읽히는 필드이고, DEFAULT는
 * 폼 작성자가 자유롭게 정의한 커스텀 필드다.
 */
export enum DynamicFormType {
  NAME = 'NAME',
  PHONE_NUMBER = 'PHONE_NUMBER',
  TRAINING_ID = 'TRAINING_ID',
  /** 일반 참가자의 직업. 선택지 키가 {@link Occupation} 값이어야 하는 드롭다운이다. */
  OCCUPATION = 'OCCUPATION',
  /**
   * 소속 학교 문장형 필드. 일반 참가자 폼에서는 직업이 교사·예비교사일 때만 보이는 조건부
   * 필드이고, 교원연수자 폼에서는 조건 없이 항상 보인다(명찰에 찍을 소속).
   */
  SCHOOL = 'SCHOOL',
  DEFAULT = 'DEFAULT',
}
