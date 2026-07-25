import { apiClient } from './client';
import type { LeaderboardEntryDto, ReportSummaryDto, TimeSeriesPointDto } from '../types';

export interface ReportParams {
  from?: string;
  to?: string;
  companyId?: string;
  agentId?: string;
}

export const reportsApi = {
  summary: (params: ReportParams) =>
    apiClient.get<ReportSummaryDto>('/api/reports/summary', { params }).then((r) => r.data),
  timeSeries: (params: ReportParams) =>
    apiClient.get<TimeSeriesPointDto[]>('/api/reports/timeseries', { params }).then((r) => r.data),
  leaderboard: (params: ReportParams) =>
    apiClient.get<LeaderboardEntryDto[]>('/api/reports/leaderboard', { params }).then((r) => r.data),
};
