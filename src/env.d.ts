/// <reference types="astro/client" />

import type { AppLocale, UserRole } from "@/db/schema";

interface ImportMetaEnv {
  readonly APP_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  namespace App {
    interface Locals {
      userId: string;
      userEmail: string;
      userRole: UserRole;
      userLocale: AppLocale;
    }
  }
}

export {};
