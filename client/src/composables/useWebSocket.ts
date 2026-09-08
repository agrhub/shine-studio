import { ref, shallowRef } from 'vue';
import { io, Socket } from 'socket.io-client';
import type { PatchEvent, Command, CollaboratorSession } from '@/types/api';

const socketRef = shallowRef<Socket | null>(null);
const isConnected = ref(false);
const activeCollaborators = ref<CollaboratorSession[]>([]);

function getWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

function getSocket(): Socket {
  if (socketRef.value) {
    if (!socketRef.value.connected && !socketRef.value.active) {
      socketRef.value.connect();
    }
    return socketRef.value;
  }

  const wsUrl = getWebSocketUrl();
  const socket = io(wsUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    isConnected.value = true;
    console.log('[useWebSocket] Connected to realtime server with ID:', socket.id);
  });

  socket.on('disconnect', () => {
    isConnected.value = false;
    console.log('[useWebSocket] Disconnected from realtime server');
  });

  socket.on('collaborator:update', (users: CollaboratorSession[]) => {
    activeCollaborators.value = users;
  });

  socketRef.value = socket;
  return socket;
}

export function useWebSocket() {
  // Ensure socket is created and listening
  const socket = getSocket();

  const connect = (seriesId?: string, user?: Partial<CollaboratorSession>) => {
    const s = getSocket();
    if (seriesId) {
      if (s.connected) {
        s.emit('join:series', { seriesId, user });
      } else {
        s.once('connect', () => {
          s.emit('join:series', { seriesId, user });
        });
      }
    }
  };

  const broadcastPatch = (seriesId: string, commands: Command[], sessionId: string = 'session-1', userId: string = 'user-1') => {
    const s = getSocket();
    if (!s || !s.connected) return;
    const event: PatchEvent = {
      user_id: userId,
      session_id: sessionId,
      series_id: seriesId,
      commands,
      timestamp: Date.now(),
    };
    s.emit('patch:broadcast', event);
  };

  const onPatchReceive = (callback: (event: PatchEvent) => void) => {
    const s = getSocket();
    s.off('patch:receive', callback);
    s.on('patch:receive', callback);
  };

  const onPipelineJobUpdated = (callback: (job: any) => void) => {
    const s = getSocket();
    s.off('pipeline_job:updated', callback);
    s.on('pipeline_job:updated', callback);
  };

  const onPipelineJobCompleted = (callback: (job: any) => void) => {
    const s = getSocket();
    s.off('pipeline_job:completed', callback);
    s.on('pipeline_job:completed', callback);
  };

  const onEpisodeUpdated = (callback: (episode: any) => void) => {
    const s = getSocket();
    s.off('episode:updated', callback);
    s.on('episode:updated', callback);
  };

  const onSeriesUpdated = (callback: (series: any) => void) => {
    const s = getSocket();
    s.off('series:updated', callback);
    s.on('series:updated', callback);
  };

  const onChatMessage = (callback: (data: { sessionId: string; message: any }) => void) => {
    const s = getSocket();
    s.off('chat:message', callback);
    s.on('chat:message', callback);
  };

  const disconnect = (seriesId?: string) => {
    if (socketRef.value) {
      if (seriesId) {
        socketRef.value.emit('leave:series', seriesId);
      }
    }
  };

  return {
    socket,
    isConnected,
    activeCollaborators,
    connect,
    broadcastPatch,
    onPatchReceive,
    onPipelineJobUpdated,
    onPipelineJobCompleted,
    onEpisodeUpdated,
    onSeriesUpdated,
    onChatMessage,
    disconnect,
  };
}
