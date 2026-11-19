import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CreateCompanyDto } from './create-company.dto';

export class AdminUpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @ApiPropertyOptional({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion?: number;
}
