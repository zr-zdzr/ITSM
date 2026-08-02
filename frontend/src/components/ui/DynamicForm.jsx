
const EMPTY_ERRORS = {};
export default function DynamicForm({
  fields,
  values,
  onChange,
  errors = EMPTY_ERRORS,
}) {
  return (
    <div className="row g-3">
      {fields.map((f) => {
        const val = values[f.name] ?? "";
        const err = errors[f.name];
        const invalid = !!err;
        const commonProps = {
          id: f.name,
          value: val,
          onChange: (e) => onChange(f.name, e.target.value),
          placeholder: f.placeholder || "",
          required: !!f.required,
        };
        const isFullWidth = f.fullWidth || f.type === "textarea";
        return (
          <div key={f.name} className={isFullWidth ? "col-12" : "col-md-6"}>
            <label htmlFor={f.name} className="form-label small fw-medium mb-1">
              {f.label}
              {f.required && <span className="text-danger ms-1">*</span>}
            </label>
            {f.type === "select" ? (
              <select
                {...commonProps}
                className={`form-select${invalid ? " is-invalid" : ""}`}
              >
                {!f.required && <option value="">— Select —</option>}
                {f.options?.map((o) => {
                  const { val: optVal, label } =
                    typeof o === "string" ? { val: o, label: o } : o;
                  return (
                    <option key={optVal} value={optVal}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                {...commonProps}
                rows={3}
                className={`form-control${invalid ? " is-invalid" : ""}`}
                style={{ resize: "none" }}
              />
            ) : (
              <input
                {...commonProps}
                type={f.type || "text"}
                className={`form-control${invalid ? " is-invalid" : ""}`}
              />
            )}
            {invalid && (
              <div
                className="invalid-feedback d-block"
                style={{ fontSize: "0.75rem" }}
              >
                {err}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
