import { Transform, Type } from 'class-transformer';
import { CompanyVerificationStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCompaniesQueryDto {
  @ApiPropertyOptional({
    enum: CompanyVerificationStatus,
    default: CompanyVerificationStatus.PENDING,
  })
  @IsOptional()
  @IsIn([...Object.values(CompanyVerificationStatus), 'ALL'])
  verified_status: CompanyVerificationStatus | 'ALL' =
    CompanyVerificationStatus.PENDING;

  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) q?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsIn(['true', 'false']) suspended?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
