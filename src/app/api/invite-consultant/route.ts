import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { officeId, consultantEmail, consultantName, consultantCode } = body;

    if (!officeId || !consultantEmail || !consultantName || !consultantCode) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create invitation token
    let tokenData: string;
    try {
      tokenData = await db.token.createInvitationToken(
        'CONSULTANT_INVITATION',
        officeId,
        consultantEmail,
        consultantName,
        consultantCode
      );
    } catch (tokenError: any) {
      console.error('Error creating token:', tokenError);
      return NextResponse.json(
        { error: 'Failed to create invitation token' },
        { status: 500 }
      );
    }

    // Get office info
    const officeData = await db.office.getAdminOfficeById(officeId);

    // Create invitation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/invite/${tokenData}`;

    console.log('Invitation URL:', inviteUrl);

    if (!officeData) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Send email using Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'LifeOps <onboarding@resend.dev>',
      to: consultantEmail,
      subject: `Invitación para unirte a ${officeData.name || 'LifeOps'}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invitación a LifeOps</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">LifeOps</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="color: #1f2937; margin-top: 0;">¡Has sido invitado!</h2>
              <p style="color: #4b5563;">
                Hola <strong>${consultantName}</strong>,
              </p>
              <p style="color: #4b5563;">
                Has sido invitado por <strong>${officeData.name || 'una oficina'}</strong> para unirte a LifeOps como asesor.
              </p>
              <p style="color: #4b5563;">
                Tu código de asesor es: <strong>${consultantCode}</strong>
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}"
                   style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Aceptar Invitación
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                O copia y pega este enlace en tu navegador:<br>
                <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
              </p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                Esta invitación expirará en 7 días. Si no solicitaste esta invitación, puedes ignorar este correo.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error('Error sending email:', emailError);
      return NextResponse.json(
        { error: 'Failed to send invitation email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token: tokenData,
      message: 'Invitation sent successfully',
    });
  } catch (error: any) {
    console.error('Error in invite-consultant API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

