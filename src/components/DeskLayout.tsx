// MARVEL V1 — DeskLayout: CSS-grid recompose wrapper.
// Filters left / rows center / detail right at >=1024px, single column below.
// Pure CSS — no JS breakpoint logic.
import type { ReactNode } from 'react';

export interface DeskLayoutProps {
  /** Filter / facet panel. Left column on desk, stacks first on phones. */
  filters: ReactNode;
  /** Main row list (cards on phone, table on desk). Center column on desk. */
  rows: ReactNode;
  /** Optional detail panel. Right column on desk, stacks last on phones. */
  detail?: ReactNode;
}

export function DeskLayout({ filters, rows, detail }: DeskLayoutProps) {
  return (
    <div className={detail ? 'desk-layout' : 'desk-layout no-detail'}>
      <div className="desk-filters">{filters}</div>
      <div className="desk-rows">{rows}</div>
      {detail ? <div className="desk-detail">{detail}</div> : null}
    </div>
  );
}

export default DeskLayout;
