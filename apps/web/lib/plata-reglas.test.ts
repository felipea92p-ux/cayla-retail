import { describe, expect, it } from "vitest";
import { actividadDe, fraseDeLaPlata, loQueNoCubre, partesDelFlujo, puentePlata, recomendacionesPlata } from "./plata-reglas";
import type { ArranqueCuenta, FlujoReal, Proyeccion, SemanaProy } from "./flujo-caja-reglas";

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
    arranques: [],
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

describe("lo que el flujo no cubre (ADR-0609)", () => {
  const cuenta = (p: Partial<ArranqueCuenta> = {}): ArranqueCuenta => ({ cuentaId: "c1", cuenta: "BCP", desde: "2026-10-28", saldoInicial: 1000, cobros: 0, salidas: 0, entreCuentas: 0, comision: 0, ...p });

  it("sin cuentas que arranquen a mitad de período, el cuadro está completo", () => {
    expect(loQueNoCubre(real())).toBeNull();
  });
  it("una cuenta que arrancó en cero y sin movimientos no le quita nada al cuadro", () => {
    expect(loQueNoCubre(real({ arranques: [cuenta({ saldoInicial: 0 })] }))).toBeNull();
  });
  it("suma lo cobrado de verdad en céntimos exactos; lo del dueño no es un cobro", () => {
    const r = loQueNoCubre(
      real({
        categorias: [
          { clave: "efectivo", lado: "entra", monto: 39801.84 },
          { clave: "qr", lado: "entra", monto: 11020.3 },
          { clave: "dueno_pone", lado: "entra", monto: 500 },
        ],
        arranques: [cuenta({ cobros: 70000.1, salidas: 110.4, comision: 5 }), cuenta({ cuentaId: "c2", cuenta: "Izipay", saldoInicial: 0, cobros: 6829.49, entreCuentas: -19162.66 })],
      }),
    )!;
    expect(r.cobrosEnElCuadro).toBe(50822.14);
    expect(r.cobrosFuera).toBe(76829.59);
    expect(r.cobrosDelPeriodo).toBe(127651.73);
    expect(r.salidasFuera).toBe(110.4);
    expect(r.entreCuentasFuera).toBe(-19162.66);
    expect(r.comisionFuera).toBe(5);
    expect(r.cuando).toBe("el 28 oct");
  });
  it("con dos fechas de arranque dice el tramo", () => {
    expect(loQueNoCubre(real({ arranques: [cuenta(), cuenta({ cuentaId: "c2", desde: "2026-10-23" })] }))!.cuando).toBe("entre el 23 oct y el 28 oct");
  });
  it("no cambia ninguna cifra del puente, pero no llama «al empezar el mes» a un saldo de fin de mes", () => {
    const completo = puentePlata(real(), false);
    const parcial = puentePlata(real({ arranques: [cuenta()] }), false);
    expect(parcial.map((t) => t.monto)).toEqual(completo.map((t) => t.monto));
    expect(completo[0]!.nombre).toBe("Al empezar el mes");
    expect(parcial[0]!.nombre).toBe("Saldo de partida");
    expect(parcial[0]!.detalle).toContain("el 28 oct");
  });
  it("la frase no afirma que subió, bajó ni por qué", () => {
    const f = fraseDeLaPlata(real({ arranques: [cuenta()] }), 9000);
    expect(f).toBe("No se puede decir cuánto subió o bajó en el mes: una cuenta arrancó con su saldo el 28 oct.");
  });
  it("no recomienda por una baja que no se sabe si ocurrió", () => {
    const r = recomendacionesPlata({ real: real({ arranques: [cuenta()] }), proyeccion: null, semanas: [], ganancia: 9000, href: (x) => x });
    expect(r.map((x) => x.clave)).not.toContain("gano-y-bajo");
  });
});
