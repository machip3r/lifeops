'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Contract, Consultant, Client } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import {
    TABLE_FILTER_DEBOUNCE_MS,
    useDebouncedValue,
} from '@/hooks/use-debounced-value';

interface SearchResult {
    type: 'contract' | 'consultant' | 'client';
    id: string;
    title: string;
    subtitle?: string;
}

export default function GlobalSearch() {
    const router = useRouter();
    const { profile } = useAuth();
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, TABLE_FILTER_DEBOUNCE_MS);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (debouncedQuery.trim().length < 2) {
            setResults([]);
            setIsOpen(false);
            setLoading(false);
            return;
        }

        if (!profile) {
            return;
        }

        let cancelled = false;
        const run = async () => {
            setLoading(true);
            try {
                const officeId = profile.role === 'promotory' ? profile.id : profile.office_id || undefined;

                const [contracts, consultants, clients] = await Promise.all([
                    db.search.searchContracts(debouncedQuery, officeId),
                    db.search.searchConsultants(debouncedQuery, officeId),
                    db.search.searchClients(debouncedQuery, officeId),
                ]);

                const searchResults: SearchResult[] = [
                    ...contracts.slice(0, 5).map((c: Contract) => ({
                        type: 'contract' as const,
                        id: c.id,
                        title: c.contract_number || 'Sin número',
                        subtitle: c.project_name || undefined,
                    })),
                    ...consultants.slice(0, 5).map((c: Consultant) => ({
                        type: 'consultant' as const,
                        id: c.id,
                        title: c.name,
                        subtitle: c.consultant_code || c.email || undefined,
                    })),
                    ...clients.slice(0, 5).map((c: Client) => ({
                        type: 'client' as const,
                        id: c.id,
                        title: c.name,
                        subtitle: c.birth_date || undefined,
                    })),
                ];

                if (!cancelled) {
                    setResults(searchResults);
                    setIsOpen(searchResults.length > 0);
                }
            } catch (error) {
                console.error('Error searching:', error);
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, profile]);

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        if (result.type === 'contract') {
            router.push(`/dashboard/contracts/${result.id}`);
        } else if (result.type === 'consultant') {
            router.push(`/dashboard/consultants/${result.id}`);
        } else if (result.type === 'client') {
            router.push(`/dashboard/clients/${result.id}`);
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'contract':
                return 'Póliza';
            case 'consultant':
                return 'Asesor';
            case 'client':
                return 'Contratante';
            default:
                return type;
        }
    };

    return (
        <div ref={searchRef} className="relative w-full max-w-md">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                    placeholder="Buscar pólizas, asesores, clientes..."
                    className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                {loading && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {results.map((result) => (
                        <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleSelect(result)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {result.title}
                                    </p>
                                    {result.subtitle && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {result.subtitle}
                                        </p>
                                    )}
                                </div>
                                <span className="ml-2 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded">
                                    {getTypeLabel(result.type)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {isOpen && query.length >= 2 && !loading && results.length === 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        No se encontraron resultados
                    </p>
                </div>
            )}
        </div>
    );
}
