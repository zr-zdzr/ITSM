import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { cn } from "../../lib/utils";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function SortIcon({ colKey, sort }) {
  if (sort.key !== colKey)
    return <ChevronsUpDown size={12} className="opacity-30" />;
  return sort.dir === "asc" ? (
    <ChevronUp size={12} style={{ color: "var(--brand)" }} />
  ) : (
    <ChevronDown size={12} style={{ color: "var(--brand)" }} />
  );
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3)
    return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

function SkeletonRow({ cols, selectable }) {
  return (
    <tr style={{ pointerEvents: "none" }}>
      {selectable && (
        <td>
          <div
            className="skeleton-box"
            style={{ width: 16, height: 16, borderRadius: 3 }}
          />
        </td>
      )}
      {cols.map((_, i) => (
        <td key={i}>
          <div
            className="skeleton-box"
            style={{
              height: 13,
              width: `${55 + ((i * 17) % 40)}%`,
              borderRadius: 4,
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function DataTable({
  columns,
  data,
  loading,
  searchPlaceholder = "Search…",
  selectable = false,
  selectedIds,
  onSelectionChange,
  onRowClick,
  emptyTitle = "No records found",
  emptyMessage = "",
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      columns.some((col) =>
        String(row[col.key] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data, query, columns]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    return filtered.toSorted((a, b) => {
      const va = String(a[sort.key] ?? ""),
        vb = String(b[sort.key] ?? "");
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [filtered, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, data]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const filteredIds = useMemo(
    () => filtered.map((r) => r.id).filter(Boolean),
    [filtered],
  );
  const allChecked =
    selectable &&
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds?.has(id));
  const someChecked =
    selectable && filteredIds.some((id) => selectedIds?.has(id));
  const headerCheckRef = useRef(null);

  useEffect(() => {
    if (headerCheckRef.current)
      headerCheckRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allChecked) {
      const next = new Set(selectedIds);
      filteredIds.forEach((id) => next.delete(id));
      onSelectionChange(next);
    } else {
      onSelectionChange(new Set([...(selectedIds || []), ...filteredIds]));
    }
  }

  function toggleRow(id) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  }

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
    setPage(1);
  }

  const isFiltered = query.trim().length > 0;
  const showEmpty = !loading && paginated.length === 0;

  return (
    <div className="d-flex flex-column gap-3">
      {/* Search */}
      <div className="d-flex align-items-center gap-2">
        <div className="position-relative flex-grow-1">
          <Search
            size={14}
            className="position-absolute text-secondary"
            style={{
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="form-control form-control-sm"
            style={{ paddingLeft: "2rem" }}
          />
        </div>
        {isFiltered && (
          <button
            className="btn btn-sm btn-outline-secondary flex-shrink-0"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="itms-card overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      ref={headerCheckRef}
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() =>
                      col.sortable !== false && toggleSort(col.key)
                    }
                    style={{
                      cursor: col.sortable !== false ? "pointer" : "default",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    <div className="d-flex align-items-center gap-1">
                      {col.label}
                      {col.sortable !== false && (
                        <SortIcon colKey={col.key} sort={sort} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow key={i} cols={columns} selectable={selectable} />
                ))
              ) : showEmpty ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="text-center py-5"
                  >
                    <div className="d-flex flex-column align-items-center gap-2 text-secondary">
                      <Inbox size={36} className="opacity-40" />
                      <p className="small fw-medium mb-0">
                        {isFiltered ? `No results for "${query}"` : emptyTitle}
                      </p>
                      {!isFiltered && emptyMessage && (
                        <p
                          className="small mb-0 opacity-75"
                          style={{ fontSize: "0.75rem" }}
                        >
                          {emptyMessage}
                        </p>
                      )}
                      {isFiltered && (
                        <button
                          className="btn btn-sm btn-link text-secondary p-0 mt-1"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => setQuery("")}
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    onClick={() => onRowClick?.(row)}
                    style={{
                      cursor: onRowClick ? "pointer" : "default",
                    }}
                    className={cn(
                      selectedIds?.has(row.id) ? "table-active" : "",
                      onRowClick ? "row-clickable" : "",
                    )}
                  >
                    {selectable && (
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(row.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedIds?.has(row.id) ?? false}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("align-middle", col.className)}
                        style={{ whiteSpace: "nowrap" }}
                        onClick={
                          col.key === "_actions"
                            ? (e) => e.stopPropagation()
                            : undefined
                        }
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : (row[col.key] ?? (
                              <span className="text-secondary">—</span>
                            ))}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      {sorted.length > 0 && (
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 small">
          <div className="d-flex align-items-center gap-2 text-secondary">
            <span>
              {sorted.length} record{sorted.length !== 1 ? "s" : ""}
            </span>
            <select
              className="form-select form-select-sm"
              style={{ width: "auto", fontSize: "0.75rem" }}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>

          {totalPages > 1 && (
            <nav aria-label="Table pagination">
              <ul className="pagination pagination-sm mb-0">
                <li className={cn("page-item", page <= 1 && "disabled")}>
                  <button
                    className="page-link"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft size={13} />
                  </button>
                </li>
                {pageNumbers(page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <li key={`e${i}`} className="page-item disabled">
                      <span className="page-link px-2">…</span>
                    </li>
                  ) : (
                    <li
                      key={p}
                      className={cn("page-item", p === page && "active")}
                    >
                      <button
                        className="page-link"
                        style={{ minWidth: 36 }}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    </li>
                  ),
                )}
                <li
                  className={cn("page-item", page >= totalPages && "disabled")}
                >
                  <button
                    className="page-link"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight size={13} />
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
