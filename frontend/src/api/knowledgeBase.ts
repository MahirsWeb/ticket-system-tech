import { apiClient } from './client';
import type { KnowledgeBaseSearchResultDto } from '../types';

export interface KnowledgeBaseAskResponse {
  answer: string;
  sources: KnowledgeBaseSearchResultDto[];
}

export const knowledgeBaseApi = {
  search: (query: string) =>
    apiClient
      .get<KnowledgeBaseSearchResultDto[]>('/api/knowledge-base/search', { params: { query } })
      .then((r) => r.data),

  ask: (question: string) =>
    apiClient.post<KnowledgeBaseAskResponse>('/api/knowledge-base/ask', { question }).then((r) => r.data),

  reindexAll: () => apiClient.post<{ indexed: number }>('/api/knowledge-base/reindex-all').then((r) => r.data),
};
