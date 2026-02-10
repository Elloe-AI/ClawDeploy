CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "InstanceStatus" AS ENUM ('provisioning', 'running', 'disabled', 'stopped', 'error');
CREATE TYPE "BillingStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE "Provider" AS ENUM ('telegram');
CREATE TYPE "HostStatus" AS ENUM ('active', 'draining', 'offline');

CREATE TABLE "Workspace" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "billingStatus" "BillingStatus" NOT NULL DEFAULT 'trialing',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "workspaceId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Host" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "status" "HostStatus" NOT NULL DEFAULT 'active',
  "capacityCpu" INTEGER NOT NULL,
  "capacityMemoryMb" INTEGER NOT NULL,
  "usedCpu" INTEGER NOT NULL DEFAULT 0,
  "usedMemoryMb" INTEGER NOT NULL DEFAULT 0,
  "lastHeartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Instance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "hostId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "InstanceStatus" NOT NULL DEFAULT 'provisioning',
  "runnerSecretHash" TEXT NOT NULL,
  "runnerSecretSalt" TEXT NOT NULL,
  "runnerId" TEXT,
  "runnerPort" INTEGER,
  "lastHeartbeatAt" TIMESTAMP(3),
  "killEnabled" BOOLEAN NOT NULL DEFAULT false,
  "cpuLimit" INTEGER NOT NULL DEFAULT 1,
  "memoryLimitMb" INTEGER NOT NULL DEFAULT 1024,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Channel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "instanceId" UUID NOT NULL,
  "provider" "Provider" NOT NULL,
  "externalId" TEXT NOT NULL,
  "botTokenEncrypted" TEXT NOT NULL,
  "webhookSecret" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "instanceId" UUID,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_ownerUserId_key" ON "Workspace"("ownerUserId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
CREATE INDEX "Workspace_billingStatus_idx" ON "Workspace"("billingStatus");
CREATE INDEX "Host_status_idx" ON "Host"("status");
CREATE INDEX "Instance_workspaceId_idx" ON "Instance"("workspaceId");
CREATE INDEX "Instance_hostId_idx" ON "Instance"("hostId");
CREATE INDEX "Instance_status_idx" ON "Instance"("status");
CREATE INDEX "Channel_instanceId_idx" ON "Channel"("instanceId");
CREATE INDEX "Channel_provider_externalId_idx" ON "Channel"("provider", "externalId");
CREATE INDEX "Event_workspaceId_idx" ON "Event"("workspaceId");
CREATE INDEX "Event_instanceId_idx" ON "Event"("instanceId");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
