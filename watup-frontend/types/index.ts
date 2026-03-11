// ── Core enums ────────────────────────────────────────────────────────────
export type ExperienceLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
export type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type WorkType = 'Remote' | 'Hybrid' | 'Onsite';
export type VoteFilter = 'all' | 'needs-vote' | 'recently-approved' | 'reported';
export type VoteResult = 'approved' | 'flagged' | 'pending';
export type K8sStatus = 'healthy' | 'degraded' | 'down';

// ── Salary submission ─────────────────────────────────────────────────────
export interface SalarySubmission {
  id: string;
  company: string;
  role: string;
  experienceLevel: ExperienceLevel;
  yearsOfExperience: number;
  monthlySalaryLKR: number;
  country: string;
  city?: string;
  currency: string;
  workType?: WorkType;
  status: SubmissionStatus;
  anonymize: boolean;
  upvotes: number;
  downvotes: number;
  createdAt: string;
}

export interface SearchResult extends SalarySubmission {
  votes: number;
}

// ── Search & filters ──────────────────────────────────────────────────────
export interface SearchFilters {
  country?: string;
  company?: string;
  role?: string;
  experienceLevel?: ExperienceLevel;
  query?: string;
}

// ── Stats & analytics ─────────────────────────────────────────────────────
export interface StatsResult {
  role: string;
  country: string;
  count: number;
  averageSalaryLKR: number;
  medianSalaryLKR: number;
  p25SalaryLKR: number;
  p75SalaryLKR: number;
}

export interface SalaryTrend {
  month: string;
  medianLKR: number;
}

export interface ExperienceBreakdown {
  level: ExperienceLevel;
  label: string;
  percentage: number;
  color: string;
}

export interface AnalyticsFilters {
  country?: string;
  role?: string;
  year?: number;
}

export interface AnalyticsData {
  medianSalaryLKR: number;
  p25SalaryLKR: number;
  p75SalaryLKR: number;
  approvedEntries: number;
  approvedEntriesChange: number;
  medianChange: number;
  byRole: StatsResult[];
  trend: SalaryTrend[];
  byExperience: ExperienceBreakdown[];
}

// ── Auth ──────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  token: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export interface VoteHistoryItem {
  id: string;
  role: string;
  timestamp: string;
  result: VoteResult;
}

export interface PendingSubmission {
  id: string;
  role: string;
  company: string;
  monthlySalaryLKR: number;
  votesFor: number;
  votesAgainst: number;
  votesRequired: number;
}

export interface RecentlyApprovedSalary {
  id: string;
  role: string;
  monthlySalaryLKR: number;
  experienceLevel: ExperienceLevel;
  companyType: string;
}

export interface DashboardData {
  votesCast: number;
  votesCastChange: number;
  reportsFiled: number;
  communityScore: number;
  communityScoreChange: number;
  avgSalaryLKR: number;
  avgSalaryChange: number;
  pendingSubmissions: PendingSubmission[];
  voteHistory: VoteHistoryItem[];
  recentlyApproved: RecentlyApprovedSalary[];
}

// ── Admin ─────────────────────────────────────────────────────────────────
export interface K8sService {
  name: string;
  type: string;
  cpuPercent: number;
  memoryMB: number;
  status: K8sStatus;
}

export interface KafkaTopic {
  name: string;
  offset: number;
  lag: number;
  ratePerMin: number;
}

export interface ModerationItem {
  id: string;
  role: string;
  monthlySalaryLKR: number;
  reason: string;
}

export interface ServiceMetricPoint {
  time: number;
  requestsPerMin: number;
  p95Latency: number;
  errorRate: number;
}

export interface AdminData {
  totalUsers: number;
  totalUsersChange: number;
  pendingReview: number;
  approvedEntries: number;
  approvedEntriesChange: number;
  reportsQueue: number;
  k8sServices: K8sService[];
  kafkaTopics: KafkaTopic[];
  metrics: ServiceMetricPoint[];
  moderationQueue: ModerationItem[];
}

// ── Errors ────────────────────────────────────────────────────────────────
export interface ApiError {
  message: string;
  statusCode: number;
}
