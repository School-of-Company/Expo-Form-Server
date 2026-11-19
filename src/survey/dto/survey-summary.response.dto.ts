import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ParticipationType } from '../../common/enums/participation-type.enum.js';

/**
 * 박람회에 어떤 설문이 만들어져 있고 추첨을 운영할 준비가 됐는지. 박람회 기능 설정(`SURVEY_LOTTERY`)은 기능 사용
 * 허용이고, 여기의 로컬 추첨 운영(`lotteryEnabled`)과 당첨 번호는 실제 운영 준비다 — 실제 추첨은 둘 다 켜져야
 * 한다(#302). 박람회 서비스(F05)와 관리자 통합 페이지(F09)가 준비 상태를 보여 줄 때 쓴다.
 */
export const surveySummarySchema = z.object({
  expoId: z.uuid(),
  participationType: z.enum(ParticipationType),
  /** 이 설문에서 추첨 운영을 시작했는지(관리자 화면의 '추첨 운영 시작/중지'). */
  lotteryEnabled: z.boolean(),
  /** 당첨 번호가 하나 이상 정해졌는지. 없으면 추첨을 켜도 당첨자가 나오지 않는다. */
  lotteryNumbersConfigured: z.boolean(),
});

export class SurveySummaryDto extends createZodDto(surveySummarySchema) {}
