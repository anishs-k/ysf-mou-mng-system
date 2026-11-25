/**
 * Purpose: One look for the header row of every exported Excel sheet (Full
 * Details, Only MoU, Contacts): bold text on a light blue band with a thin
 * bottom border, wrapped and vertically centred, and frozen so it stays in view
 * while scrolling. Call it after the sheet's columns are set.
 */

import type ExcelJS from "exceljs";

const HEADER_FILL = "FFDCE6F1";
const HEADER_BORDER = "FF8EA9DB";

export function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: HEADER_BORDER } } };
  });
  header.height = 30;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
