/**
 * Support contact shown in the UI. Configure with:
 * - NEXT_PUBLIC_SUPPORT_EMAIL (e.g. soporte@tudominio.com)
 * - NEXT_PUBLIC_SUPPORT_WHATSAPP (digits with country code, e.g. 523312345678)
 */
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "") || null;

export type SupportLink = { label: string; href: string };

/** Contact links with a prefilled message; empty when no channel is configured. */
export function supportLinks(subject: string, message: string): SupportLink[] {
  const links: SupportLink[] = [];
  if (SUPPORT_WHATSAPP) {
    links.push({
      label: "Escríbenos por WhatsApp",
      href: `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`,
    });
  }
  if (SUPPORT_EMAIL) {
    links.push({
      label: `Escríbenos a ${SUPPORT_EMAIL}`,
      href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    });
  }
  return links;
}
