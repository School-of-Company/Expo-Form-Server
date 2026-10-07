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
  /**
   * 동반자 추가. 대표자가 동반자를 한 명씩(이름·구분·지역·소속) 최대 4명(`COMPANION_MAX_COUNT`, 대표자 포함 5명)까지 더한다.
   * 신청 폼(일반 참가자)에서만 쓰고 설문 문항에는 쓰지 않는다.
   */
  COMPANION = 'COMPANION',
  /**
   * 지역 선택. 값은 {@link Region}(광주·전남·그 외) 중 하나이고 선택지가 고정이라 `jsonData`를 쓰지 않는다.
   * 신청 폼(일반 참가자)에서만 쓰고 설문 문항에는 쓰지 않는다.
   */
  REGION = 'REGION',
}
