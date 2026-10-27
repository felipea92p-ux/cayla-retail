import { describe, expect, it } from "vitest";
import { leerInversion, pendienteDeCaja, repartoDeLaCompra, razonIgv } from "./inversion-mercaderia-reglas";
import {
  FORMAS_DE_PAGO,
  ORDEN_DE_FORMAS,
  TASA_IGV,
  VISIBILIDADES,
  TEXTO_DE_VISIBILIDAD,
  ajustarPorcentajes,
  argsGuardarPagos,
  campanaParaFinanzas,
  categoriasPorTanda,
  costosConIgv,
  frasePorQueLlegaTarde,
  leerPagado,
  leerPagos,
  leerTandas,
  pagosDeLasTandas,
  pagosSonValidos,
  pedidoSinIgv,
  salidaPorMes,
  semanasDePedido,
  tandaLlegaTarde,
  tandasParaGuardar,
  tandasPorDefecto,
  type LecturaPagos,
  type Tanda,
} from "./plan-compra-inversion";
import type { LecturaPedido } from "./plan-compra-pedido";

// Cómo se paga la campaña (ADR-0527). Hoy es lunes 26 de octubre de 2026; Navidad va del 11 al 25 de diciembre y con 14 días para llegar el último día para pedir es el 27 de noviembre.
const HOY = "2026-10-26";
const LIMITE = "2026-11-27";

describe("las semanas para pedir y las tandas de por defecto", () => {
  it("la primera semana es la de hoy y las demás, los lunes que siguen (nueve en total)", () => {
    const s = semanasDePedido(HOY); // hoy es lunes
    expect(s).toHaveLength(9);
    expect(s[0]).toBe(HOY);
    expect(s[1]).toBe("2026-11-02");
    expect(s.at(-1)).toBe("2026-12-21");
  });
  it("si el último día para pedir cae más lejos, el selector llega hasta esa semana (con un tope de medio año)", () => {
    const s = semanasDePedido(HOY, "2027-02-22"); // un lunes, a 119 días
    expect(s.at(-1)).toBe("2027-02-22");
    expect(s).toContain("2027-02-15");
    expect(semanasDePedido(HOY, "2027-02-24").at(-1)).toBe("2027-02-22"); // el miércoles: la última semana que empieza antes
    expect(semanasDePedido(HOY, "2030-01-01").at(-1)! <= "2027-04-26").toBe(true); // tope: 182 días
    expect(semanasDePedido(HOY, "2026-10-20")).toHaveLength(9); // ya pasó: lo de siempre
    expect(semanasDePedido(HOY, null)).toHaveLength(9);
  });
  it("a mitad de semana, la de hoy y luego los lunes; un domingo, el lunes siguiente es mañana", () => {
    expect(semanasDePedido("2026-10-28").slice(0, 3)).toEqual(["2026-10-28", "2026-11-02", "2026-11-09"]); // miércoles
    expect(semanasDePedido("2026-11-01").slice(0, 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-09"]); // domingo
    expect(semanasDePedido("2026-10-31").slice(0, 2)).toEqual(["2026-10-31", "2026-11-02"]); // sábado
    for (const hoy of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) {
      const s = semanasDePedido(hoy);
      expect(s.slice(1).every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
    }
  });
  it("con la fecha límite más allá de las 8 semanas, las tandas se ponen donde cae de verdad (se puede pedir tarde, no antes por falta de opciones)", () => {
    expect(tandasPorDefecto(2, HOY, "2027-02-24").map((t) => t.pedido)).toEqual(["2027-02-15", "2027-02-22"]);
  });
  it("todas a tiempo: la última cae en la semana de la fecha límite y las otras, una semana antes cada una; todas a contado", () => {
    // La semana del 23 nov (k=4) es la última que empieza a más tardar el 27 nov.
    expect(tandasPorDefecto(1, HOY, LIMITE)).toEqual([{ pedido: "2026-11-23", pct: 100, forma: "contado" }]);
    expect(tandasPorDefecto(2, HOY, LIMITE).map((t) => [t.pedido, t.pct])).toEqual([["2026-11-16", 60], ["2026-11-23", 40]]);
    expect(tandasPorDefecto(3, HOY, LIMITE).map((t) => [t.pedido, t.pct])).toEqual([["2026-11-09", 50], ["2026-11-16", 30], ["2026-11-23", 20]]);
  });
  it("si la fecha límite ya pasó o la campaña ya empezó (sin límite), todas en la semana de hoy; nunca antes de hoy", () => {
    expect(tandasPorDefecto(2, HOY, null).every((t) => t.pedido === HOY)).toBe(true);
    expect(tandasPorDefecto(3, HOY, "2026-10-20").every((t) => t.pedido === HOY)).toBe(true);
    expect(tandasPorDefecto(3, "2026-11-23", "2026-11-24").every((t) => t.pedido >= "2026-11-23")).toBe(true);
  });
  it("siempre suman 100 y ninguna tanda llega tarde con un límite que alcanza", () => {
    for (const n of [1, 2, 3] as const) {
      const t = tandasPorDefecto(n, HOY, LIMITE);
      expect(t.reduce((s, x) => s + x.pct, 0)).toBe(100);
      expect(t.some((x) => tandaLlegaTarde(x, LIMITE))).toBe(false);
    }
  });
});

describe("ajustarPorcentajes", () => {
  const t = (pct: number[]): Tanda[] => pct.map((p) => ({ pedido: HOY, pct: p, forma: "contado" as const }));
  it("la última toma lo que falta para llegar a 100", () => {
    expect(ajustarPorcentajes(t([60, 10])).map((x) => x.pct)).toEqual([60, 40]);
    expect(ajustarPorcentajes(t([50, 30, 5])).map((x) => x.pct)).toEqual([50, 30, 20]);
  });
  it("si las anteriores se pasan de 100 se recortan desde atrás y la última queda en 0", () => {
    expect(ajustarPorcentajes(t([80, 60, 10])).map((x) => x.pct)).toEqual([80, 20, 0]);
    expect(ajustarPorcentajes(t([100, 100, 100])).map((x) => x.pct)).toEqual([100, 0, 0]);
  });
  it("topa cada valor en 0–100 y redondea a enteros; con una sola tanda es 100", () => {
    expect(ajustarPorcentajes(t([-5, 30.6])).map((x) => x.pct)).toEqual([0, 100]);
    expect(ajustarPorcentajes(t([37])).map((x) => x.pct)).toEqual([100]);
    expect(ajustarPorcentajes([])).toEqual([]);
  });
  it("sea cual sea lo escrito, suma 100", () => {
    for (const a of [0, 7, 33, 50, 99, 100, 250]) for (const b of [0, 13, 40, 100, 400]) for (const c of [0, 20, 100]) {
      expect(ajustarPorcentajes(t([a, b, c])).reduce((s, x) => s + x.pct, 0)).toBe(100);
    }
  });
});

describe("los pagos que salen de las tandas", () => {
  it("una tanda al contado paga todo el día del pedido", () => {
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "contado" }])).toEqual([{ fecha: "2026-11-02", pct: 100 }]);
  });
  it("cada forma pone sus cuotas: a 30 días cae 30 días después; con anticipo, una parte el día del pedido", () => {
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "d30" }])).toEqual([{ fecha: "2026-12-02", pct: 100 }]);
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "d60" }])).toEqual([{ fecha: "2027-01-01", pct: 100 }]);
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "a50" }])).toEqual([{ fecha: "2026-11-02", pct: 50 }, { fecha: "2026-12-02", pct: 50 }]);
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "a30" }])).toEqual([{ fecha: "2026-11-02", pct: 30 }, { fecha: "2027-01-01", pct: 70 }]);
  });
  it("las cuotas que caen el mismo día se suman y la lista sale en orden de fecha", () => {
    // La tanda 1 (a 30 días) paga el 2 dic; la tanda 2 (contado), el 2 dic también: un solo pago de 100 %.
    const p = pagosDeLasTandas([{ pedido: "2026-11-02", pct: 60, forma: "d30" }, { pedido: "2026-12-02", pct: 40, forma: "contado" }]);
    expect(p).toEqual([{ fecha: "2026-12-02", pct: 100 }]);
    const q = pagosDeLasTandas([{ pedido: "2026-12-02", pct: 40, forma: "contado" }, { pedido: "2026-11-02", pct: 60, forma: "a50" }]);
    expect(q.map((x) => x.fecha)).toEqual(["2026-11-02", "2026-12-02"]);
    expect(q.map((x) => x.pct)).toEqual([30, 70]);
  });
  it("una tanda de 0 % no genera ningún pago", () => {
    expect(pagosDeLasTandas([{ pedido: "2026-11-02", pct: 100, forma: "contado" }, { pedido: "2026-11-09", pct: 0, forma: "a50" }])).toEqual([{ fecha: "2026-11-02", pct: 100 }]);
  });
  it("suman EXACTO 100 y son válidos para la base con cualquier mezcla de tandas y formas", () => {
    const fechas = semanasDePedido(HOY);
    let casos = 0;
    for (const n of [1, 2, 3]) {
      for (const f1 of ORDEN_DE_FORMAS) for (const f2 of ORDEN_DE_FORMAS) for (const f3 of ORDEN_DE_FORMAS) {
        for (const pcts of [[100, 0, 0], [60, 40, 0], [50, 30, 20], [33, 33, 34], [7, 13, 80], [1, 1, 98]]) {
          const tandas: Tanda[] = [f1, f2, f3].slice(0, n).map((forma, i) => ({ pedido: fechas[(i * 3) % 9]!, pct: pcts[i]!, forma }));
          const ajustadas = ajustarPorcentajes(tandas);
          const pagos = pagosDeLasTandas(ajustadas);
          expect(pagos.reduce((s, p) => Math.round(s * 100 + p.pct * 100) / 100, 0)).toBe(100);
          expect(pagosSonValidos(pagos)).toBe(true);
          casos++;
        }
      }
    }
    expect(casos).toBeGreaterThan(900);
  });
  it("el residuo del redondeo lo toma el último pago: tres tandas de 33 % no dejan 99,99 %", () => {
    const p = pagosDeLasTandas([
      { pedido: "2026-11-02", pct: 33, forma: "contado" },
      { pedido: "2026-11-09", pct: 33, forma: "contado" },
      { pedido: "2026-11-16", pct: 34, forma: "contado" },
    ]);
    expect(p.map((x) => x.pct)).toEqual([33, 33, 34]);
  });
});

describe("pagosSonValidos (el gemelo de lo que exige la base)", () => {
  const p = (fecha: string, pct: number) => ({ fecha, pct });
  it("acepta lo que suma exacto 100, con fechas que existen y sin repetir", () => {
    expect(pagosSonValidos([p("2027-01-10", 100)])).toBe(true);
    expect(pagosSonValidos([p("2027-01-10", 33.33), p("2027-02-10", 33.33), p("2027-03-10", 33.34)])).toBe(true);
    expect(pagosSonValidos([p("2028-02-29", 100)])).toBe(true);
  });
  it("rechaza lo imposible: la suma, una fecha que no existe o repetida, un % fuera de rango, vacío o más de 24", () => {
    expect(pagosSonValidos([p("2027-01-10", 70)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 33.33), p("2027-02-10", 33.33), p("2027-03-10", 33.33)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 50), p("2027-02-10", 51)])).toBe(false);
    expect(pagosSonValidos([p("2027-02-31", 100)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 50), p("2027-01-10", 50)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 0), p("2027-02-10", 100)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 0.001), p("2027-02-10", 99.999)])).toBe(false);
    expect(pagosSonValidos([p("2027-01-10", 101)])).toBe(false);
    expect(pagosSonValidos([])).toBe(false);
    expect(pagosSonValidos(Array.from({ length: 25 }, (_, i) => p(`2027-01-${String(i + 1).padStart(2, "0")}`, 4)))).toBe(false);
    expect(pagosSonValidos([p("mañana", 100)])).toBe(false);
  });
});

describe("tandas que llegan tarde", () => {
  it("una tanda pedida después de la fecha límite llega con la campaña empezada; sin fecha límite no hay «tarde»", () => {
    expect(tandaLlegaTarde({ pedido: "2026-11-30" }, LIMITE)).toBe(true);
    expect(tandaLlegaTarde({ pedido: LIMITE }, LIMITE)).toBe(false);
    expect(tandaLlegaTarde({ pedido: "2026-11-02" }, LIMITE)).toBe(false);
    expect(tandaLlegaTarde({ pedido: "2027-01-01" }, null)).toBe(false);
  });
  it("la frase dice cuándo entra a las tiendas y cuándo empieza la campaña", () => {
    expect(frasePorQueLlegaTarde({ pedido: "2026-11-30" }, 14, "2026-12-11")).toBe("Con 14 días para llegar, esa tanda entra a las tiendas el 14/12, después de que empieza la campaña (11/12).");
    expect(frasePorQueLlegaTarde({ pedido: "2026-11-30" }, 1, "2026-12-01")).toContain("Con 1 día para llegar");
  });
});

describe("guardar y volver a leer las tandas", () => {
  const tandas: Tanda[] = [{ pedido: "2026-11-16", pct: 60, forma: "a50" }, { pedido: "2026-11-23", pct: 40, forma: "d30" }];
  it("lo guardado se lee igual", () => {
    expect(leerTandas(tandasParaGuardar(tandas))).toEqual(tandas);
  });
  it("lo que no se entiende da null (la pantalla arranca con las de por defecto, sin inventar lo que había)", () => {
    expect(leerTandas(null)).toBeNull();
    expect(leerTandas([])).toBeNull();
    expect(leerTandas({ v: 2, tandas })).toBeNull();
    expect(leerTandas({ v: 1, tandas: [] })).toBeNull();
    expect(leerTandas({ v: 1, tandas: [{ pedido: "2026-11-16", pct: 60, forma: "a50" }] })).toBeNull(); // no suma 100
    expect(leerTandas({ v: 1, tandas: [{ pedido: "2026-02-31", pct: 100, forma: "a50" }] })).toBeNull();
    expect(leerTandas({ v: 1, tandas: [{ pedido: "2026-11-16", pct: 100, forma: "en_cuotas" }] })).toBeNull();
    expect(leerTandas({ v: 1, tandas: [{ pedido: "2026-11-16", pct: 50.5, forma: "a50" }, { pedido: "2026-11-17", pct: 49.5, forma: "a50" }] })).toBeNull();
    expect(leerTandas({ v: 1, tandas: Array.from({ length: 4 }, () => ({ pedido: "2026-11-16", pct: 25, forma: "contado" })) })).toBeNull();
  });
  it("los argumentos de guardar llevan los pagos que salen de las tandas, las tandas, el IGV en orden y la versión", () => {
    const a = argsGuardarPagos("plan-1", tandas, new Set(["b", "a"]), 3);
    expect(a).toMatchObject({ p_plan_id: "plan-1", p_igv_incluido: ["a", "b"], p_version_esperada: 3 });
    expect(a.p_pagos).toEqual(pagosDeLasTandas(tandas));
    expect(pagosSonValidos(a.p_pagos)).toBe(true);
    expect(leerTandas(a.p_tandas)).toEqual(tandas);
  });
});

describe("el IGV por categoría", () => {
  const filas = [
    { clave: "faldas", nombre: "Faldas", inversion: 1180 },
    { clave: "blusas", nombre: "Blusas", inversion: 1000 },
    { clave: "polos", nombre: "Polos", inversion: 0 },
  ];
  it("sin la marca, al costo se le suma el 18 %: sale de caja el costo más su IGV", () => {
    const c = costosConIgv([{ clave: "blusas", nombre: "Blusas", inversion: 1000 }], new Set());
    expect(c.filas[0]).toMatchObject({ incluido: false, sinIgv: 1000, igv: 180, saleDeCaja: 1180 });
    expect(c).toMatchObject({ inversion: 1000, sinIgv: 1000, igv: 180, saleDeCaja: 1180 });
  });
  it("con la marca «ya incluye el IGV», lo que sale de caja es el costo y el valor sin IGV es el costo ÷ 1,18", () => {
    const c = costosConIgv([{ clave: "faldas", nombre: "Faldas", inversion: 1180 }], new Set(["faldas"]));
    expect(c.filas[0]).toMatchObject({ incluido: true, sinIgv: 1000, igv: 180, saleDeCaja: 1180 });
  });
  it("en los dos casos el IGV es el 18 % del valor sin IGV, y valor sin IGV + IGV = lo que sale de caja", () => {
    for (const marcada of [false, true]) {
      for (const inv of [1, 99.99, 1234.56, 40000]) {
        const f = costosConIgv([{ clave: "x", nombre: "X", inversion: inv }], marcada ? new Set(["x"]) : new Set()).filas[0]!;
        expect(Math.abs(f.igv - f.sinIgv * TASA_IGV)).toBeLessThan(0.0101);
        expect(Math.abs(f.sinIgv + f.igv - f.saleDeCaja)).toBeLessThan(0.0101);
      }
    }
  });
  it("ordena de la que más cuesta a la que menos, deja fuera las que no cuestan nada y suma", () => {
    const c = costosConIgv(filas, new Set(["faldas"]));
    expect(c.filas.map((f) => f.clave)).toEqual(["faldas", "blusas"]);
    expect(c).toMatchObject({ inversion: 2180, sinIgv: 2000, igv: 360, saleDeCaja: 2360 });
  });
});

describe("qué categorías caen en cada tanda", () => {
  const filas = [
    { clave: "casacas", saleDeCaja: 5000 },
    { clave: "vestidos", saleDeCaja: 3000 },
    { clave: "blusas", saleDeCaja: 1500 },
    { clave: "polos", saleDeCaja: 500 },
  ];
  it("de la que más cuesta a la que menos, cada tanda hasta cubrir su parte; la última, lo que quede", () => {
    expect(categoriasPorTanda(filas, [{ pct: 50 }, { pct: 50 }])).toEqual([["casacas"], ["vestidos", "blusas", "polos"]]);
    expect(categoriasPorTanda(filas, [{ pct: 80 }, { pct: 20 }])).toEqual([["casacas", "vestidos"], ["blusas", "polos"]]);
  });
  it("una sola tanda se lleva todo", () => {
    expect(categoriasPorTanda(filas, [{ pct: 100 }])).toEqual([["casacas", "vestidos", "blusas", "polos"]]);
  });
  it("una tanda de 0 % no toma ninguna y la última con compra se lleva lo que reste", () => {
    expect(categoriasPorTanda(filas, [{ pct: 60 }, { pct: 40 }, { pct: 0 }])).toEqual([["casacas", "vestidos"], ["blusas", "polos"], []]);
    expect(categoriasPorTanda(filas, [{ pct: 0 }, { pct: 100 }])).toEqual([[], ["casacas", "vestidos", "blusas", "polos"]]);
  });
  it("ninguna categoría se repite ni se pierde, sea cual sea el reparto", () => {
    for (const pcts of [[100], [60, 40], [50, 30, 20], [10, 10, 80], [33, 33, 34], [90, 5, 5], [0, 50, 50]]) {
      const r = categoriasPorTanda(filas, pcts.map((pct) => ({ pct })));
      expect(r.flat().sort()).toEqual(["blusas", "casacas", "polos", "vestidos"]);
    }
  });
  it("sin categorías con costo no hay nada que repartir", () => {
    expect(categoriasPorTanda([{ clave: "x", saleDeCaja: 0 }], [{ pct: 100 }])).toEqual([[]]);
  });
});

describe("cuánto sale de caja mes a mes", () => {
  it("reparte lo que sale de caja según el % de cada pago y lo pone en su mes; lo de después de tres meses va a «más adelante»", () => {
    const m = salidaPorMes(
      [{ fecha: "2026-11-02", pct: 30 }, { fecha: "2026-12-02", pct: 50 }, { fecha: "2027-03-01", pct: 20 }],
      1000,
      HOY,
    );
    expect(m.map((x) => [x.nombre, x.monto])).toEqual([["Octubre", 0], ["Noviembre", 300], ["Diciembre", 500], ["Más adelante", 200]]);
  });
  it("un pago que ya pasó se cuenta en el primer mes: no se pierde plata de la cuenta", () => {
    const m = salidaPorMes([{ fecha: "2026-09-10", pct: 40 }, { fecha: "2026-10-30", pct: 60 }], 500, HOY);
    expect(m[0]).toMatchObject({ nombre: "Octubre", monto: 500 });
  });
  it("cruza de año sin romperse", () => {
    const m = salidaPorMes([{ fecha: "2027-01-05", pct: 100 }], 100, "2026-11-20");
    expect(m.map((x) => x.nombre)).toEqual(["Noviembre", "Diciembre", "Enero", "Más adelante"]);
    expect(m[2]!.monto).toBe(100);
  });
  it("lo que suman los cuatro es lo que sale de caja", () => {
    const m = salidaPorMes([{ fecha: "2026-11-02", pct: 33.33 }, { fecha: "2026-12-02", pct: 33.33 }, { fecha: "2027-05-01", pct: 33.34 }], 1234.56, HOY);
    expect(Math.abs(m.reduce((s, x) => s + x.monto, 0) - 1234.56)).toBeLessThan(0.02);
  });
});

describe("leer lo que la base guarda", () => {
  const cruda = (extra: Record<string, unknown> = {}) => ({
    soportado: true,
    plan: { id: "p1", visibilidad_finanzas: "todo", por: null, en: null },
    guardado: null,
    ...extra,
  });
  it("una base que no la tiene (sin la marca) o una respuesta que no se entiende dan null", () => {
    expect(leerPagos(null)).toBeNull();
    expect(leerPagos({ plan: { id: "p1" } })).toBeNull();
    expect(leerPagos({ soportado: false })).toBeNull();
    expect(leerPagos({ soportado: true })).toBeNull();
    expect(leerPagos({ soportado: true, plan: {} })).toBeNull();
  });
  it("sin nada guardado: la campaña se ve (por defecto «todo») y no hay foto", () => {
    expect(leerPagos(cruda())).toEqual({ planId: "p1", visibilidad: "todo", visibilidadPor: null, visibilidadEn: null, guardado: null });
  });
  it("una visibilidad que no es una de las tres se lee como «todo» (por defecto todo se ve)", () => {
    expect(leerPagos(cruda({ plan: { id: "p1", visibilidad_finanzas: "raro" } }))!.visibilidad).toBe("todo");
    for (const v of VISIBILIDADES) expect(leerPagos(cruda({ plan: { id: "p1", visibilidad_finanzas: v, por: "Felipe", en: "2026-10-26T15:00:00Z" } }))).toMatchObject({ visibilidad: v, visibilidadPor: "Felipe" });
  });
  it("con una foto guardada trae los pagos, las tandas, el IGV incluido y quién", () => {
    const tandas: Tanda[] = [{ pedido: "2026-11-16", pct: 100, forma: "a50" }];
    const l = leerPagos(
      cruda({
        guardado: { version: 3, pagos: [{ fecha: "2026-11-16", pct: 50 }, { fecha: "2026-12-16", pct: 50 }], tandas: tandasParaGuardar(tandas), igv_incluido: ["c1", "c2"], por: "Micaela", en: "2026-10-26T15:00:00Z" },
      }),
    ) as LecturaPagos;
    expect(l.guardado).toEqual({ version: 3, pagos: [{ fecha: "2026-11-16", pct: 50 }, { fecha: "2026-12-16", pct: 50 }], tandas, igvIncluido: ["c1", "c2"], por: "Micaela", en: "2026-10-26T15:00:00Z" });
  });
  it("lo pagado: sin la marca o malformado da null (nunca un 0 inventado); con ella, los montos", () => {
    expect(leerPagado(null)).toBeNull();
    expect(leerPagado({ comprobantes: 2 })).toBeNull();
    expect(leerPagado({ soportado: true, comprobantes: 3, facturado_sin_igv: 1700, pagado_sin_igv: 700, pagado_total: 790 })).toEqual({ comprobantes: 3, facturadoSinIgv: 1700, pagadoSinIgv: 700, pagadoTotal: 790 });
    expect(leerPagado({ soportado: true, comprobantes: 0, facturado_sin_igv: 0, pagado_sin_igv: 0, pagado_total: 0 })).toEqual({ comprobantes: 0, facturadoSinIgv: 0, pagadoSinIgv: 0, pagadoTotal: 0 });
  });
});

describe("lo que Finanzas lee: la campaña con cada sol en una sola etapa", () => {
  const pedido: LecturaPedido = {
    ordenes: [],
    porCategoria: new Map([
      ["blusas", { unidades: 100, porLlegar: 40, soles: 3000, ordenes: [1] }],
      ["faldas", { unidades: 50, porLlegar: 50, soles: 1180, ordenes: [2] }],
    ]),
    total: 4180,
    unidades: 150,
    porLlegar: 90,
  };
  const filas = [
    { c: { id: "blusas", nombre: "Blusas", prefijo: null, familia: null, tallas: [] }, calculo: { cuantil: 0.6, objetivo: 200, stock: 100, comprar: 100, inversion: 2000 } },
    { c: { id: "faldas", nombre: "Faldas", prefijo: null, familia: null, tallas: [] }, calculo: { cuantil: 0.6, objetivo: 100, stock: 50, comprar: 50, inversion: 1180 } },
    { c: { id: "polos", nombre: "Polos", prefijo: null, familia: null, tallas: [] }, calculo: null },
  ];
  const plan = { id: "plan-navidad", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25" };
  const pagos = (extra: Partial<NonNullable<LecturaPagos["guardado"]>> | null, visibilidad: LecturaPagos["visibilidad"] = "todo"): LecturaPagos => ({
    planId: plan.id,
    visibilidad,
    visibilidadPor: null,
    visibilidadEn: null,
    guardado: extra === null ? null : { version: 1, pagos: [{ fecha: "2026-11-23", pct: 100 }], tandas: null, igvIncluido: ["faldas"], por: "Felipe", en: "2026-10-26T15:00:00Z", ...extra },
  });
  const pagado = { comprobantes: 2, facturadoSinIgv: 3000, pagadoSinIgv: 1500, pagadoTotal: 1770 };
  const armar = (p: LecturaPagos) => campanaParaFinanzas({ plan, filas, pedido, tope: 12000, plazo: { limite: LIMITE }, pagos: p, pagado });

  it("lo pedido sin IGV quita el IGV solo a las categorías marcadas; lo que falta pedir, igual", () => {
    expect(pedidoSinIgv(pedido, new Set())).toBe(4180);
    expect(pedidoSinIgv(pedido, new Set(["faldas"]))).toBe(4000); // 3000 + 1180 / 1,18
    expect(pedidoSinIgv(null, new Set())).toBe(0);
  });
  it("el plan es lo pedido más lo que falta pedir, todo sin IGV; el IGV es el 18 % del valor sin IGV", () => {
    // Blusas sin marca: pedido 3000 y falta 2000. Faldas marcada: pedido 1000 y falta 1000 (1180 ÷ 1,18).
    const c = armar(pagos({}));
    expect(c).toMatchObject({ id: "plan-navidad", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25", plan_sin_igv: 7000, pedido: 4000, pagado: 1500, igv: 1260, tope: 12000, fecha_limite: LIMITE });
  });
  it("trae la lista de pagos y la visibilidad tal como se guardaron, y dónde se arma", () => {
    const c = armar(pagos({}, "escenarios"));
    expect(c.pagos).toEqual([{ fecha: "2026-11-23", pct: 100 }]);
    expect(c.visibilidad_finanzas).toBe("escenarios");
    expect(c.href_plan).toBe("/compras/plan?plan=plan-navidad");
  });
  it("sin nada guardado: pagos vacíos (el plan aún no dice cómo se paga) y ninguna marca de IGV", () => {
    const c = armar(pagos(null));
    expect(c.pagos).toEqual([]);
    expect(c).toMatchObject({ plan_sin_igv: 3000 + 2000 + 1180 + 1180, pedido: 4180, visibilidad_finanzas: "todo" });
  });
  it("sin fecha límite (la campaña ya empezó) la entrega null, no una fecha inventada", () => {
    expect(campanaParaFinanzas({ plan, filas, pedido, tope: null, plazo: { limite: null }, pagos: pagos({}), pagado })).toMatchObject({ fecha_limite: null, tope: null });
  });
  it("pasa por la lectura de Finanzas entera: cada sol en una etapa y la caja suma lo que falta pedir con su IGV", () => {
    const [c] = leerInversion([armar(pagos({}))]);
    expect(c).toBeDefined();
    expect(c!.visible).toBe(true);
    expect(c!.pagos).toEqual([{ fecha: "2026-11-23", pct: 100 }]);
    const r = repartoDeLaCompra(c!);
    expect(r.pagado + r.pedidoSinPagar + r.faltaPedir).toBeCloseTo(c!.planSinIgv, 2);
    expect(r.pasaDelPlan).toBe(0);
    expect(r).toMatchObject({ pagado: 1500, pedidoSinPagar: 2500, faltaPedir: 3000 });
    // Lo que la caja todavía no sabe: lo que falta pedir (3000 sin IGV) con el 18 %.
    expect(razonIgv(c!)).toBeCloseTo(TASA_IGV, 6);
    expect(pendienteDeCaja(c!, true)).toBe(3540);
    expect(pendienteDeCaja(c!, false)).toBe(3000);
  });
  it("«solo en Escenarios» y «no mostrarla» no se ven en el Resumen; «todo», sí", () => {
    expect(leerInversion([armar(pagos({}, "todo"))])[0]!.visible).toBe(true);
    expect(leerInversion([armar(pagos({}, "escenarios"))])[0]!.visible).toBe(false);
    expect(leerInversion([armar(pagos({}, "nada"))])[0]!.visible).toBe(false);
  });
  it("lo pedido de más que el plan se dice aparte y nunca deja la etapa «falta pedir» en negativo", () => {
    const c = leerInversion([campanaParaFinanzas({ plan, filas: [], pedido, tope: null, plazo: { limite: LIMITE }, pagos: pagos({ igvIncluido: [] }), pagado })])[0]!;
    // Sin filas con plan: el plan es lo pedido (4180) y no falta nada.
    expect(c.planSinIgv).toBe(4180);
    expect(repartoDeLaCompra(c).faltaPedir).toBe(0);
  });
});

describe("los textos de visibilidad no prometen lo que todavía no existe", () => {
  it("hay una frase por cada estado y ninguna dice que el flujo de caja de Reportes ya la lee", () => {
    for (const v of VISIBILIDADES) {
      expect(TEXTO_DE_VISIBILIDAD[v].corto.length).toBeGreaterThan(0);
      expect(TEXTO_DE_VISIBILIDAD[v].nota).not.toMatch(/flujo de caja de Reportes|Reportes ▸ Flujo/i);
    }
  });
  it("cada forma de pago suma el 100 % de su tanda", () => {
    for (const f of ORDEN_DE_FORMAS) expect(FORMAS_DE_PAGO[f].cuotas.reduce((s, c) => s + c.parte, 0)).toBeCloseTo(1, 10);
  });
});
