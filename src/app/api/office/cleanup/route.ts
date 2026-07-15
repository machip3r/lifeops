import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { officeCleanupSchema } from '@/lib/validation/actions';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from '@/lib/auth/api';

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

    const body = await request.json().catch(() => ({}));
    const parsed = officeCleanupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'officeId inválido.',
          fieldErrors: zodFieldErrors(parsed.error, VALIDATION_MESSAGES),
        },
        { status: 400 },
      );
    }

    const { officeId } = parsed.data;

    const access = assertOfficeAccess(auth.ctx, officeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Get consultants for this office (need id and auth_user_id for later auth deletion)
    const { data: consultants, error: consultantsError } = await supabaseAdmin
      .from('consultant')
      .select('id, auth_user_id')
      .eq('office_id', officeId);

    if (consultantsError) {
      console.error('Error fetching consultants for cleanup:', consultantsError);
      return NextResponse.json({ error: 'Failed to fetch consultants' }, { status: 500 });
    }

    const consultantIds = (consultants || []).map((c: any) => c.id);
    const authUserIds = (consultants || [])
      .map((c: any) => c.auth_user_id)
      .filter((id): id is string => !!id);

    if (consultantIds.length === 0) {
      // Still delete clients + cobranza audit for this office when there are no consultants
      const { error: auditDeleteError } = await supabaseAdmin
        .from('collection_audit_log')
        .delete()
        .eq('office_id', officeId);
      if (auditDeleteError) {
        console.error('Error deleting collection_audit_log:', auditDeleteError);
        return NextResponse.json({ error: 'Failed to delete collection audit' }, { status: 500 });
      }

      const { error: clientsDeleteError } = await supabaseAdmin
        .from('client')
        .delete()
        .eq('office_id', officeId);
      if (clientsDeleteError) {
        console.error('Error deleting clients:', clientsDeleteError);
        return NextResponse.json({ error: 'Failed to delete clients' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        deletedContracts: 0,
        deletedConsultants: 0,
        deletedClients: true,
        deletedAuthUsers: 0,
        deletedCollectionData: true,
      });
    }

    // Get contracts for these consultants
    const { data: contracts, error: contractsError } = await supabaseAdmin
      .from('contract')
      .select('id')
      .in('consultant_id', consultantIds);

    if (contractsError) {
      console.error('Error fetching contracts for cleanup:', contractsError);
      return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
    }

    const contractIds = (contracts || []).map((c: any) => c.id);

    // Delete collection payments, change requests, details, and contracts
    if (contractIds.length > 0) {
      const { error: paymentsError } = await supabaseAdmin
        .from('contract_collection_payment')
        .delete()
        .in('contract_id', contractIds);

      if (paymentsError) {
        console.error('Error deleting contract_collection_payment rows:', paymentsError);
        return NextResponse.json({ error: 'Failed to delete collection payments' }, { status: 500 });
      }

      const { error: ccrError } = await supabaseAdmin
        .from('contract_change_request')
        .delete()
        .in('contract_id', contractIds);

      if (ccrError) {
        console.error('Error deleting contract_change_request rows:', ccrError);
        return NextResponse.json({ error: 'Failed to delete change requests' }, { status: 500 });
      }

      const { error: detailsError } = await supabaseAdmin
        .from('contract_detail')
        .delete()
        .in('contract_id', contractIds);

      if (detailsError) {
        console.error('Error deleting contract_detail rows:', detailsError);
        return NextResponse.json({ error: 'Failed to delete contract details' }, { status: 500 });
      }

      const { error: contractsDeleteError } = await supabaseAdmin
        .from('contract')
        .delete()
        .in('id', contractIds);

      if (contractsDeleteError) {
        console.error('Error deleting contracts:', contractsDeleteError);
        return NextResponse.json({ error: 'Failed to delete contracts' }, { status: 500 });
      }
    }

    // Audit rows survive contract delete (FK SET NULL); clear by office
    const { error: auditDeleteError } = await supabaseAdmin
      .from('collection_audit_log')
      .delete()
      .eq('office_id', officeId);

    if (auditDeleteError) {
      console.error('Error deleting collection_audit_log:', auditDeleteError);
      return NextResponse.json({ error: 'Failed to delete collection audit' }, { status: 500 });
    }

    // Delete clients for this office (after contracts so FK is safe)
    const { error: clientsDeleteError } = await supabaseAdmin
      .from('client')
      .delete()
      .eq('office_id', officeId);

    if (clientsDeleteError) {
      console.error('Error deleting clients:', clientsDeleteError);
      return NextResponse.json({ error: 'Failed to delete clients' }, { status: 500 });
    }

    // Delete consultants from consultant table
    const { error: consultantsDeleteError } = await supabaseAdmin
      .from('consultant')
      .delete()
      .in('id', consultantIds);

    if (consultantsDeleteError) {
      console.error('Error deleting consultants:', consultantsDeleteError);
      return NextResponse.json({ error: 'Failed to delete consultants' }, { status: 500 });
    }

    // Delete auth users (so they can't log in anymore)
    let deletedAuthCount = 0;
    for (const uid of authUserIds) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (authDeleteError) {
        console.error(`Error deleting auth user ${uid}:`, authDeleteError);
        // Continue with others
      } else {
        deletedAuthCount++;
      }
    }

    return NextResponse.json({
      success: true,
      deletedContracts: contractIds?.length ?? 0,
      deletedConsultants: consultantIds.length,
      deletedClients: true,
      deletedAuthUsers: deletedAuthCount,
      deletedCollectionData: true,
    });
  } catch (error: any) {
    console.error('Error in office cleanup API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

