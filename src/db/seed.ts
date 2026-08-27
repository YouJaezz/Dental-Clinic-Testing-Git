import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { procedureCatalog, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth-server";

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;

async function main() {
  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the environment before running db:seed.",
    );
    process.exit(1);
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      email,
      passwordHash: hashPassword(password),
      role: "ADMIN_I",
    });
    console.log("Created admin user:", email);
  } else {
    console.log("Admin user already exists:", email);
  }

  const catalog = [
    { code: "CONSULT", name: "Consultation", unitPriceCents: 15000 },
    { code: "FOLLOW", name: "Follow-up visit", unitPriceCents: 8500 },
    { code: "LAB", name: "Basic lab panel", unitPriceCents: 12000 },
  ];

  for (const row of catalog) {
    const found = await db
      .select({ id: procedureCatalog.id })
      .from(procedureCatalog)
      .where(eq(procedureCatalog.code, row.code))
      .limit(1);
    if (found.length === 0) {
      await db.insert(procedureCatalog).values({
        code: row.code,
        name: row.name,
        unitPriceCents: row.unitPriceCents,
        pricingMode: "FIXED",
        levelPricesJson: null,
        active: true,
      });
      console.log("Seeded catalog:", row.code);
    }
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
