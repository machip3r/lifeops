/**
 * Browser Auth adapter — only place client code should call Supabase Auth.
 * UI / contexts import from here; do not call `supabase.auth.*` elsewhere.
 */
import { supabase } from "@/lib/supabase";
import type {
  AuthChangeEvent,
  Session,
  AuthError,
} from "@supabase/supabase-js";

export type AuthSessionResult = {
  session: Session | null;
  error: AuthError | null;
};

export async function getSession(): Promise<AuthSessionResult> {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session ?? null, error };
}

export async function getUser() {
  return supabase.auth.getUser();
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(opts: {
  email: string;
  password: string;
  emailRedirectTo?: string;
  data?: Record<string, unknown>;
}) {
  return supabase.auth.signUp({
    email: opts.email,
    password: opts.password,
    options: {
      emailRedirectTo: opts.emailRedirectTo,
      data: opts.data,
    },
  });
}

export async function verifyOtp(opts: {
  email: string;
  token: string;
  type: "signup" | "email" | "email_change";
}) {
  return supabase.auth.verifyOtp({
    email: opts.email,
    token: opts.token,
    type: opts.type,
  });
}

export async function resendOtp(opts: {
  email: string;
  type: "signup" | "email_change";
}) {
  return supabase.auth.resend({
    type: opts.type,
    email: opts.email,
  });
}

export async function signOut(scope: "global" | "local" | "others" = "global") {
  return supabase.auth.signOut({ scope });
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange(callback);
}
