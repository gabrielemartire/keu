import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Field({ label, hint, error, children, wide }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  invalid,
  mono,
  list,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  invalid?: boolean
  mono?: boolean
  list?: string
}) {
  return (
    <input
      className={`input${invalid ? ' invalid' : ''}${mono ? ' mono' : ''}`}
      value={value}
      placeholder={placeholder}
      list={list}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Numeric input that keeps a local draft so the user can clear it while typing. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  decimal,
  suffix,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  decimal?: boolean
  suffix?: string
}) {
  const show = (v: number | null) => (v === null ? '' : String(Math.round(v * 100) / 100).replace('.', ','))
  const [draft, setDraft] = useState(show(value))
  useEffect(() => setDraft((d) => (parse(d) === value ? d : show(value))), [value])
  function parse(v: string): number | null {
    const t = v.trim().replace(',', '.')
    if (t === '') return null
    if (!(decimal ? /^\d+(\.\d*)?$/ : /^\d+$/).test(t)) return NaN
    return Number(t)
  }
  const n = parse(draft)
  const invalid = draft !== '' && (n === null || Number.isNaN(n) || (min !== undefined && n! < min) || (max !== undefined && n! > max))
  const input = (
    <input
      className={`input mono${invalid ? ' invalid' : ''}`}
      value={draft}
      inputMode={decimal ? 'decimal' : 'numeric'}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = parse(e.target.value)
        if (v === null) onChange(null)
        else if (!Number.isNaN(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v)
      }}
    />
  )
  return suffix ? (
    <span className="input-suffix">
      {input}
      <span>{suffix}</span>
    </span>
  ) : (
    input
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Select<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean }) {
  return (
    <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** On/off toggle switch. */
export function Switch({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <label className={`switch${checked ? ' on' : ''}`} title={title}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  const id = useId()
  return (
    <div className="checkbox">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  )
}

/** Editable list of short strings (DNS/NTP servers). */
export function ListEditor({
  values,
  onChange,
  placeholder,
  validate,
  suggestions,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  validate?: (v: string) => boolean
  suggestions?: { value: string; label: string }[]
}) {
  const [draft, setDraft] = useState('')
  const add = (v: string) => {
    const t = v.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t])
    setDraft('')
  }
  const remaining = suggestions?.filter((s) => !values.includes(s.value)) ?? []
  return (
    <div className="list-editor">
      {values.length > 0 && (
        <div className="chips">
          {values.map((v, i) => (
            <span key={v} className={`chip${validate && !validate(v) ? ' chip-bad' : ''}`}>
              <span className="mono">{v}</span>
              {i > 0 && (
                <button type="button" title="Sposta su" onClick={() => onChange(swap(values, i, i - 1))}>
                  ↑
                </button>
              )}
              <button type="button" title="Rimuovi" onClick={() => onChange(values.filter((x) => x !== v))}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="input mono"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={() => add(draft)} disabled={!draft.trim()}>
          Aggiungi
        </button>
      </div>
      {remaining.length > 0 && (
        <div className="suggestions">
          {remaining.slice(0, 4).map((s) => (
            <button key={s.value} type="button" className="suggestion" onClick={() => add(s.value)}>
              + {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const out = [...arr]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}
