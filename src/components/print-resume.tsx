'use client'

export function PrintResume({ label }: Readonly<{ label: string }>) {
  return (
    <button className="cv-print" onClick={() => window.print()} type="button">
      {label}
    </button>
  )
}
