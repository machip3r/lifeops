'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import RequestFormDialog from '@/components/request-form-dialog';
import { SortableTh } from '@/components/sortable-th';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type SortKey = 'name' | 'email' | 'consultant_code' | 'status' | 'sales' | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-400';

function getCurrentMonthStartEnd(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function ConsultantsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { start: defaultStart, end: defaultEnd } = getCurrentMonthStartEnd();
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);
  const [pendingDateStart, setPendingDateStart] = useState(defaultStart);
  const [pendingDateEnd, setPendingDateEnd] = useState(defaultEnd);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [salesByConsultant, setSalesByConsultant] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'PENDING'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadConsultants = useCallback(async () => {
    try {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const [data, sales] = await Promise.all([
        db.consultant.getConsultantsByOffice(profile.id),
        db.dashboard.getOfficeConsultantsSales(profile.id, dateStart, dateEnd),
      ]);

      setConsultants(data);
      const map: Record<string, number> = {};
      sales.forEach((s) => { map[s.consultant_id] = s.total_sales; });
      setSalesByConsultant(map);
      setLoadError('');
    } catch (error) {
      console.error('Error loading consultants:', error);
      setLoadError('Error al cargar los asesores. Por favor recarga la página.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, dateStart, dateEnd]);

  useEffect(() => {
    if (profile?.role === 'promotory' && profile.id) {
      loadConsultants();
    }
  }, [profile, loadConsultants]);

  const handleInviteConsultant = async () => {
    if (!inviteEmail || !inviteName || !inviteCode) {
      setInviteError('Por favor completa todos los campos');
      return;
    }

    setIsInviting(true);
    setInviteError('');

    try {
      // Call API to create token and send email
      const response = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId: profile?.id,
          consultantEmail: inviteEmail,
          consultantName: inviteName,
          consultantCode: inviteCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar la invitación');
      }

      setInviteSuccess(`Invitación enviada exitosamente a ${inviteEmail}. El asesor recibirá un correo electrónico con el enlace de registro.`);

      // Reset form
      setInviteEmail('');
      setInviteName('');
      setInviteCode('');
      setInviteError('');

      // Close dialog and reload after a short delay to show success message
      setTimeout(() => {
        setIsDialogOpen(false);
        setInviteSuccess('');
        loadConsultants();
      }, 2000);
    } catch (error: any) {
      console.error('Error inviting consultant:', error);
      setInviteError(error.message || 'Error al invitar al asesor. Por favor intenta de nuevo.');
    } finally {
      setIsInviting(false);
    }
  };

  const openRequestDialog = (consultant: Consultant) => {
    setSelectedConsultant(consultant);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedConsultant(null);
    setInviteError('');
    setInviteSuccess('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando asesores...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">
          Asesores
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona tus asesores. Ventas filtradas por fecha de pago (período).
        </p>
      </div>
      <div className="flex justify-end mb-6">
        <button
          onClick={() => {
            setInviteEmail('');
            setInviteName('');
            setInviteCode('');
            setInviteError('');
            setInviteSuccess('');
            setSelectedConsultant(null);
            setIsDialogOpen(true);
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          + Invitar Asesor
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 dark:text-red-200">{loadError}</p>
        </div>
      )}

      {/* Consultants List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Buscar
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, código o correo..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="PENDING">Pendiente</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </div>
        </div>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <SortableTh label="Nombre" active={sortKey === 'name'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'name');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Correo Electrónico" active={sortKey === 'email'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'email');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Código" active={sortKey === 'consultant_code'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'consultant_code');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Estado" active={sortKey === 'status'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'status');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Ventas (período)" active={sortKey === 'sales'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'sales');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Fecha de Invitación" active={sortKey === 'created_at'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'created_at');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {(() => {
              const searchLower = search.trim().toLowerCase();
              const filtered = consultants.filter((consultant) => {
                if (statusFilter !== 'ALL' && consultant.status !== statusFilter) {
                  return false;
                }
                if (!searchLower) return true;
                const name = consultant.name?.toLowerCase() || '';
                const email = consultant.email?.toLowerCase() || '';
                const code = consultant.consultant_code?.toLowerCase() || '';
                return (
                  name.includes(searchLower) ||
                  email.includes(searchLower) ||
                  code.includes(searchLower)
                );
              });

              const sorted = sortRows(filtered, sortKey, sortDir, {
                name: (c) => c.name,
                email: (c) => c.email,
                consultant_code: (c) => c.consultant_code,
                status: (c) => c.status,
                sales: (c) => salesByConsultant[c.id] ?? 0,
                created_at: (c) => c.created_at,
              }, {
                sales: 'number',
                created_at: 'date',
              });

              if (sorted.length === 0) {
                return (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      {consultants.length === 0
                        ? 'No hay asesores registrados. Invita uno para comenzar.'
                        : 'No hay asesores que coincidan con los filtros.'}
                    </td>
                  </tr>
                );
              }

              return sorted.map((consultant) => (
                <tr
                  key={consultant.id || `temp-${consultant.name}`}
                  onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {consultant.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.email || <span className="text-gray-400 italic">No establecido</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.consultant_code || <span className="text-gray-400 italic">No establecido</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${consultant.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : consultant.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                      {consultant.status === 'ACTIVE' ? 'Activo' : consultant.status === 'PENDING' ? 'Pendiente' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    ${(salesByConsultant[consultant.id] ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.created_at
                      ? new Date(consultant.created_at).toLocaleDateString('en-US')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                      >
                        Ver Detalles
                      </button>
                      <button
                        onClick={() => openRequestDialog(consultant)}
                        className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                      >
                        Nueva Solicitud
                      </button>
                    </div>
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>

      {/* Invite/Request Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedConsultant ? 'Nueva Solicitud' : 'Invitar Asesor'}
                </h2>
                <button
                  onClick={closeDialog}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedConsultant ? (
                <RequestFormDialog consultant={selectedConsultant} onClose={closeDialog} />
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre del Asesor *
                    </label>
                    <input
                      id="invite-name"
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Correo Electrónico *
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Código del Asesor *
                    </label>
                    <input
                      id="invite-code"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Código único del asesor"
                    />
                  </div>
                  {inviteError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <p className="text-sm text-red-800 dark:text-red-200">{inviteError}</p>
                    </div>
                  )}
                  {inviteSuccess && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <p className="text-sm text-green-800 dark:text-green-200">{inviteSuccess}</p>
                    </div>
                  )}
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={closeDialog}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleInviteConsultant}
                      disabled={isInviting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isInviting ? 'Enviando...' : 'Enviar Invitación'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultantsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory']}>
      <ConsultantsPageContent />
    </ProtectedRoute>
  );
}
