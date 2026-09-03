import { defineStore } from 'pinia';
import http from '@/utils/http';
import type { ViralTopic } from '@/types/api';

export const useTrendStore = defineStore('trend', {
  state: () => ({
    trends: [] as ViralTopic[],
    selectedRegion: 'United States',
    selectedTopic: null as ViralTopic | null,
    isLoading: false,
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 1,
  }),

  actions: {
    async fetchViralTopics(options: {
      country?: string;
      language?: string;
      page?: number;
      pageSize?: number;
      genre?: string;
      search?: string;
      refresh?: boolean;
    } | string = 'United States', languageArg?: string) {
      let country = 'United States';
      let language = 'en-US';
      let page = this.page;
      let pageSize = this.pageSize;
      let genre: string | undefined;
      let search: string | undefined;
      let refresh = false;

      if (typeof options === 'string') {
        country = options;
        if (languageArg) language = languageArg;
      } else if (options && typeof options === 'object') {
        country = options.country || this.selectedRegion;
        language = options.language || languageArg || 'en-US';
        page = options.page ?? this.page;
        pageSize = options.pageSize ?? this.pageSize;
        genre = options.genre;
        search = options.search;
        refresh = !!options.refresh;
      }

      this.selectedRegion = country;
      this.page = page;
      this.pageSize = pageSize;
      this.isLoading = true;

      try {
        let url = `/ai/trends/viral-topics?country=${encodeURIComponent(country)}&lang=${encodeURIComponent(language)}&page=${page}&pageSize=${pageSize}`;
        if (genre && genre !== 'All') url += `&genre=${encodeURIComponent(genre)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (refresh) url += `&forceRefresh=true`;

        const res = await http.get(url) as any;
        if (res.data) {
          this.trends = res.data;
          if (res.pagination) {
            this.total = res.pagination.total || res.data.length;
            this.totalPages = res.pagination.totalPages || 1;
          } else {
            this.total = res.data.length;
            this.totalPages = Math.ceil(this.total / pageSize) || 1;
          }
          if (this.trends.length > 0 && !this.selectedTopic) {
            this.selectedTopic = this.trends[0];
          }
        }
        return res.data;
      } finally {
        this.isLoading = false;
      }
    },

    selectTopic(topic: ViralTopic) {
      this.selectedTopic = topic;
    },
  },
});

