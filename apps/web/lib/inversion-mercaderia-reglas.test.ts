import { describe, expect, it } from "vitest";
import type { Proyeccion } from "./flujo-caja-reglas";
import {
  avisoDeInversion,
  formaEfectiva,
  pagosDeLaCompra,
  cajaConCompra,
  diasParaPedir,
  evaluarFormas,
  formasDePago,
  leerInversion,
  seVeEnElResumen,
  mejorMezcla,
  pagosPendientesDelPlan,
  pendienteDeCaja,
  razonIgv,
  repartoDeLaCompra,
  saldoBase,
  saldoBaseEn,
  saleDeCajaDelPlan,
  type CampanaInversion,
} from "./inversion-mercaderia-reglas";

// La compra de campaña NO es un gasto: sale de la caja el día que se paga. Aquí se prueba que cada sol esté en una sola etapa, que la caja solo
// sume lo que aún no se pidió y que los pagos se repartan sin perder ni inventar un centavo.

const HOY = "2026-10-26";
const camp = (extra: Partial<CampanaInversion> = {}): CampanaInversion => ({
  id: "nav", nombre: "Navidad", desde: "2026-12-01", hasta: "2026-12-24", planSinIgv: 18400, igv: 3312, tope: 20000, pedido: 9200, pagado: 3000,
  fechaLimite: "2026-11-12", pagos: [], visible: true, hrefPlan: "/compras/plan", ...extra,
});
const sem = (hasta: string, saldo: number) => ({ desde: hasta, hasta, entra: 0, sale: 0, saldo, bajoMinimo: false });
const proy = (extra: Partial<Proyeccion> = {}): Proyeccion =>
  ({
    hoy: HOY, desde: HOY, hasta: "2026-12-07", saldoHoy: 21500, minimoCaja: 15000, planillaVisible: true,
    semanas: [sem("2026-11-02", 16800), sem("2026-11-09", 20100), sem("2026-11-16", 24300), sem("2026-11-23", 29800), sem("2026-11-30", 24500), sem("2026-12-07", 36800)],
    cobros: [], salidas: [], ...extra,
  }) as unknown as Proyeccion;
const suma = (xs: readonly { monto: number }[]) => Math.round(xs.reduce((a, x) => a + x.monto, 0) * 100) / 100;

describe("leerInversion", () => {
  const bueno = { id: "nav", nombre: "Navidad", desde: "2026-12-01", hasta: "2026-12-24", plan_sin_igv: 18400, igv: 3312, tope: 20000, pedido: 9200, pagado: 3000, fecha_limite: "2026-11-12", pagos: [{ fecha: "2026-11-12", pct: 70 }, { fecha: "2026-11-26", pct: 30 }] };

  it("lee una campaña completa y por defecto se ve", () => {
    const [c] = leerInversion([bueno]);
    expect(c).toMatchObject({ id: "nav", planSinIgv: 18400, igv: 3312, tope: 20000, visible: true, fechaLimite: "2026-11-12" });
    expect(c!.pagos).toHaveLength(2);
  });

  it("deja fuera lo que no entiende en vez de dibujarlo a medias", () => {
    expect(leerInversion(null)).toEqual([]);
    expect(leerInversion([{ ...bueno, id: undefined }, { ...bueno, desde: "ayer" }, 7, null])).toEqual([]);
  });

  it("una lista de pagos que no suma 100 % se descarta entera: el plan aún no dice cómo pagar", () => {
    expect(leerInversion([{ ...bueno, pagos: [{ fecha: "2026-11-12", pct: 70 }, { fecha: "2026-11-26", pct: 20 }] }])[0]!.pagos).toEqual([]);
  });

  it("un monto que falta no se vuelve un dato: sin tope es null, y visible=false se respeta", () => {
    const [c] = leerInversion([{ ...bueno, tope: undefined, visible: false }]);
    expect(c!.tope).toBeNull();
    expect(c!.visible).toBe(false);
  });
});

describe("¿se ve en el Resumen?", () => {
  it("con tres estados, solo «todo» se ve aquí; «escenarios» y «nada» no", () => {
    expect(seVeEnElResumen({ visibilidad_finanzas: "todo" })).toBe(true);
    expect(seVeEnElResumen({ visibilidad_finanzas: "escenarios" })).toBe(false);
    expect(seVeEnElResumen({ visibilidad_finanzas: "nada" })).toBe(false);
  });

  it("con un sí o no, lo que diga; y sin nada, o con algo que no entiende, se ve", () => {
    expect(seVeEnElResumen({ se_ve_en_finanzas: false })).toBe(false);
    expect(seVeEnElResumen({ se_ve_en_finanzas: true })).toBe(true);
    expect(seVeEnElResumen({})).toBe(true);
    expect(seVeEnElResumen({ visible: false })).toBe(false);
  });

  it("`leerInversion` usa esta función: una campaña en «escenarios» no entra a la lista que se ve", () => {
    const base = { id: "a", nombre: "A", desde: "2026-12-01", hasta: "2026-12-24", plan_sin_igv: 100, igv: 18 };
    expect(leerInversion([{ ...base, visibilidad_finanzas: "escenarios" }])[0]!.visible).toBe(false);
    expect(leerInversion([{ ...base, visibilidad_finanzas: "todo" }])[0]!.visible).toBe(true);
  });
});

describe("las etapas del plan no se pisan", () => {
  it("plan = pagado + pedido sin pagar + falta pedir", () => {
    const r = repartoDeLaCompra(camp());
    expect(r).toEqual({ pagado: 3000, pedidoSinPagar: 6200, faltaPedir: 9200, pasaDelPlan: 0 });
    expect(r.pagado + r.pedidoSinPagar + r.faltaPedir).toBe(18400);
  });

  it("si se pidió más que el plan, lo de más va aparte y nada queda por pedir", () => {
    const r = repartoDeLaCompra(camp({ pedido: 20000, pagado: 5000 }));
    expect(r).toMatchObject({ faltaPedir: 0, pasaDelPlan: 1600, pagado: 5000, pedidoSinPagar: 13400 });
  });

  it("no se puede haber pagado más de lo pedido", () => {
    const r = repartoDeLaCompra(camp({ pedido: 1000, pagado: 4000 }));
    expect(r.pagado).toBe(1000);
    expect(r.pedidoSinPagar).toBe(0);
  });

  it("la caja solo suma lo que falta pedir (lo pedido ya está en Por pagar), con su IGV si se cuenta", () => {
    expect(pendienteDeCaja(camp(), false)).toBe(9200);
    expect(pendienteDeCaja(camp(), true)).toBe(10856);
    expect(pendienteDeCaja(camp({ pedido: 18400 }), true)).toBe(0);
  });

  it("de caja saldrá el plan entero con su IGV; el IGV es el que marcó el Plan, no un 18 % puesto aquí", () => {
    expect(saleDeCajaDelPlan(camp(), true)).toBe(21712);
    expect(saleDeCajaDelPlan(camp(), false)).toBe(18400);
    expect(razonIgv(camp({ igv: 0 }))).toBe(0);
    expect(razonIgv(camp({ planSinIgv: 0, igv: 0 }))).toBe(0);
  });
});

describe("cómo se paga", () => {
  it("los pagos del plan que ya pasaron no se vuelven a contar; lo que falta pedir se reparte entre los que quedan", () => {
    const c = camp({ pagos: [{ fecha: "2026-10-20", pct: 40 }, { fecha: "2026-11-12", pct: 30 }, { fecha: "2026-12-12", pct: 30 }] });
    const p = pagosPendientesDelPlan(c, HOY, false);
    expect(p.map((x) => x.fecha)).toEqual(["2026-11-12", "2026-12-12"]);
    expect(suma(p)).toBe(9200);
  });

  it("sin lista de pagos, o sin nada por pedir, no hay pagos que inventar", () => {
    expect(pagosPendientesDelPlan(camp(), HOY, true)).toEqual([]);
    expect(pagosPendientesDelPlan(camp({ pedido: 18400, pagos: [{ fecha: "2026-11-12", pct: 100 }] }), HOY, true)).toEqual([]);
  });

  it("cada forma de pagar suma EXACTO lo que falta pedir (el último pago absorbe el redondeo)", () => {
    const c = camp({ planSinIgv: 10001, pedido: 0, pagado: 0, igv: 1800.18 });
    for (const conIgv of [true, false]) {
      for (const f of formasDePago(c, HOY, conIgv)) expect(suma(f.pagos), `${f.clave} con IGV=${conIgv}`).toBe(pendienteDeCaja(c, conIgv));
    }
  });

  it("«Tu plan» aparece primero solo si el plan ya dice cómo; las otras tres salen de la fecha límite", () => {
    expect(formasDePago(camp(), HOY, true).map((f) => f.clave)).toEqual(["junto", "tandas", "plazo"]);
    const conPlan = camp({ pagos: [{ fecha: "2026-11-12", pct: 100 }] });
    expect(formasDePago(conPlan, HOY, true).map((f) => f.clave)).toEqual(["plan", "junto", "tandas", "plazo"]);
  });

  it("sin fecha límite o sin nada por pedir no hay qué comparar", () => {
    expect(formasDePago(camp({ fechaLimite: null }), HOY, true)).toEqual([]);
    expect(formasDePago(camp({ pedido: 18400 }), HOY, true)).toEqual([]);
  });

  it("«Pago a plazo» dice de qué depende; «Dos tandas» deja parte para reponer", () => {
    const f = Object.fromEntries(formasDePago(camp(), HOY, true).map((x) => [x.clave, x]));
    expect(f.plazo!.requiere).toMatch(/crédito/);
    expect(f.junto!.requiere).toBeNull();
    expect(f.tandas).toMatchObject({ llegaAbrir: 70 });
    expect(f.tandas!.pagos.map((x) => x.fecha)).toEqual(["2026-11-12", "2026-11-26"]);
  });

  it("cuántos días faltan para pedir (negativo si ya pasó)", () => {
    expect(diasParaPedir(camp(), HOY)).toBe(17);
    expect(diasParaPedir(camp({ fechaLimite: "2026-10-20" }), HOY)).toBe(-6);
    expect(diasParaPedir(camp({ fechaLimite: null }), HOY)).toBeNull();
  });
});

describe("la caja con la compra", () => {
  it("la caja base une el saldo de hoy con el de cada cierre de semana", () => {
    const b = saldoBase(proy());
    expect(b.map((x) => x.dia)).toEqual([0, 7, 14, 21, 28, 35, 42]);
    expect(saldoBaseEn(b, 0)).toBe(21500);
    expect(saldoBaseEn(b, 7)).toBe(16800);
    expect(saldoBaseEn(b, 3.5)).toBeCloseTo(19150, 5);
    expect(saldoBaseEn(b, 99)).toBe(36800);
  });

  it("sin pagos es la caja base, con su punto más bajo y sus días bajo el mínimo", () => {
    const c = cajaConCompra(proy(), [])!;
    expect(c.masBajo).toMatchObject({ saldo: 16800, dia: 7 });
    expect(c.sinPlata).toBeNull();
    expect(c.salePorLaCompra).toBe(0);
  });

  it("un pago resta desde su día y se dibuja como escalón (un punto el día anterior y otro el día del pago)", () => {
    const c = cajaConCompra(proy(), [{ fecha: "2026-11-10", monto: 10000 }])!;
    const dia = 15;
    expect(c.puntos.find((x) => x.dia === dia - 1)!.saldo).toBeGreaterThan(c.puntos.find((x) => x.dia === dia)!.saldo + 9000);
    expect(c.salePorLaCompra).toBe(10000);
  });

  it("el punto más bajo y el primer día sin plata salen de la caja con la compra", () => {
    const c = cajaConCompra(proy(), [{ fecha: "2026-11-10", monto: 21712 }])!;
    expect(c.sinPlata).not.toBeNull();
    expect(c.sinPlata!.saldo).toBeLessThan(0);
    expect(c.masBajo.saldo).toBeLessThan(0);
  });

  it("los días bajo el mínimo suben cuando la compra empuja la caja bajo él", () => {
    const sin = cajaConCompra(proy(), [])!.diasBajoMinimo;
    const con = cajaConCompra(proy(), [{ fecha: "2026-11-10", monto: 6000 }])!.diasBajoMinimo;
    expect(con).toBeGreaterThan(sin);
  });

  it("un pago que cae después de lo que la proyección alcanza a ver no se dibuja, pero se avisa", () => {
    const c = cajaConCompra(proy(), [{ fecha: "2027-01-09", monto: 3000 }])!;
    expect(c.fueraDelHorizonte).toEqual([{ fecha: "2027-01-09", monto: 3000 }]);
    expect(c.salePorLaCompra).toBe(0);
  });

  it("sin horizonte (la proyección no tiene semanas) no hay caja que dibujar, en vez de una línea falsa", () => {
    expect(cajaConCompra(proy({ semanas: [] }), [{ fecha: "2026-11-10", monto: 100 }])).toBeNull();
  });
});

describe("la mejor mezcla", () => {
  // Una caja que no se recupera hasta la 5.ª semana: pagar todo junto la deja en negativo; en dos tandas, no.
  const justa = proy({ saldoHoy: 12000, minimoCaja: 5000, semanas: [sem("2026-11-02", 12000), sem("2026-11-09", 12000), sem("2026-11-16", 12000), sem("2026-11-23", 12000), sem("2026-11-30", 20000), sem("2026-12-07", 20000)] });
  const plan = camp({ pedido: 0, pagado: 0, planSinIgv: 10593, igv: 1907 });
  const evaluadas = (p: Proyeccion, c: CampanaInversion) => evaluarFormas(p, formasDePago(c, HOY, true));

  it("«Todo junto» deja la caja en negativo, «Dos tandas» no, y gana la que no depende de nadie y deja la caja a salvo", () => {
    const ev = evaluadas(justa, plan);
    expect(ev.find((f) => f.clave === "junto")!.caja!.sinPlata).not.toBeNull();
    expect(ev.find((f) => f.clave === "tandas")!.caja!.sinPlata).toBeNull();
    expect(mejorMezcla(ev)).toBe("tandas");
  });

  it("nunca recomienda lo que depende de crédito, aunque sea lo más liviano para la caja", () => {
    const ev = evaluadas(justa, plan);
    expect(ev.find((f) => f.clave === "plazo")!.caja!.diasBajoMinimo).toBeLessThanOrEqual(ev.find((f) => f.clave === "tandas")!.caja!.diasBajoMinimo);
    expect(mejorMezcla(ev)).not.toBe("plazo");
  });

  it("entre las que cumplen gana la que pasa menos días bajo tu mínimo", () => {
    const ev = evaluadas(proy(), camp({ pedido: 0, pagado: 0 })).filter((f) => !f.requiere && f.caja && !f.caja.sinPlata);
    const mejor = [...ev].sort((a, b) => a.caja!.diasBajoMinimo - b.caja!.diasBajoMinimo || b.llegaAbrir - a.llegaAbrir)[0]!;
    expect(mejorMezcla(evaluadas(proy(), camp({ pedido: 0, pagado: 0 })))).toBe(mejor.clave);
  });

  it("si ninguna cumple, no recomienda en silencio la menos mala", () => {
    const c = camp({ pedido: 0, pagado: 0, planSinIgv: 90000, igv: 16200 });
    expect(mejorMezcla(evaluadas(proy(), c))).toBeNull();
  });
});

describe("el aviso de «te falta pedir»", () => {
  it("nace con lo que falta pedir (con IGV si se cuenta) y cuántos días quedan", () => {
    const a = avisoDeInversion(camp(), HOY, true)!;
    expect(a.clave).toBe("inversion:nav");
    expect(a.titulo.replace(/ /g, " ")).toBe("Inversión en mercadería · Navidad: te falta pedir S/ 10,856");
    expect(a.detalle).toMatch(/12 de noviembre \(faltan 17 días\)/);
    expect(a.tono).toBe("pizarra");
    expect(a.href).toBe("/compras/plan");
  });

  it("a 7 días o menos, o con la fecha ya pasada, sube a ámbar y lo dice", () => {
    expect(avisoDeInversion(camp({ fechaLimite: "2026-11-01" }), HOY, false)!.tono).toBe("ambar");
    const pasado = avisoDeInversion(camp({ fechaLimite: "2026-10-20" }), HOY, false)!;
    expect(pasado.tono).toBe("ambar");
    expect(pasado.detalle).toMatch(/pasó hace 6 días/);
  });

  it("sin nada por pedir o sin fecha límite no hay aviso (no se inventa urgencia)", () => {
    expect(avisoDeInversion(camp({ pedido: 18400 }), HOY, true)).toBeNull();
    expect(avisoDeInversion(camp({ fechaLimite: null }), HOY, true)).toBeNull();
  });
});

describe("qué forma de pago cuenta la caja", () => {
  const justa = proy({ saldoHoy: 12000, minimoCaja: 5000, semanas: [sem("2026-11-02", 12000), sem("2026-11-09", 12000), sem("2026-11-16", 12000), sem("2026-11-23", 12000), sem("2026-11-30", 20000), sem("2026-12-07", 20000)] });
  const plan = camp({ pedido: 0, pagado: 0, planSinIgv: 10593, igv: 1907 });
  const evaluadas = (c: CampanaInversion) => evaluarFormas(justa, formasDePago(c, HOY, true));

  it("la que la persona eligió; si no, «Tu plan»; si no, la mejor mezcla", () => {
    expect(formaEfectiva(evaluadas(plan), "junto")!.clave).toBe("junto");
    expect(formaEfectiva(evaluadas(plan), undefined)!.clave).toBe("tandas");
    const conPlan = camp({ pedido: 0, pagado: 0, planSinIgv: 10593, igv: 1907, pagos: [{ fecha: "2026-11-30", pct: 100 }] });
    expect(formaEfectiva(evaluadas(conPlan), undefined)!.clave).toBe("plan");
  });

  it("una forma elegida que ya no existe (cambió la campaña) cae a la de siempre, no a un error", () => {
    expect(formaEfectiva(evaluadas(plan), "inventada")!.clave).toBe("tandas");
  });

  it("si ninguna forma cumple, la caja cuenta «Todo junto» para mostrar el daño; sin nada que comparar, no suma nada", () => {
    const grande = camp({ pedido: 0, pagado: 0, planSinIgv: 90000, igv: 16200 });
    expect(mejorMezcla(evaluadas(grande))).toBeNull();
    expect(formaEfectiva(evaluadas(grande), undefined)!.clave).toBe("junto");
    expect(formaEfectiva([], "junto")).toBeNull();
    expect(pagosDeLaCompra([camp({ pedido: 18400 })], justa, true, {})).toEqual([]);
  });

  it("los pagos de varias campañas se juntan por fecha", () => {
    const a = camp({ id: "a", pedido: 0, pagado: 0, planSinIgv: 4000, igv: 720, fechaLimite: "2026-11-20" });
    const b = camp({ id: "b", pedido: 0, pagado: 0, planSinIgv: 4000, igv: 720, fechaLimite: "2026-11-05" });
    const pagos = pagosDeLaCompra([a, b], justa, true, { a: "junto", b: "junto" });
    expect(pagos.map((x) => x.fecha)).toEqual(["2026-11-05", "2026-11-20"]);
    expect(suma(pagos)).toBe(9440);
  });
});
