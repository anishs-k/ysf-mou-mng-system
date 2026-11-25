/**
 * Purpose: One look for the header row of every exported Excel sheet (Full
 * Details, Only MoU, Contacts): bold text only - no colour - frozen so it stays
 * in view while scrolling. Call it after the sheet's columns are set.
 */

import type ExcelJS from "exceljs";

export function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
