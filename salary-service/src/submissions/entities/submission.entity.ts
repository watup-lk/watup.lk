import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExperienceLevel } from '../enums/experience-level.enum';
import { WorkType } from '../enums/work-type.enum';
import { SubmissionStatus } from '../enums/submission-status.enum';

@Entity({ schema: 'salary_schema', name: 'submissions' })
export class Submission {
  @ApiProperty({ description: 'Unique identifier', format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Job role or title',
    example: 'Software Engineer',
  })
  @Column({ type: 'text' })
  role!: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'Acme Corp' })
  @Column({ type: 'text', nullable: true })
  company!: string | null;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'LK',
    default: 'LK',
  })
  @Column({ type: 'text', default: 'LK' })
  country!: string;

  @ApiPropertyOptional({ description: 'City name', example: 'Colombo' })
  @Column({ type: 'text', nullable: true })
  city!: string | null;

  @ApiProperty({ description: 'Gross salary amount', example: '150000.00' })
  @Column({ name: 'salary_amount', type: 'numeric', precision: 14, scale: 2 })
  salaryAmount!: string;

  @ApiProperty({
    description: 'ISO 4217 currency code',
    example: 'LKR',
    default: 'LKR',
  })
  @Column({ type: 'varchar', length: 3, default: 'LKR' })
  currency!: string;

  @ApiPropertyOptional({
    description: 'Years of professional experience',
    example: 3,
    minimum: 0,
    maximum: 60,
  })
  @Column({ name: 'experience_years', type: 'int', nullable: true })
  experienceYears!: number | null;

  @ApiPropertyOptional({
    description: 'Experience level',
    enum: ExperienceLevel,
  })
  @Column({
    name: 'experience_level',
    type: 'varchar',
    length: 20,
    enum: ExperienceLevel,
    nullable: true,
  })
  experienceLevel!: ExperienceLevel | null;

  @ApiPropertyOptional({
    description: 'Work arrangement type',
    enum: WorkType,
  })
  @Column({
    name: 'work_type',
    type: 'varchar',
    length: 10,
    enum: WorkType,
    nullable: true,
  })
  workType!: WorkType | null;

  @ApiProperty({
    description: 'Whether the submission has been anonymized',
    default: false,
  })
  @Column({ name: 'is_anonymized', type: 'boolean', default: false })
  isAnonymized!: boolean;

  @ApiProperty({
    description: 'Review status of the submission',
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  @Column({
    type: 'varchar',
    length: 10,
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  status!: SubmissionStatus;

  @ApiProperty({ description: 'Timestamp when the record was created' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp when the record was last updated' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
