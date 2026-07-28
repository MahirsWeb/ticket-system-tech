export type UserRole = 'Admin' | 'Consultant' | 'SupportAgent' | 'Client';

export type TicketStatus = 'New' | 'Open' | 'InProgress' | 'Resolved' | 'Closed';

export type TicketSource = 'Phone' | 'Email' | 'TicketSystem' | 'Other';

export type MessageType = 'Response' | 'InternalNote';

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  phoneNumber: string | null;
  phoneNumberPrompted: boolean;
  departmentId: string | null;
  departmentName: string | null;
}

export interface LoginResponse {
  requiresPasswordChange: boolean;
  accessToken: string | null;
  expiresAtUtc: string | null;
  user: UserSummary | null;
}

export interface LookupItem {
  id: string;
  name: string;
}

export interface SlaPlanItem extends LookupItem {
  responseTimeHours: number;
  resolutionTimeHours: number;
}

export interface LookupItemFull {
  id: string;
  name: string;
  isActive: boolean;
}

export interface DepartmentItemFull {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface SlaPlanItemFull {
  id: string;
  name: string;
  responseTimeHours: number;
  resolutionTimeHours: number;
  isActive: boolean;
}

export interface ClientLookupResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  companyId: string | null;
  companyName: string | null;
}

export interface KnowledgeBaseSearchResultDto {
  ticketId: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  closedAtUtc: string | null;
  resolutionSummary: string | null;
  matchScore: number;
}

export interface TicketAttachmentDto {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  contentType: string;
  createdAt: string;
}

export interface TicketMessageDto {
  id: string;
  type: MessageType;
  bodyHtml: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  attachments: TicketAttachmentDto[];
}

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  companyName: string;
  clientName: string;
  assignedToName: string | null;
  createdAt: string;
  dueDateUtc: string | null;
  closedAtUtc: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface TicketDetailDto {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  clientId: string;
  clientName: string;
  companyId: string;
  companyName: string;
  source: TicketSource | null;
  helpTopicId: string | null;
  helpTopicName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  slaPlanId: string | null;
  slaPlanName: string | null;
  dueDateUtc: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  openedAtUtc: string | null;
  closedAtUtc: string | null;
  resolutionSummary: string | null;
  technicalNotes: string | null;
  createdAt: string;
  attachments: TicketAttachmentDto[];
  messages: TicketMessageDto[];
}

export interface CreatedUserResponse {
  userId: string;
  email: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAtUtc: string;
}

export interface UserListItemDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  companyName: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  emailConfirmed: boolean;
  createdAtUtc: string;
  departmentId: string | null;
  departmentName: string | null;
}

export interface ReportSummaryDto {
  totalNew: number;
  totalOpen: number;
  totalClosed: number;
  avgResolutionHours: number;
  slaComplianceRate: number;
}

export interface TimeSeriesPointDto {
  date: string;
  opened: number;
  closed: number;
}

export interface LeaderboardEntryDto {
  userId: string;
  name: string;
  closedCount: number;
}

export interface BranchBreakdownEntryDto {
  departmentId: string;
  departmentName: string;
  totalNew: number;
  totalOpen: number;
  totalClosed: number;
}
