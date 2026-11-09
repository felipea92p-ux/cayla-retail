import { describe, expect, it } from "vitest";
import { cuandoSale, proximosPagos } from "./proximos-reglas";
import type { CajaCayla, PuntoCaja } from "./caja-proxima-reglas";
import type { Proyeccion, SalidaProy } from "./flujo-caja-reglas";

const HOY = "2026-11-09";
const HASTA = "2026-11-23";

const punto = (fecha: string, saldo: number): PuntoCaja => ({ dia: 0, fecha, saldo, entra: 0, sale: 0, principal: null });
function caja(puntos: PuntoCaja[], minimo = 0, hasta = HASTA): CajaCayla {
  return { tipo: "cayla", hoy: HOY, hasta, saldoHoy: 10_000, deClaudia: 0, porVolver: 0, minimo, entra: 0, sale: 0, queda: 0, puntos, porSemana: false, mayores: [], bajaDelMinimo: null, sinPlata: null, masBajo: null, luego: null, titular: "", tono: "verde", provisional: false, faltan: [], sinPlanilla: false };
}
let n = 0;
const salida = (tipo: SalidaProy["tipo"], fecha: string, monto: number, extra: Partial<SalidaProy> = {}): SalidaProy => {
  n += 1;
  return { tipo, id: `s${n}`, fecha, vence: fecha, titulo: `Pago ${n}`, detalle: "", clase: "", ubicacionId: null, unidad: null, monto, atrasada: false, ...extra };
};
const proyeccion = (salidas: SalidaProy[]) => ({ salidas }) as unknown as Proyeccion;

const SALIDAS = [
  salida("planilla", "2026-11-15", 4_000, { titulo: "Ana" }),
  salida("planilla", "2026-11-15", 3_000, { titulo: "Luis" }),
  salida("vencimiento", "2026-11-10", 2_000, { titulo: "Textiles Andino", atrasada: true }),
  salida("fijo", "2026-11-12", 400, { titulo: "Luz", ubicacionId: "tru" }),
  salida("fijo", "2026-12-01", 6_500, { titulo: "Alquiler" }),
];

describe("proximosPagos", () => {
  const c = caja([punto(HOY, 10_000), punto("2026-11-12", 7_600), punto("2026-11-15", 600), punto("2026-11-20", 2_000), punto("2026-12-01", -100)]);
  const x = proximosPagos({ cajaSola: c, caja: c, proyeccion: proyeccion(SALIDAS) });
  if (x.tipo !== "ok") throw new Error();

  it("lista lo de los 14 días, lo vencido primero, y la planilla junta en un renglón", () => {
    expect(x.pagos.map((p) => p.titulo)).toEqual(["Textiles Andino", "Luz", "Planilla"]);
    expect(x.pagos.find((p) => p.titulo === "Planilla")?.monto).toBe(7_000);
    expect(x.total).toBe(9_400);
  });

  it("el día más justo es el punto más bajo dentro de los 14 días, no después", () => {
    expect(x.justo).toMatchObject({ fecha: "2026-11-15", saldo: 600, tono: "verde" });
    expect(x.serie).toEqual([10_000, 7_600, 600, 2_000]);
  });

  it("bajo el mínimo es ámbar y bajo cero es rojo", () => {
    const ambar = proximosPagos({ cajaSola: c, caja: caja(c.puntos, 1_000), proyeccion: proyeccion(SALIDAS) });
    expect(ambar.tipo === "ok" && ambar.justo?.tono).toBe("ambar");
    const rojo = caja([punto(HOY, 100), punto("2026-11-15", -300)]);
    const r = proximosPagos({ cajaSola: rojo, caja: rojo, proyeccion: proyeccion(SALIDAS) });
    expect(r.tipo === "ok" && r.justo).toMatchObject({ tono: "rojo" });
  });

  it("la compra de campaña entra a la lista si se cuenta y cae en la ventana", () => {
    const y = proximosPagos({ cajaSola: c, caja: c, proyeccion: proyeccion(SALIDAS), compra: [{ fecha: "2026-11-18", monto: 5_000 }, { fecha: "2026-12-10", monto: 9_000 }] });
    if (y.tipo !== "ok") throw new Error();
    expect(y.incluyeCompra).toBe(true);
    expect(y.pagos.filter((p) => p.bolsillo === null)).toHaveLength(1);
  });

  it("mirando una sede: solo sus pagos y sin saldo", () => {
    const sede = { tipo: "sede" as const, nombre: "Trujillo", vende: true, hoy: HOY, hasta: HASTA, efectivo: 500, entra: 0, sale: 0, mayores: [], titular: "", sinPlanilla: false };
    const y = proximosPagos({ cajaSola: sede, caja: sede, proyeccion: proyeccion(SALIDAS), deLaSede: (u) => u === "tru" });
    expect(y).toMatchObject({ tipo: "ok", justo: null, total: 400 });
  });

  it("sin proyección no inventa la lista", () => {
    expect(proximosPagos({ cajaSola: c, caja: c, proyeccion: null }).tipo).toBe("sin_dato");
  });

  it("dice cuándo sale cada pago en palabras", () => {
    expect(cuandoSale({ fecha: HOY, atrasada: false }, HOY)).toBe("Hoy");
    expect(cuandoSale({ fecha: "2026-11-10", atrasada: false }, HOY)).toBe("Mañana");
    expect(cuandoSale({ fecha: "2026-11-15", atrasada: false }, HOY)).toBe("En 6 días");
    expect(cuandoSale({ fecha: "2026-11-10", atrasada: true }, HOY)).toBe("Vencido");
  });
});
