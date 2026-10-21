-- SPEC-23 D148: give every payroll config saved before PF / ESI / TDS existed the
-- statutory defaults - PF 12%, ESI 0.75%, TDS As applicable. Insert-only: a config
-- that already has a row for a key keeps it, so the migration is safe to re-run and
-- never changes an answer someone entered. Edit Agreement is where they are changed.
INSERT INTO "payroll_item" ("payroll_config_id", "item_key", "is_applicable", "amount", "item_type")
SELECT pc."id", d."item_key", true, d."amount", 'DEDUCTION'
  FROM "payroll_config" pc
 CROSS JOIN (VALUES ('PF', 12.00::numeric), ('ESI', 0.75::numeric), ('TDS', NULL::numeric)) AS d("item_key", "amount")
 WHERE NOT EXISTS (
         SELECT 1 FROM "payroll_item" pi
          WHERE pi."payroll_config_id" = pc."id" AND pi."item_key" = d."item_key"
       );
