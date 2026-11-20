import { Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpApplicationCvUsageClient } from '../application/http-application-cv-usage.client';
import { AuthUser } from '../common/auth/auth-user.interface';
import { CurrentUser, Roles } from '../common/auth/auth.decorators';
import { SystemRole } from '../common/auth/system-role.enum';
import { ProfileService } from './profile.service';

const UUID_PIPE = new ParseUUIDPipe({ version: '4' });

@ApiTags('candidate-profile-views')
@ApiBearerAuth()
@Controller()
export class ProfileViewController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly applications: HttpApplicationCvUsageClient,
  ) {}

  @Get('me/view-activity')
  @Roles(SystemRole.CANDIDATE)
  @ApiOperation({ summary: 'Get my profile view totals' })
  activity(@CurrentUser() candidate: AuthUser) {
    return this.profiles.getViewActivity(candidate.id);
  }

  @Post('applications/:applicationId/views/:viewId')
  @HttpCode(HttpStatus.OK)
  @Roles(SystemRole.RECRUITER)
  @ApiOperation({ summary: 'Open an authorized candidate profile and record the view once' })
  async open(
    @CurrentUser() recruiter: AuthUser,
    @Headers('authorization') authorization: string,
    @Param('applicationId', UUID_PIPE) applicationId: string,
    @Param('viewId', UUID_PIPE) viewId: string,
  ) {
    const candidateId = await this.applications.getCandidateForRecruiter(applicationId, authorization);
    return this.profiles.viewForRecruiter(candidateId, recruiter.id, viewId);
  }
}
