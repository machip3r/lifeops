'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
    getSession,
    getUser,
    onAuthStateChange,
    resendOtp,
    signInWithPassword,
    signOut as authSignOut,
    signUp as authSignUp,
    verifyOtp,
} from '@/lib/auth/client';
import { installNavigationGuardListener } from '@/lib/navigation-guard-listener';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';

installNavigationGuardListener();

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

/** `loading` is the in-flight profile read. `missing` means it finished without a profile. */
export type ProfilePhase = 'loading' | 'ready' | 'missing';

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    profilePhase: ProfilePhase;
    /** Load the office or consultant row again. Sends the user to login when the session is gone. */
    reloadProfile: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, role: UserRole, name?: string, consultantCode?: string) => Promise<SignUpResult>;
    verifyEmailCode: (email: string, token: string) => Promise<void>;
    resendVerificationEmail: (email: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const SESSION_TIMEOUT_MS = 8_000;
const PROFILE_TIMEOUT_MS = 12_000;
const SESSION_CHECK_MS = 5_000;
const SIGN_OUT_TIMEOUT_MS = 4_000;

class TimeoutError extends Error {
    constructor(label: string) {
        super(`${label} timed out`);
        this.name = 'TimeoutError';
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new TimeoutError(label));
        }, ms);
        promise.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function isSessionEndedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if (error instanceof TimeoutError) return false;
    const err = error as { code?: string; message?: string; status?: number; name?: string };
    const code = String(err.code ?? '').toLowerCase();
    const message = String(err.message ?? '').toLowerCase();
    const name = String(err.name ?? '').toLowerCase();
    if (err.status === 401 || code === 'pgrst301' || code === '401') return true;
    if (
        code === 'refresh_token_not_found' ||
        code === 'session_not_found' ||
        code === 'bad_jwt' ||
        code === 'session_expired'
    ) {
        return true;
    }
    if (name.includes('sessionmissing')) return true;
    return (
        message.includes('jwt') ||
        message.includes('refresh token') ||
        message.includes('session missing') ||
        message.includes('auth session missing') ||
        message.includes('invalid claim')
    );
}

function isSessionExpired(session: Session | null): boolean {
    if (!session?.expires_at) return false;
    return Math.floor(Date.now() / 1000) >= session.expires_at;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [profilePhase, setProfilePhase] = useState<ProfilePhase>('loading');
    const router = useRouter();
    const profileRequestId = useRef(0);
    const profileRef = useRef<UserProfile | null>(null);
    const userRef = useRef<User | null>(null);

    useEffect(() => {
        profileRef.current = profile;
        userRef.current = user;
    }, [profile, user]);

    /**
     * create_office requires EXECUTE as `authenticated` (revoked from anon in 007).
     * Call only when a session exists. Safe to retry (ON CONFLICT DO NOTHING).
     */
    const ensurePromotoryOffice = useCallback(async (authUser: User) => {
        if (!authUser.email) {
            throw new Error('No se pudo crear la oficina: falta el correo.');
        }
        const metaName = authUser.user_metadata?.office_name;
        const officeName =
            typeof metaName === 'string' && metaName.trim().length > 0
                ? metaName.trim()
                : authUser.email;
        await db.office.createOffice(authUser.id, authUser.email, officeName);
    }, []);

    const fetchUserProfile = useCallback(async (userId: string, authUser?: User | null): Promise<UserProfile | null> => {
        // Load both office and consultant in parallel for faster response
        let [officeData, consultantData] = await Promise.all([
            db.office.getOfficeById(userId),
            db.consultant.getConsultantById(userId),
        ]);

        // Invited asesores win over a phantom office row (same auth.uid() as office.id).
        // profile.id must be consultant.id (PK used by contract.consultant_id).
        // auth.users.id lives in consultant.auth_user_id — never swap them.
        if (consultantData) {
            return {
                id: consultantData.id,
                email: consultantData.email || '',
                role: 'consultant',
                name: consultantData.name,
                consultant_code: consultantData.consultant_code || '',
                office_id: consultantData.office_id,
            };
        }

        // Orphaned promotory signup: auth user exists, office row deferred until session.
        // Never bootstrap an office for invited asesores (they may briefly fail consultant RLS
        // before auth_user_id policies apply — creating an office would grant promotory access).
        if (!officeData && authUser?.email) {
            const meta = authUser.user_metadata ?? {};
            const metaRole =
                typeof meta.role === 'string' ? meta.role.toLowerCase() : '';
            const hasOfficeName =
                typeof meta.office_name === 'string' &&
                meta.office_name.trim().length > 0;
            const looksLikePromotory =
                metaRole === 'promotory' ||
                metaRole === 'office' ||
                hasOfficeName;
            if (looksLikePromotory) {
                try {
                    await ensurePromotoryOffice(authUser);
                    officeData = await db.office.getOfficeById(userId);
                } catch (bootstrapError) {
                    console.error(
                        'Error bootstrapping office profile:',
                        bootstrapError,
                    );
                }
            }
        }

        if (officeData) {
            return {
                id: officeData.id,
                email: officeData.email,
                role: 'promotory', // Role is inferred: office table = promotory role
                name: officeData.name,
            };
        }

        console.warn('No profile found for user:', userId);
        return null;
    }, [ensurePromotoryOffice]);

    const clearAuthState = useCallback(() => {
        profileRequestId.current += 1;
        setUser(null);
        setProfile(null);
        setSession(null);
        setProfilePhase('missing');
        setLoading(false);
    }, []);

    /** Drop a dead session locally so the dashboard can leave the loader for /login. */
    const abandonSession = useCallback(async () => {
        profileRequestId.current += 1;
        try {
            await withTimeout(authSignOut('local'), SIGN_OUT_TIMEOUT_MS, 'sign out');
        } catch (error) {
            console.warn('Local sign out did not finish:', error);
        }
        clearAuthState();
    }, [clearAuthState]);

    const sessionHasEnded = useCallback(async (): Promise<boolean> => {
        try {
            const { data, error } = await withTimeout(getUser(), SESSION_CHECK_MS, 'session check');
            if (error) return isSessionEndedError(error);
            return !data.user;
        } catch (error) {
            return isSessionEndedError(error);
        }
    }, []);

    const resolveProfile = useCallback(async (authUser: User) => {
        const requestId = ++profileRequestId.current;
        const deadline = Date.now() + PROFILE_TIMEOUT_MS;
        setProfilePhase((current) => (current === 'ready' && profileRef.current ? current : 'loading'));

        const loadProfile = () => {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new TimeoutError('profile');
            return withTimeout(fetchUserProfile(authUser.id, authUser), remaining, 'profile');
        };

        const leaveIfSessionEnded = async () => {
            if (requestId !== profileRequestId.current) return true;
            if (!(await sessionHasEnded())) return false;
            if (requestId !== profileRequestId.current) return true;
            await abandonSession();
            return true;
        };

        try {
            let next = await loadProfile();
            if (requestId !== profileRequestId.current) return;

            // Empty read after a token refresh still looks like "no profile". Confirm the
            // session, then try once more before leaving the loader.
            if (!next) {
                if (await leaveIfSessionEnded()) return;
                if (requestId !== profileRequestId.current) return;
                next = await loadProfile();
            }

            if (requestId !== profileRequestId.current) return;
            if (next) {
                setProfile(next);
                setProfilePhase('ready');
                return;
            }

            if (await leaveIfSessionEnded()) return;
            setProfile(null);
            setProfilePhase('missing');
        } catch (error) {
            console.error('Error loading profile:', error);
            if (requestId !== profileRequestId.current) return;
            if (isSessionEndedError(error)) {
                await abandonSession();
                return;
            }
            if (await leaveIfSessionEnded()) return;

            try {
                const next = await loadProfile();
                if (requestId !== profileRequestId.current) return;
                if (next) {
                    setProfile(next);
                    setProfilePhase('ready');
                    return;
                }
            } catch (retryError) {
                console.error('Error loading profile (retry):', retryError);
                if (requestId !== profileRequestId.current) return;
                if (isSessionEndedError(retryError)) {
                    await abandonSession();
                    return;
                }
                if (await leaveIfSessionEnded()) return;
            }

            if (requestId !== profileRequestId.current) return;
            setProfile(null);
            setProfilePhase('missing');
        }
    }, [abandonSession, fetchUserProfile, sessionHasEnded]);

    const reloadProfile = useCallback(async () => {
        const authUser = userRef.current;
        if (!authUser) {
            await abandonSession();
            return;
        }
        await resolveProfile(authUser);
    }, [abandonSession, resolveProfile]);

    useEffect(() => {
        let mounted = true;
        let sessionFromListener = false;
        let epoch = 0;

        const initializeAuth = async () => {
            const started = epoch;
            try {
                const { session: nextSession, error } = await withTimeout(
                    getSession(),
                    SESSION_TIMEOUT_MS,
                    'session',
                );

                if (!mounted || epoch !== started) return;

                if (error) console.error('Error getting session:', error);

                // No session is a normal logged-out visit — don't wait on signOut.
                if (!nextSession?.user) {
                    if (!sessionFromListener) clearAuthState();
                    return;
                }

                if (isSessionExpired(nextSession) || isSessionEndedError(error)) {
                    console.warn('Session missing or expired');
                    if (sessionFromListener) return;
                    await abandonSession();
                    return;
                }

                setSession(nextSession);
                setUser(nextSession.user);
                setLoading(false);
                await resolveProfile(nextSession.user);
            } catch (error) {
                console.error('Error in getSession:', error);
                if (!mounted || epoch !== started || sessionFromListener) return;
                await abandonSession();
            }
        };

        void initializeAuth();

        // Sync callback. Profile reads are deferred so they cannot deadlock a token refresh.
        const {
            data: { subscription },
        } = onAuthStateChange((event, nextSession) => {
            if (!mounted) return;

            if (!nextSession?.user || event === 'SIGNED_OUT') {
                // A null INITIAL_SESSION can arrive before getSession finishes.
                if (event === 'INITIAL_SESSION') return;
                epoch += 1;
                sessionFromListener = false;
                clearAuthState();
                return;
            }

            sessionFromListener = true;
            setSession(nextSession);
            setUser(nextSession.user);
            setLoading(false);

            // userRef still holds the previous render, so a different account is not skipped.
            const sameUser =
                userRef.current?.id === nextSession.user.id && profileRef.current !== null;
            if (
                sameUser &&
                (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_IN')
            ) {
                return;
            }

            window.setTimeout(() => {
                if (!mounted) return;
                void resolveProfile(nextSession.user);
            }, 0);
        });

        return () => {
            mounted = false;
            profileRequestId.current += 1;
            subscription.unsubscribe();
        };
    }, [abandonSession, clearAuthState, resolveProfile]);

    const signIn = async (email: string, password: string) => {
        const { error } = await signInWithPassword(email, password);

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
                const { error: otpError } = await resendOtp({
                    type: 'signup',
                    email,
                });

                if (otpError) {
                    // If resend fails, try email_change type as fallback
                    const { error: emailOtpError } = await resendOtp({
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

        const officeName = (name || email).trim();

        const { data, error } = await authSignUp({
            email,
            password,
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
                intended_role: 'promotory',
                office_name: officeName,
            },
        });

        if (error) throw error;

        // Check if email confirmation is required (OTP code-based)
        const needsEmailVerification = Boolean(!data.session && data.user && !data.user.email_confirmed_at);

        // create_office is only executable by `authenticated`. With email confirm on,
        // signUp often returns a user without a session (still anon) — defer office create.
        if (data.user && role === 'promotory' && data.session) {
            try {
                await ensurePromotoryOffice(data.user);
                await resolveProfile(data.user);
            } catch (officeError: unknown) {
                console.error('Error creating office:', officeError);
                throw officeError;
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
        ({ data, error } = await verifyOtp({
            email,
            token,
            type: 'signup',
        }));

        // If that fails, try email type (for existing users verifying email)
        if (error) {
            ({ data, error } = await verifyOtp({
                email,
                token,
                type: 'email',
            }));
        }

        if (error) throw error;

        if (data.user) {
            // Session exists now → authenticated can call create_office
            await resolveProfile(data.user);
        }
    };

    const resendVerificationEmail = async (email: string) => {
        const { error } = await resendOtp({
            type: 'signup',
            email,
        });

        if (error) throw error;
    };

    const signOut = async () => {
        try {
            await withTimeout(authSignOut(), SIGN_OUT_TIMEOUT_MS, 'sign out');
        } catch (error) {
            console.warn('Sign out did not finish, clearing the local session:', error);
            try {
                await withTimeout(authSignOut('local'), SIGN_OUT_TIMEOUT_MS, 'local sign out');
            } catch (localError) {
                console.warn('Local sign out did not finish:', localError);
            }
        }
        clearAuthState();
        router.replace('/login');
    };

    return (
        <AuthContext.Provider value={{ user, profile, session, loading, profilePhase, reloadProfile, signIn, signUp, verifyEmailCode, resendVerificationEmail, signOut }}>
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
