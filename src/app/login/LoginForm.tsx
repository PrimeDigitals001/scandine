"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { unifiedLogin } from "./actions";
import type { LoginState } from "./types";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput, Field } from "@/components/ui/Input";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(unifiedLogin, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@cafe.com"
          required
          autoFocus
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        <p className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" variant="dark" size="lg" fullWidth loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
