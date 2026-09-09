import { defineStore } from 'pinia';
import http from '@/utils/http';
import i18n from '@/i18n';
import { ElMessage } from 'element-plus';
import type { PlatformComment, PublishJob, SentimentAnalysisResult, SocialConnection } from '@/types/api';

export const usePublishStore = defineStore('publish', {
  state: () => ({
    activePublishJob: null as PublishJob | null,
    publishedJobs: [] as PublishJob[],
    coverVariants: [] as Array<{ id: string; url: string; title: string; score: number }>,
    publishing: false,
    generatingCover: false,
    platformProgress: {
      tiktok: 0,
      youtube: 0,
      instagram: 0,
      facebook: 0,
      douyin: 0,
    } as Record<string, number>,
    eventSource: null as EventSource | null,

    // Social Accounts & Engagement state
    connections: [] as SocialConnection[],
    isLoadingConnections: false,
    comments: [] as PlatformComment[],
    isLoadingComments: false,
    sentimentAnalysis: null as SentimentAnalysisResult | null,
    isAnalyzingSentiment: false,
  }),

  actions: {
    async fetchConnections() {
      this.isLoadingConnections = true;
      try {
        const res: any = await http.get('/social/connections');
        this.connections = res.data?.connections || res.connections || [];
        return this.connections;
      } catch (err) {
        console.warn('Failed to fetch social connections', err);
        return [];
      } finally {
        this.isLoadingConnections = false;
      }
    },

    async fetchComments(episode_id: string, platform?: string) {
      this.isLoadingComments = true;
      try {
        const res: any = await http.get('/engagement/comments', {
          params: { episode_id, platform },
        });
        this.comments = res.data?.data?.comments || res.data?.comments || [];
        return this.comments;
      } catch (err) {
        console.warn('Failed to fetch comments', err);
        this.comments = [];
        return [];
      } finally {
        this.isLoadingComments = false;
      }
    },

    async replyToComment(comment_id: string, platform: string, text: string) {
      try {
        const res: any = await http.post('/engagement/reply', {
          comment_id,
          platform,
          text,
        });
        ElMessage.success('Reply posted successfully');
        return res.data;
      } catch (err: any) {
        ElMessage.error(err?.response?.data?.error || err.message || 'Failed to post reply');
        throw err;
      }
    },

    async analyzeComments(episode_id: string, commentsList?: PlatformComment[]) {
      const targetComments = commentsList || this.comments;
      if (targetComments.length === 0) {
        ElMessage.warning('No comments available to analyze.');
        return null;
      }
      this.isAnalyzingSentiment = true;
      try {
        const res: any = await http.post('/engagement/analyze', {
          episode_id,
          comments: targetComments,
        });
        this.sentimentAnalysis = res.data?.data?.analysis || res.data?.analysis || null;
        ElMessage.success('Audience sentiment analyzed with Gemini');
        return this.sentimentAnalysis;
      } catch (err: any) {
        ElMessage.error(err?.response?.data?.message || 'Sentiment analysis failed');
        return null;
      } finally {
        this.isAnalyzingSentiment = false;
      }
    },

    async applyFeedbackToScript(series_id: string, target_episode_number: number = 2, custom_notes?: string) {
      try {
        const res: any = await http.post('/engagement/feedback-to-script', {
          series_id,
          target_episode_number,
          analysis: this.sentimentAnalysis,
          custom_notes,
        });
        ElMessage.success('Audience feedback incorporated into Episode script!');
        return res.data?.data;
      } catch (err: any) {
        ElMessage.error(err?.response?.data?.message || 'Failed to apply feedback to script');
        throw err;
      }
    },

    async publishEpisode(
      episode_id: string,
      platforms: ('tiktok' | 'youtube' | 'instagram' | 'facebook' | 'douyin')[],
      caption: string = '',
      hashtags: string[] = [],
      cover_url: string = '',
      series_id: string = 'series-001'
    ): Promise<PublishJob | null> {
      this.publishing = true;
      try {
        const startedMsg = i18n.global.t('toast.publishStarted', { platform: platforms.join(', ') });
        ElMessage.info(startedMsg);

        const res = await http.post('/publish/multi-platform', {
          episode_id,
          series_id,
          platforms,
          caption,
          hashtags,
          cover_url,
        });

        if (res.data && res.data.data) {
          const job: PublishJob = res.data.data;
          this.activePublishJob = job;
          this.publishedJobs.unshift(job);
          
          this.connectSse(job.id);
          return job;
        }
        return null;
      } catch (err: any) {
        console.error('Publish episode failed', err);
        const msg = err?.response?.data?.message || 'Failed to initiate publishing';
        ElMessage.error(msg);
        return null;
      } finally {
        this.publishing = false;
      }
    },

    connectSse(jobId: string) {
      if (this.eventSource) {
        this.eventSource.close();
      }
      const sseUrl = `${http.defaults.baseURL || '/api'}/render/stream?job_id=${encodeURIComponent(jobId)}`;
      const es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.current_platform && typeof data.progress === 'number') {
            this.platformProgress[data.current_platform] = data.progress;
          }
          if (data.status === 'published' || data.status === 'success' || data.status === 'completed') {
            if (this.activePublishJob) {
              this.activePublishJob.status = 'success';
              if (data.published_urls) {
                this.activePublishJob.published_urls = data.published_urls;
              }
            }
            const count = Object.keys(data.published_urls || {}).length || 1;
            ElMessage.success(i18n.global.t('toast.publishSuccess', { count }));
            es.close();
            this.eventSource = null;
          }
        } catch (e) {
          console.error('Error parsing SSE data', e);
        }
      };

      es.onerror = () => {
        es.close();
        this.eventSource = null;
      };

      this.eventSource = es;
    },

    async generateViralCover(episode_id: string) {
      this.generatingCover = true;
      try {
        const res = await http.post('/ai/viral-cover/generate', { episode_id });
        if (res.data && res.data.data) {
          this.coverVariants = res.data.data.variants || [];
          return this.coverVariants;
        }
        return [];
      } catch (err) {
        console.error('Failed to generate viral cover', err);
        return [];
      } finally {
        this.generatingCover = false;
      }
    },
    
    async bulkPublish(seriesId: string, episodeId: string, platforms: string[], options?: { caption?: string; hashtags?: string[] }) {
      this.publishing = true;
      try {
        const res: any = await http.post('/publish/multi-platform', {
          episodeId,
          seriesId,
          platforms,
          caption: options?.caption || '',
          hashtags: options?.hashtags || ['MicroDrama', 'ShineStudio'],
        });
        return res?.data;
      } finally {
        this.publishing = false;
      }
    },
  },
});
