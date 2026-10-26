/**
 * RLS-scoped persistence. Every table / RPC request lives under `src/lib/db/` (this layer)
 * or `src/lib/db-admin/` (service role). Routes, pages and domain helpers call these adapters —
 * never Supabase directly.
 *
 * - `db`: browser instance (Supabase browser session)
 * - `createDb(client)`: same adapters bound to another RLS client, e.g. `createUserClient(jwt)` on the server
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createOfficeDb } from './office';
import { createOfficeOnboardingDb } from './office-onboarding';
import { createConsultantDb } from './consultant';
import { createTokenDb } from './token';
import { createContractDb } from './contract';
import { createContractChangeRequestDb } from './change-request';
import { createClientDb } from './client';
import { createContractDetailDb } from './contract-detail';
import { createDashboardDb } from './dashboard';
import { createCommissionImportDb } from './commission-import';
import { createSearchDb } from './search';
import { createCollectionsDb } from './collections';

export type { Token } from './token';
export type { OfficeOnboarding, OnboardingCatalogs } from './office-onboarding';

export function createDb(client: SupabaseClient) {
    return {
        office: createOfficeDb(client),
        officeOnboarding: createOfficeOnboardingDb(client),
        consultant: createConsultantDb(client),
        token: createTokenDb(client),
        contract: createContractDb(client),
        contractChangeRequest: createContractChangeRequestDb(client),
        client: createClientDb(client),
        contractDetail: createContractDetailDb(client),
        dashboard: createDashboardDb(client),
        commissionImport: createCommissionImportDb(client),
        search: createSearchDb(client),
        collections: createCollectionsDb(client),
    };
}

export type Db = ReturnType<typeof createDb>;

export const db = createDb(supabase);
