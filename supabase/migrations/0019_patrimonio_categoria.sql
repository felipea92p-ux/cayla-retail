-- Categoría real de cada partida de patrimonio (encargo de Felipe: "mi IME debe estar
-- bien categorizado"). Alineado al plan de cuentas del manual (docs/MANUAL-CONTABLE-CAYLA.md):
-- activos e IME por su naturaleza PCGE, pasivos por tipo de deuda.
alter table patrimonio_items add column categoria text;
