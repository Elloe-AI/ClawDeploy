# ClawDeploy Architecture (Frozen)

- Control plane owns all side effects (Telegram, routing, credentials).
- Runner executes only and has no external authority.
- Agents are remote (e.g., Simmers) and are never copied or modified.
- Polymarket integration is read-only and signal-only.
- No trading, no wallets, no custody.

Any change violating these rules is a breaking change.
