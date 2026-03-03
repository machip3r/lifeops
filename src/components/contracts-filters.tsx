'use client';

import { useMemo } from 'react';
import type { Contract } from '@/lib/supabase';

export interface ContractsFilterState {
  search: string;
  currency: string;
  paymentMethod: string;
  captureDateFrom: string;
  captureDateTo: string;
}

interface ContractsFiltersProps {
  filters: ContractsFilterState;
  onChange: (next: ContractsFilterState) => void;
  availableCurrencies: string[];
  availablePaymentMethods: string[];
}

export function filterContracts<T extends Contract & { client_name?: string }>(
  contracts: T[],
  filters: ContractsFilterState
): T[] {
  const search = filters.search.trim().toLowerCase();
  const hasDateFilter = !!filters.captureDateFrom || !!filters.captureDateTo;

  return contracts.filter((contract) => {
    // Search by client name and policy number (and project name for convenience)
    if (search) {
      const clientName = ((contract as any).client_name as string | undefined) || '';
      const projectName = contract.project_name || '';
      const policy = contract.contract_number || '';
      const matchesSearch =
        clientName.toLowerCase().includes(search) ||
        policy.toLowerCase().includes(search) ||
        projectName.toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    // Currency filter
    if (filters.currency && contract.currency !== filters.currency) {
      return false;
    }

    // Payment method filter
    if (filters.paymentMethod && contract.payment_method !== filters.paymentMethod) {
      return false;
    }

    // Capture date range filter (falls back to created_at when capture_date is missing)
    if (hasDateFilter) {
      const baseDateString = contract.capture_date || contract.created_at;
      if (!baseDateString) return false;

      const baseDate = new Date(baseDateString);
      if (filters.captureDateFrom) {
        const from = new Date(filters.captureDateFrom);
        from.setHours(0, 0, 0, 0);
        if (baseDate < from) return false;
      }
      if (filters.captureDateTo) {
        const to = new Date(filters.captureDateTo);
        to.setHours(23, 59, 59, 999);
        if (baseDate > to) return false;
      }
    }

    return true;
  });
}

export function ContractsFilters({
  filters,
  onChange,
  availableCurrencies,
  availablePaymentMethods,
}: ContractsFiltersProps) {
  const sortedCurrencies = useMemo(
    () => Array.from(new Set(availableCurrencies.filter(Boolean))).sort(),
    [availableCurrencies]
  );

  const sortedPaymentMethods = useMemo(
    () => Array.from(new Set(availablePaymentMethods.filter(Boolean))).sort(),
    [availablePaymentMethods]
  );

  const update = (patch: Partial<ContractsFilterState>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Búsqueda
        </label>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Buscar por cliente o póliza..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="min-w-[160px]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Moneda
        </label>
        <select
          value={filters.currency}
          onChange={(e) => update({ currency: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Todas</option>
          {sortedCurrencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[180px]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Método de pago
        </label>
        <select
          value={filters.paymentMethod}
          onChange={(e) => update({ paymentMethod: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Todos</option>
          {sortedPaymentMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Fecha captura desde
          </label>
          <input
            type="date"
            value={filters.captureDateFrom}
            onChange={(e) => update({ captureDateFrom: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Fecha captura hasta
          </label>
          <input
            type="date"
            value={filters.captureDateTo}
            onChange={(e) => update({ captureDateTo: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onChange({
            search: '',
            currency: '',
            paymentMethod: '',
            captureDateFrom: '',
            captureDateTo: '',
          })
        }
        className="ml-auto px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        Limpiar filtros
      </button>
    </div>
  );
}

