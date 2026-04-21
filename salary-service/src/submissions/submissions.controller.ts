import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { FindSubmissionsQueryDto } from './dto/find-submissions-query.dto';
import { Submission } from './entities/submission.entity';
import { SubmissionsService } from './submissions.service';

@ApiTags('salary-submissions')
@Controller('api/salary')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List approved salary submissions',
    description:
      'Returns all approved submissions. Supports optional filtering by role, country, experience level, work type, and currency.',
  })
  @ApiOkResponse({
    description: 'List of approved submissions.',
    type: [Submission],
  })
  async findAll(@Query() query: FindSubmissionsQueryDto) {
    return this.submissionsService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a salary entry',
    description: 'Creates a new salary submission pending review.',
  })
  @ApiCreatedResponse({
    description: 'Submission created successfully.',
    type: Submission,
  })
  async create(@Body() createSubmissionDto: CreateSubmissionDto) {
    return this.submissionsService.create(createSubmissionDto);
  }
}
