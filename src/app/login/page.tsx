'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { assets } from '../theme/assets';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import {
  LIMITS,
  loginSchema,
  otpVerifySchema,
  signupSchema,
} from '@/lib/validation/schemas';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const { signIn, signUp, verifyEmailCode, resendVerificationEmail, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (isSignUp && !name.trim()) return false;
    return true;
  }, [email, password, name, isSignUp]);

  useEffect(() => {
    if (!authLoading && profile) {
      router.push('/dashboard');
    }
  }, [authLoading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});
    setNeedsVerification(false);

    const parsed = isSignUp
      ? signupSchema.safeParse({ name, email, password })
      : loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const data = parsed.data as { name: string; email: string; password: string };
        const result = await signUp(data.email, data.password, 'promotory', data.name);

        if (result.needsEmailVerification) {
          setNeedsVerification(true);
          setLoading(false);
          return;
        }

        router.push('/dashboard');
      } else {
        const data = parsed.data as { email: string; password: string };
        try {
          await signIn(data.email, data.password);
          setLoading(false);
          router.push('/dashboard');
        } catch (signInError: unknown) {
          const err = signInError as { needsVerification?: boolean; message?: string };
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
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Ocurrió un error. Por favor intenta de nuevo.';
      setError(errorMessage);
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
      router.push('/dashboard');
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Código de verificación inválido. Por favor intenta de nuevo.';
      setError(errorMessage);
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
      const errorMessage =
        err instanceof Error ? err.message : 'Error al reenviar el código de verificación.';
      setError(errorMessage);
    } finally {
      setResendingEmail(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Cargando...</p>
        </div>
      </div>
    );
  }

  if (profile) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="text-4xl font-bold text-gray-900 dark:text-white">
            {assets.brand.name}
          </Link>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {needsVerification
              ? 'Verifica tu correo'
              : isSignUp
                ? 'Crea tu cuenta'
                : 'Inicia sesión en tu cuenta'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
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
              {isSignUp && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Los asesores deben ser invitados por una promotoría. Solo se pueden crear cuentas
                    de promotoría aquí.
                  </p>
                  <FormField
                    label="Nombre Completo"
                    htmlFor="name"
                    variant="auth"
                    error={fieldErrors.name}
                  >
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={LIMITS.personName}
                      autoCapitalize="words"
                      placeholder="Tu nombre"
                    />
                  </FormField>
                </>
              )}

              <FormField
                label="Correo Electrónico"
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
                  minLength={isSignUp ? LIMITS.password.min : 1}
                  maxLength={LIMITS.password.max}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                />
              </FormField>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Por favor espera...' : isSignUp ? 'Registrarse' : 'Iniciar Sesión'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError('');
                    setSuccess('');
                    setFieldErrors({});
                    setNeedsVerification(false);
                    setVerificationCode('');
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isSignUp
                    ? '¿Ya tienes una cuenta? Inicia sesión'
                    : '¿No tienes una cuenta? Regístrate'}
                </button>
                {!isSignUp && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    ¿Necesitas una cuenta? Contacta a tu promotoría para una invitación.
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
