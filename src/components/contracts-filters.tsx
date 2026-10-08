'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Contract } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  TABLE_FILTER_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/hooks/use-debounced-value';

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
  /** Primary create action (e.g. Registrar póliza). */
  actions?: ReactNode;
}

export function filterContracts<T extends Contract & { client_name?: string }>(
  contracts: T[],
  filters: ContractsFilterState
): T[] {
  const search = filters.search.trim().toLowerCase();
  const hasDateFilter = !!filters.captureDateFrom || !!filters.captureDateTo;

  return contracts.filter((contract) => {
    if (search) {
      const clientName = (contract as { client_name?: string }).client_name || '';
      const projectName = contract.project_name || '';
      const policy = contract.contract_number || '';
      const matchesSearch =
        clientName.toLowerCase().includes(search) ||
        policy.toLowerCase().includes(search) ||
        projectName.toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    if (filters.currency && contract.currency !== filters.currency) {
      return false;
    }

    if (filters.paymentMethod && contract.payment_method !== filters.paymentMethod) {
      return false;
    }

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
  actions,
}: ContractsFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    setSearchInput(filters.search);
  }
  const debouncedSearch = useDebouncedValue(searchInput, TABLE_FILTER_DEBOUNCE_MS);

  const sortedCurrencies = useMemo(
    () => Array.from(new Set(availableCurrencies.filter(Boolean))).sort(),
    [availableCurrencies]
  );

  const sortedPaymentMethods = useMemo(
    () => Array.from(new Set(availablePaymentMethods.filter(Boolean))).sort(),
    [availablePaymentMethods]
  );

  useEffect(() => {
    if (debouncedSearch === filters.search) return;
    onChange({ ...filters, search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- emit debounced search only
  }, [debouncedSearch]);

  const update = (patch: Partial<ContractsFilterState>) => {
    onChange({ ...filters, search: searchInput, ...patch });
  };

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Búsqueda
        </label>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por cliente o póliza…"
          className="w-full h-9 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
        />
      </div>

      <div className="min-w-[160px]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Moneda
        </label>
        <select
          value={filters.currency}
          onChange={(e) => update({ currency: e.target.value })}
          className="w-full h-9 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
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
          Forma de pago
        </label>
        <select
          value={filters.paymentMethod}
          onChange={(e) => update({ paymentMethod: e.target.value })}
          className="w-full h-9 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
        >
          <option value="">Todas</option>
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
            className="h-9 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
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
            className="h-9 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end ml-auto">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setSearchInput('');
            onChange({
              search: '',
              currency: '',
              paymentMethod: '',
              captureDateFrom: '',
              captureDateTo: '',
            });
          }}
        >
          Limpiar
        </Button>
        {actions}
      </div>
    </div>
  );
}
