import React from 'react'

export default function DynamicForm({ fields, values, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map(f => {
        const val = values[f.name] ?? ''
        const commonProps = {
          id: f.name,
          value: val,
          onChange: e => onChange(f.name, e.target.value),
          className: 'input-base',
          placeholder: f.placeholder || '',
          required: !!f.required,
        }
        const isFullWidth = f.fullWidth || f.type === 'textarea'
        return (
          <div key={f.name} className={isFullWidth ? 'sm:col-span-2' : ''}>
            <label htmlFor={f.name} className="block text-xs font-medium text-zinc-400 mb-1.5">
              {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {f.type === 'select' ? (
              <select {...commonProps} className="input-base">
                {!f.required && <option value="">— Select —</option>}
                {f.options?.map(o => {
                  const { val: optVal, label } = typeof o === 'string' ? { val: o, label: o } : o
                  return <option key={optVal} value={optVal}>{label}</option>
                })}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea {...commonProps} rows={3} className="input-base resize-none" />
            ) : (
              <input {...commonProps} type={f.type || 'text'} />
            )}
          </div>
        )
      })}
    </div>
  )
}
