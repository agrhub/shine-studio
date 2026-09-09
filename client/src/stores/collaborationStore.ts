import { defineStore } from 'pinia';
import { useWebSocket } from '@/composables/useWebSocket';
import { useTimelineStore } from '@/stores/timelineStore';
import type { CollaboratorSession, PatchEvent, Command } from '@/types/api';
import i18n from '@/i18n';
import { ElNotification } from 'element-plus';

import http from '@/utils/http';
import { toast } from 'vue-sonner';

export const useCollaborationStore = defineStore('collaboration', {
  state: () => ({
    seriesId: 'series-001',
    activeUsers: [] as CollaboratorSession[],
    teamMembersList: [] as any[],
    isLoadingTeam: false,
    isConnected: false,
    wsComposable: null as any,
  }),

  actions: {
    initCollaboration(seriesId: string) {
      this.seriesId = seriesId;
      const ws = useWebSocket();
      this.wsComposable = ws;

      ws.connect(seriesId, {
        user_id: `user-${Math.random().toString(36).substr(2, 5)}`,
        name: `Editor ${Math.floor(Math.random() * 100)}`,
      });

      this.isConnected = ws.isConnected.value;

      ws.onPatchReceive((event: PatchEvent) => {
        this.applyRemotePatch(event);
      });
    },

    applyRemotePatch(event: PatchEvent) {
      const timelineStore = useTimelineStore();
      if (event.commands && Array.isArray(event.commands)) {
        event.commands.forEach((cmd: Command) => {
          if (cmd.target_module === 'timeline') {
            if (cmd.type === 'MOVE_CLIP' || cmd.type === 'clip.update') {
              const startSec = cmd.payload.newStartTime ?? cmd.payload.startTime ?? 5;
              const durationSec = cmd.payload.duration ?? 5;
              timelineStore.clipUpdate(cmd.payload.clipId || 'clip-v1', {
                display: { from: startSec * 1_000_000, to: (startSec + durationSec) * 1_000_000 },
              });
            } else if (cmd.type === 'SPLIT_CLIP' || cmd.type === 'clip.split') {
              timelineStore.clipSplit(cmd.payload.clipId || 'clip-v1', cmd.payload.splitTime || 3.5);
            }
          }
        });
      }

      const toastMessage = i18n.global.t('toast.collaboratorJoined', { name: `Editor (${event.user_id.substring(0, 4)})` });
      ElNotification({
        title: 'Real-time Patch Received',
        message: toastMessage,
        type: 'info',
        duration: 3000,
      });
    },

    broadcastLocalPatch(commands: Command[]) {
      if (this.wsComposable) {
        this.wsComposable.broadcastPatch(this.seriesId, commands);
      }
    },

    async fetchTeamMembers() {
      this.isLoadingTeam = true;
      try {
        const res: any = await http.get('/admin/team-members');
        if (res?.data && Array.isArray(res.data)) {
          this.teamMembersList = res.data;
        }
        return this.teamMembersList;
      } catch (err) {
        console.error('Failed to load team members', err);
        return [];
      } finally {
        this.isLoadingTeam = false;
      }
    },

    async inviteMember(email: string, role: string) {
      if (!email.trim()) {
        toast.error(i18n.global.t('toast.enterEmail', 'Please enter an email'));
        return null;
      }
      try {
        const res: any = await http.post('/admin/team-members', { email, role });
        if (res?.data) {
          this.teamMembersList.push(res.data);
          toast.success(i18n.global.t('toast.teamMemberInvited', 'Team member invited successfully!'));
          return res.data;
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to invite team member');
        throw err;
      }
      return null;
    },
  },
});
