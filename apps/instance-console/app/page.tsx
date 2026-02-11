"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import ChatInput from "@/components/chat-input";
import MarkdownMessage from "@/components/markdown-message";
import Link from "next/link";

const CONTROL_PLANE_URL = (process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "").replace(/\/$/, "");
const INSTANCE_STORAGE_KEY = "clawdeploy:instance-id";

type WorkspaceInfo = {
  id: string;
  name: string;
  billingStatus: string;
};

type UserInfo = {
  id: string;
  email: string;
};

type AuthPayload = {
  user: UserInfo;
  workspace: WorkspaceInfo;
};

type InstanceSummary = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  killEnabled: boolean;
  lastHeartbeatAt: string | null;
  host: {
    id: string;
    name: string;
    baseUrl: string;
    region: string;
  };
  channels: { id: string; provider: string; externalId: string }[];
  createdAt: string;
};

type FileItem = {
  name: string;
  size: number;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  meta?: {
    requestId?: string;
    durationMs?: number;
    isError?: boolean;
  };
};

function apiUrl(path: string) {
  if (!CONTROL_PLANE_URL) return path;
  return `${CONTROL_PLANE_URL}${path}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = value >= 10 || idx === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function uniqueList(items: string[]) {
  return Array.from(new Set(items));
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function InstanceConsole() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "ready" | "unauthorized" | "error"
  >("loading");
  const [authError, setAuthError] = useState<string | null>(null);

  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<"ready" | "submitted">(
    "ready"
  );
  const [chatError, setChatError] = useState<string | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resourcesSelected, setResourcesSelected] = useState<string[]>([]);
  const [resourcesSaved, setResourcesSaved] = useState<string[]>([]);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [simmersAgentRef, setSimmersAgentRef] = useState<string | null>(null);
  const [simmersConfirmed, setSimmersConfirmed] = useState(false);

  const selectedInstance = useMemo(() => {
    return instances.find((instance) => instance.id === selectedInstanceId) ?? null;
  }, [instances, selectedInstanceId]);

  const resourcesDirty = useMemo(() => {
    const a = [...resourcesSelected].sort().join("|");
    const b = [...resourcesSaved].sort().join("|");
    return a !== b;
  }, [resourcesSelected, resourcesSaved]);

  useEffect(() => {
    if (!CONTROL_PLANE_URL) return;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const source = params.get("source");
      const agent = params.get("agent");
      if (source === "simmers" && agent) {
        setSimmersAgentRef(agent);
      }
    }

    const loadAuth = async () => {
      setAuthStatus("loading");
      setAuthError(null);
      try {
        const response = await fetch(apiUrl("/api/auth/me"), {
          credentials: "include",
          cache: "no-store",
        });
        if (response.status === 401) {
          setAuthStatus("unauthorized");
          return;
        }
        const payload = (await response.json()) as AuthPayload & {
          message?: string;
        };
        if (!response.ok) {
          setAuthStatus("error");
          setAuthError(payload.message ?? "Failed to load session");
          return;
        }
        setAuth(payload);
        setAuthStatus("ready");
      } catch (error) {
        setAuthStatus("error");
        setAuthError((error as Error).message);
      }
    };

    const loadInstances = async () => {
      setInstancesLoading(true);
      setInstancesError(null);
      try {
        const response = await fetch(apiUrl("/api/instances"), {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          instances?: InstanceSummary[];
          message?: string;
        };
        if (!response.ok) {
          setInstancesError(payload.message ?? "Unable to load instances");
          setInstances([]);
          return;
        }
        setInstances(payload.instances ?? []);
      } catch (error) {
        setInstancesError((error as Error).message);
      } finally {
        setInstancesLoading(false);
      }
    };

    void loadAuth();
    void loadInstances();
  }, []);

  useEffect(() => {
    if (!instances.length) return;
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(INSTANCE_STORAGE_KEY)
        : null;
    const storedId = stored && instances.some((item) => item.id === stored) ? stored : "";
    const nextId = storedId || instances[0]?.id || "";
    setSelectedInstanceId(nextId);
  }, [instances]);

  useEffect(() => {
    if (!selectedInstanceId || typeof window === "undefined") return;
    window.localStorage.setItem(INSTANCE_STORAGE_KEY, selectedInstanceId);
    setMessages([]);
    void loadFilesAndResources(selectedInstanceId);
  }, [selectedInstanceId]);

  const loadFilesAndResources = async (instanceId: string) => {
    setFilesLoading(true);
    setFilesError(null);
    setResourceError(null);
    try {
      const [filesResponse, resourcesResponse] = await Promise.all([
        fetch(apiUrl(`/api/instances/${instanceId}/files`), {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(apiUrl(`/api/instances/${instanceId}/resources`), {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const filesPayload = (await filesResponse.json()) as {
        files?: FileItem[];
        message?: string;
      };
      if (!filesResponse.ok) {
        setFilesError(filesPayload.message ?? "Unable to load files");
        setFiles([]);
      } else {
        setFiles(filesPayload.files ?? []);
      }

      const resourcesPayload = (await resourcesResponse.json()) as {
        selected?: string[];
        message?: string;
      };
      if (!resourcesResponse.ok) {
        setResourceError(resourcesPayload.message ?? "Unable to load resources");
        setResourcesSelected([]);
        setResourcesSaved([]);
      } else {
        const selected = uniqueList(resourcesPayload.selected ?? []);
        setResourcesSelected(selected);
        setResourcesSaved(selected);
      }
    } catch (error) {
      setFilesError((error as Error).message);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleSend = async (text: string) => {
    if (!selectedInstanceId) return;
    setChatStatus("submitted");
    setChatError(null);

    const userMessage: ChatMessage = {
      id: newId("user"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch(
        apiUrl(`/api/instances/${selectedInstanceId}/execute`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ input: text }),
        }
      );
      const payload = (await response.json()) as {
        output?: string;
        requestId?: string;
        durationMs?: number;
        message?: string;
      };
      if (!response.ok) {
        const errorMessage = payload.message ?? "Execution failed";
        setMessages((prev) => [
          ...prev,
          {
            id: newId("assistant"),
            role: "assistant",
            content: errorMessage,
            createdAt: new Date().toISOString(),
            meta: { isError: true },
          },
        ]);
        return;
      }

      const output = typeof payload.output === "string" ? payload.output : "";
      setMessages((prev) => [
        ...prev,
        {
          id: newId("assistant"),
          role: "assistant",
          content: output || "No output returned.",
          createdAt: new Date().toISOString(),
          meta: {
            requestId: payload.requestId,
            durationMs: payload.durationMs,
          },
        },
      ]);
    } catch (error) {
      const message = (error as Error).message || "Execution failed";
      setChatError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: newId("assistant"),
          role: "assistant",
          content: message,
          createdAt: new Date().toISOString(),
          meta: { isError: true },
        },
      ]);
    } finally {
      setChatStatus("ready");
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedInstanceId) return;
    const list = event.target.files;
    if (!list || list.length === 0) return;

    setUploading(true);
    setFilesError(null);
    try {
      const formData = new FormData();
      Array.from(list).forEach((file) => formData.append("files", file));
      const response = await fetch(
        apiUrl(`/api/instances/${selectedInstanceId}/files`),
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setFilesError(payload.message ?? "Upload failed");
        return;
      }
      await loadFilesAndResources(selectedInstanceId);
    } catch (error) {
      setFilesError((error as Error).message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!selectedInstanceId) return;
    setFilesError(null);
    try {
      const response = await fetch(
        apiUrl(
          `/api/instances/${selectedInstanceId}/files/${encodeURIComponent(fileName)}`
        ),
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setFilesError(payload.message ?? "Delete failed");
        return;
      }
      await loadFilesAndResources(selectedInstanceId);
    } catch (error) {
      setFilesError((error as Error).message);
    }
  };

  const toggleResource = (name: string) => {
    setResourcesSelected((prev) => {
      if (prev.includes(name)) {
        return prev.filter((item) => item !== name);
      }
      return [...prev, name];
    });
  };

  const saveResources = async () => {
    if (!selectedInstanceId) return;
    setResourceSaving(true);
    setResourceError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/instances/${selectedInstanceId}/resources`),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ selected: resourcesSelected }),
        }
      );
      const payload = (await response.json()) as {
        selected?: string[];
        message?: string;
      };
      if (!response.ok) {
        setResourceError(payload.message ?? "Unable to save resources");
        return;
      }
      const selected = uniqueList(payload.selected ?? []);
      setResourcesSelected(selected);
      setResourcesSaved(selected);
    } catch (error) {
      setResourceError((error as Error).message);
    } finally {
      setResourceSaving(false);
    }
  };

  if (!CONTROL_PLANE_URL) {
    return (
      <div className="min-h-screen bg-background text-zinc-100">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/40 p-6">
            <div className="text-lg font-semibold">Missing configuration</div>
            <div className="mt-2 text-sm text-zinc-400">
              NEXT_PUBLIC_CONTROL_PLANE_URL is required to connect to the control plane.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-900/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-zinc-900/60 bg-black text-[11px] font-semibold text-zinc-200">
              CD
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium leading-tight">
                ClawDeploy Instance Console
              </div>
              <div className="truncate text-[11px] leading-tight text-zinc-400">
                Execute messages and manage instance files
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            {authStatus === "ready" && auth ? (
              <div className="hidden text-[11px] text-zinc-400 sm:block">
                {auth.workspace.name} · {auth.user.email}
              </div>
            ) : null}
            <Link
              href={`${CONTROL_PLANE_URL}/instances`}
              className="rounded-xl border border-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900/40"
            >
              Control plane
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-[calc(11rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">
        {authStatus === "unauthorized" ? (
          <div className="rounded-3xl border border-amber-900/60 bg-amber-950/30 p-6 text-sm text-amber-200">
            <div className="font-medium">Authentication required.</div>
            <div className="mt-2 text-xs text-amber-200/80">
              Sign in to ClawDeploy to access instance console.
            </div>
            <Link
              href={`${CONTROL_PLANE_URL}/login`}
              className="mt-4 inline-flex rounded-2xl bg-white px-4 py-2 text-xs font-medium text-zinc-950 shadow-sm hover:bg-zinc-200"
            >
              Sign in
            </Link>
          </div>
        ) : authStatus === "error" ? (
          <div className="rounded-3xl border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-300">
            {authError ?? "Unable to load session."}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/40 p-5 text-xs text-zinc-300">
              <div className="text-sm font-semibold text-zinc-100">Signal-only execution</div>
              <div className="mt-2 text-[11px] text-zinc-400">
                ClawDeploy runs agents safely. It does not place trades, hold funds, or modify strategies.
              </div>
              <div className="mt-2 text-[11px] text-zinc-400">
                Signal-only mode. No auto-trading. Kill switch always available in the control plane.
              </div>
              <div className="mt-2 text-[11px] text-zinc-400">
                Agents are run remotely via Simmers. ClawDeploy does not copy or alter agent logic.
              </div>
            </div>

            {simmersAgentRef ? (
              <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/40 p-5 text-xs text-zinc-300">
                <div className="text-sm font-semibold text-zinc-100">Simmers agent reference</div>
                <div className="mt-2 text-[11px] text-zinc-400">Agent: {simmersAgentRef}</div>
                <label className="mt-3 flex items-center gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={simmersConfirmed}
                    onChange={(event) => setSimmersConfirmed(event.target.checked)}
                  />
                  I understand this agent runs remotely via Simmers.
                </label>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-6">
              <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/40 p-5 shadow-sm">
                <div className="text-sm font-semibold">Instance</div>
                <div className="mt-3 space-y-3 text-xs text-zinc-300">
                  {instancesLoading ? (
                    <div>Loading instances...</div>
                  ) : instancesError ? (
                    <div className="text-red-300">{instancesError}</div>
                  ) : instances.length === 0 ? (
                    <div>
                      No instances available. Create one in the control plane.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-[11px] font-medium text-zinc-400">
                        Select instance
                      </label>
                      <select
                        value={selectedInstanceId}
                        onChange={(event) =>
                          setSelectedInstanceId(event.target.value)
                        }
                        className="w-full rounded-2xl border border-zinc-900/60 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-100 outline-none"
                      >
                        {instances.map((instance) => (
                          <option key={instance.id} value={instance.id}>
                            {instance.name} ({instance.effectiveStatus})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedInstance ? (
                    <div className="space-y-2 pt-2">
                      <div>
                        <span className="text-zinc-500">Status:</span>{" "}
                        {selectedInstance.effectiveStatus}
                      </div>
                      <div>
                        <span className="text-zinc-500">Heartbeat:</span>{" "}
                        {formatDate(selectedInstance.lastHeartbeatAt)}
                      </div>
                      <div>
                        <span className="text-zinc-500">Region:</span>{" "}
                        {selectedInstance.host.region}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/40 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Files</div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-900/60 px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-900/40">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={!selectedInstanceId || uploading}
                    />
                    {uploading ? "Uploading..." : "Upload"}
                  </label>
                </div>

                <div className="mt-3 space-y-3 text-xs text-zinc-300">
                  {filesLoading ? (
                    <div>Loading files...</div>
                  ) : filesError ? (
                    <div className="text-red-300">{filesError}</div>
                  ) : files.length === 0 ? (
                    <div>No files uploaded yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {files.map((file) => (
                        <div
                          key={file.name}
                          className="flex items-start gap-2 rounded-2xl border border-zinc-900/50 bg-black/30 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={resourcesSelected.includes(file.name)}
                            onChange={() => toggleResource(file.name)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-zinc-100">
                              {file.name}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {formatBytes(file.size)} · {formatDate(file.updatedAt)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(file.name)}
                            className="rounded-lg border border-zinc-900/60 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-900/40"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2">
                    <div className="text-[11px] text-zinc-500">
                      Knowledge base selection (checked files).
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveResources}
                        disabled={!resourcesDirty || resourceSaving}
                        className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-950 shadow-sm hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-400"
                      >
                        {resourceSaving ? "Saving..." : "Save selection"}
                      </button>
                      {resourceError ? (
                        <span className="text-[11px] text-red-300">
                          {resourceError}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <section className="flex min-h-[70vh] flex-col rounded-3xl border border-zinc-900/60 bg-zinc-950/30 p-5 shadow-sm">
              <div className="flex-1 space-y-4 overflow-y-auto pb-4">
                {messages.length === 0 ? (
                  <div className="rounded-3xl border border-zinc-900/60 p-4 text-sm text-zinc-400">
                    Send a message to the selected instance.
                  </div>
                ) : (
                  messages.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={message.id}
                        className={`flex w-full gap-3 ${isUser ? "justify-end" : ""}`}
                      >
                        {!isUser && (
                          <div className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-full border border-zinc-900/60 bg-black text-[10px] font-semibold text-zinc-200 shadow-sm sm:flex">
                            CD
                          </div>
                        )}
                        <div
                          className={`w-full ${isUser ? "max-w-[92%] sm:max-w-[80%]" : "max-w-full"}`}
                        >
                          <div
                            className={`rounded-3xl px-4 py-3 shadow-sm ${
                              message.meta?.isError
                                ? "border border-red-900/60 text-red-200"
                                : "border border-zinc-900/60 text-zinc-100"
                            } ${isUser ? "ml-auto" : ""}`}
                          >
                            <MarkdownMessage
                              content={message.content}
                              isAnimating={false}
                            />
                            {message.meta?.requestId ? (
                              <div className="mt-2 text-[10px] text-zinc-500">
                                Request {message.meta.requestId} · {message.meta.durationMs ?? "-"} ms
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {chatError ? (
                  <div className="text-xs text-red-300">{chatError}</div>
                ) : null}
              </div>

              <div className="border-t border-zinc-900/60 pt-4">
                <ChatInput
                  status={chatStatus}
                  onSubmit={handleSend}
                  inputDisabled={
                    !selectedInstanceId ||
                    authStatus !== "ready" ||
                    (simmersAgentRef !== null && !simmersConfirmed)
                  }
                  placeholder={
                    !selectedInstanceId
                      ? "Select an instance to start..."
                      : simmersAgentRef && !simmersConfirmed
                        ? "Confirm Simmers agent reference to send..."
                        : "Paste Polymarket market JSON to request a signal..."
                  }
                />
              </div>
            </section>
          </div>
          </div>
        )}
      </main>
    </div>
  );
}
