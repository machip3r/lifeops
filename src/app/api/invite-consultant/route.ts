import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/write';
import {
  createInvitationTokenAdmin,
  findConsultantEmailConflicts,
  getAdminOfficeById,
  resetConsultantInviteRegistrationAdmin,
} from '@/lib/db-admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from '@/lib/auth/api';
import { renderConsultantInvitationEmail } from '@/lib/email/consultant-invitation';
import { inviteConsultantSchema } from '@/lib/validation/actions';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOfficeContext(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const promotory = assertPromotory(auth.ctx);
    if (!promotory.ok) {
      return NextResponse.json({ error: promotory.error }, { status: promotory.status });
    }

    const body = await request.json();
    const parsed = inviteConsultantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos de invitación inválidos.',
          fieldErrors: zodFieldErrors(parsed.error, VALIDATION_MESSAGES),
        },
        { status: 400 },
      );
    }

    const {
      officeId,
      consultantEmail,
      consultantName,
      consultantCode,
      consultantId,
    } = parsed.data;

    const access = assertOfficeAccess(auth.ctx, officeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const emailConflicts = await findConsultantEmailConflicts(officeId, [
      {
        email: consultantEmail,
        consultantCode,
        consultantId,
      },
    ]);
    if (emailConflicts.length > 0) {
      return NextResponse.json(
        { error: emailConflicts[0] },
        { status: 400 },
      );
    }

    // Reset half-finished Auth/profile so the asesor can accept this invite cleanly.
    try {
      await resetConsultantInviteRegistrationAdmin({
        officeId,
        consultantEmail,
        consultantName,
        consultantCode,
        consultantId,
      });
    } catch (resetError: unknown) {
      console.error('Error resetting consultant invite registration:', resetError);
      return NextResponse.json(
        { error: 'No se pudo reiniciar el registro del asesor.' },
        { status: 500 },
      );
    }

    // Create invitation token (service role after office auth checks above)
    let tokenData: string;
    try {
      tokenData = await createInvitationTokenAdmin(
        'CONSULTANT_INVITATION',
        officeId,
        consultantEmail,
        consultantName,
        consultantCode
      );
    } catch (tokenError: unknown) {
      console.error('Error creating token:', tokenError);
      return NextResponse.json(
        { error: 'No se pudo crear el token de invitación.' },
        { status: 500 }
      );
    }

    // Get office info
    const officeData = await getAdminOfficeById(officeId);

    // Create invitation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/invite/${tokenData}`;

    console.log('Invitation URL:', inviteUrl);

    if (!officeData) {
      return NextResponse.json(
        { error: 'Promotoría no encontrada.' },
        { status: 404 }
      );
    }

    // Send email using Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'LifeOps <noreply@amrap.space>',
      to: consultantEmail,
      subject: `Invitación para unirte a ${officeData.name || 'LifeOps'}`,
      html: renderConsultantInvitationEmail({
        consultantName,
        officeName: officeData.name || 'una promotoría',
        consultantCode,
        inviteUrl,
        assetBaseUrl: baseUrl,
      }),
    });

    if (emailError) {
      console.error('Error sending email:', emailError);
      return NextResponse.json(
        { error: 'No se pudo enviar el correo de invitación.' },
        { status: 500 }
      );
    }

    await writeAuditLog(supabaseAdmin, {
      officeId,
      actorUserId: auth.ctx.user.id,
      actorRole: 'office',
      action: 'consultant.invite',
      entityType: 'consultant',
      entityId: null,
      source: 'api',
      newValues: {
        email: consultantEmail,
        name: consultantName,
        consultant_code: consultantCode,
      },
    });

    return NextResponse.json({
      success: true,
      token: tokenData,
      message: 'Invitación enviada correctamente.',
      emailId: emailData?.id,
    });
  } catch (error: unknown) {
    console.error('Error in invite-consultant API:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
