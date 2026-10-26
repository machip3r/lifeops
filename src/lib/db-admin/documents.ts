/** `file` rows + tenancy checks for document upload / signed URLs. */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type DocumentContractRow = {
  id: string;
  contract_number: string | null;
  consultant_id: string;
  office_id: string | null;
};

export async function getContractForDocumentUploadAdmin(
  contractId: string,
): Promise<DocumentContractRow | null> {
  const { data, error } = await supabaseAdmin
    .from("contract")
    .select("id, contract_number, consultant_id, consultant:consultant_id(id, office_id)")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const consultant = Array.isArray(data.consultant)
    ? data.consultant[0]
    : data.consultant;
  const officeId = (consultant as { office_id?: string } | null)?.office_id ?? null;

  return {
    id: data.id as string,
    contract_number: (data.contract_number as string | null) ?? null,
    consultant_id: data.consultant_id as string,
    office_id: officeId,
  };
}

export async function changeRequestBelongsToContractAdmin(
  changeRequestId: string,
  contractId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("contract_change_request")
    .select("id, contract_id")
    .eq("id", changeRequestId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.contract_id === contractId);
}

export async function collectionPaymentBelongsToContractAdmin(
  collectionPaymentId: string,
  contractId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("contract_collection_payment")
    .select("id, contract_id")
    .eq("id", collectionPaymentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.contract_id === contractId);
}

export type InsertFileRecordInput = {
  officeId: string;
  consultantId: string;
  contractId: string;
  changeRequestId: string | null;
  collectionPaymentId: string | null;
  displayName: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
};

export async function insertFileRecordAdmin(input: InsertFileRecordInput) {
  return supabaseAdmin
    .from("file")
    .insert({
      office_id: input.officeId,
      consultant_id: input.consultantId,
      contract_id: input.contractId,
      change_request_id: input.changeRequestId,
      collection_payment_id: input.collectionPaymentId,
      display_name: input.displayName,
      file_name: input.fileName,
      file_path: input.filePath,
      file_type: input.fileType,
      file_size: input.fileSize,
      file_url: null,
      status: "ACTIVE",
      metadata: {},
    })
    .select()
    .single();
}

export type FileRowForSignedUrl = {
  id: string;
  office_id: string;
  consultant_id: string;
  file_path: string;
  display_name: string | null;
  file_name: string | null;
};

export async function getFileRowForSignedUrlAdmin(
  fileId: string,
): Promise<FileRowForSignedUrl | null> {
  const { data, error } = await supabaseAdmin
    .from("file")
    .select("id, office_id, consultant_id, file_path, display_name, file_name")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  return (data as FileRowForSignedUrl | null) ?? null;
}
