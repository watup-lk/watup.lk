import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExperienceLevel } from '../enums/experience-level.enum';
import { WorkType } from '../enums/work-type.enum';

export class CreateSubmissionDto {
  @ApiProperty({
    description: 'Job role or title',
    example: 'Software Engineer',
  })
  @IsString()
  @IsNotEmpty()
  role!: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'LK',
    minLength: 2,
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'City name', example: 'Colombo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'Gross salary amount (minimum 1)',
    example: 150000,
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  salaryAmount!: number;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code',
    example: 'LKR',
    minLength: 3,
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    description: 'Years of professional experience',
    example: 3,
    minimum: 0,
    maximum: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @ApiPropertyOptional({
    description: 'Seniority level',
    enum: ExperienceLevel,
    enumName: 'ExperienceLevel',
  })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({
    description: 'Work arrangement type',
    enum: WorkType,
    enumName: 'WorkType',
  })
  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @ApiPropertyOptional({
    description: 'Submit anonymously (hides company name)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  anonymize?: boolean;
}
