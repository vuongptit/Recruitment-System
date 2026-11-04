import { JobStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export class AdminJobQueryDto {
  @ApiPropertyOptional({ enum: JobStatus }) @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) q?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') company_id?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional()
  @IsIn(['true', 'false']) suspended?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class ModerateJobDto {
  @ApiProperty() @IsBoolean() suspended!: boolean;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') operationId!: string;
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(3, 500) reason!: string;
}
