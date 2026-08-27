import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
      Sign out
    </Button>
  );
}
