'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { Consultant } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { ChevronDown, ChevronUp, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

const FORMA_PAGO_OPTIONS = ['Anual', 'Semestral', 'Trimestral', 'Mensual'] as const;

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

function startEndToDateRange(start: string, end: string): DateRange | undefined {
  if (!start) return undefined;
  const from = new Date(start);
  const to = end ? new Date(end) : from;
  return { from, to };
}

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const { start: defaultStart, end: defaultEnd } = getCurrentMonthStartEnd();
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);
  const [dateBasis, setDateBasis] = useState<'payment' | 'issue'>('payment');
  const [pendingDateStart, setPendingDateStart] = useState(defaultStart);
  const [pendingDateEnd, setPendingDateEnd] = useState(defaultEnd);
  const [pendingDateBasis, setPendingDateBasis] = useState<'payment' | 'issue'>('payment');
  const [pendingDateRange, setPendingDateRange] = useState<DateRange | undefined>(() => startEndToDateRange(defaultStart, defaultEnd));
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [seniorityMin, setSeniorityMin] = useState<number | ''>(1);
  const [seniorityMax, setSeniorityMax] = useState<number | ''>('');
  const [pendingSeniorityMin, setPendingSeniorityMin] = useState<number | ''>(1);
  const [pendingSeniorityMax, setPendingSeniorityMax] = useState<number | ''>('');
  const [ramo, setRamo] = useState<'all' | 'VI' | 'GM'>('all');
  const [pendingRamo, setPendingRamo] = useState<'all' | 'VI' | 'GM'>('all');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<string | null>(null);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [selectedConsultants, setSelectedConsultants] = useState<string[]>([]);
  const [pendingSelectedConsultants, setPendingSelectedConsultants] = useState<string[]>([]);
  const [consultantDropdownOpen, setConsultantDropdownOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [topConsultants, setTopConsultants] = useState<Array<{ consultant: Consultant; sales: number }>>([]);
  const [totalPrimaPago, setTotalPrimaPago] = useState(0);
  const [totalPrimaMeta, setTotalPrimaMeta] = useState(0);
  const [primaMetaVI, setPrimaMetaVI] = useState(0);
  const [primaMetaGM, setPrimaMetaGM] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadConsultants = useCallback(async () => {
    if (!profile?.id || profile.role !== 'promotory') return;
    try {
      const list = await db.consultant.getConsultantsByOffice(profile.id);
      setConsultants(list);
    } catch (e) {
      console.error(e);
    }
  }, [profile?.id, profile?.role]);

  const loadDashboardStats = useCallback(async () => {
    if (!profile?.id || profile.role !== 'promotory') {
      setStatsLoading(false);
      return;
    }
    try {
      setStatsLoading(true);
      const seniorityMinParam = seniorityMin === '' ? null : Number(seniorityMin);
      const seniorityMaxParam = seniorityMax === '' ? null : Number(seniorityMax);
      const consultantIdsParam = selectedConsultants.length > 0 ? selectedConsultants : null;
      const contractTypeParam = ramo === 'all' ? null : ramo;

      const [totals, topConsultantsData, totalsByType] = await Promise.all([
        db.dashboard.getOfficeTotals(
          profile.id,
          dateStart,
          dateEnd,
          dateBasis,
          seniorityMinParam,
          seniorityMaxParam,
          consultantIdsParam,
          contractTypeParam,
          paymentMethod
        ),
        db.dashboard.getTopConsultantsBySales(
          profile.id,
          3,
          dateStart,
          dateEnd,
          dateBasis,
          seniorityMinParam,
          seniorityMaxParam,
          consultantIdsParam,
          contractTypeParam,
          paymentMethod
        ),
        db.dashboard.getOfficeTotalsByType(
          profile.id,
          dateStart,
          dateEnd,
          dateBasis,
          seniorityMinParam,
          seniorityMaxParam,
          consultantIdsParam,
          contractTypeParam,
          paymentMethod
        ),
      ]);

      setTotalPrimaPago(totals.totalPrimaPago);
      setTotalPrimaMeta(totals.totalPrimaMeta);
      setPrimaMetaVI(totalsByType.primaMetaVI);
      setPrimaMetaGM(totalsByType.primaMetaGM);
      setTopConsultants(topConsultantsData);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [
    profile?.id,
    profile?.role,
    dateStart,
    dateEnd,
    dateBasis,
    seniorityMin,
    seniorityMax,
    ramo,
    paymentMethod,
    selectedConsultants,
  ]);

  useEffect(() => {
    if (!loading && profile?.role === 'promotory') {
      loadConsultants();
    }
  }, [loading, profile?.role, loadConsultants]);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role === 'consultant') {
        router.push('/dashboard/contracts');
      } else if (profile.role === 'promotory') {
        loadDashboardStats();
      }
    }
  }, [profile, loading, router, loadDashboardStats]);

  const handleApplyFilters = () => {
    setDateStart(pendingDateStart);
    setDateEnd(pendingDateEnd);
    setDateBasis(pendingDateBasis);
    setSeniorityMin(pendingSeniorityMin);
    setSeniorityMax(pendingSeniorityMax);
    setRamo(pendingRamo);
    setPaymentMethod(pendingPaymentMethod);
    setSelectedConsultants(pendingSelectedConsultants);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando...</p>
      </div>
    );
  }

  if (profile?.role !== 'promotory') {
    return null;
  }

  if (statsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-4">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">
          Vista General
        </h1>
        <p className="text-white">
          Bienvenido a tu vista general de LifeOps. Los datos se pueden filtrar por fecha de pago o fecha de emisión.
        </p>
      </div>

      {/* Filters — apply with button */}
      <div className="mb-8 rounded-lg border border-white] p-4 space-y-3">
        {/* Top row: date basis, summary chips, collapse */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
              Resumen por
            </span>
            <div className="inline-flex items-center rounded-full bg-[#242830] border border-white] p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 rounded-full px-3 text-xs font-medium ${pendingDateBasis === 'payment' ? 'bg-[#FBDBAC] text-[#242830] hover:bg-[#FBDBAC]' : 'text-gray-300 hover:text-white hover:bg-white]'}`}
                onClick={() => setPendingDateBasis('payment')}
              >
                Fecha de pago
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 rounded-full px-3 text-xs font-medium ${pendingDateBasis === 'issue' ? 'bg-[#FBDBAC] text-[#242830] hover:bg-[#FBDBAC]' : 'text-gray-300 hover:text-white hover:bg-white]'}`}
                onClick={() => setPendingDateBasis('issue')}
              >
                Fecha de emisión
              </Button>
            </div>
            <span className="text-xs text-gray-400">
              {pendingDateStart} – {pendingDateEnd}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
            onClick={() => setFiltersCollapsed(!filtersCollapsed)}
          >
            {filtersCollapsed ? (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Mostrar filtros
              </>
            ) : (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Ocultar filtros
              </>
            )}
          </Button>
        </div>

        {!filtersCollapsed && (
          <>
            <Separator className="bg-white]" />
            <div className="flex flex-wrap items-end gap-4">
              {/* Date range */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
                  Rango de fechas
                </Label>
                <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 min-w-[240px] justify-start text-left font-normal border-white] bg-[#242830] text-white hover:bg-[#2f3540]"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {pendingDateRange?.from ? (
                        pendingDateRange.to && pendingDateRange.to.getTime() !== pendingDateRange.from.getTime() ? (
                          `${format(pendingDateRange.from, 'd MMM yyyy', { locale: es })} – ${format(pendingDateRange.to, 'd MMM yyyy', { locale: es })}`
                        ) : (
                          format(pendingDateRange.from, 'd MMM yyyy', { locale: es })
                        )
                      ) : (
                        'Elegir fechas'
                      )}
                      <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#2a2f38] border-white]" align="start">
                    <Calendar
                      mode="range"
                      selected={pendingDateRange}
                      onSelect={(range) => {
                        setPendingDateRange(range);
                        if (range?.from) {
                          setPendingDateStart(format(range.from, 'yyyy-MM-dd'));
                          setPendingDateEnd(range.to ? format(range.to, 'yyyy-MM-dd') : format(range.from, 'yyyy-MM-dd'));
                        }
                      }}
                      locale={es}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Seniority */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
                  Antigüedad (años)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Mín"
                    value={pendingSeniorityMin}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') setPendingSeniorityMin('');
                      else {
                        const n = Number(v);
                        if (!Number.isNaN(n) && n >= 1) setPendingSeniorityMin(n);
                      }
                    }}
                    className="h-9 w-20 border-white] bg-[#242830] text-white"
                  />
                  <span className="text-gray-400">–</span>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Máx"
                    value={pendingSeniorityMax}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') setPendingSeniorityMax('');
                      else {
                        const n = Number(v);
                        if (!Number.isNaN(n) && n >= 1) setPendingSeniorityMax(n);
                      }
                    }}
                    className="h-9 w-20 border-white] bg-[#242830] text-white"
                  />
                </div>
              </div>

              {/* Ramo */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
                  Ramo
                </Label>
                <div className="inline-flex items-center rounded-full bg-[#242830] border border-white] p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-7 rounded-full px-3 text-xs font-medium ${pendingRamo === 'all' ? 'bg-[#FBDBAC] text-[#242830] hover:bg-[#FBDBAC]' : 'text-gray-300 hover:text-white hover:bg-white]'}`}
                    onClick={() => setPendingRamo('all')}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-7 rounded-full px-3 text-xs font-medium ${pendingRamo === 'VI' ? 'bg-[#FBDBAC] text-[#242830] hover:bg-[#FBDBAC]' : 'text-gray-300 hover:text-white hover:bg-white]'}`}
                    onClick={() => setPendingRamo('VI')}
                  >
                    VI
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-7 rounded-full px-3 text-xs font-medium ${pendingRamo === 'GM' ? 'bg-[#FBDBAC] text-[#242830] hover:bg-[#FBDBAC]' : 'text-gray-300 hover:text-white hover:bg-white]'}`}
                    onClick={() => setPendingRamo('GM')}
                  >
                    GM
                  </Button>
                </div>
              </div>

              {/* Forma de pago */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
                  Forma de pago
                </Label>
                <select
                  value={pendingPaymentMethod ?? ''}
                  onChange={(e) => setPendingPaymentMethod(e.target.value === '' ? null : e.target.value)}
                  className="h-9 rounded-md border border-white] bg-[#242830] text-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
                >
                  <option value="">Todas</option>
                  {FORMA_PAGO_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Consultants */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#FBDBAC]/80">
                  Asesores
                </Label>
                <Popover open={consultantDropdownOpen} onOpenChange={setConsultantDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 min-w-[180px] justify-between font-normal border-white] bg-[#242830] text-white hover:bg-[#2f3540]"
                    >
                      {pendingSelectedConsultants.length === 0
                        ? 'Todos'
                        : `${pendingSelectedConsultants.length} seleccionado(s)`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0 bg-[#2a2f38] border-white]" align="start">
                    <Command className="bg-[#2a2f38]">
                      <CommandInput placeholder="Buscar asesor..." className="text-white placeholder:text-gray-500" />
                      <CommandList>
                        <CommandEmpty>Sin resultados</CommandEmpty>
                        <CommandGroup>
                          {consultants.map((c) => (
                            <CommandItem
                              key={c.id}
                              onSelect={() => {
                                setPendingSelectedConsultants((prev) =>
                                  prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                                );
                              }}
                              className="text-white focus:bg-white]"
                            >
                              <Checkbox
                                checked={pendingSelectedConsultants.includes(c.id)}
                                className="mr-2"
                              />
                              {c.name} {c.consultant_code ? `(${c.consultant_code})` : ''}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                type="button"
                onClick={handleApplyFilters}
                className="h-9 bg-[#FBDBAC] text-[#242830] hover:bg-[#f5d08c]"
              >
                Aplicar
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 border-t border-b border-white]">
          <div className="p-6 border-b border-r border-white]">
            <h3 className="text-sm font-semibold text-[#FBDBAC] mb-1">Total Prima Pago</h3>
            <p className="text-2xl font-bold text-white">
              ${totalPrimaPago.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-6 border-b border-l border-white]">
            <h3 className="text-sm font-semibold text-[#FBDBAC] mb-1">Total Prima Meta</h3>
            <p className="text-2xl font-bold text-white">
              ${totalPrimaMeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-6 border-t border-r border-white]">
            <h3 className="text-sm font-semibold text-[#FBDBAC] mb-1">Prima Meta - Seguro de Vida (VI)</h3>
            <p className="text-2xl font-bold text-white">
              ${primaMetaVI.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-6 border-t border-l border-white]">
            <h3 className="text-sm font-semibold text-[#FBDBAC] mb-1">Prima Meta - Seguro de Gastos Mayores (GM)</h3>
            <p className="text-2xl font-bold text-white">
              ${primaMetaGM.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
