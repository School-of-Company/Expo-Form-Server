import { Injectable } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyNotFoundException } from '../common/exceptions/domain.exception.js';
import {
  SurveyLotteryResponseDto,
  UpdateSurveyLotteryRequestDto,
} from './dto/survey-lottery.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyStore } from './survey.store.js';

/**
 * 박람회(설문)별 경품 추첨 설정을 담당한다. 대상은 공개 설문이 쓰는 일반 참가자 설문이다.
 *
 * 켜고 끄는 것과 당첨 번호 목록은 관리자가 직접 다룬다. 켜 두는 동안 번호를 입력한 응답자만 센 순번이 목록에
 * 있으면 당첨이고, 끄면 그동안은 세지 않는다. 진행 중에 목록을 바꿔도 이미 지나간 순번은 다시 오지 않으므로
 * 응답에 현재까지 센 순번을 함께 돌려줘 관리자가 확인할 수 있게 한다.
 */
@Injectable()
export class SurveyLotteryService {
  constructor(private readonly surveyStore: SurveyStore) {}

  /**
   * 경품 추첨 설정과 현재까지 센 순번을 조회한다.
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   */
  async find(expoId: string): Promise<SurveyLotteryResponseDto> {
    return this.toResponse(await this.findSurvey(expoId));
  }

  /**
   * 경품 추첨 설정을 바꾼다. 당첨 번호는 작은 순서로 저장한다. 순번은 건드리지 않아서 껐다 켜면 이어서 센다.
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   */
  async update(
    expoId: string,
    dto: UpdateSurveyLotteryRequestDto,
  ): Promise<SurveyLotteryResponseDto> {
    const survey = await this.findSurvey(expoId);

    const numbers = dto.numbers.toSorted((a, b) => a - b);
    await this.surveyStore.updateLottery(survey.id, dto.enabled, numbers);

    // 응답 직전에 다시 읽는다. 바꾸는 사이에 응답이 들어와 센 순번이 달라졌을 수 있다.
    return this.toResponse(await this.findSurvey(expoId));
  }

  private async findSurvey(expoId: string): Promise<SurveyEntity> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      ParticipationType.STANDARD,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    return survey;
  }

  private toResponse(survey: SurveyEntity): SurveyLotteryResponseDto {
    return {
      enabled: survey.lotteryEnabled,
      numbers: survey.lotteryNumbers,
      currentSequence: survey.lotterySequence,
    };
  }
}
