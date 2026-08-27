import { useEffect, useState } from "react";
import { getLocationSearch } from "@/lib/workspace-url";
import { useLocale } from "@/lib/use-locale";

const links = [
  { href: "/workspace", key: "workspace.overview" as const },
  { href: "/workspace/procedures", key: "workspace.procedures" as const },
  { href: "/workspace/record", key: "workspace.record" as const },
  { href: "/workspace/payment", key: "workspace.payment" as const },
] as const;

export function WorkspaceNav(props: { querySuffix?: string }) {
  const { t } = useLocale();
  const [suffix, setSuffix] = useState(
    () => props.querySuffix ?? getLocationSearch(),
  );

  useEffect(() => {
    if (props.querySuffix !== undefined) {
      setSuffix(props.querySuffix);
    }
  }, [props.querySuffix]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setSuffix(window.location.search);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("clinicalhub:query", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("clinicalhub:query", sync);
    };
  }, []);

  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const linkSuffix =
    typeof window !== "undefined" ? getLocationSearch() : suffix;

  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b pb-4"
      aria-label="Workspace sections"
    >
      {links.map(({ href, key }) => {
        const active =
          href === "/workspace"
            ? path === "/workspace"
            : path === href || path.startsWith(`${href}/`);
        return (
          <a
            key={href}
            href={`${href}${linkSuffix}`}
            className={
              active
                ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {t(key)}
          </a>
        );
      })}
    </nav>
  );
}
