'use client';

import { FormField } from '@/components/ui/form-field';
import type { Client, Contract } from '@/lib/supabase';
import { dashboardSelectClassName } from '@/components/project-name-select';

type ClientSelectProps = {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  allowNew?: boolean;
  error?: string;
  disabled?: boolean;
  id?: string;
  label?: string;
};

/** Select among consultant/office clients; optional "new client" sentinel. */
export function ClientSelectField({
  clients,
  value,
  onChange,
  allowNew = false,
  error,
  disabled,
  id = 'client-select',
  label = 'Nombre completo del cliente',
}: ClientSelectProps) {
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={dashboardSelectClassName}
      >
        <option value="">Selecciona un cliente</option>
        {allowNew && <option value="__new__">+ Crear nuevo cliente</option>}
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

type ContractSelectProps = {
  contracts: Contract[];
  clients?: Client[];
  value: string;
  onChange: (contractId: string) => void;
  error?: string;
  disabled?: boolean;
  id?: string;
  label?: string;
};

/** Select a contract/póliza; label is `{contractNumber|id} - {clientName}`. */
export function ContractSelectField({
  contracts,
  clients = [],
  value,
  onChange,
  error,
  disabled,
  id = 'contract-select',
  label = 'Número de póliza',
}: ContractSelectProps) {
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <FormField label={label} htmlFor={id} error={error}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={dashboardSelectClassName}
      >
        <option value="">Selecciona una póliza</option>
        {contracts.map((contract) => {
          const contractLabel = contract.contract_number || contract.id;
          const clientName =
            (contract.client_id && clientNameById.get(contract.client_id)) ||
            'Sin cliente';
          return (
            <option key={contract.id} value={contract.id}>
              {contractLabel} - {clientName}
            </option>
          );
        })}
      </select>
    </FormField>
  );
}
