import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class ModerateCompanyDto {
  @ApiProperty() @IsBoolean() suspended!: boolean;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') operationId!: string;
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(3, 500) reason!: string;
}
