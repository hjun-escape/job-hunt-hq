import { sortRows, type Column, type SortDir } from "./sortRows";

interface TableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  selectedId?: string;
}

export function Table<T extends { id: string }>({ rows, columns, sortKey, sortDir = "asc", onSort, onRowClick, emptyText = "Nothing here yet.", selectedId }: TableProps<T>) {
  const column = columns.find((c) => c.key === sortKey);
  const sorted = sortRows(rows, column, sortDir);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align ?? "left" }} aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                {c.sortValue && onSort ? (
                  <button type="button" className="th-sort" onClick={() => onSort(c.key)}>
                    {c.header}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty">{emptyText}</td></tr>
          ) : sorted.map((row) => (
            <tr
              key={row.id}
              className={[onRowClick ? "clickable" : "", selectedId === row.id ? "selected" : ""].join(" ").trim()}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => {
                if (e.key === "Enter") onRowClick(row);
                else if (e.key === " ") { e.preventDefault(); onRowClick(row); }
              } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
