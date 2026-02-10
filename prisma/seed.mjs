import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const baseUrl = process.env.HOST_AGENT_URL;
  const capacityCpu = Number(process.env.HOST_CAPACITY_CPU);
  const capacityMemoryMb = Number(process.env.HOST_CAPACITY_MEMORY_MB);
  const name = process.env.HOST_NAME ?? "local";
  const region = process.env.HOST_REGION ?? "local";

  if (!baseUrl) {
    throw new Error("HOST_AGENT_URL is required to seed a host record");
  }
  if (!Number.isFinite(capacityCpu) || capacityCpu <= 0) {
    throw new Error("HOST_CAPACITY_CPU must be a positive number");
  }
  if (!Number.isFinite(capacityMemoryMb) || capacityMemoryMb <= 0) {
    throw new Error("HOST_CAPACITY_MEMORY_MB must be a positive number");
  }

  const existing = await prisma.host.findFirst({ where: { baseUrl } });
  if (existing) {
    await prisma.host.update({
      where: { id: existing.id },
      data: {
        name,
        region,
        capacityCpu,
        capacityMemoryMb,
        status: "active"
      }
    });
    return;
  }

  await prisma.host.create({
    data: {
      name,
      baseUrl,
      region,
      capacityCpu,
      capacityMemoryMb,
      status: "active"
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
