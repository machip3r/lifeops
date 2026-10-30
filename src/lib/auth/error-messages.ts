export type AuthErrorOperation = 'login' | 'verification' | 'resend' | 'registration' | 'invitation';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no son correctos. Revisa tus datos e inténtalo de nuevo.',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
  phone_not_confirmed: 'Confirma tu teléfono antes de iniciar sesión.',
  user_banned: 'El acceso a esta cuenta está suspendido. Contacta a soporte para recibir ayuda.',
  email_exists: 'Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.',
  user_already_exists: 'Ya existe una cuenta con esos datos. Inicia sesión o revisa el correo.',
  signup_disabled: 'El registro requiere una invitación. Solicita acceso a LifeOps.',
  email_provider_disabled: 'El registro por correo no está disponible. Solicita una invitación para acceder.',
  email_address_invalid: 'Revisa el formato del correo e inténtalo de nuevo.',
  email_address_not_authorized: 'No se pudo enviar el correo de verificación. Contacta a soporte para recibir ayuda.',
  otp_expired: 'El código venció. Solicita uno nuevo e inténtalo otra vez.',
  otp_disabled: 'La verificación por código no está disponible por ahora. Inténtalo más tarde.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos antes de pedir otro código.',
  over_request_rate_limit: 'Se hicieron demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.',
  validation_failed: 'Revisa los datos e inténtalo de nuevo.',
  weak_password: 'La contraseña no cumple los requisitos. Elige una más segura.',
  request_timeout: 'La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.',
  unexpected_failure: 'No se pudo completar la solicitud. Inténtalo de nuevo más tarde.',
  session_expired: 'Tu sesión venció. Inicia sesión de nuevo.',
  session_not_found: 'No encontramos una sesión activa. Inicia sesión de nuevo.',
  refresh_token_not_found: 'Tu sesión venció. Inicia sesión de nuevo.',
  refresh_token_already_used: 'Tu sesión cambió. Inicia sesión de nuevo.',
  flow_state_expired: 'El proceso de acceso venció. Inícialo de nuevo.',
  flow_state_not_found: 'No pudimos continuar con el proceso de acceso. Inícialo de nuevo.',
  captcha_failed: 'No se pudo validar la solicitud. Inténtalo de nuevo.',
};

const OPERATION_FALLBACKS: Record<AuthErrorOperation, string> = {
  login: 'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
  verification: 'No se pudo verificar el código. Revisa que sea correcto e inténtalo de nuevo.',
  resend: 'No se pudo enviar el código. Inténtalo de nuevo más tarde.',
  registration: 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.',
  invitation: 'No se pudo completar la invitación. Revisa los datos e inténtalo de nuevo.',
};

const SAFE_AUTH_ERROR_NAME = 'LifeOpsAuthError';

export function getAuthErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' && code.trim() ? code.trim().toLowerCase() : undefined;
}

export function getAuthErrorMessage(
  error: unknown,
  operation: AuthErrorOperation,
): string {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
    if (candidate.name === SAFE_AUTH_ERROR_NAME && typeof candidate.message === 'string') {
      return candidate.message;
    }
  }

  const code = getAuthErrorCode(error);
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  return OPERATION_FALLBACKS[operation];
}

export function toSafeAuthError(error: unknown, operation: AuthErrorOperation): Error {
  const safeError = new Error(getAuthErrorMessage(error, operation));
  safeError.name = SAFE_AUTH_ERROR_NAME;
  return safeError;
}
