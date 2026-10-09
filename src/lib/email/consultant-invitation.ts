/**
 * Consultant invitation email.
 * Dark LifeOps shell (#1a1d24 / #242830) with the gold accent CTA.
 * Layout uses inline styles. A style block only declares the app fonts.
 */

export type ConsultantInvitationEmailInput = {
  consultantName: string;
  officeName: string;
  consultantCode: string;
  inviteUrl: string;
  /** App origin so clients that load remote fonts can use Lexend and Inter. */
  assetBaseUrl?: string;
};

const COLORS = {
  page: '#1a1d24',
  chrome: '#242830',
  border: '#2a2f38',
  fg: '#ffffff',
  muted: '#9ba5b3',
  accent: '#FBDBAC',
  onAccent: '#1a1d24',
} as const;

const FONT_TITLE = "'Lexend', 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_TEXT = "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fontFaces(assetBaseUrl: string | undefined): string {
  if (!assetBaseUrl) return '';
  const base = escapeHtml(assetBaseUrl.replace(/\/$/, ''));
  return `<style>
    @font-face { font-family: 'Lexend'; font-weight: 600; font-style: normal; src: url('${base}/assets/fonts/Lexend/Lexend-SemiBold.ttf') format('truetype'); }
    @font-face { font-family: 'Lexend'; font-weight: 700; font-style: normal; src: url('${base}/assets/fonts/Lexend/Lexend-Bold.ttf') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; src: url('${base}/assets/fonts/Inter/Inter_18pt-Regular.ttf') format('truetype'); }
    @font-face { font-family: 'Inter'; font-weight: 600; font-style: normal; src: url('${base}/assets/fonts/Inter/Inter_18pt-SemiBold.ttf') format('truetype'); }
  </style>`;
}

export function renderConsultantInvitationEmail({
  consultantName,
  officeName,
  consultantCode,
  inviteUrl,
  assetBaseUrl,
}: ConsultantInvitationEmailInput): string {
  const name = escapeHtml(consultantName);
  const office = escapeHtml(officeName);
  const code = escapeHtml(consultantCode);
  const url = escapeHtml(inviteUrl);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>Invitación a LifeOps</title>
    ${fontFaces(assetBaseUrl)}
  </head>
  <body style="margin:0;padding:0;background:${COLORS.page};color:${COLORS.fg};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      ${office} te invitó a LifeOps. Tu código de asesor es ${code}.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <div style="max-width:560px;margin:0 auto;text-align:left;background:${COLORS.chrome};border:1px solid ${COLORS.border};border-radius:16px;padding:36px 28px 32px;overflow-wrap:anywhere;">
                <p style="margin:0;font-family:${FONT_TITLE};font-size:22px;font-weight:700;line-height:1.2;letter-spacing:-0.02em;color:${COLORS.accent};">
                  LifeOps
                </p>
                <h1 style="margin:28px 0 0;font-family:${FONT_TITLE};font-size:28px;font-weight:600;line-height:1.2;letter-spacing:-0.02em;color:${COLORS.fg};">
                  Te invitaron
                </h1>
                <p style="margin:16px 0 0;font-family:${FONT_TEXT};font-size:16px;line-height:1.6;color:${COLORS.fg};">
                  Hola <strong>${name}</strong>,
                </p>
                <p style="margin:12px 0 0;font-family:${FONT_TEXT};font-size:16px;line-height:1.6;color:${COLORS.muted};">
                  <strong style="color:${COLORS.fg};font-weight:600;">${office}</strong> te invitó a LifeOps como asesor.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td style="background:${COLORS.page};border:1px solid ${COLORS.border};border-radius:12px;padding:14px 16px;">
                      <p style="margin:0;font-family:${FONT_TEXT};font-size:12px;line-height:1.4;color:${COLORS.muted};">
                        Código de asesor
                      </p>
                      <p style="margin:4px 0 0;font-family:${FONT_TITLE};font-size:20px;font-weight:600;line-height:1.3;letter-spacing:0.04em;color:${COLORS.accent};">
                        ${code}
                      </p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td align="center" bgcolor="${COLORS.accent}" style="border-radius:8px;background:${COLORS.accent};">
                      <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT_TEXT};font-size:15px;font-weight:600;line-height:1.2;color:${COLORS.onAccent};text-decoration:none;border-radius:8px;">
                        Aceptar invitación
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-family:${FONT_TEXT};font-size:13px;line-height:1.5;color:${COLORS.muted};">
                  Si el botón no abre, copia este enlace en el navegador:
                </p>
                <p style="margin:8px 0 0;font-family:${FONT_TEXT};font-size:13px;line-height:1.5;">
                  <a href="${url}" style="color:${COLORS.accent};word-break:break-all;overflow-wrap:anywhere;text-decoration:underline;">${url}</a>
                </p>
                <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${COLORS.border};font-family:${FONT_TEXT};font-size:12px;line-height:1.5;color:${COLORS.muted};">
                  Esta invitación vence en 7 días. Si no la esperabas, puedes ignorar este correo.
                </p>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
