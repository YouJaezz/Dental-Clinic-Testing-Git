import { AdminPendingBadge } from "@/components/AdminPendingBadge";
import { useLocale } from "@/lib/use-locale";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/clinical-types";

type Props = {
  path: string;
  userRole: Role;
};

function linkClass(path: string, href: string, exact?: boolean) {
  const active = exact
    ? path === href
    : path === href || path.startsWith(`${href}/`);
  return cn(
    "clinic-nav-link",
    active ? "clinic-nav-link--active" : "clinic-nav-link--idle",
  );
}

export function AppShellNav(props: Props) {
  const { t } = useLocale();
  const { path, userRole } = props;
  const isAdminLike = userRole === "ADMIN_I" || userRole === "ADMIN_II";
  const canViewDailySales =
    userRole === "ADMIN_I" ||
    userRole === "ADMIN_II" ||
    userRole === "USER";

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Main">
      <a href="/patients" className={linkClass(path, "/patients", true)}>
        {t("nav.patients")}
      </a>
      <a href="/patients/intake-qr" className={linkClass(path, "/patients/intake-qr")}>
        {t("nav.registrationQr")}
      </a>
      <a href="/workspace" className={linkClass(path, "/workspace")}>
        {t("nav.workspace")}
      </a>
      <a href="/prescriptions" className={linkClass(path, "/prescriptions")}>
        {t("nav.prescriptions")}
      </a>
      <a href="/visits/ongoing" className={linkClass(path, "/visits/ongoing")}>
        {t("nav.ongoingVisits")}
      </a>
      {canViewDailySales ? (
        <a href="/sales" className={linkClass(path, "/sales")}>
          {t("nav.dailySales")}
        </a>
      ) : null}
      {isAdminLike ? (
        <a href="/analytics" className={linkClass(path, "/analytics")}>
          {t("nav.analytics")}
        </a>
      ) : null}
      {isAdminLike ? (
        <a href="/admin" className={linkClass(path, "/admin")}>
          {t("nav.administration")}
          <AdminPendingBadge />
        </a>
      ) : null}
      {isAdminLike ? (
        <a href="/admin/history" className={linkClass(path, "/admin/history")}>
          {t("nav.changeHistory")}
        </a>
      ) : null}
    </nav>
  );
}
