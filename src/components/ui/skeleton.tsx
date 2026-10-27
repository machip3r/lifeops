import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading placeholders. Shapes mirror the real layout so nothing jumps when data arrives.
 * Screen readers get one "Cargando" status per region; the blocks themselves are hidden.
 */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden style={style} className={cn('rounded-md bg-(--lifeops-hover) motion-safe:animate-pulse', className)} />
  );
}

/** Wraps a skeleton region: announces loading once, hides the shapes from assistive tech. */
function SkeletonRegion({
  children,
  className,
  label = 'Cargando',
  bare = false,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  /** Inside another region: no extra announcement */
  bare?: boolean;
}) {
  if (bare) return <div className={className}>{children}</div>;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const cardClass = 'rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)';

export function PageHeaderSkeleton({ withEyebrow = false }: { withEyebrow?: boolean }) {
  return (
    <div className="mb-5 pt-5 sm:pt-7">
      {withEyebrow ? <Skeleton className="mb-3 h-3.5 w-28" /> : null}
      <Skeleton className="h-8 w-56 sm:h-9" />
      <Skeleton className="mt-2 h-4 w-full max-w-md" />
    </div>
  );
}

export function StatTilesSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', count >= 5 ? 'md:grid-cols-3 xl:grid-cols-5' : 'xl:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(cardClass, 'flex flex-col gap-2 px-4 py-3.5')}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3.5 w-3.5 rounded" />
          </div>
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Table rows only (sits inside an existing panel). */
export function TableSkeleton({ rows = 8, columns = 6, bare = false }: { rows?: number; columns?: number; bare?: boolean }) {
  return (
    <SkeletonRegion bare={bare}>
      <div className="border-b border-(--lifeops-border) bg-(--lifeops-hover)/60 px-4 py-2.5 sm:px-5">
        <div className="flex gap-6">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-2.5 flex-1 bg-(--lifeops-border)" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-(--lifeops-border)">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 py-3 sm:px-5">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton
                key={c}
                className={cn('h-3 flex-1', c === 0 && 'max-w-32', c === columns - 1 && 'h-5 max-w-24 rounded-full')}
              />
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Full list panel: search bar, chips and table. */
function ListPanelSkeleton({
  rows = 8,
  columns = 6,
  chips = 5,
  bare = false,
}: {
  rows?: number;
  columns?: number;
  chips?: number;
  bare?: boolean;
}) {
  return (
    <SkeletonRegion bare={bare} className={cn(cardClass, 'overflow-hidden')}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <Skeleton className="h-12 min-w-[200px] flex-1" />
        <Skeleton className="h-12 w-20" />
        <Skeleton className="h-12 w-36" />
      </div>
      {chips > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-(--lifeops-border) px-4 pb-3 sm:px-5">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      ) : null}
      <TableSkeleton rows={rows} columns={columns} bare />
    </SkeletonRegion>
  );
}

/** Card with a title and label / value lines (data panels, history, avisos). */
export function CardSkeleton({ lines = 5, className, bare = false }: { lines?: number; className?: string; bare?: boolean }) {
  return (
    <SkeletonRegion bare={bare} className={cn(cardClass, 'p-4 sm:p-5', className)}>
      <Skeleton className="mb-4 h-4 w-36" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className={cn('h-3', i % 2 ? 'w-20' : 'w-32')} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Chart card: title, subtitle and bars. */
const BAR_HEIGHTS = [55, 70, 40, 85, 60, 75, 45, 90, 65, 50, 80, 35];

export function ChartSkeleton({ className, bars = 12, bare = false }: { className?: string; bars?: number; bare?: boolean }) {
  return (
    <SkeletonRegion bare={bare} className={cn(cardClass, 'flex flex-col gap-3 p-4 sm:p-5', className)}>
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-3 w-64 max-w-full" />
      <div className="mt-2 flex h-40 items-end gap-2">
        {Array.from({ length: bars }, (_, i) => (
          <div key={i} className="flex h-full flex-1 items-end">
            <Skeleton className="w-full rounded-b-none" style={{ height: `${BAR_HEIGHTS[i % BAR_HEIGHTS.length]}%` }} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Dialog / settings form: labeled fields and the action row. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonRegion className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-1">
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-12 w-32" />
      </div>
    </SkeletonRegion>
  );
}

/** Vista general content (KPIs, cartera + avisos, two charts). */
export function OverviewSkeleton() {
  return (
    <SkeletonRegion label="Cargando resumen">
      <StatTilesSkeleton count={5} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartSkeleton className="lg:col-span-2" bars={4} bare />
        <CardSkeleton lines={4} bare />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartSkeleton bare />
        <ChartSkeleton bars={6} bare />
      </div>
    </SkeletonRegion>
  );
}

/** List pages (Pólizas, Clientes, Asesores, Cobranza). */
export function ListPageSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <SkeletonRegion className="space-y-4">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={tiles} />
      <ListPanelSkeleton bare />
    </SkeletonRegion>
  );
}

/** Expedientes (póliza, cliente, asesor): header, KPIs, side card + main card, table. */
export function DetailPageSkeleton() {
  return (
    <SkeletonRegion className="space-y-4">
      <PageHeaderSkeleton withEyebrow />
      <StatTilesSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardSkeleton lines={6} bare />
        <ChartSkeleton className="lg:col-span-2" bars={6} bare />
      </div>
      <ListPanelSkeleton rows={4} chips={0} bare />
    </SkeletonRegion>
  );
}

/** Generic page (profile, documents). */
export function PageSkeleton() {
  return (
    <SkeletonRegion className="space-y-4">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton lines={6} bare />
        <CardSkeleton lines={6} bare />
      </div>
    </SkeletonRegion>
  );
}

/** Before the session / profile is known: app chrome + a list page. */
export function AppShellSkeleton() {
  return (
    <SkeletonRegion className="flex min-h-screen bg-(--lifeops-page)" label="Cargando LifeOps">
      <div className="hidden w-[232px] shrink-0 flex-col border-r border-(--lifeops-border) bg-(--lifeops-chrome) lg:flex">
        <div className="flex h-16 items-center border-b border-(--lifeops-border) px-4">
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="space-y-1.5 px-2.5 py-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-14 items-center border-b border-(--lifeops-border) bg-(--lifeops-chrome) px-3 lg:hidden">
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <PageHeaderSkeleton />
          <StatTilesSkeleton />
          <div className="mt-4">
            <ListPanelSkeleton bare />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Auth / invite card (centered form). */
export function AuthCardSkeleton() {
  return (
    <SkeletonRegion className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <FormSkeleton fields={2} />
    </SkeletonRegion>
  );
}
