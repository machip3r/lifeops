'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { assets } from '../theme/assets';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const { signIn, signUp, verifyEmailCode, resendVerificationEmail, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect if already logged in (only if we have a profile, not just a session)
  useEffect(() => {
    if (!authLoading && profile) {
      router.push('/dashboard');
    }
  }, [authLoading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setLoading(true);

    try {
      if (isSignUp) {
        // Only promotory can sign up (consultants must be invited)
        const result = await signUp(email, password, 'promotory', name);

        if (result.needsEmailVerification) {
          setNeedsVerification(true);
          setLoading(false);
          return;
        }

        // If no email verification needed, redirect
        router.push('/dashboard');
      } else {
        try {
          await signIn(email, password);

          // Clear loading state immediately after successful sign in
          setLoading(false);

          // Redirect immediately - session is set, profile will load in background
          router.push('/dashboard');
        } catch (signInError: any) {
          // Only show verification flow when auth context explicitly set this (e.g. Supabase email not confirmed).
          // Do not infer from generic error messages — wrong password must show as login error.
          const isVerificationNeeded =
            signInError?.needsVerification === true ||
            signInError?.message === 'EMAIL_NOT_CONFIRMED';

          if (isVerificationNeeded) {
            setNeedsVerification(true);
            setLoading(false);
            // Clear any error message since we're showing verification UI
            setError('');
            return;
          }
          throw signInError;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error. Por favor intenta de nuevo.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifyingCode(true);

    try {
      await verifyEmailCode(email, verificationCode);

      // Redirect to dashboard - layout will handle role-based routing
      router.push('/dashboard');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Código de verificación inválido. Por favor intenta de nuevo.';
      setError(errorMessage);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingEmail(true);
    setError('');
    try {
      await resendVerificationEmail(email);
      setError('');
      alert('¡Código de verificación enviado! Por favor revisa tu bandeja de entrada.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al reenviar el código de verificación.';
      setError(errorMessage);
    } finally {
      setResendingEmail(false);
    }
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Cargando...</p>
        </div>
      </div>
    );
  }

  // Don't render login form if already authenticated with profile (redirect will happen)
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
            {isSignUp ? 'Crea tu cuenta' : 'Inicia sesión en tu cuenta'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {/* Show verification form OR login/signup form */}
          {needsVerification ? (
            <div className="space-y-6">
              {/* Email Verification Code Input */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                  Hemos enviado un código de verificación a <strong>{email}</strong>. Por favor ingresa el código a continuación para verificar tu cuenta.
                </p>
                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div>
                    <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Código de Verificación
                    </label>
                    <input
                      id="verificationCode"
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                      placeholder="000000"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={verifyingCode || verificationCode.length !== 6}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyingCode ? 'Verificando...' : 'Verificar Código'}
                  </button>
                </form>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingEmail}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {resendingEmail ? 'Enviando...' : '¿No recibiste el código? Reenviar'}
                  </button>
                </div>
              </div>
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name (only for sign up) */}
              {isSignUp && (
                <>
                  <div>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                      Los consultores deben ser invitados por una oficina. Solo se pueden crear cuentas de oficina aquí.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre Completo
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Tu nombre"
                    />
                  </div>
                </>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Correo Electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Por favor espera...' : isSignUp ? 'Registrarse' : 'Iniciar Sesión'}
              </button>

              {/* Toggle Sign Up/Sign In */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError('');
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
                    ¿Necesitas una cuenta? Contacta a tu oficina para una invitación.
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

