import { prisma } from "../src/lib/db.ts";
import { DEMO_PASSWORD, DEMO_USERS, seedDemo } from "../src/lib/demo.ts";

async function main() {
  await seedDemo();
  console.log("Demo data ready. Sign in with any of:");
  for (const user of DEMO_USERS) console.log(`  ${user.email}  /  ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
