/**
 * 참가자의 지역. 사전신청 폼의 지역 필드(`DynamicFormFieldType.REGION`)가 받는 값이다. 선택지가 고정이라
 * 직업과 달리 폼마다 `jsonData`로 정하지 않고, 화면에 보일 이름("광주", "전남", "그 외")은 클라이언트가 정한다.
 */
export enum Region {
  /** 광주 */
  GWANGJU = 'GWANGJU',
  /** 전남 */
  JEONNAM = 'JEONNAM',
  /** 그 외 지역 */
  OTHER = 'OTHER',
}
