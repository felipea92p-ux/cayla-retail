import { describe, expect, it } from "vitest";
import { actividadDe, fraseDeLaPlata, partesDelFlujo, puentePlata, recomendacionesPlata } from "./plata-reglas";
import type { FlujoReal, Proyeccion, SemanaProy } from "./flujo-caja-reglas";

const S = (n: string) => n.replace(/S\/ /g, "S/ ");
const real = (p: Partial<FlujoReal> = {}): FlujoReal =>
  ({
    desde: "2026-10-01",
    hasta: "2026-10-30",
    hoy: "2026-10-30",
    saldoInicial: 31200,
    saldoFinal: 27450,
    entro: 55900,
    salio: 59650,
    ajustes: 0,
    descuadre: 0,
    categorias: [
      { clave: "efectivo", lado: "entra", monto: 30000 },
      { clave: "tarjeta", lado: "entra", monto: 25900 },
      { clave: "mercaderia", lado: "sale", monto: 27600 },
      { clave: "planilla", lado: "sale", monto: 9800 },
      { clave: "gastos", lado: "sale", monto: 8400 },
      { clave: "impuestos", lado: "sale", monto: 3950 },
      { clave: "comision_pos", lado: "sale", monto: 800 },
      { clave: "activos", lado: "sale", monto: 4800 },
      { clave: "dueno_saca", lado: "sale", monto: 3000 },
      { clave: "pago_tarjeta", lado: "sale", monto: 1300 },
    ],
    semanas: [],
    sinCuenta: [],
    planillaVisible: true,
    planilla: [],
    ...p,
  }) as FlujoReal;

describe("las tres partes del método directo (ADR-0585)", () => {
  it("cada categoría va a su parte; lo que no se conoce, al día a día", () => {
    expect(actividadDe({ clave: "activos", lado: "sale" })).toBe("inversion");
    expect(actividadDe({ clave: "dueno_pone", lado: "entra" })).toBe("financiamiento");
    expect(actividadDe({ clave: "faltantes_caja", lado: "ajuste" })).toBe("ajustes");
    expect(actividadDe({ clave: "algo_nuevo", lado: "sale" })).toBe("operacion");
  });
  it("los totales con su signo: el día a día deja +5,350; las compras −4,800; tú y los préstamos −4,300", () => {
    const p = partesDelFlujo(real());
    expect(p.map((x) => [x.clave, x.total])).toEqual([
      ["operacion", 5350],
      ["inversion", -4800],
      ["financiamiento", -4300],
    ]);
    expect(p[0]!.lineas[0]).toEqual({ nombre: "Efectivo", monto: 30000 });
  });
  it("el puente suma: empezar + las partes = cerrar", () => {
    const t = puentePlata(real(), false);
    const suma = t.slice(0, -1).reduce((s, x) => s + (x.tipo === "entra" ? x.monto : -x.monto), 0);
    expect(suma).toBe(27450);
    expect(t.at(-1)).toMatchObject({ nombre: "Al cerrar el mes", monto: 27450, tipo: "queda" });
    expect(puentePlata(real(), true).at(-1)!.nombre).toBe("Hoy");
  });
});

describe("fraseDeLaPlata", () => {
  it("ganó y la plata bajó: nombra lo que se fue fuera del día a día", () => {
    expect(fraseDeLaPlata(real(), 3850)).toBe(S("Ganaste S/ 3,850, pero compraste cosas que duran años por S/ 4,800, retiraste S/ 3,000 y pagaste la tarjeta de crédito por S/ 1,300."));
  });
  it("ganó y subió; perdió; sin ganancia", () => {
    expect(fraseDeLaPlata(real({ saldoFinal: 32000 }), 3850)).toBe(S("Ganaste S/ 3,850 y la plata subió S/ 800."));
    expect(fraseDeLaPlata(real(), -500)).toBe(S("Perdiste S/ 500 en el mes. La plata bajó S/ 3,750 en el mes."));
    expect(fraseDeLaPlata(real(), null)).toBe(S("La plata bajó S/ 3,750 en el mes."));
  });
});

describe("recomendacionesPlata", () => {
  const href = (r: string) => r;
  const proy = (p: Partial<Proyeccion> = {}) => ({ minimoCaja: 15000, diasDeCaja: 30, salidasDiarias: 1900, salidas: [], ...p }) as unknown as Proyeccion;
  const sem = (saldos: number[]): SemanaProy[] => saldos.map((s, i) => ({ desde: `2026-11-0${i + 1}`, hasta: `2026-11-0${i + 2}`, entra: 0, sale: 0, saldo: s, bajoMinimo: s < 15000 }));
  it("no alcanza: arriba, con lo que se debe", () => {
    const r = recomendacionesPlata({ real: real(), proyeccion: proy(), semanas: sem([20000, 12000]), ganancia: 3850, href });
    expect(r[0]).toMatchObject({ clave: "no-alcanza", tono: "error", accion: { href: "/finanzas/dinero/por-pagar" } });
    expect(r[1]!.clave).toBe("gano-y-bajo");
  });
  it("alcanza, días de caja cortos y el impuesto que viene", () => {
    const r = recomendacionesPlata({
      real: real({ saldoFinal: 40000 }),
      proyeccion: proy({ diasDeCaja: 9, salidas: [{ tipo: "impuesto", fecha: "2026-11-18", titulo: "IGV de octubre", monto: 4200 }] as Proyeccion["salidas"] }),
      semanas: sem([20000, 18000]),
      ganancia: 3850,
      href,
    });
    expect(r.map((x) => x.clave)).toEqual(["dias", "impuesto", "alcanza"]);
    expect(r[1]!.titulo).toBe(S("IGV de octubre: S/ 4,200 el 18/11"));
  });
});
