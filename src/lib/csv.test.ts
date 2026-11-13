import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows, with money as plain whole numbers", () => {
    expect(toCsv(["Month", "Collected"], [["2026-10", 41_847_000], ["2026-11", 36_826_000]])).toBe(
      "Month,Collected\r\n2026-10,41847000\r\n2026-11,36826000\r\n",
    );
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(["Group"], [["English, B1"], ['The "best" group'], ["two\nlines"]])).toBe(
      'Group\r\n"English, B1"\r\n"The ""best"" group"\r\n"two\nlines"\r\n',
    );
  });

  it("keeps Uzbek and Cyrillic text and writes null as an empty cell", () => {
    expect(toCsv(["Guruh", "Davomat"], [["Rus tili boshlangʻich", null], ["Математика", 95.9]])).toBe(
      "Guruh,Davomat\r\nRus tili boshlangʻich,\r\nМатематика,95.9\r\n",
    );
  });

  it("stops a cell from running as a spreadsheet formula", () => {
    expect(toCsv(["Name"], [["=SUM(A1:A9)"], ["+998901234567"], ["-5"], ["@cmd"]])).toBe(
      "Name\r\n'=SUM(A1:A9)\r\n'+998901234567\r\n'-5\r\n'@cmd\r\n",
    );
    // Numbers are numbers, also below zero.
    expect(toCsv(["Profit"], [[-5000]])).toBe("Profit\r\n-5000\r\n");
  });
});
