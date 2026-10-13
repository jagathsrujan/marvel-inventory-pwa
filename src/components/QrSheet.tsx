import type { CSSProperties } from 'react';

export interface ItemLabelProps {
  title: string;
  sku: string;
  home: string;
  qrDataUrl: string | null;
  style?: CSSProperties;
}

export interface LocationLabelProps {
  code: string;
  name: string;
  qrDataUrl: string | null;
  laminatedNote: boolean;
  style?: CSSProperties;
}

const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export function ItemLabel({ title, sku, home, qrDataUrl, style }: ItemLabelProps) {
  return (
    <div className="mv-item-label" style={{ width: '100%', maxWidth: 220, border: '1px solid #222', padding: 8, display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'system-ui, sans-serif', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
          {title}
        </div>
        <div style={{ fontSize: 11, ...mono }}>{sku}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>&gt; {home}</div>
      </div>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={`QR for ${sku}`} width={64} height={64} style={{ width: 64, height: 64 }} />
      ) : (
        <div style={{ width: 64, height: 64, border: '1px dashed #888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
          Loading QR
        </div>
      )}
    </div>
  );
}

export function LocationLabel({ code, name, qrDataUrl, laminatedNote, style }: LocationLabelProps) {
  return (
    <div className="mv-location-label" style={{ width: '100%', maxWidth: 320, border: '2px solid #222', padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', ...style }}>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, ...mono }}>{code}</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>{name}</div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR for location ${code}`} width={120} height={120} style={{ width: 120, height: 120 }} />
        ) : (
          <div style={{ width: 120, height: 120, border: '1px dashed #888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
            Loading QR
          </div>
        )}
      </div>
      {laminatedNote ? (
        <div style={{ fontSize: 11, marginTop: 8, color: '#444' }}>Laminate before sticking on rack</div>
      ) : null}
    </div>
  );
}
