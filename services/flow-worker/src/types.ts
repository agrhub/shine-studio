export type WorkerType = 'EXTENSION' | 'HEADLESS';

export type AccountStatus = 'READY' | 'BUSY' | 'QUOTA_EXCEEDED' | 'AUTH_REQUIRED' | 'OFFLINE';

export interface FlowAccountState {
  accountId: string;          // e.g. email or label
  label?: string;
  workerType: WorkerType;
  status: AccountStatus;
  hasFlowTab?: boolean;       // True if user currently has flow.google.com tab open
  projectId?: string;         // Current / default Google Flow project workspace ID
  projectUrl?: string;        // Full project URL (https://flow.google.com/project/<id>)
  projectSlots?: string[];    // FIFO list of all project IDs created by this account (oldest first)
  credits?: number;           // Remaining Flow credits (e.g. 150, 0)
  userPaygateTier?: string;   // e.g. 'PAYGATE_TIER_ONE', 'FREE'
  isQuotaExceeded?: boolean;  // True if out of credits
  totalCompletedJobs?: number;
  connectedAt?: number;
  lastActiveAt: number;
  lastVerifiedAt?: number;
  isVerified?: boolean;
  lastError?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  wsClient?: any;             // live WebSocket connection if EXTENSION
}

export interface FlowImageItem {
  name: string;
  url: string;
  mimeType?: string;
  base64?: string;
}

export interface GenerationJobRequest {
  jobId: string;
  type: 'image' | 'video';
  model?: string;
  resolvedModel?: string;     // Canonical Google Flow internal model name
  prompt: string;
  agentPrompt?: string;       // Formatted natural prompt instruction for Flow Agent
  aspectRatio?: string;       // '9:16' | '16:9' | '1:1' | '4:3' | '3:4'
  duration?: number;          // 4s, 5s, 6s, 8s, 10s
  resolution?: string;        // '720p' | '1080p' | '4k'
  seed?: number;
  mode?: 't2v' | 'i2v' | 'r2v' | 'interpolation' | 'extend' | 'upsample' | 't2i' | 'i2i';
  images?: Array<string | FlowImageItem>;          // List of reference / input images
  imageStart?: string | FlowImageItem;            // Starting frame (I2V / Interpolation)
  imageEnd?: string | FlowImageItem;              // Ending frame (Interpolation)
  referenceImages?: Array<string | FlowImageItem>; // Reference images (R2V / Character references)
  characterReferences?: Array<string | FlowImageItem>;
  imageInputs?: Array<string | FlowImageItem>;
  namedReferences?: Array<{ name: string; url: string; role?: string }>;
  projectId?: string;         // Target project ID if specified
  accountId?: string;         // Optional targeted account
  timeoutMs?: number;
  priority?: number;          // Queue priority (1 = high, 5 = normal)
  queuedAt?: number;
  n?: number;                 // Outputs count (1, 2, 3, 4)
}

export interface GenerationJobResult {
  jobId: string;
  status: 'SUCCESS' | 'FAILED' | 'QUEUED';
  mediaUrl?: string;
  base64Data?: string;
  mimeType?: string;
  error?: string;
  durationMs?: number;
  model?: string;
  mode?: string;
  queuePosition?: number;
  accountId?: string;
}

export interface FlowJobRecord {
  jobId: string;
  type: 'video' | 'image';
  model: string;
  mode?: string;
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  referenceImages?: Array<string | FlowImageItem>;
  imageStart?: string | FlowImageItem;
  imageEnd?: string | FlowImageItem;
  status: 'QUEUED' | 'BUSY' | 'SUCCESS' | 'FAILED';
  accountId?: string;
  accountLabel?: string;
  mediaUrl?: string;
  base64Data?: string;
  mimeType?: string;
  durationMs?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// WebSocket message protocols between Extension & Worker Server
export type ExtensionToWorkerMessage =
  | { type: 'REGISTER'; accountId: string; label?: string; projectId?: string; projectUrl?: string; cookies?: any[]; credits?: number; hasFlowTab?: boolean; status?: AccountStatus }
  | { type: 'HEARTBEAT'; accountId: string; status: AccountStatus; projectId?: string; projectUrl?: string; credits?: number; hasFlowTab?: boolean }
  | { type: 'TAB_STATUS'; accountId: string; hasFlowTab: boolean; status: AccountStatus; projectId?: string; projectUrl?: string; credits?: number }
  | { type: 'JOB_RESULT'; jobId: string; status: 'SUCCESS' | 'FAILED'; mediaUrl?: string; base64Data?: string; mimeType?: string; error?: string }
  | { type: 'CREDIT_UPDATE'; accountId: string; credits: number; isQuotaExceeded: boolean; reason?: string; requestId?: string; error?: string; userPaygateTier?: string }
  | { type: 'SYNC_PROJECT'; accountId: string; projectId: string; projectUrl?: string }
  | { type: 'SESSION_EXPIRED'; accountId: string; reason?: string }
  | { type: 'LOG'; level: string; message: string };

export type WorkerToExtensionMessage =
  | { type: 'REGISTERED'; success: boolean; message?: string }
  | { type: 'EXECUTE_JOB'; job: GenerationJobRequest }
  | { type: 'SET_PROJECT'; projectId: string; projectTitle?: string }    // Navigate extension to a specific project
  | { type: 'DELETE_PROJECT'; projectId: string }                        // Extension should delete an old project
  | { type: 'CHECK_CREDITS'; accountId?: string; requestId: string }     // Trigger extension to open flow tab & sync credits
  | { type: 'PING' };
