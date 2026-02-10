export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logInfo = (event: string, data?: Record<string, unknown>) => log("info", event, data);
export const logWarn = (event: string, data?: Record<string, unknown>) => log("warn", event, data);
export const logError = (event: string, data?: Record<string, unknown>) => log("error", event, data);
