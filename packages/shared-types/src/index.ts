export type InstanceStatus =
  | "provisioning"
  | "running"
  | "disabled"
  | "stopped"
  | "error";

export type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type Provider = "telegram";

export type RunnerRegisterRequest = {
  instanceId: string;
  runnerSecret: string;
  runnerVersion?: string;
};

export type RunnerHeartbeatRequest = {
  runnerSecret: string;
  cpuPercent?: number;
  memoryMb?: number;
  requestsProcessed?: number;
};

export type RunnerExecuteRequest = {
  input: string;
  metadata?: Record<string, string>;
  timeoutMs?: number;
};

export type RunnerExecuteResponse = {
  requestId: string;
  output: string;
  exitCode: number;
  durationMs: number;
};

export type RunnerExecuteError = {
  requestId: string;
  error: string;
  message: string;
};

export type TelegramWebhookUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    date: number;
    chat: {
      id: number;
      type: string;
      username?: string;
      title?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

export type ApiError = {
  error: string;
  message: string;
  details?: Record<string, unknown>;
};
