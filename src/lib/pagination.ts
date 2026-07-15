export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type PageParams = {
  page: number;
  pageSize: number;
};

export type PageResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type SortOrder = {
  column: string;
  ascending: boolean;
};

/** Clamp page/pageSize to safe values for Supabase `.range()`. */
export function normalizePageParams(
  params: Partial<PageParams> | undefined,
  fallbackPageSize: number = DEFAULT_PAGE_SIZE,
): PageParams {
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(params?.pageSize ?? fallbackPageSize) || fallbackPageSize),
  );
  const page = Math.max(1, Math.floor(params?.page ?? 1) || 1);
  return { page, pageSize };
}

/** Inclusive range for PostgREST `.range(from, to)`. */
export function toRange(page: number, pageSize: number): { from: number; to: number } {
  const { page: p, pageSize: s } = normalizePageParams({ page, pageSize });
  const from = (p - 1) * s;
  return { from, to: from + s - 1 };
}

export function totalPages(total: number, pageSize: number): number {
  const size = Math.max(1, pageSize);
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

export function pageWindow(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const { from } = toRange(page, pageSize);
  const start = from + 1;
  const end = Math.min(from + pageSize, total);
  return { from: start, to: end };
}

export function emptyPageResult<T>(
  params?: Partial<PageParams>,
): PageResult<T> {
  const { page, pageSize } = normalizePageParams(params);
  return { rows: [], total: 0, page, pageSize };
}
