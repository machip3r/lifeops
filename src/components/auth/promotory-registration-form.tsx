'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { LIMITS } from '@/lib/validation/schemas';
import { useAuth } from '@/contexts/auth-context';

export function PromotoryRegistrationForm({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [autoLoginError, setAutoLoginError] = useState(false);
  const { signIn } = useAuth();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch('/api/promotory-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'No se pudo completar el registro.');
        setFieldErrors(result.fieldErrors || {});
        return;
      }
      setAccountCreated(true);
      try {
        await signIn(email.trim().toLowerCase(), password);
      } catch (signInError) {
        console.error('Automatic sign-in after promotoría registration failed:', signInError);
        setAutoLoginError(true);
      }
    } catch {
      setError('No se pudo completar el registro. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (accountCreated && !autoLoginError) {
    return (
      <div className="space-y-4 text-center" role="status">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tu cuenta está lista</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">Iniciando sesión para continuar con el registro de tu promotoría…</p>
      </div>
    );
  }

  if (accountCreated && autoLoginError) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tu cuenta está lista</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">No pudimos iniciar sesión automáticamente. Entra con el correo y la contraseña que acabas de registrar.</p>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-md bg-(--lifeops-accent) px-4 text-sm font-semibold text-gray-900 hover:opacity-90">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Regístrate como promotoría para empezar a usar LifeOps.</p>
      </div>
      <FormField label="Correo electrónico" htmlFor="registration-email" variant="auth" error={fieldErrors.email}>
        <Input id="registration-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={LIMITS.email} autoComplete="email" required placeholder="tu.correo@ejemplo.com" />
      </FormField>
      <FormField label="Contraseña" htmlFor="registration-password" variant="auth" error={fieldErrors.password}>
        <PasswordInput id="registration-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={LIMITS.password.min} maxLength={LIMITS.password.max} autoComplete="new-password" required placeholder="••••••••" />
      </FormField>
      {error ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
      <Button type="submit" variant="brand" className="h-11 w-full" disabled={submitting || !email.trim() || password.length < LIMITS.password.min}>
        {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
