/**
 * Demo data for local development. Wipes the database first.
 * Run with: npm run db:seed
 *
 * All demo accounts use the password: clienthub-demo-2026
 */
import { fromDateOnly } from "../src/lib/dates.js";
import { hashPassword } from "../src/lib/password.js";
import { createPrismaClient } from "../src/lib/prisma.js";

try {
  process.loadEnvFile();
} catch {
  // Use variables from the environment.
}

const DEMO_PASSWORD = "clienthub-demo-2026";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const prisma = createPrismaClient(databaseUrl);

function inDays(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return fromDateOnly(date.toISOString().slice(0, 10));
}

async function main() {
  await prisma.$transaction([
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.session.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [owner, member, client] = await Promise.all(
    [
      { name: "Sofía Morales", email: "owner@clienthub.test" },
      { name: "Diego Herrera", email: "member@clienthub.test" },
      { name: "Carla Méndez", email: "client@clienthub.test" },
    ].map((user) => prisma.user.create({ data: { ...user, passwordHash } })),
  );
  if (!owner || !member || !client) throw new Error("Failed to create demo users");

  const organization = await prisma.organization.create({ data: { name: "Northwind Studio" } });
  const [, memberMembership, clientMembership] = await Promise.all([
    prisma.membership.create({
      data: { userId: owner.id, organizationId: organization.id, role: "OWNER" },
    }),
    prisma.membership.create({
      data: { userId: member.id, organizationId: organization.id, role: "MEMBER" },
    }),
    prisma.membership.create({
      data: { userId: client.id, organizationId: organization.id, role: "CLIENT" },
    }),
  ]);

  await prisma.project.create({
    data: {
      organizationId: organization.id,
      name: "Acme Corp website redesign",
      description: "New marketing site with a faster checkout flow and a blog.",
      clientMembershipId: clientMembership.id,
      tasks: {
        create: [
          { title: "Kick-off meeting and requirements", status: "DONE", dueDate: inDays(-10) },
          {
            title: "Wireframes for homepage and checkout",
            status: "DONE",
            assigneeMembershipId: memberMembership.id,
            dueDate: inDays(-3),
          },
          {
            title: "Build responsive homepage",
            status: "IN_PROGRESS",
            assigneeMembershipId: memberMembership.id,
            dueDate: inDays(4),
          },
          { title: "Set up analytics and Core Web Vitals monitoring", dueDate: inDays(9) },
          { title: "Content migration from the old site", dueDate: inDays(14) },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      organizationId: organization.id,
      name: "Internal brand refresh",
      description: "Update our own portfolio site and proposal templates.",
      status: "ON_HOLD",
      tasks: {
        create: [
          { title: "Collect feedback from past clients" },
          { title: "New logo exploration", assigneeMembershipId: memberMembership.id },
        ],
      },
    },
  });

  console.log("Seed complete. Demo accounts (password: %s):", DEMO_PASSWORD);
  console.log("  owner@clienthub.test   → OWNER");
  console.log("  member@clienthub.test  → MEMBER");
  console.log("  client@clienthub.test  → CLIENT (sees only the Acme project)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
