import { apiClient } from './client';
import type { ClientLookupResult, CreatedUserResponse, UserListItemDto, UserRole } from '../types';

export const usersApi = {
  lookupByEmail: (email: string) =>
    apiClient.get<ClientLookupResult>('/api/users/lookup-by-email', { params: { email } }).then((r) => r.data),

  createEmployee: (firstName: string, lastName: string, email: string, role: UserRole, departmentId?: string) =>
    apiClient.post<CreatedUserResponse>('/api/users/employees', { firstName, lastName, email, role, departmentId: departmentId || null }).then((r) => r.data),

  createClient: (firstName: string, lastName: string, email: string, companyId: string) =>
    apiClient.post<CreatedUserResponse>('/api/users/clients', { firstName, lastName, email, companyId }).then((r) => r.data),

  regenerateTempPassword: (userId: string) =>
    apiClient.post<CreatedUserResponse>(`/api/users/${userId}/regenerate-temp-password`).then((r) => r.data),

  list: (params?: { role?: UserRole; companyId?: string; departmentId?: string }) =>
    apiClient.get<UserListItemDto[]>('/api/users', { params }).then((r) => r.data),

  setDepartment: (userId: string, departmentId: string | null) =>
    apiClient.patch(`/api/users/${userId}/department`, { departmentId }).then((r) => r.data),

  setMyPhone: (phoneNumber: string) => apiClient.patch('/api/users/me/phone', { phoneNumber }).then((r) => r.data),

  skipPhonePrompt: () => apiClient.post('/api/users/me/skip-phone-prompt').then((r) => r.data),
};
