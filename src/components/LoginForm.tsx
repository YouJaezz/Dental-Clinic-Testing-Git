import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      window.location.href = "/patients";
    } finally {
      setLoading(false);
    }
  }

  async function onForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotMessage(null);
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setForgotMessage(data.error ?? "Request failed");
        return;
      }
      setForgotMessage(
        data.message ??
          "If an account exists, the clinic administrator has been notified.",
      );
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <Card className="clinic-card w-full max-w-md shadow-md">
      <CardHeader>
        <CardTitle>Staff sign in</CardTitle>
        <CardDescription>Use your clinic account email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form id="login-form" onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setShowForgot((v) => !v);
                setForgotEmail(email);
                setForgotMessage(null);
              }}
            >
              {showForgot ? "Hide forgot password" : "Forgot password?"}
            </button>
          </div>
        </form>

        {showForgot ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Enter your account email. The clinic administrator will be
              notified and can reset your password.
            </p>
            <form onSubmit={onForgotSubmit} className="space-y-2">
              <Label htmlFor="forgot-email">Account email</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
              {forgotMessage ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {forgotMessage}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                disabled={forgotLoading}
              >
                {forgotLoading ? "Sending…" : "Request password reset"}
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button type="submit" form="login-form" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </CardFooter>
    </Card>
  );
}
