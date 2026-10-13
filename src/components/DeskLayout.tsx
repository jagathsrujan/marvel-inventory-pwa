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
      <style>{`
        .desk-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .desk-filters, .desk-rows, .desk-detail { min-width: 0; }
        @media (min-width: 1024px) {
          .desk-layout { grid-template-columns: 264px minmax(0, 1fr) 328px; gap: 24px; }
          .desk-layout.no-detail { grid-template-columns: 264px minmax(0, 1fr); }
          .desk-filters, .desk-detail { position: sticky; top: 16px; }
        }
      `}</style>
      <div className="desk-filters">{filters}</div>
      <div className="desk-rows">{rows}</div>
      {detail ? <div className="desk-detail">{detail}</div> : null}
    </div>
  );
}

export default DeskLayout;
