import { describe, expect, it } from "vitest";
import { sumarDias } from "./caja-proxima-reglas";
import type { Proyeccion } from "./flujo-caja-reglas";
import { cajaConCompra } from "./inversion-mercaderia-reglas";
import {
  BAJA_DE_COBROS,
  alertaDeLaCaja,
  conMenosCobros,
  diasDeCredito,
  evaluarFormas,
  formasParaComparar,
  leerLaCaja,
  pagosEnSoles,
  veredictoDeLaForma,
} from "./plan-compra-pagar";
import { pagosDeLasTandas, type Tanda } from "./plan-compra-inversion";

// Cómo pagar la campaña (ADR-0527, la caja). Hoy es lunes 26 de octubre de 2026. La caja de mentira tiene `semanas` bloques de 7 días desde mañana: cada uno con lo que entra y lo que sale.
const HOY = "2026-10-26";

function caja(o: { saldoHoy: number; minimo?: number; semanas: readonly (readonly [number, number])[] }): Proyeccion {
  let saldo = o.saldoHoy;
  const minimo = o.minimo ?? 0;
  return {
    hoy: HOY,
    desde: sumarDias(HOY, 1),
    hasta: sumarDias(HOY, 7 * o.semanas.length),
    saldoHoy: o.saldoHoy,
    minimoCaja: minimo,
    salidasDiarias: 0,
    diasDeCaja: null,
    salidas30: { conCuenta: 0, sinCuenta: 0, planilla: 0 },
    planillaVisible: true,
    historiaDias: null,
    saldoInicialDeclarado: true,
    hayFacturasDeProveedor: true,
    incluyeImpuestos: true,
    saldoFavorIgvDeclarado: true,
    diasDeCajaConfiable: true,
    semanas: o.semanas.map(([entra, sale], k) => {
      saldo += entra - sale;
      return { desde: sumarDias(HOY, 1 + 7 * k), hasta: sumarDias(HOY, 7 + 7 * k), entra, sale, saldo, bajoMinimo: saldo < minimo };
    }),
    cobros: [],
    salidas: [],
  };
}
const plana = (saldoHoy: number, minimo: number, entra = 10000, sale = 10000) => caja({ saldoHoy, minimo, semanas: Array.from({ length: 12 }, () => [entra, sale] as const) });

// Una sola tanda que se pide el 9 de noviembre (14 días desde hoy), al contado: los pagos de cada forma salen de ahí.
const UNA_TANDA: Tanda[] = [{ pedido: "2026-11-09", pct: 100, forma: "contado" }];
const COMPRA = 50000;

describe("leer la caja que llega de Finanzas", () => {
  it("sin permiso, caída o sin pedir no hay caja (nunca una inventada)", () => {
    expect(leerLaCaja(null)).toBeNull();
    expect(leerLaCaja({ estado: "sin_permiso" })).toBeNull();
    expect(leerLaCaja({ estado: "falla" })).toBeNull();
  });
  it("una respuesta sin semanas o que no se entiende tampoco", () => {
    expect(leerLaCaja({ estado: "ok", datos: null })).toBeNull();
    expect(leerLaCaja({ estado: "ok", datos: { hoy: HOY, semanas: [] } })).toBeNull();
  });
  it("con semanas y su hoy, la lee como la lee Finanzas", () => {
    const p = leerLaCaja({ estado: "ok", datos: { hoy: HOY, desde: "2026-10-27", hasta: "2026-11-02", saldo_hoy: 5000, minimo_caja: 1000, semanas: [{ desde: "2026-10-27", hasta: "2026-11-02", entra: 300, sale: 100, saldo: 5200, bajo_minimo: false }] } });
    expect(p).toMatchObject({ hoy: HOY, saldoHoy: 5000, minimoCaja: 1000 });
    expect(p!.semanas).toHaveLength(1);
  });
});

describe("«¿y si se cobra menos?»", () => {
  it("cada semana entra 20 % menos y cada cierre baja lo acumulado que no se cobró; las salidas no cambian", () => {
    const p = caja({ saldoHoy: 1000, semanas: [[100, 0], [100, 0], [100, 0]] });
    const peor = conMenosCobros(p);
    expect(BAJA_DE_COBROS).toBe(0.2);
    expect(peor.semanas.map((s) => s.entra)).toEqual([80, 80, 80]);
    expect(peor.semanas.map((s) => s.saldo)).toEqual([1080, 1160, 1240]); // 1100−20, 1200−40, 1300−60
    expect(peor.semanas.map((s) => s.sale)).toEqual([0, 0, 0]);
    expect(peor.saldoHoy).toBe(1000);
  });
  it("no toca la caja original y marca las semanas que quedan bajo el mínimo", () => {
    const p = caja({ saldoHoy: 1000, minimo: 1150, semanas: [[100, 0], [100, 0], [100, 0]] });
    const peor = conMenosCobros(p);
    expect(p.semanas.map((s) => s.saldo)).toEqual([1100, 1200, 1300]);
    expect(peor.semanas.map((s) => s.bajoMinimo)).toEqual([true, false, false]);
  });
});

describe("los pagos de la pantalla en soles", () => {
  it("cada pago es su % de lo que sale de caja y el último toma el residuo: suman EXACTO", () => {
    const pagos = [{ fecha: "2026-11-02", pct: 33.33 }, { fecha: "2026-12-02", pct: 33.33 }, { fecha: "2027-01-02", pct: 33.34 }];
    const m = pagosEnSoles(pagos, 1000, HOY);
    expect(m.map((x) => x.monto)).toEqual([333.3, 333.3, 333.4]);
    expect(Math.round(m.reduce((s, x) => s + x.monto, 0) * 100) / 100).toBe(1000);
  });
  it("un pago de antes de hoy ya salió (está en el saldo de hoy): no se resta otra vez; uno de hoy sí", () => {
    const m = pagosEnSoles([{ fecha: "2026-10-20", pct: 40 }, { fecha: HOY, pct: 20 }, { fecha: "2026-11-02", pct: 40 }], 1000, HOY);
    expect(m.map((x) => [x.fecha, x.monto])).toEqual([[HOY, 200], ["2026-11-02", 400]]);
  });
});

describe("las formas que se comparan", () => {
  it("el crédito que da cada una, en días promedio: contado 0, anticipo de 50 % 15, a 30 días 30, anticipo de 30 % 42, a 60 días 60", () => {
    expect(["contado", "a50", "d30", "a30", "d60"].map((f) => diasDeCredito(f as never))).toEqual([0, 15, 30, 42, 60]);
  });
  it("son cinco, de la que menos crédito pide a la que más, y cada una aplica su forma a las MISMAS tandas (semana y %)", () => {
    const dos: Tanda[] = [{ pedido: "2026-11-09", pct: 60, forma: "d60" }, { pedido: "2026-11-16", pct: 40, forma: "contado" }];
    const f = formasParaComparar(dos);
    expect(f.map((x) => x.clave)).toEqual(["contado", "a50", "d30", "a30", "d60"]);
    for (const x of f) {
      expect(x.tandas.map((t) => [t.pedido, t.pct])).toEqual([["2026-11-09", 60], ["2026-11-16", 40]]);
      expect(x.tandas.every((t) => t.forma === x.clave)).toBe(true);
    }
  });
  it("solo el contado no depende de nadie; las demás dicen qué hay que confirmar", () => {
    const f = formasParaComparar(UNA_TANDA);
    expect(f.find((x) => x.clave === "contado")!.requiere).toBeNull();
    for (const x of f.filter((y) => y.clave !== "contado")) expect(x.requiere).toMatch(/proveedor/);
  });
});

describe("cómo le va a la caja con cada forma", () => {
  it("la caja con la compra es la de Finanzas menos los pagos: lo mismo que `cajaConCompra`", () => {
    const p = plana(100000, 20000);
    const contado = evaluarFormas(p, COMPRA, formasParaComparar(UNA_TANDA)).find((f) => f.clave === "contado")!;
    const igual = cajaConCompra(p, pagosEnSoles(pagosDeLasTandas(UNA_TANDA), COMPRA, HOY));
    expect(contado.esperado).toEqual(igual);
    expect(contado.esperado!.masBajo.saldo).toBe(50000);
    expect(contado.saleEnElHorizonte).toBe(COMPRA);
  });
  it("«aguanta» solo si la caja no baja del mínimo (ni de cero), con lo esperado y cobrando 20 % menos", () => {
    const ev = (p: Proyeccion) => evaluarFormas(p, COMPRA, formasParaComparar(UNA_TANDA)).find((f) => f.clave === "contado")!;
    expect(ev(plana(100000, 20000))).toMatchObject({ aguantaLoEsperado: true, aguantaSiVaPeor: true }); // al final: 76000 − 50000 = 26000 ≥ 20000
    expect(ev(plana(75000, 20000))).toMatchObject({ aguantaLoEsperado: true, aguantaSiVaPeor: false }); // esperado 25000; cobrando menos, 1000 al final
    expect(ev(plana(60000, 20000))).toMatchObject({ aguantaLoEsperado: false, aguantaSiVaPeor: false }); // 10000 < 20000 ya con lo esperado
    expect(ev(plana(30000, 0))).toMatchObject({ aguantaLoEsperado: false, aguantaSiVaPeor: false }); // −20000: sin plata
  });
});

describe("lo que se le dice a la persona", () => {
  const veredicto = (p: Proyeccion, tandas: readonly Tanda[] = UNA_TANDA) => veredictoDeLaForma(p, evaluarFormas(p, COMPRA, formasParaComparar(tandas)));

  it("el contado aguanta aun cobrando 20 % menos: no hace falta crédito", () => {
    const v = veredicto(plana(100000, 20000));
    expect(v).toMatchObject({ tipo: "contado-aguanta", clave: "contado" });
    expect(v.frase).toContain("No necesitas crédito");
    expect(v.frase).toContain("no baja de tu mínimo");
  });
  it("el contado aguanta con lo esperado pero no cobrando menos: es una compra justa, y se dice", () => {
    const v = veredicto(plana(75000, 20000));
    expect(v.tipo).toBe("contado-justo");
    expect(v.frase).toContain("compra justa");
  });
  it("el contado no aguanta pero con crédito sí: recomienda la forma que MENOS crédito pide, no la más larga", () => {
    // Tres semanas sin cobrar y de la cuarta en adelante entran S/ 40,000 por semana: pagar 50,000 el día 14 deja la caja en −20,000, pero un anticipo de la mitad (y el resto a 30 días) alcanza.
    const p = caja({ saldoHoy: 30000, semanas: [[0, 0], [0, 0], [0, 0], [0, 0], ...Array.from({ length: 8 }, () => [40000, 0] as const)] });
    const v = veredicto(p);
    expect(v.tipo).toBe("pide-credito");
    if (v.tipo === "pide-credito") expect(v.clave).toBe("a50");
    expect(v.frase).toContain("Pregúntale a tu proveedor");
    expect(v.frase).toContain("50 % de anticipo y el resto a 30 días");
  });
  it("ni con crédito alcanza: lo dice y no elige «la menos mala» en silencio", () => {
    // La caja está sana sin la compra (S/ 20,000 quietos) pero la compra vale S/ 50,000 y no entra nada: ni pagándola a 60 días alcanza.
    const v = veredicto(caja({ saldoHoy: 20000, semanas: Array.from({ length: 12 }, () => [0, 0] as const) }));
    expect(v.tipo).toBe("ninguna");
    expect("clave" in v).toBe(false);
    expect(v.frase).toContain("Ninguna forma de pagar aguanta");
  });
  it("si la caja ya se queda sin plata (o bajo el mínimo) SIN esta compra, se dice primero: la forma de pagar no lo arregla y la compra no es la culpable", () => {
    const sinPlata = caja({ saldoHoy: 1000, semanas: Array.from({ length: 12 }, () => [0, 5000] as const) });
    const a = veredicto(sinPlata);
    expect(a.tipo).toBe("caja-ya-apretada");
    expect(a.frase).toContain("aun sin esta compra");
    expect(a.frase).toContain("se queda sin plata");
    // Positiva pero ya bajo el mínimo: el mismo diagnóstico, con otras palabras.
    const bajoMinimo = caja({ saldoHoy: 10000, minimo: 20000, semanas: Array.from({ length: 12 }, () => [10000, 10000] as const) });
    const b = veredicto(bajoMinimo);
    expect(b.tipo).toBe("caja-ya-apretada");
    expect(b.frase).toContain("ya baja de tu mínimo");
  });
  it("si ningún pago cae dentro de lo que la caja alcanza a ver, no hay con qué comparar", () => {
    const lejos: Tanda[] = [{ pedido: "2027-09-01", pct: 100, forma: "contado" }];
    expect(veredicto(plana(100000, 0), lejos).tipo).toBe("fuera-de-vista");
  });
  it("una forma con crédito jamás se recomienda sola, aunque sea la que deja la caja más alta", () => {
    for (const saldo of [1000, 30000, 60000, 75000, 100000, 500000]) {
      const v = veredicto(plana(saldo, 20000));
      if (v.tipo === "contado-aguanta" || v.tipo === "contado-justo") expect(v.clave).toBe("contado");
    }
  });
});

describe("la alerta de la gráfica", () => {
  const conCompra = (p: Proyeccion, tandas: readonly Tanda[] = UNA_TANDA) => cajaConCompra(p, pagosEnSoles(pagosDeLasTandas(tandas), COMPRA, HOY));
  const sinCompra = (p: Proyeccion) => cajaConCompra(p, []);

  it("aguanta: dice el punto más bajo y que no baja del mínimo", () => {
    const p = plana(100000, 20000);
    const a = alertaDeLaCaja(p, conCompra(p), sinCompra(p));
    expect(a).toMatchObject({ tono: "ok", titulo: "La caja aguanta el plan" });
    expect(a.detalle).toContain("no baja de tu mínimo");
  });
  it("baja del mínimo: dice cuándo, cuántos días, y qué se puede hacer", () => {
    const p = plana(60000, 20000);
    const a = alertaDeLaCaja(p, conCompra(p), sinCompra(p));
    expect(a.tono).toBe("atencion");
    expect(a.detalle).toMatch(/bajo el mínimo/);
    expect(a.detalle).toContain("baja el tope");
  });
  it("se queda sin plata CON la compra: urgente y dice dónde", () => {
    const p = plana(30000, 0);
    const a = alertaDeLaCaja(p, conCompra(p), sinCompra(p));
    expect(a.tono).toBe("urgente");
    expect(a.titulo).toContain("Con esta compra tu caja se queda sin plata");
  });
  it("si la caja YA se quedaba sin plata antes de la compra, no se le echa la culpa a la compra", () => {
    const p = caja({ saldoHoy: 1000, semanas: Array.from({ length: 12 }, () => [0, 5000] as const) });
    const a = alertaDeLaCaja(p, conCompra(p), sinCompra(p));
    expect(a.tono).toBe("urgente");
    expect(a.titulo).toContain("ya se queda sin plata");
    expect(a.detalle).toContain("Aun sin esta compra");
  });
  it("una compra que cae más allá de lo que la caja ve, o sin pagos por salir, no dice nada de la caja", () => {
    const p = plana(100000, 20000);
    const lejos: Tanda[] = [{ pedido: "2027-09-01", pct: 100, forma: "contado" }];
    expect(alertaDeLaCaja(p, conCompra(p, lejos), sinCompra(p))).toMatchObject({ tono: "info", titulo: "La compra cae más allá de lo que se ve" });
    expect(alertaDeLaCaja(p, null, null)).toMatchObject({ tono: "info" });
  });
});
