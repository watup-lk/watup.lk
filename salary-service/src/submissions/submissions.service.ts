import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';
import { SubmissionStatus } from './enums/submission-status.enum';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepository: Repository<Submission>,
  ) {}

  /**
   * Create a new salary submission.
   * 
   * @param createSubmissionDto 
   * @returns 
   */
  async create(createSubmissionDto: CreateSubmissionDto) {
    const submission = this.submissionRepository.create({
      role: createSubmissionDto.role.trim(),
      company: createSubmissionDto.company?.trim() || null,
      country: createSubmissionDto.country?.trim().toUpperCase() || 'LK',
      city: createSubmissionDto.city?.trim() || null,
      salaryAmount: createSubmissionDto.salaryAmount.toFixed(2),
      currency: createSubmissionDto.currency?.trim().toUpperCase() || 'LKR',
      experienceYears: createSubmissionDto.experienceYears ?? null,
      experienceLevel: createSubmissionDto.experienceLevel ?? null,
      workType: createSubmissionDto.workType ?? null,
      isAnonymized: createSubmissionDto.anonymize ?? false,
      status: SubmissionStatus.PENDING,
    });

    const saved = await this.submissionRepository.save(submission);

    return {
      id: saved.id,
      role: saved.role,
      company: saved.company,
      country: saved.country,
      city: saved.city,
      monthlySalaryLKR: Number(saved.salaryAmount),
      currency: saved.currency,
      yearsOfExperience: saved.experienceYears,
      experienceLevel: saved.experienceLevel,
      workType: saved.workType,
      anonymize: saved.isAnonymized,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }
}