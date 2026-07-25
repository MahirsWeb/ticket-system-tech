import { apiClient } from './client';
import type { KnowledgeBaseSearchResultDto } from '../types';

export const knowledgeBaseApi = {
  search: (query: string) =>
    apiClient
      .get<KnowledgeBaseSearchResultDto[]>('/api/knowledge-base/search', { params: { query } })
      .then((r) => r.data),
};
