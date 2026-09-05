import { prisma } from "../src/lib/db.ts";
import { syncUser } from "../src/lib/sync.ts";

async function main() {
  const users = await prisma.user.findMany({ where: { snaptradeUserId: { not: null } }, select: { id: true, email: true } });
  for (const user of users) {
    const result = await syncUser(user.id, "cli");
    console.log(`${user.email}: ${result.accounts} account(s) synced${result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
