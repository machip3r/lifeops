import type { SupabaseClient } from '@supabase/supabase-js';
import type { File as LifeOpsFile } from '@/lib/supabase';

export type ContractFile = Pick<
  LifeOpsFile,
  'id' | 'display_name' | 'file_name' | 'file_type' | 'file_size' | 'collection_payment_id' | 'created_at'
>;

/** `file` reads (RLS: promotoría sees its office; asesor its own pólizas). Downloads use signed URLs from the API. */
export function createFileDb(supabase: SupabaseClient) {
  return {
    /** Documents of one póliza, newest first (payment evidence has `collection_payment_id`). */
    listByContract: async (contractId: string): Promise<ContractFile[]> => {
      const { data, error } = await supabase
        .from('file')
        .select('id, display_name, file_name, file_type, file_size, collection_payment_id, created_at')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractFile[];
    },
  };
}
