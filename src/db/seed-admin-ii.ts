import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth-server";

const email = (
  process.env.SEED_ADMIN_II_EMAIL ?? "admin@clinic.local"
).trim().toLowerCase();
const password = process.env.SEED_ADMIN_II_PASSWORD ?? "admin123";

async function main() {
  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_II_EMAIL and SEED_ADMIN_II_PASSWORD, or use defaults.",
    );
    process.exit(1);
  }

  const adminII = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, "ADMIN_II"))
    .limit(1);

  if (adminII[0]) {
    console.log("Admin II already exists:", adminII[0].email);
    return;
  }

  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({ role: "ADMIN_II" })
      .where(eq(users.id, existing[0].id));
    console.log("Promoted existing user to Admin II:", email);
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash: hashPassword(password),
    role: "ADMIN_II",
  });
  console.log("Created Admin II user:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
