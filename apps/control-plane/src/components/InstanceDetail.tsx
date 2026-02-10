"use client";

import { useEffect, useState } from "react";

type InstanceDetails = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  killEnabled: boolean;
  lastHeartbeatAt: string | null;
  cpuLimit: number;
  memoryLimitMb: number;
  runnerId: string | null;
  runnerPort: number | null;
  host: { name: string; baseUrl: string; region: string };
  channels: { id: string; provider: string; externalId: string }[];
};

type EventItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export default function InstanceDetail({ instanceId }: { instanceId: string }) {
  const [instance, setInstance] = useState<InstanceDetails | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [killLoading, setKillLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/instances/${instanceId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Failed to load instance");
        setLoading(false);
        return;
      }
      setInstance(payload.instance);
      setEvents(payload.events ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [instanceId]);

  async function connectTelegram() {
    setError(null);
    setConnectStatus(null);
    try {
      const response = await fetch(`/api/instances/${instanceId}/telegram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken, chatId })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Telegram connection failed");
        return;
      }
      setConnectStatus(`Telegram connected for chat ${payload.chatId}`);
      setBotToken("");
      setChatId("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function killInstance() {
    setKillLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/instances/${instanceId}/kill`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Kill switch failed");
        setKillLoading(false);
        return;
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setKillLoading(false);
    }
  }

  if (loading) {
    return <div className="card">Loading instance...</div>;
  }

  if (!instance) {
    return <div className="card">Instance not found.</div>;
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="section-title">Instance</div>
        <p>Name: {instance.name}</p>
        <p>Status: {instance.effectiveStatus}</p>
        <p>Kill switch: {instance.killEnabled ? "enabled" : "disabled"}</p>
        <p>Last heartbeat: {instance.lastHeartbeatAt ? new Date(instance.lastHeartbeatAt).toLocaleString() : "-"}</p>
        <p>Host: {instance.host.name} ({instance.host.region})</p>
        <p>CPU limit: {instance.cpuLimit}</p>
        <p>Memory limit: {instance.memoryLimitMb} MB</p>
        <button className="danger" onClick={killInstance} disabled={killLoading || instance.killEnabled}>
          {killLoading ? "Stopping..." : "Kill instance"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <div className="section-title">Connect Telegram</div>
        <div className="form-row">
          <label>Bot token</label>
          <input value={botToken} onChange={(event) => setBotToken(event.target.value)} />
        </div>
        <div className="form-row">
          <label>Chat ID</label>
          <input value={chatId} onChange={(event) => setChatId(event.target.value)} />
        </div>
        <button onClick={connectTelegram}>Connect</button>
        {connectStatus && <div className="success">{connectStatus}</div>}
      </div>

      <div className="card">
        <div className="section-title">Recent events</div>
        {events.length === 0 ? (
          <p>No events recorded.</p>
        ) : (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                {new Date(event.createdAt).toLocaleString()} - {event.type}: {event.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
