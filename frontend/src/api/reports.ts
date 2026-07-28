import { apiClient } from './client';
import type { BranchBreakdownEntryDto, LeaderboardEntryDto, ReportSummaryDto, TimeSeriesPointDto } from '../types';

export interface ReportParams {
  from?: string;
  to?: string;
  companyId?: string;
  agentId?: string;
  departmentId?: string;
}

export const reportsApi = {
  summary: (params: ReportParams) =>
    apiClient.get<ReportSummaryDto>('/api/reports/summary', { params }).then((r) => r.data),
  timeSeries: (params: ReportParams) =>
    apiClient.get<TimeSeriesPointDto[]>('/api/reports/timeseries', { params }).then((r) => r.data),
  leaderboard: (params: ReportParams) =>
    apiClient.get<LeaderboardEntryDto[]>('/api/reports/leaderboard', { params }).then((r) => r.data),
  byBranch: (params: { from?: string; to?: string }) =>
    apiClient.get<BranchBreakdownEntryDto[]>('/api/reports/by-branch', { params }).then((r) => r.data),

  /// Triggers a browser download of the filtered ticket list as CSV.
  exportCsv: async (params: ReportParams) => {
    const response = await apiClient.get('/api/reports/export', { params, responseType: 'blob' });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? 'tickets-export.csv';

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
