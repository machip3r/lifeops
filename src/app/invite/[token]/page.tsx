'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { db, Token } from '@/lib/db';
import { LIMITS } from '@/lib/validation/schemas';

function BrandWordmark() {
  return (
    <span className="inline-flex items-baseline font-title tracking-[-0.04em] text-[38px] leading-none text-(--lifeops-fg)" aria-label="LifeOps">
      <span className="font-normal">Life</span><span className="font-bold">Ops</span>
    </span>
  );
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [tokenData, setTokenData] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadTokenData = useCallback(async () => {
    try {
      const data = await db.token.getTokenByValue(token);
      if (!data) {
        setError('Esta invitación no es válida o ya venció.');
        return;
      }
      if (data.type !== 'CONSULTANT_INVITATION') {
        setError('Esta invitación no corresponde a una cuenta de asesor.');
        return;
      }
      if (new Date(data.expires_at) < new Date()) {
        setError('Esta invitación venció. Solicita una nueva a tu promotoría.');
        return;
      }
      if (data.used_at || data.status === 'USED') {
        setError('Esta invitación ya fue utilizada.');
        return;
      }
      setTokenData(data);
    } catch {
      setError('No se pudo cargar la invitación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void Promise.resolve().then(loadTokenData);
  }, [loadTokenData, token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < LIMITS.password.min) {
      setError(`La contraseña debe tener al menos ${LIMITS.password.min} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Revisa ambas e inténtalo de nuevo.');
      return;
    }
    if (!tokenData) {
      setError('No encontramos los datos de tu invitación. Solicita un nuevo enlace.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo completar el registro.');
      }

      const email = typeof data.email === 'string'
        ? data.email
        : String(tokenData.metadata?.consultant_email || '');
      setSuccess(true);
      window.setTimeout(() => router.push(`/login?email=${encodeURIComponent(email)}`), 1800);
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout imageSide="left">
        <div role="status" aria-label="Validando invitación" className="flex w-full max-w-[420px] flex-col items-center gap-5">
          <LoaderCircle className="size-9 text-(--lifeops-accent) motion-safe:animate-spin" strokeWidth={1.6} aria-hidden />
          <BrandWordmark />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout imageSide="left">
      <div className="w-full max-w-[420px]">
        <header className="mb-9">
          <Link href="/" aria-label="LifeOps, inicio" className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--lifeops-accent)">
            <BrandWordmark />
          </Link>
          <p className="mt-5 text-sm font-medium text-(--lifeops-accent)">Acceso para asesores</p>
          <h1 className="mt-2 font-title text-2xl font-semibold tracking-[-0.035em] text-(--lifeops-fg) sm:text-[28px]">
            {success ? 'Cuenta lista' : tokenData ? 'Acepta tu invitación' : 'No pudimos validar la invitación'}
          </h1>
          <p className="mt-2 max-w-[38ch] text-sm leading-6 text-(--lifeops-muted)">
            {success
              ? 'Tu cuenta quedó creada. Te llevaremos al inicio de sesión.'
              : tokenData
                ? 'Crea una contraseña para entrar a LifeOps y consultar tu información.'
                : 'Pide a tu promotoría que te comparta un enlace de invitación vigente.'}
          </p>
        </header>

        {!tokenData ? (
          <div className="rounded-2xl border border-(--lifeops-border)/70 bg-(--lifeops-chrome)/75 p-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 dark:border-(--lifeops-border) dark:bg-(--lifeops-chrome)/80">
            <div role="alert" className="flex items-start gap-3 text-sm leading-6 text-(--lifeops-fg)">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              <p>{error || 'La invitación no está disponible.'}</p>
            </div>
            <Button asChild variant="brand" className="mt-6 w-full">
              <Link href="/login">Ir a iniciar sesión</Link>
            </Button>
          </div>
        ) : success ? (
          <div role="status" className="rounded-2xl border border-(--lifeops-border)/70 bg-(--lifeops-chrome)/75 p-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 dark:border-(--lifeops-border) dark:bg-(--lifeops-chrome)/80">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-(--lifeops-accent)" aria-hidden />
              <div>
                <p className="font-medium text-(--lifeops-fg)">Tu acceso está listo</p>
                <p className="mt-1 text-sm leading-6 text-(--lifeops-muted)">En unos segundos podrás iniciar sesión con tu correo y contraseña.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-(--lifeops-border)/70 bg-(--lifeops-chrome)/75 p-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 dark:border-(--lifeops-border) dark:bg-(--lifeops-chrome)/80">
            {tokenData.metadata && (
              <dl className="mb-6 space-y-3 border-b border-(--lifeops-border)/70 pb-5 text-sm">
                <div>
                  <dt className="text-(--lifeops-muted)">Correo de la invitación</dt>
                  <dd className="mt-1 break-all font-medium text-(--lifeops-fg)">{String(tokenData.metadata.consultant_email || '')}</dd>
                </div>
                <div>
                  <dt className="text-(--lifeops-muted)">Código de asesor</dt>
                  <dd className="mt-1 font-medium text-(--lifeops-fg)">{String(tokenData.metadata.consultant_code || '')}</dd>
                </div>
              </dl>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <FormField label="Contraseña" htmlFor="password" variant="auth" hint={`Al menos ${LIMITS.password.min} caracteres.`}>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={LIMITS.password.min}
                  maxLength={LIMITS.password.max}
                  autoComplete="new-password"
                  placeholder="Crea una contraseña"
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                />
              </FormField>

              <FormField label="Confirma tu contraseña" htmlFor="confirmPassword" variant="auth">
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={LIMITS.password.min}
                  maxLength={LIMITS.password.max}
                  autoComplete="new-password"
                  placeholder="Escríbela de nuevo"
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                />
              </FormField>

              {error && (
                <p role="alert" className="text-sm leading-5 text-red-700 dark:text-red-300">{error}</p>
              )}

              <Button type="submit" variant="brand" className="w-full" disabled={isSubmitting || !password || !confirmPassword}>
                {isSubmitting ? 'Creando tu cuenta…' : 'Crear cuenta'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-(--lifeops-muted)">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="font-medium text-(--lifeops-accent) underline-offset-4 hover:underline">Inicia sesión</Link>
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
