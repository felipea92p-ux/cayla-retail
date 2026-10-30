import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_MOTIVO_INGRESO,
  MAX_TEXTO_INGRESO,
  MOTIVO_LOTE_USADO,
  MOTIVOS_CORREGIR_INGRESO,
  RPC_CORREGIR_INGRESO,
  RPC_ELIMINAR_INGRESO,
  RPC_INGRESOS_ELIMINADOS,
  RPC_RESTAURAR_INGRESO,
  cambiosDelIngreso,
  cantidadComoEscrita,
  costoComoEscrito,
  escritoDeFabrica,
  ingresoLeido,
  leerCantidadDelIngreso,
  leerCostoDelIngreso,
  motivoParaNoTocarIngreso,
  problemaDeMotivoIngreso,
  problemasDelIngreso,
  resumenDeCambios,
  type IngresoEditable,
} from "./ingreso-insumo-reglas";
import { leerCostoUnitario } from "./monto-plata-reglas";

const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20261030134000_insumos_corregir_y_eliminar_ingreso.sql", import.meta.url), "utf8");
const HOY = "2026-10-30";
const LOTE: IngresoEditable = { cantidad: 9, costo: 11.1111, fecha: "2026-10-29", documento: "F001-1", codigo: "LT-9" };
const VE = { veCostos: true, hoy: HOY };
const SIN = { veCostos: false, hoy: HOY };

describe("Corregir un ingreso: la hoja nace con el lote tal como está y NUNCA rechaza lo que no se tocó", () => {
  it("lo de fábrica no tiene ningún problema y no cambia nada", () => {
    const e = escritoDeFabrica(LOTE);
    expect(problemasDelIngreso(e, LOTE, VE)).toEqual([]);
    const leido = ingresoLeido(e, LOTE, VE);
    expect(leido).toEqual(LOTE);
    expect(cambiosDelIngreso(LOTE, leido as IngresoEditable).alguno).toBe(false);
  });

  it("el costo escrito se lee de vuelta igual: cuatro decimales, a céntimos o con tres decimales guardados", () => {
    for (const costo of [11.1111, 12.5, 5, 0, 0.045, 11.111, 0.0451, 100000]) {
      const texto = costoComoEscrito(costo);
      expect(leerCostoUnitario(texto), `«${texto}» de ${costo}`).toBeCloseTo(costo, 4);
      expect(leerCostoDelIngreso(texto, { ...LOTE, costo })).toBe(costo);
    }
  });

  it("un lote con tres decimales (otra puerta los permite) no se rechaza si la persona no tocó la cantidad", () => {
    const lote = { ...LOTE, cantidad: 7.125 };
    const e = escritoDeFabrica(lote);
    expect(e.cantidad).toBe("7.125");
    expect(leerCantidadDelIngreso(e.cantidad, lote)).toBe(7.125);
    expect(problemasDelIngreso(e, lote, VE)).toEqual([]);
    // Pero si la escribe de nuevo con tres decimales distintos, sí se rechaza (el campo solo escribe dos).
    expect(problemasDelIngreso({ ...e, cantidad: "7.126" }, lote, VE)).toContain("No se entiende la cantidad: escríbela así, 48.2 o 48,2.");
  });

  it("un ingreso de después de las 7 de la noche (día de mañana en UTC) no se rechaza si no se toca el día", () => {
    const lote = { ...LOTE, fecha: "2026-10-31" };
    expect(problemasDelIngreso(escritoDeFabrica(lote), lote, VE)).toEqual([]);
    expect(problemasDelIngreso({ ...escritoDeFabrica(lote), fecha: "2026-11-02" }, lote, VE)).toContain("El día del ingreso no puede ser de mañana.");
  });

  it("cantidad con coma, cero, vacía o ilegible", () => {
    const base = escritoDeFabrica(LOTE);
    expect(leerCantidadDelIngreso("7,5", LOTE)).toBe(7.5);
    expect(problemasDelIngreso({ ...base, cantidad: "7,5" }, LOTE, VE)).toEqual([]);
    expect(problemasDelIngreso({ ...base, cantidad: "0" }, LOTE, VE)[0]).toContain("mayor que cero");
    expect(problemasDelIngreso({ ...base, cantidad: "" }, LOTE, VE)[0]).toContain("No se entiende la cantidad");
    expect(problemasDelIngreso({ ...base, cantidad: "1.200" }, LOTE, VE)[0]).toContain("No se entiende la cantidad");
    expect(problemasDelIngreso({ ...base, cantidad: "abc" }, LOTE, VE)[0]).toContain("No se entiende la cantidad");
  });

  it("el costo vacío o ilegible se dice; un costo de 0 es válido; quien no ve costos no lo escribe", () => {
    const base = escritoDeFabrica(LOTE);
    expect(problemasDelIngreso({ ...base, costo: "" }, LOTE, VE)[0]).toContain("costo");
    expect(problemasDelIngreso({ ...base, costo: "12.500" }, LOTE, VE)[0]).toContain("No se entiende el costo");
    expect(problemasDelIngreso({ ...base, costo: "0" }, LOTE, VE)).toEqual([]);
    // Sin ver costos: el campo no existe, así que no se revisa y el costo que se manda es el del lote.
    const sinCosto = { ...LOTE, costo: null };
    expect(problemasDelIngreso({ ...escritoDeFabrica(sinCosto), costo: "" }, sinCosto, SIN)).toEqual([]);
    expect(ingresoLeido(escritoDeFabrica(sinCosto), sinCosto, SIN)?.costo).toBeNull();
  });

  it("el día vacío o de mañana, y los textos de más de 40 letras", () => {
    const base = escritoDeFabrica(LOTE);
    expect(problemasDelIngreso({ ...base, fecha: "" }, LOTE, VE)[0]).toContain("Elige el día");
    expect(problemasDelIngreso({ ...base, fecha: "2026-10-31" }, LOTE, VE)[0]).toContain("de mañana");
    expect(problemasDelIngreso({ ...base, fecha: HOY }, LOTE, VE)).toEqual([]);
    expect(problemasDelIngreso({ ...base, documento: "x".repeat(MAX_TEXTO_INGRESO + 1) }, LOTE, VE)[0]).toContain("hasta 40 letras");
    expect(problemasDelIngreso({ ...base, codigo: "x".repeat(MAX_TEXTO_INGRESO) }, LOTE, VE)).toEqual([]);
  });

  it("qué cambió de verdad: lo vacío y null son lo mismo y los espacios de más no cuentan", () => {
    const sinTextos = { ...LOTE, documento: null, codigo: null };
    const escrito = { ...escritoDeFabrica(sinTextos), documento: "  ", codigo: "" };
    const leido = ingresoLeido(escrito, sinTextos, VE) as IngresoEditable;
    expect(cambiosDelIngreso(sinTextos, leido).alguno).toBe(false);
    expect(cambiosDelIngreso(LOTE, { ...LOTE, cantidad: 7 })).toMatchObject({ cantidad: true, costo: false, fecha: false, alguno: true });
    expect(cambiosDelIngreso(LOTE, { ...LOTE, costo: 12.5 })).toMatchObject({ costo: true, cantidad: false, alguno: true });
    expect(cambiosDelIngreso(LOTE, { ...LOTE, documento: " F001-1 " }).alguno).toBe(false);
  });

  it("el resumen dice solo lo que cambió", () => {
    expect(resumenDeCambios(LOTE, { ...LOTE, cantidad: 7, costo: 12.5 }, "metro")).toBe("9 m → 7 m · costo");
    expect(resumenDeCambios(LOTE, { ...LOTE, fecha: "2026-10-28", codigo: "LT-10" }, "metro")).toBe("día · documento o código");
    expect(resumenDeCambios(LOTE, LOTE, "metro")).toBe("");
  });

  it("la cantidad escrita pierde el polvo de los decimales", () => {
    expect(cantidadComoEscrita(9)).toBe("9");
    expect(cantidadComoEscrita(7.5)).toBe("7.5");
    expect(cantidadComoEscrita(7.1250001)).toBe("7.125");
  });
});

describe("Corregir un ingreso: el motivo y lo que impide tocarlo", () => {
  it("sin motivo o de más de 300 letras se dice; con motivo no hay problema", () => {
    expect(problemaDeMotivoIngreso("")).toContain("Cuenta por qué");
    expect(problemaDeMotivoIngreso("   ")).toContain("Cuenta por qué");
    expect(problemaDeMotivoIngreso("x".repeat(MAX_MOTIVO_INGRESO + 1))).toContain("300");
    expect(problemaDeMotivoIngreso("Cantidad equivocada")).toBeNull();
    for (const m of MOTIVOS_CORREGIR_INGRESO) expect(problemaDeMotivoIngreso(m)).toBeNull();
  });

  it("un lote donde ya salió material (consumo, merma o devolución) no se toca; una compra o un ajuste no lo impiden", () => {
    expect(motivoParaNoTocarIngreso([{ tipo: "compra" }, { tipo: "ajuste" }, { tipo: "ajuste" }])).toBeNull();
    expect(motivoParaNoTocarIngreso([])).toBeNull();
    for (const tipo of ["consumo", "merma", "devolucion"] as const) expect(motivoParaNoTocarIngreso([{ tipo: "compra" }, { tipo }])).toBe(MOTIVO_LOTE_USADO);
  });
});

describe("Corregir un ingreso: lo que la hoja dice es lo que la base dice", () => {
  it("la frase de un lote ya usado es la misma de `fn_ingreso_insumo_corregible`", () => {
    expect(MIGRACION).toContain(`'${MOTIVO_LOTE_USADO}'`);
  });

  it("las funciones se llaman como la migración las crea", () => {
    for (const rpc of [RPC_CORREGIR_INGRESO, RPC_ELIMINAR_INGRESO, RPC_RESTAURAR_INGRESO, RPC_INGRESOS_ELIMINADOS]) expect(MIGRACION, rpc).toMatch(new RegExp(`create or replace function retail\\.${rpc}\\(`));
  });

  it("los topes (300 letras de motivo, 40 de documento y código) son los de la base", () => {
    expect(MIGRACION).toContain(`length(motivo) <= ${MAX_MOTIVO_INGRESO}`);
    expect(MIGRACION).toContain(`length(v) > ${MAX_MOTIVO_INGRESO}`);
    expect(MIGRACION).toContain(`length(coalesce(v_doc, '')) > ${MAX_TEXTO_INGRESO}`);
    expect(MIGRACION).toContain(`length(coalesce(v_cod, '')) > ${MAX_TEXTO_INGRESO}`);
  });

  it("la cantidad máxima y los tres decimales de la base caben en lo que la hoja deja escribir (dos decimales, un subconjunto)", () => {
    expect(MIGRACION).toContain("p_cantidad <> round(p_cantidad, 3)");
    expect(leerCantidadDelIngreso("99999.99", LOTE)).toBe(99999.99);
  });

  it("el nombre de cada hint que la base manda tiene su frase en `traducirError` (llegan en castellano)", () => {
    const hints = [...MIGRACION.matchAll(/hint = '(ingreso_[a-z_]+)'/g)].map((m) => m[1]);
    expect(hints.length).toBeGreaterThan(8);
    const regla = readFileSync(new URL("./error-escritura.ts", import.meta.url), "utf8");
    // Los hints de ingreso entran por un patrón único (`ingreso_[a-z_]+`): una prueba de que el patrón los cubre a todos.
    expect(regla).toContain("ingreso_[a-z_]+");
    for (const h of hints) expect(h).toMatch(/^ingreso_[a-z_]+$/);
  });
});
