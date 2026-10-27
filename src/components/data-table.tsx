'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { SortableHeaderButton } from '@/components/sortable-th';
import type { SortDir } from '@/lib/table-sort';
import { cn } from '@/lib/utils';

/** Panel around a dashboard table. Same chrome as Cobranza. */
export const dataTablePanelClass =
  'overflow-hidden rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) shadow-lg';

type DataTableSort = {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
};

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sort?: DataTableSort;
  align?: 'left' | 'right';
  /** Pinned actions column. Clicks here do not activate the row. */
  sticky?: boolean;
  tone?: 'default' | 'muted' | 'accent';
  className?: string;
  headerClassName?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Highlights the row with this key (e.g. the one shown in a side panel) */
  selectedRowKey?: string | null;
  empty?: ReactNode;
  className?: string;
};

const headerCellClass =
  'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide whitespace-nowrap text-(--lifeops-muted) first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5';

const bodyCellClass = 'px-3 py-2.5 text-[13px] whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5';

function toneClass(tone: DataTableColumn<unknown>['tone']) {
  if (tone === 'muted') return 'text-(--lifeops-muted)';
  if (tone === 'accent') return 'font-medium text-(--lifeops-accent)';
  return 'text-(--lifeops-fg)';
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  selectedRowKey,
  empty,
  className,
}: DataTableProps<T>) {
  const activateRow = (row: T) => {
    onRowClick?.(row);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activateRow(row);
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-(--lifeops-border)">
        <thead className="bg-(--lifeops-hover)">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  headerCellClass,
                  column.align === 'right' && 'text-right',
                  column.sticky && 'sticky right-0 z-10 bg-(--lifeops-hover)',
                  column.headerClassName,
                )}
              >
                <div className={cn(column.align === 'right' && 'flex justify-end')}>
                  {column.sort ? (
                    <SortableHeaderButton
                      label={column.sort.label}
                      active={column.sort.active}
                      dir={column.sort.dir}
                      onSort={column.sort.onSort}
                    />
                  ) : (
                    column.header
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-(--lifeops-border)">
          {rows.length === 0 && empty ? (
            <tr className="bg-(--lifeops-chrome)">
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-(--lifeops-muted)"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className={cn(
                  'group bg-(--lifeops-chrome) hover:bg-(--lifeops-hover)/70',
                  onRowClick && 'cursor-pointer',
                  selectedRowKey != null &&
                    getRowKey(row) === selectedRowKey &&
                    'bg-(--lifeops-hover) shadow-[inset_3px_0_0_var(--lifeops-accent)]',
                )}
                aria-selected={selectedRowKey != null ? getRowKey(row) === selectedRowKey : undefined}
                onClick={onRowClick ? () => activateRow(row) : undefined}
                onKeyDown={onRowClick ? (event) => onRowKeyDown(event, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      bodyCellClass,
                      toneClass(column.tone),
                      column.align === 'right' && 'text-right',
                      column.sticky &&
                        'sticky right-0 z-10 bg-(--lifeops-chrome) font-medium group-hover:bg-(--lifeops-hover)/70',
                      column.sticky &&
                        selectedRowKey != null &&
                        getRowKey(row) === selectedRowKey &&
                        'bg-(--lifeops-hover)',
                      column.className,
                    )}
                    onClick={
                      column.sticky
                        ? (event) => {
                            event.stopPropagation();
                          }
                        : undefined
                    }
                    onKeyDown={
                      column.sticky
                        ? (event) => {
                            event.stopPropagation();
                          }
                        : undefined
                    }
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
