// MARVEL V1 — DataTable: accessible table with sortable columns, 48px targets, sticky header.
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  getValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: Array<T>;
  getRowId: (row: T, index: number) => string;
  caption?: string;
  emptyText?: string;
  defaultSortKey?: string;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  emptyText = 'No rows to show.',
  defaultSortKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.getValue ? col.getValue(a) : '';
      const vb = col.getValue ? col.getValue(b) : '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
      return;
    }
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  return (
    <div className="dt-wrap">
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key;
              const dirLabel = active ? (sortDir === 'desc' ? ', sorted descending' : ', sorted ascending') : '';
              if (c.sortable) {
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                    style={{ textAlign: c.align ?? 'left' }}
                  >
                    <button
                      type="button"
                      className="hcell"
                      onClick={() => toggleSort(c.key)}
                      aria-label={`Sort by ${c.label}${dirLabel}`}
                    >
                      <span>{c.label}</span>
                      <span aria-hidden="true">{active ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}</span>
                    </button>
                  </th>
                );
              }
              return (
                <th key={c.key} scope="col" style={{ textAlign: c.align ?? 'left' }}>
                  <span className="hcell">{c.label}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={getRowId(row, i)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render ? c.render(row) : c.getValue ? String(c.getValue(row)) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 ? <div className="dt-empty">{emptyText}</div> : null}
    </div>
  );
}

export default DataTable;
