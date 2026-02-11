'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';

export type UserRole = 'consultant' | 'promotory';

interface UserProfile {
    id: string;
    email: string;
    role: UserRole;
    name: string;
    consultant_code?: string;
    office_id?: string; // For consultants
}

interface SignUpResult {
    needsEmailVerification: boolean;
    user?: User;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, role: UserRole, name?: string, consultantCode?: string) => Promise<SignUpResult>;
    verifyEmailCode: (email: string, token: string) => Promise<void>;
    resendVerificationEmail: (email: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const loadUserProfile = useCallback(async (userId: string) => {
        try {
            // Load both office and consultant in parallel for faster response
            const [officeData, consultantData] = await Promise.all([
                db.office.getOfficeById(userId),
                db.consultant.getConsultantById(userId),
            ]);

            if (officeData) {
                setProfile({
                    id: officeData.id,
                    email: officeData.email,
                    role: 'promotory', // Role is inferred: office table = promotory role
                    name: officeData.name,
                });
                // Don't set loading to false here - it's already false
                return;
            }

            if (consultantData) {
                // For consultants, use auth_user_id if available, otherwise use id
                const consultantId = consultantData.auth_user_id || consultantData.id;
                setProfile({
                    id: consultantId,
                    email: consultantData.email || '',
                    role: 'consultant', // Role is inferred: consultant table = consultant role
                    name: consultantData.name,
                    consultant_code: consultantData.consultant_code || '',
                    office_id: consultantData.office_id,
                });
                // Don't set loading to false here - it's already false
                return;
            }

            // No profile found - this is okay, user might not have a profile yet
            console.warn('No profile found for user:', userId);
            setProfile(null);
            // Don't set loading to false here - it's already false
        } catch (error) {
            console.error('Error loading profile:', error);
            // Set profile to null but don't change loading state
            setProfile(null);
            // Don't re-throw - we want to continue even if profile loading fails
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        let profileLoadingTimeout: NodeJS.Timeout | null = null;

        // Get initial session - this is fast and doesn't block
        const initializeAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (!mounted) return;

                if (error) {
                    console.error('Error getting session:', error);
                    setSession(null);
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                    return;
                }

                // Check if session is valid (not expired)
                if (session) {
                    const now = Math.floor(Date.now() / 1000);
                    if (session.expires_at && now >= session.expires_at) {
                        // Session expired, clear it
                        console.warn('Session expired');
                        await supabase.auth.signOut();
                        setSession(null);
                        setUser(null);
                        setProfile(null);
                        setLoading(false);
                        return;
                    }
                }

                // Set session immediately - don't wait for profile
                setSession(session);
                setUser(session?.user ?? null);

                // Set loading to false immediately after session check
                // Profile will load in background
                setLoading(false);

                // Load profile in background (non-blocking)
                if (session?.user) {
                    // Set a timeout for profile loading (10 seconds max)
                    profileLoadingTimeout = setTimeout(() => {
                        if (mounted && !profile) {
                            console.warn('Profile loading taking too long, continuing without profile');
                        }
                    }, 10000);

                    loadUserProfile(session.user.id).catch((err) => {
                        console.error('Error loading profile in getSession:', err);
                        // Don't set loading to false here - it's already false
                        // Just log the error and continue
                    }).finally(() => {
                        if (profileLoadingTimeout) {
                            clearTimeout(profileLoadingTimeout);
                        }
                    });
                } else {
                    setProfile(null);
                }
            } catch (error) {
                console.error('Error in getSession:', error);
                if (mounted) {
                    setSession(null);
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                }
            }
        };

        initializeAuth();

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return;

            setSession(session);
            setUser(session?.user ?? null);

            // Don't set loading to true on auth state change - it's already loaded
            if (session?.user) {
                // Load profile in background
                loadUserProfile(session.user.id).catch((error) => {
                    console.error('Error loading profile in auth state change:', error);
                    // Don't set loading - just log error
                });
            } else {
                setProfile(null);
            }
        });

        return () => {
            mounted = false;
            if (profileLoadingTimeout) {
                clearTimeout(profileLoadingTimeout);
            }
            subscription.unsubscribe();
        };
    }, [loadUserProfile]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            // Only treat as "email not confirmed" when Supabase clearly says so.
            // Do NOT use status 400 alone — wrong password also returns 400.
            const errorMessage = error.message.toLowerCase();
            const errorCode = String((error as any).code ?? '').toLowerCase();

            const isInvalidCredentials =
                errorMessage.includes('invalid') && (
                    errorMessage.includes('credential') ||
                    errorMessage.includes('login') ||
                    errorMessage.includes('password')
                );

            const isEmailConfirmMessage =
                errorMessage.includes('not confirmed') ||
                errorMessage.includes('unconfirmed') ||
                (errorMessage.includes('confirm') && !errorMessage.includes('invalid'));
            const isEmailNotConfirmed =
                !isInvalidCredentials &&
                (errorCode === 'email_not_confirmed' ||
                    errorCode === 'signup_disabled' ||
                    errorMessage.includes('signup_disabled') ||
                    (errorMessage.includes('email') && isEmailConfirmMessage));

            if (isEmailNotConfirmed) {
                console.log('Email not confirmed detected, sending verification code...');
                // If email is not confirmed, trigger OTP verification flow
                // Send OTP code to email
                const { error: otpError } = await supabase.auth.resend({
                    type: 'signup',
                    email,
                });

                if (otpError) {
                    // If resend fails, try email_change type as fallback
                    const { error: emailOtpError } = await supabase.auth.resend({
                        type: 'email_change',
                        email,
                    });

                    if (emailOtpError) {
                        throw new Error('No se pudo enviar el código de verificación. Por favor, intenta de nuevo.');
                    }
                }

                // Throw a special error that the login page can catch to show verification UI
                const verificationError = new Error('EMAIL_NOT_CONFIRMED');
                (verificationError as any).needsVerification = true;
                throw verificationError;
            }
            throw error;
        }

        // Auth state change handler will automatically load the profile
        // No need to do it here - just let the session be set
    };

    const signUp = async (email: string, password: string, role: UserRole, name?: string, consultantCode?: string, officeId?: string): Promise<SignUpResult> => {
        // Consultants cannot sign up - they must be invited
        if (role === 'consultant') {
            throw new Error('Consultants must be invited by an office. Please use the invitation link sent to your email.');
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/login`,
            },
        });

        if (error) throw error;

        // Check if email confirmation is required (OTP code-based)
        const needsEmailVerification = Boolean(!data.session && data.user && !data.user.email_confirmed_at);

        if (data.user) {
            // Only promotory can sign up
            if (role === 'promotory') {
                // Create office profile
                try {
                    await db.office.createOffice(data.user.id, email, name || email);
                } catch (officeError: any) {
                    console.error('Error creating office:', officeError);
                    throw officeError;
                }
            }

            // Only load profile if user is already confirmed (has session)
            if (data.session) {
                await loadUserProfile(data.user.id);
            }
        }

        return {
            needsEmailVerification,
            user: data.user || undefined,
        };
    };

    const verifyEmailCode = async (email: string, token: string) => {
        // Try both signup and email verification types
        let data, error;

        // First try signup type (for new users)
        ({ data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'signup',
        }));

        // If that fails, try email type (for existing users verifying email)
        if (error) {
            ({ data, error } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'email',
            }));
        }

        if (error) throw error;

        if (data.user) {
            await loadUserProfile(data.user.id);
        }
    };

    const resendVerificationEmail = async (email: string) => {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
        });

        if (error) throw error;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setUser(null);
        setProfile(null);
        setSession(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, profile, session, loading, signIn, signUp, verifyEmailCode, resendVerificationEmail, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

