import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ExperienceLevel } from '../enums/experience-level.enum';
import { WorkType } from '../enums/work-type.enum';

export class FindSubmissionsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by job role (case-insensitive partial match)',
    example: 'Engineer',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Filter by ISO 3166-1 alpha-2 country code',
    example: 'LK',
    minLength: 2,
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({
    description: 'Filter by seniority level',
    enum: ExperienceLevel,
    enumName: 'ExperienceLevel',
  })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({
    description: 'Filter by work arrangement type',
    enum: WorkType,
    enumName: 'WorkType',
  })
  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @ApiPropertyOptional({
    description: 'Filter by ISO 4217 currency code',
    example: 'LKR',
    minLength: 3,
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
