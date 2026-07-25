import { apiClient } from './client';
import type { LookupItem, LookupItemFull, SlaPlanItem, SlaPlanItemFull } from '../types';

export const lookupsApi = {
  companies: () => apiClient.get<LookupItem[]>('/api/companies').then((r) => r.data),
  createCompany: (name: string, address?: string, contactInfo?: string) =>
    apiClient.post<LookupItem>('/api/companies', { name, address, contactInfo }).then((r) => r.data),

  departments: () => apiClient.get<LookupItem[]>('/api/departments').then((r) => r.data),
  departmentsAdmin: () =>
    apiClient.get<LookupItemFull[]>('/api/departments', { params: { includeInactive: true } }).then((r) => r.data),
  createDepartment: (name: string) => apiClient.post<LookupItemFull>('/api/departments', { name }).then((r) => r.data),
  updateDepartment: (id: string, name: string, isActive: boolean) =>
    apiClient.put<LookupItemFull>(`/api/departments/${id}`, { name, isActive }).then((r) => r.data),

  helpTopics: () => apiClient.get<LookupItem[]>('/api/help-topics').then((r) => r.data),
  helpTopicsAdmin: () =>
    apiClient.get<LookupItemFull[]>('/api/help-topics', { params: { includeInactive: true } }).then((r) => r.data),
  createHelpTopic: (name: string) => apiClient.post<LookupItemFull>('/api/help-topics', { name }).then((r) => r.data),
  updateHelpTopic: (id: string, name: string, isActive: boolean) =>
    apiClient.put<LookupItemFull>(`/api/help-topics/${id}`, { name, isActive }).then((r) => r.data),

  slaPlans: () => apiClient.get<SlaPlanItem[]>('/api/sla-plans').then((r) => r.data),
  slaPlansAdmin: () =>
    apiClient.get<SlaPlanItemFull[]>('/api/sla-plans', { params: { includeInactive: true } }).then((r) => r.data),
  createSlaPlan: (name: string, responseTimeHours: number, resolutionTimeHours: number) =>
    apiClient.post<SlaPlanItemFull>('/api/sla-plans', { name, responseTimeHours, resolutionTimeHours }).then((r) => r.data),
  updateSlaPlan: (id: string, name: string, responseTimeHours: number, resolutionTimeHours: number, isActive: boolean) =>
    apiClient
      .put<SlaPlanItemFull>(`/api/sla-plans/${id}`, { name, responseTimeHours, resolutionTimeHours, isActive })
      .then((r) => r.data),
};
