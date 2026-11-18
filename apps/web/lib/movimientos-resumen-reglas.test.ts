import { describe, expect, it } from "vitest";
import { diaDelFeed, diasDelFeed, movimientosDe, nombreDelDia, pasosDelFeed, semanasDelFeed } from "./movimientos-resumen-reglas";
import type { CategoriaFlujo } from "./flujo-caja-reglas";
import { periodoDe } from "./estados-periodo";

const HOY = "2026-11-09";
const cat = (clave: string, lado: CategoriaFlujo["lado"], monto: number): CategoriaFlujo => ({ clave, lado, monto });

describe("movimientosDe — un día de plata, como la lista del banco", () => {
  const { movimientos, neto } = movimientosDe({
    categorias: [
      cat("efectivo", "entra", 1_200),
      cat("tarjeta", "entra", 2_300),
      cat("yape", "entra", 500),
      cat("mercaderia", "sale", 4_120),
      cat("gastos", "sale", 380),
      cat("pago_claure", "sale", 2_300),
      cat("entre_cuentas", "ajuste", 3_200),
      cat("dueno_pone", "entra", 1_000),
    ],
  });

  it("junta los cobros a clientes en un renglón con sus medios", () => {
    expect(movimientos[0]).toMatchObject({ tipo: "cobro", titulo: "Cobraste a clientes", monto: 4_000 });
    expect(movimientos[0]!.detalle.replace(/ /g, " ")).toBe("Efectivo S/ 1,200 · Yape S/ 500 · Tarjeta S/ 2,300");
  });

  it("lo que entra va antes que lo que sale, y lo que cambia de lugar al final", () => {
    expect(movimientos.map((m) => m.tipo)).toEqual(["cobro", "entra", "sale", "sale", "claure", "mueve"]);
  });

  it("lo que cambia de lugar no cuenta; lo de CLAURE sale, pero dice que no es gasto", () => {
    // 4,000 + 1,000 − 4,120 − 380 − 2,300 = −1,800 (los 3,200 entre cuentas no cuentan).
    expect(neto).toBe(-1_800);
    expect(movimientos.find((m) => m.tipo === "claure")?.detalle).toContain("no es gasto");
    expect(movimientos.find((m) => m.tipo === "mueve")?.detalle).toContain("no es gasto");
  });

  it("un día sin nada no inventa renglones", () => {
    expect(movimientosDe({ categorias: [] })).toEqual({ movimientos: [], neto: 0 });
  });
});

describe("qué días se muestran", () => {
  it("el mes en curso: los últimos 6 días hasta hoy, del más nuevo al más viejo", () => {
    expect(diasDelFeed(periodoDe("2026-11-01", HOY, HOY))).toEqual(["2026-11-09", "2026-11-08", "2026-11-07", "2026-11-06", "2026-11-05", "2026-11-04"]);
  });
  it("no se sale del período", () => {
    expect(diasDelFeed(periodoDe("2026-11-01", "2026-11-03", HOY))).toEqual(["2026-11-03", "2026-11-02", "2026-11-01"]);
  });
  it("un mes que ya cerró se cuenta por semanas", () => {
    expect(diasDelFeed(periodoDe("2026-10-01", "2026-10-31", HOY))).toBeNull();
  });
  it("los días se nombran como se dicen", () => {
    expect(nombreDelDia(HOY, HOY)).toBe("Hoy · lunes 9");
    expect(nombreDelDia("2026-11-08", HOY)).toBe("Ayer · domingo 8");
    expect(nombreDelDia("2026-11-06", HOY)).toBe("Viernes 6");
    expect(diaDelFeed("2026-11-06", HOY, { categorias: [] }).nombre).toBe("Viernes 6");
  });
  it("las semanas van de la más nueva a la más vieja", () => {
    const s = semanasDelFeed([
      { desde: "2026-10-01", hasta: "2026-10-07", entro: 10, salio: 5, ajustes: 0, saldo: 0 },
      { desde: "2026-10-08", hasta: "2026-10-14", entro: 20, salio: 8, ajustes: 0, saldo: 0 },
    ]);
    expect(s.map((x) => x.desde)).toEqual(["2026-10-08", "2026-10-01"]);
  });
});

describe("lo que faltó o sobró en la caja, y los días sin nada", () => {
  it("un faltante de caja lleva su signo y cuenta; la plata en camino no", () => {
    const { movimientos, neto } = movimientosDe({ categorias: [cat("efectivo", "entra", 500), cat("faltantes_caja", "ajuste", -20), cat("entre_cuentas", "ajuste", 300)] });
    expect(movimientos.map((m) => m.tipo)).toEqual(["cobro", "ajuste", "mueve"]);
    expect(neto).toBe(480);
  });
  it("los días seguidos sin movimiento van en una sola línea", () => {
    const vacio = (f: string) => diaDelFeed(f, HOY, { categorias: [] });
    const lleno = diaDelFeed(HOY, HOY, { categorias: [cat("efectivo", "entra", 100)] });
    const pasos = pasosDelFeed([lleno, vacio("2026-11-08"), vacio("2026-11-07"), vacio("2026-11-06")]);
    expect(pasos).toHaveLength(2);
    expect(pasos[1]).toMatchObject({ tipo: "vacios", texto: "Del viernes 6 al domingo 8, no entró ni salió plata." });
    expect(pasosDelFeed([vacio("2026-11-08")])[0]).toMatchObject({ texto: "Ayer · domingo 8: no entró ni salió plata." });
  });
});
