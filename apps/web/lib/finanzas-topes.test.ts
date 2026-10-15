import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPCION_GASTO,
  MAX_MONTO_FINANZAS,
  MAX_MOTIVO_ANULAR_GASTO,
  MAX_NOMBRE_ACTIVO,
  MAX_NOMBRE_CUENTA,
  MAX_NUMERO_CUENTA,
  MAX_REFERENCIA_MOVIMIENTO,
} from "./finanzas-topes";

const MIG = readFileSync(join(__dirname, "../../../supabase/migrations/20261015002000_finanzas_montos_y_textos_parte1.sql"), "utf8");
// La cuenta y la referencia de un movimiento ya tenían su tope desde que nació Cuentas y dinero.
const CUENTAS = readFileSync(join(__dirname, "../../../supabase/migrations/20260925110000_finanzas_cuentas_y_dinero.sql"), "utf8");
const tope = (tabla: string, columna: string) => Number(MIG.match(new RegExp(`candado\\('${tabla}'[^;]*char_length\\(${columna}\\) <= (\\d+)`))?.[1]);
const topeDeCuentas = (columna: string) => Number(CUENTAS.match(new RegExp(`char_length\\(${columna}\\) <= (\\d+)`))?.[1]);
const monto = (tabla: string, columna: string) => Number(MIG.match(new RegExp(`candado\\('${tabla}'[^;]*${columna} <= (\\d+)`))?.[1]);

describe("los topes de Finanzas son los de la base (ADR-0412)", () => {
  it("textos de gastos, gastos fijos, movimientos, cuentas y activos", () => {
    expect(tope("gastos", "descripcion")).toBe(MAX_DESCRIPCION_GASTO);
    expect(tope("gastos_fijos", "descripcion")).toBe(MAX_DESCRIPCION_GASTO);
    expect(tope("gastos", "motivo_anulacion")).toBe(MAX_MOTIVO_ANULAR_GASTO);
    expect(topeDeCuentas("referencia")).toBe(MAX_REFERENCIA_MOVIMIENTO);
    expect(topeDeCuentas("nombre")).toBe(MAX_NOMBRE_CUENTA);
    expect(topeDeCuentas("numero")).toBe(MAX_NUMERO_CUENTA);
    expect(tope("activos_fijos", "nombre")).toBe(MAX_NOMBRE_ACTIVO);
  });
  it("el monto de un gasto y de un movimiento de dinero", () => {
    expect(monto("gastos", "monto_total")).toBe(MAX_MONTO_FINANZAS);
    expect(monto("movimientos_dinero", "monto")).toBe(MAX_MONTO_FINANZAS);
  });
  it("un activo se registra como gasto: su nombre cabe en la descripción del gasto", () => {
    expect(MAX_NOMBRE_ACTIVO).toBeLessThanOrEqual(MAX_DESCRIPCION_GASTO);
  });
});
