# SPEC-35 — Invoice fields, YSI-only guards and the sheet's fee names

**Amends:** SPEC-31 (client sheet fields), SPEC-34 (YSF / YSI), SPEC-22 / SPEC-30 (bulk template).
**Source:** client instruction, 2026-11-25. This is the last gap between the MOU TEMPLATE's YSF and YSI sheets and the app.

---

## 1. Two new fields (YSF and YSI)

| Client sheet column | App field | Rule |
|---|---|---|
| MATCH WITH INVOICE | **Match with Invoice** (`mou.invoice_match`) | Optional list: Match / No Match (`MATCH`, `NO_MATCH`) |
| INVOICE REMARK / "mou and invoice problem" | **Invoice Remark** (`mou.invoice_remark`) | Optional text, at most 500 characters |

Migration `0024_spec35_invoice_match` adds two nullable columns and a CHECK. Nothing
existing changes.

The fields appear on:
- the wizard's MoU Tracking card and the Review step;
- the bulk template, after Mail Confirmation and after Remark;
- the record view, the record PDF, and the Excel Commercial sheet.

## 2. YSI-only guards

1. **Other rows:** a YSF agreement may not add an Other charge named like a YSI-only
   fee. The error is *"This fee is for YSI only. Choose YSI to add it."*
   - Names are compared on their letters only, ignoring a trailing "fee(s)" or "charge(s)".
     So "Examination fee" and "EXAMINATION FEES" both match.
   - "Education / Training" is not caught, because it is a YSF column.
   - The same rule runs in the wizard, on final save, and in Edit Agreement. In Edit
     Agreement a row the agreement already held may stay.
2. **Bulk template:** each YSI-only fee column's format reads *"… YSI only - leave
   blank for YSF"*.

## 3. Fee names follow the client sheet

| Key (unchanged) | Old label | New label |
|---|---|---|
| `EDUCATION_CHARGES` | Education Charges | **Education Fees** |
| `ONE_TIME_REGISTRATION_FEES` | One Time Registration Fees | **Course Registration Fees** |

- Only the label changes. Stored data and keys stay the same.
- The old names are kept in `COMMERCIAL_ITEM_LEGACY_LABELS`. A bulk sheet with the
  old header, or a PDF charge row with the old name, still matches.
- D161 still applies: a sheet must hold every current header. A template
  downloaded before SPEC-34 / SPEC-35 has to be downloaded again.
