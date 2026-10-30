'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import {
  LIMITS,
  loginSchema,
  otpVerifySchema,
} from '@/lib/validation/schemas';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';
import { homePathFor } from '@/lib/onboarding/routes';
import { AuthCardSkeleton } from '@/components/ui/skeleton';
import { LandingSectionLink } from '@/components/landing/landing-header';
import { getAuthErrorMessage } from '@/lib/auth/error-messages';
import { LoaderCircle } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const { signIn, verifyEmailCode, resendVerificationEmail, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const canSubmit = useMemo(() => Boolean(email.trim() && password), [email, password]);

  useEffect(() => {
    if (!authLoading && profile) {
      router.push(homePathFor(profile));
    }
  }, [authLoading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});
    setNeedsVerification(false);

    const parsed = loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
      return;
    }

    setLoading(true);

    try {
      try {
        await signIn(parsed.data.email, parsed.data.password);
        setLoading(false);
        // The profile effect routes to onboarding or the dashboard.
      } catch (signInError: unknown) {
        const err = signInError as { needsVerification?: boolean; message?: string; };
        const isVerificationNeeded =
          err?.needsVerification === true || err?.message === 'EMAIL_NOT_CONFIRMED';

        if (isVerificationNeeded) {
          setNeedsVerification(true);
          setLoading(false);
          setError('');
          return;
        }
        throw signInError;
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const parsed = otpVerifySchema.safeParse({ email, otp: verificationCode });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
      return;
    }

    setVerifyingCode(true);

    try {
      await verifyEmailCode(parsed.data.email, parsed.data.otp);
      // The profile effect sends the new promotoría to onboarding.
    } catch (err) {
      setError(getAuthErrorMessage(err, 'verification'));
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingEmail(true);
    setError('');
    setSuccess('');
    try {
      await resendVerificationEmail(email);
      setSuccess('¡Código de verificación enviado! Por favor revisa tu bandeja de entrada.');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'resend'));
    } finally {
      setResendingEmail(false);
    }
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <AuthCardSkeleton />
      </AuthLayout>
    );
  }

  if (profile) {
    return (
      <AuthLayout>
        <div role="status" aria-label="Preparando tu espacio de trabajo" className="flex w-full max-w-[420px] flex-col items-center gap-5">
          <div className="relative flex size-16 items-center justify-center rounded-full bg-(--lifeops-chrome)/85 shadow-sm">
            <LoaderCircle className="size-9 text-(--lifeops-accent) motion-safe:animate-spin" strokeWidth={1.6} aria-hidden />
            <span className="absolute size-2 rounded-full bg-(--lifeops-accent)" aria-hidden />
          </div>
          <span className="font-title text-xl tracking-[-0.04em] text-(--lifeops-fg)">
            <span className="font-normal">Life</span><span className="font-bold">Ops</span>
          </span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-[420px]">
        <div className="mb-10 flex flex-col items-start">
          <Link href="/" aria-label="LifeOps, inicio" className="inline-flex items-baseline tracking-[-0.04em] text-[38px] text-(--lifeops-fg)">
            <span className="font-title font-normal">Life</span>
            <span className="font-title font-bold">Ops</span>
          </Link>
          <p className="mt-4 text-sm font-medium text-(--lifeops-accent)">Acceso a LifeOps</p>
          <h1 className="mt-2 font-title text-2xl font-semibold tracking-[-0.035em] text-(--lifeops-fg) sm:text-[28px]">
            {needsVerification ? 'Confirma tu correo' : 'Inicia sesión'}
          </h1>
          <p className="mt-2 max-w-[36ch] text-sm leading-6 text-(--lifeops-muted)">
            {needsVerification
              ? 'Escribe el código que enviamos para continuar.'
              : 'Ingresa con tu correo electrónico y contraseña.'}
          </p>
        </div>

        <div className="rounded-2xl border border-(--lifeops-border)/70 bg-(--lifeops-chrome)/75 p-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 dark:border-(--lifeops-border) dark:bg-(--lifeops-chrome)/80">
          {needsVerification ? (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="space-y-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enviamos un código de 6 dígitos a
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white break-all">
                  {email}
                </p>
              </div>

              <FormField
                label="Código de verificación"
                htmlFor="verificationCode"
                variant="auth"
                error={fieldErrors.otp}
              >
                <Input
                  id="verificationCode"
                  type="text"
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(
                      e.target.value.replace(/\D/g, '').slice(0, LIMITS.otp.max),
                    )
                  }
                  required
                  maxLength={LIMITS.otp.max}
                  className="h-12 text-center text-2xl tracking-[0.35em] font-medium"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </FormField>

              {success && (
                <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
                  {success}
                </p>
              )}
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={verifyingCode || verificationCode.length !== LIMITS.otp.max}
                className="w-full h-11"
              >
                {verifyingCode ? 'Verificando…' : 'Verificar código'}
              </Button>

              <div className="flex flex-col items-center gap-2 text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={handleResendVerification}
                  disabled={resendingEmail}
                  className="h-auto p-0 text-sm"
                >
                  {resendingEmail ? 'Enviando…' : 'Reenviar código'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsVerification(false);
                    setVerificationCode('');
                    setError('');
                    setSuccess('');
                    setFieldErrors({});
                  }}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Usar otro correo
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <FormField
                label="Correo electrónico"
                htmlFor="email"
                variant="auth"
                error={fieldErrors.email}
              >
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={LIMITS.email}
                  autoComplete="email"
                  placeholder="tu.correo@ejemplo.com"
                />
              </FormField>

              <FormField
                label="Contraseña"
                htmlFor="password"
                variant="auth"
                error={fieldErrors.password}
              >
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={1}
                  maxLength={LIMITS.password.max}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </FormField>

              {error && (
                <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="brand"
                disabled={loading || !canSubmit}
                className="w-full h-11"
              >
                {loading ? 'Por favor espera…' : 'Iniciar sesión'}
              </Button>

            </form>
          )}
        </div>
        {!needsVerification && (
          <p className="mt-6 text-center text-sm leading-6 text-(--lifeops-muted)">
            El acceso se habilita por invitación. ¿Quieres conocer LifeOps?{' '}
            <LandingSectionLink targetId="contact" className="font-medium text-(--lifeops-accent) underline-offset-4 hover:underline">
              Solicita una demo
            </LandingSectionLink>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
