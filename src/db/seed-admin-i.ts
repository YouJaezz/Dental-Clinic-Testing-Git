import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth-server";

const email = (
  process.env.SEED_ADMIN_I_EMAIL ?? "admin-i@clinic.local"
).trim().toLowerCase();
const password = process.env.SEED_ADMIN_I_PASSWORD ?? "admin123";

async function main() {
  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_I_EMAIL and SEED_ADMIN_I_PASSWORD, or use defaults.",
    );
    process.exit(1);
  }

  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    if (existing[0].role === "ADMIN_I") {
      console.log("Admin I already exists:", email);
      return;
    }
    await db
      .update(users)
      .set({ role: "ADMIN_I" })
      .where(eq(users.id, existing[0].id));
    console.log("Promoted existing user to Admin I:", email);
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash: hashPassword(password),
    role: "ADMIN_I",
  });
  console.log("Created Admin I user:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
