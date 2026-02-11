"use client";

import { useEffect, useState } from "react";

type Instance = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  killEnabled: boolean;
  lastHeartbeatAt: string | null;
  host: { name: string; region: string };
};

export default function InstancesList() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [simmersAgentRef, setSimmersAgentRef] = useState<string | null>(null);
  const [simmersConfirmed, setSimmersConfirmed] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/instances", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Failed to load instances");
        setLoading(false);
        return;
      }
      setInstances(payload.instances ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const agent = params.get("agent");
    if (source === "simmers" && agent) {
      setSimmersAgentRef(agent);
    }
  }, []);

  async function createInstance() {
    if (simmersAgentRef && !simmersConfirmed) {
      setError("Confirm the Simmers agent reference before creating an instance.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Failed to create instance");
        setCreating(false);
        return;
      }
      setName("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card">
      <div className="section-title">Instances</div>
      <div className="form-row">
        <label>Instance name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <button onClick={createInstance} disabled={creating || (simmersAgentRef !== null && !simmersConfirmed)}>
        {creating ? "Creating..." : "Create instance"}
      </button>
      {simmersAgentRef ? (
        <div className="form-row">
          <p className="note">Simmers agent: {simmersAgentRef}</p>
          <label className="note">
            <input
              type="checkbox"
              checked={simmersConfirmed}
              onChange={(event) => setSimmersConfirmed(event.target.checked)}
            />{" "}
            I understand this agent runs remotely via Simmers.
          </label>
        </div>
      ) : null}
      <p className="note">Signal-only mode. No auto-trading. Kill switch always available.</p>
      <p className="note">Agents are run remotely via Simmers. ClawDeploy does not copy or alter agent logic.</p>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p>Loading instances...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Host</th>
              <th>Last heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td>
                  <a href={`/instances/${instance.id}`}>{instance.name}</a>
                </td>
                <td>{instance.effectiveStatus}</td>
                <td>
                  {instance.host.name} ({instance.host.region})
                </td>
                <td>{instance.lastHeartbeatAt ? new Date(instance.lastHeartbeatAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
