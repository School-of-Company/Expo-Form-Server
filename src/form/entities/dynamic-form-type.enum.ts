/**
 * 필드가 신청 처리 로직에서 고정된 의미로 참조되는지 표시.
 * NAME/PHONE_NUMBER/TRAINING_ID는 값이 직접 읽히는 필드이고, DEFAULT는
 * 폼 작성자가 자유롭게 정의한 커스텀 필드다.
 */
export enum DynamicFormType {
  NAME = 'NAME',
  PHONE_NUMBER = 'PHONE_NUMBER',
  TRAINING_ID = 'TRAINING_ID',
  DEFAULT = 'DEFAULT',
}
