import { ApiProperty } from '@nestjs/swagger';

export class CompanyFollowStatusDto {
  @ApiProperty({
    description: 'Whether the current candidate is following this company',
    example: true,
  })
  isFollowing!: boolean;

  @ApiProperty({
    description: 'Total number of candidates following this company',
    minimum: 0,
    example: 12,
  })
  followersCount!: number;
}
