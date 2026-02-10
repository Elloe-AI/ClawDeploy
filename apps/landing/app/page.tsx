import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,76,129,0.35),_transparent_70%)] blur-3xl" />
        <div className="absolute top-16 right-[-5%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.35),_transparent_70%)] blur-3xl" />
      </div>
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold">
              CD
            </div>
            <div className="text-sm font-semibold">ClawDeploy</div>
          </div>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="#architecture" className="hover:text-foreground">Architecture</Link>
            <Link href="#workflow" className="hover:text-foreground">Workflow</Link>
            <Link href="#setup" className="hover:text-foreground">Setup</Link>
            <Link href="https://clawdeploy.co/login" className="rounded-md border border-border px-3 py-1.5 text-foreground">
              Control Plane
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Managed OpenClaw deployment
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Deploy OpenClaw with a control plane, runner fleet, and Telegram routing.
            </h1>
            <p className="text-base text-muted-foreground">
              ClawDeploy provisions runner containers on DigitalOcean droplets, routes messages through the control plane, and enforces billing and kill-switch policies.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="https://clawdeploy.co/signup"
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Create account
              </Link>
              <Link
                href="https://clawdeploy.co/instances"
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold"
              >
                Open control plane
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <div className="mb-3 text-xs font-semibold text-foreground">Runtime flow</div>
            <pre className="whitespace-pre-wrap leading-relaxed">
Telegram -> Control Plane -> Host Agent -> Runner -> OpenClaw
            </pre>
            <div className="mt-4 space-y-2">
              <div>Messaging: Telegram webhook to control plane.</div>
              <div>Execution: runner containers on droplet hosts.</div>
              <div>Response: control plane sends outbound Telegram messages.</div>
            </div>
          </div>
        </section>

        <section id="architecture" className="mt-16 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-sm font-semibold">Control Plane</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Next.js API and UI for authentication, instance lifecycle, billing enforcement, and message routing.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-sm font-semibold">Host Agent</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Service running on DigitalOcean droplets that provisions runner containers and manages their lifecycle.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-sm font-semibold">Runner</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Container that executes OpenClaw with bounded resources and returns structured output to the control plane.
            </p>
          </div>
        </section>

        <section id="workflow" className="mt-16">
          <h2 className="text-2xl font-semibold">Workflow</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <div className="text-sm font-semibold text-foreground">Provisioning</div>
              <ul className="mt-3 space-y-2">
                <li>1. User creates an instance in the control plane.</li>
                <li>2. Control plane selects a host and provisions a runner container.</li>
                <li>3. Runner registers and starts heartbeats.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <div className="text-sm font-semibold text-foreground">Messaging</div>
              <ul className="mt-3 space-y-2">
                <li>1. Telegram webhook hits the control plane.</li>
                <li>2. Control plane enforces rate limits and kill switch.</li>
                <li>3. Runner executes and returns output.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="setup" className="mt-16 rounded-xl border border-border bg-card p-6">
          <h2 className="text-2xl font-semibold">Setup targets</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm text-muted-foreground">
            <div>
              <div className="text-sm font-semibold text-foreground">Local</div>
              <ul className="mt-2 space-y-2">
                <li>- Run Postgres from docker compose.</li>
                <li>- Configure control plane env vars.</li>
                <li>- Start control plane and host agent.</li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Production</div>
              <ul className="mt-2 space-y-2">
                <li>- Deploy control plane with `CONTROL_PLANE_URL` set.</li>
                <li>- Run host agents on DigitalOcean droplets.</li>
                <li>- Provision runner containers per instance.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
