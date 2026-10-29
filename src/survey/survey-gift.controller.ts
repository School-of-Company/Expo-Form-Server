import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import { AdminChangeNotify } from '../common/notification/admin-change-notify.js';
import {
  ConfirmGiftPickupRequestDto,
  GiftPickupStatusRequestDto,
  GiftPickupStatusResponseDto,
  GiftPinResponseDto,
  UpdateGiftPinRequestDto,
} from './dto/survey-gift.dto.js';
import { SurveyGiftService } from './survey-gift.service.js';

/**
 * 공개 설문 응답별 기념품 수령 확인 HTTP 엔트리포인트. 직원 PIN 설정은 관리자용이고, 수령 상태 조회·확인은
 * 설문 제출자의 휴대전화에서 부른다. 토큰·PIN은 URL이 아니라 바디로만 받고 응답은 캐시하지 않는다.
 */
@ApiTags('survey-gift')
@Controller('surveys')
export class SurveyGiftController {
  constructor(private readonly surveyGiftService: SurveyGiftService) {}

  @ApiOperation({
    summary: '기념품 직원 PIN 설정 여부 조회',
    description: 'PIN이 설정돼 있는지만 돌려준다. PIN 자체는 조회할 수 없다.',
  })
  @ApiOkResponse({ type: GiftPinResponseDto })
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @Header('Cache-Control', 'no-store')
  @Get(':expoId/gift-pin')
  async findPin(
    @Param('expoId', ParseUUIDPipe) expoId: string,
  ): Promise<GiftPinResponseDto> {
    return this.surveyGiftService.findPin(expoId);
  }

  @ApiOperation({
    summary: '기념품 직원 PIN 설정·변경',
    description:
      '(수령 확인에는 더 이상 쓰지 않는다.) 박람회의 공용 직원 PIN(숫자 4~8자리)을 설정하거나 바꾼다. 해시로만 저장하고 응답·로그에 싣지 않는다. 바꾸면 그 뒤 확인부터 옛 PIN은 통하지 않는다.',
  })
  @ApiOkResponse({ type: GiftPinResponseDto })
  @ApiErrorResponse(400, 'PIN 형식이 맞지 않음')
  @ApiErrorResponse(
    404,
    '그 박람회에 일반 참가자 설문이 없음 (SURVEY_NOT_FOUND)',
  )
  @AdminChangeNotify('기념품 직원 PIN 설정')
  @Header('Cache-Control', 'no-store')
  @Put(':expoId/gift-pin')
  async updatePin(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: UpdateGiftPinRequestDto,
  ): Promise<GiftPinResponseDto> {
    return this.surveyGiftService.updatePin(expoId, dto);
  }

  @ApiOperation({
    summary: '기념품 수령 상태 조회',
    description:
      '설문 제출 때 받은 토큰으로 수령 여부와 완료 시각, 직원 PIN 설정 여부만 돌려준다. 응답 본문·전화번호 등은 싣지 않는다. 토큰은 바디로 보낸다.',
  })
  @ApiOkResponse({ type: GiftPickupStatusResponseDto })
  @ApiErrorResponse(
    404,
    '설문이 없거나 토큰이 이 박람회의 것이 아님 (SURVEY_NOT_FOUND, GIFT_PICKUP_TOKEN_INVALID)',
  )
  @Header('Cache-Control', 'no-store')
  @Post(':expoId/gift-pickup/status')
  @HttpCode(HttpStatus.OK)
  async findStatus(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: GiftPickupStatusRequestDto,
  ): Promise<GiftPickupStatusResponseDto> {
    return this.surveyGiftService.findStatus(expoId, dto);
  }

  @ApiOperation({
    summary: '기념품 수령 확인(직원확인)',
    description:
      '응답 토큰만으로 수령을 완료한다. 직원 PIN은 보지 않고 요청에 `pin`이 있어도 무시한다(이전 클라이언트 호환). 참가자가 직접 눌러도 처리되며 직원의 신원을 확인하지 않는다. 이미 완료된 토큰은 확인 시각을 다시 쓰지 않고 기존 완료 상태를 그대로 돌려준다(멱등). 응답마다 별도 토큰·확인 상태를 가진다.',
  })
  @ApiOkResponse({ type: GiftPickupStatusResponseDto })
  @ApiErrorResponse(
    404,
    '설문이 없거나 토큰이 이 박람회의 것이 아님 (SURVEY_NOT_FOUND, GIFT_PICKUP_TOKEN_INVALID)',
  )
  @Header('Cache-Control', 'no-store')
  @Post(':expoId/gift-pickup/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('expoId', ParseUUIDPipe) expoId: string,
    @Body() dto: ConfirmGiftPickupRequestDto,
  ): Promise<GiftPickupStatusResponseDto> {
    return this.surveyGiftService.confirm(expoId, dto);
  }
}
