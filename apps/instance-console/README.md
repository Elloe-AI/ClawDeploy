# Instance Console

The instance console is a frontend-only Next.js UI for ClawDeploy. It talks directly to the control plane API and does not run its own backend.

## Responsibilities

- authenticate with control plane session cookies
- list instances for the current workspace
- send execute requests to a selected instance
- upload and delete instance files
- manage instance resource selection

## API usage

- `GET /api/auth/me` session check
- `GET /api/instances` list instances
- `POST /api/instances/:id/execute` send input
- `GET /api/instances/:id/files` list files
- `POST /api/instances/:id/files` upload files
- `DELETE /api/instances/:id/files/:name` delete files
- `GET /api/instances/:id/resources` get selected resources
- `PUT /api/instances/:id/resources` update selected resources

All requests are sent to the control plane base URL.

## Environment variables

```env
NEXT_PUBLIC_CONTROL_PLANE_URL=http://localhost:3000
```

## Run locally

```bash
npm install
npm --workspace apps/instance-console run dev
```
