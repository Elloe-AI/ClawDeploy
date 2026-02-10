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

  async function createInstance() {
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
      <button onClick={createInstance} disabled={creating}>
        {creating ? "Creating..." : "Create instance"}
      </button>
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
