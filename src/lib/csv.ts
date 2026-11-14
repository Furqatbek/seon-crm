// CSV for the report exports. Plain values only: money is whole soʻm as a
// number, so a spreadsheet can add it up.

export type CsvCell = string | number | null;

/** One cell: quoted when it has a comma, quote or line break. */
function cell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  // A cell starting with = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows to CSV text (RFC 4180 line ends). */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
