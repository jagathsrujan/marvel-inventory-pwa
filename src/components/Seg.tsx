import type { CSSProperties } from 'react'

type SegOption<T extends string> = { value: T; label: string }

/**
 * iOS-style segmented control with a sliding glass thumb.
 *
 * The thumb is a separate layer translated to the pressed column's index;
 * the CSS transition always retargets from its current position, so tapping
 * mid-slide is smooth (interruptible, per the fluid-interface house style).
 * Real buttons keep aria-pressed for assistive tech; the thumb is aria-hidden.
 */
export default function Seg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  cols,
}: {
  options: readonly SegOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  cols?: number
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return (
    <div
      className={cols ? `seg cols-${cols}` : 'seg'}
      role="group"
      aria-label={ariaLabel}
      style={{ '--seg-n': options.length, '--seg-i': idx } as CSSProperties}
    >
      <span aria-hidden="true" className="seg-thumb" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
