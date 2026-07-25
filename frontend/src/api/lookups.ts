import { apiClient } from './client';
import type { LookupItem, SlaPlanItem } from '../types';

export const lookupsApi = {
  companies: () => apiClient.get<LookupItem[]>('/api/companies').then((r) => r.data),
  createCompany: (name: string, address?: string, contactInfo?: string) =>
    apiClient.post<LookupItem>('/api/companies', { name, address, contactInfo }).then((r) => r.data),
  departments: () => apiClient.get<LookupItem[]>('/api/departments').then((r) => r.data),
  helpTopics: () => apiClient.get<LookupItem[]>('/api/help-topics').then((r) => r.data),
  slaPlans: () => apiClient.get<SlaPlanItem[]>('/api/sla-plans').then((r) => r.data),
};
