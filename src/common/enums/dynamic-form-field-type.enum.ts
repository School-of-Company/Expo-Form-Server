/**
 * 입력 필드의 위젯 종류. `form`의 필드와 `survey`의 문항이 같은 위젯 개념을 쓰기 때문에
 * 두 모듈 어디에도 속하지 않는 공용 위치에 둔다 ({@link ParticipationType}과 같은 기준).
 */
export enum DynamicFormFieldType {
  /** 한 줄/여러 줄 텍스트 입력. */
  SENTENCE = 'SENTENCE',
  /** 단일 체크박스 (예/아니오 성격). */
  CHECKBOX = 'CHECKBOX',
  /** 드롭다운 단일 선택. */
  DROPDOWN = 'DROPDOWN',
  /** 이미지 업로드. */
  IMAGE = 'IMAGE',
  /** 다중 선택. */
  MULTIPLE = 'MULTIPLE',
}
