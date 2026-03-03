'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { db, Token } from '@/lib/db';
import Link from 'next/link';
import { assets } from '@/app/theme/assets';

export default function InvitePage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;

    const [tokenData, setTokenData] = useState<Token | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (token) {
            loadTokenData();
        }
    }, [token]);

    const loadTokenData = async () => {
        try {
            const data = await db.token.getTokenByValue(token);

            if (!data) {
                setError('Token de invitación no válido o expirado');
                setLoading(false);
                return;
            }

            // Check if token is for consultant invitation
            if (data.type !== 'CONSULTANT_INVITATION') {
                setError('Token de invitación no válido');
                setLoading(false);
                return;
            }

            // Check if token is expired
            if (new Date(data.expires_at) < new Date()) {
                setError('Este token de invitación ha expirado. Por favor, solicita una nueva invitación.');
                setLoading(false);
                return;
            }

            // Check if token is already used
            if (data.used_at || data.status === 'USED') {
                setError('Este token de invitación ya ha sido utilizado.');
                setLoading(false);
                return;
            }

            setTokenData(data);
        } catch (error: any) {
            console.error('Error loading token:', error);
            setError('Error al cargar la invitación. Por favor, intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password || password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (!tokenData) {
            setError('Datos de invitación no válidos');
            return;
        }

        setIsSubmitting(true);

        try {
            // Extract consultant info from metadata
            const consultantEmail = tokenData.metadata?.consultant_email;
            const consultantName = tokenData.metadata?.consultant_name;
            const consultantCode = tokenData.metadata?.consultant_code;
            const officeId = tokenData.metadata?.office_id;

            if (!officeId || !consultantEmail || !consultantName || !consultantCode) {
                throw new Error('Datos de invitación incompletos');
            }

            // Create auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: consultantEmail,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/login`,
                },
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    setError('Este email ya está registrado. Por favor, inicia sesión.');
                    setIsSubmitting(false);
                    return;
                }
                throw authError;
            }

            if (!authData.user) {
                throw new Error('No se pudo crear el usuario');
            }

            // Create consultant profile
            try {
                await db.consultant.createConsultant(
                    authData.user.id,
                    consultantEmail,
                    consultantName,
                    consultantCode,
                    officeId
                );
            } catch (consultantError: any) {
                // If consultant creation fails, we can't delete the auth user from client
                // The user will need to contact support or try to sign in
                console.error('Error creating consultant profile:', consultantError);
                throw new Error('Error al crear el perfil de asesor. Por favor, contacta al soporte.');
            }

            // Mark token as used
            try {
                await db.token.markTokenAsUsed(tokenData.id);
            } catch (tokenUpdateError: any) {
                console.error('Error marking token as used:', tokenUpdateError);
                // Don't fail the whole process if this fails
            }

            setSuccess(true);

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push('/login?email=' + encodeURIComponent(consultantEmail));
            }, 2000);
        } catch (error: any) {
            console.error('Error creating account:', error);
            setError(error.message || 'Error al crear la cuenta. Por favor, intenta de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-600 dark:text-gray-400">Cargando invitación...</p>
                </div>
            </div>
        );
    }

    if (error && !tokenData) {
        return (
            <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <div className="mb-4">
                        <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Error</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
                    <Link
                        href="/login"
                        className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                        Ir al Inicio de Sesión
                    </Link>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <div className="mb-4">
                        <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">¡Cuenta Creada!</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Tu cuenta ha sido creada exitosamente. Serás redirigido al inicio de sesión...
                    </p>
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
                        Acepta tu invitación
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                    {tokenData && tokenData.metadata && (
                        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Email:</strong> {tokenData.metadata.consultant_email}
                            </p>
                            <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                                <strong>Código de Asesor:</strong> {tokenData.metadata.consultant_code}
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Contraseña *
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Mínimo 8 caracteres"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Confirmar Contraseña *
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={8}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Confirma tu contraseña"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Creando cuenta...' : 'Crear Cuenta'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            href="/login"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            ¿Ya tienes una cuenta? Inicia sesión
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

