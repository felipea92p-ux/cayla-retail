import { describe, expect, it } from "vitest";
import {
  calcular,
  diasDesde,
  grillaPico,
  hora12,
  horaDe,
  llenadoDelAro,
  nivelPorCuenta,
  parsearObservatorio,
  parsearTienda,
  porAgotarse,
  rankear,
  sumarDias,
  textoDelPeriodo,
  textoVsDe,
  ventanaDe,
  ventasNuevas,
  type DatosObservatorio,
} from "./observatorio-reglas";

const HOY = "2026-10-03"; // sábado
function datos(): DatosObservatorio {
  const dias = [];
  for (let i = 0; i < 60; i++) {
    const f = sumarDias(HOY, -i);
    // Trujillo vende 1000 por día con meta 1000; Lima, 500 con meta 1000. Hoy la tabla trae lo de la mañana.
    dias.push({ u: "tru", f, s: f === HOY ? 300 : 1000, t: f === HOY ? 2 : 10, p: f === HOY ? 3 : 15, m: 1000 });
    dias.push({ u: "lim", f, s: f === HOY ? 100 : 500, t: f === HOY ? 1 : 5, p: f === HOY ? 1 : 6, m: 1000 });
  }
  return {
    hoy: HOY,
    ahoraMin: 17 * 60 + 40,
    tiendas: [
      { id: "tru", nombre: "Tienda Trujillo", sigla: "TRU", mapa: "TRU", cierre: "21:00", caja: { desde: 592, por: "Rosa" }, turno: [] },
      { id: "lim", nombre: "Tienda Lima", sigla: "LIM", mapa: "LIM", cierre: "21:00", caja: null, turno: null },
    ],
    dias,
    hoyVentas: [
      { id: "a", u: "tru", min: 10 * 60 + 30, s: 100, p: 1, q: "Rosa" },
      { id: "b", u: "tru", min: 15 * 60, s: 200, p: 2, q: "Ana" },
      { id: "c", u: "lim", min: 16 * 60 + 10, s: 100, p: 1, q: "Carla" },
    ],
    semanaPasada: [
      { u: "tru", min: 11 * 60, s: 400 },
      { u: "tru", min: 19 * 60, s: 600 },
      { u: "lim", min: 12 * 60, s: 500 },
    ],
  };
}

describe("calcular: hoy", () => {
  it("toda CAYLA es la suma de las tiendas", () => {
    const d = datos();
    const todas = calcular(d, "TODAS", "hoy");
    const tru = calcular(d, "tru", "hoy");
    const lim = calcular(d, "lim", "hoy");
    expect(todas.total).toBe(tru.total + lim.total);
    expect(todas.tickets).toBe(3);
    expect(todas.meta).toBe(2000);
    expect(todas.pct).toBeCloseTo(20, 6);
  });

  it("compara con el mismo día de la semana pasada A ESTA HORA", () => {
    const tru = calcular(datos(), "tru", "hoy");
    expect(tru.prev).toBe(400); // la de las 19:00 todavía no
    expect(tru.delta).toBeCloseTo(-25, 6);
  });

  it("«Repetir el día»: con un corte a las 12:00 solo cuenta lo vendido hasta esa hora", () => {
    const tru = calcular(datos(), "tru", "hoy", 12 * 60);
    expect(tru.total).toBe(100);
    expect(tru.barraActual).toBe(2);
    expect(tru.xAhora).toBeCloseTo(120 / 660, 6);
  });

  it("las barras son por hora y la curva es el % de la meta acumulado", () => {
    const tru = calcular(datos(), "tru", "hoy");
    expect(tru.barras).toHaveLength(11);
    expect(tru.barras[0]).toBe(100);
    expect(tru.barras[5]).toBe(200);
    expect(tru.sombra[9]).toBe(600);
    expect(tru.curva).toHaveLength(12);
    expect(tru.curva.at(-1)?.[1]).toBeCloseTo(30, 6);
    expect(tru.barrasTickets[5]).toBe(1);
    expect(tru.barrasPrendas[5]).toBe(2);
  });

  it("sin meta configurada no se inventa un %", () => {
    const d = datos();
    d.dias = d.dias.map((x) => ({ ...x, m: null }));
    const tru = calcular(d, "tru", "hoy");
    expect(tru.meta).toBeNull();
    expect(tru.pct).toBeNull();
  });

  it("una tienda sin ventas tiene ticket medio null, no 0", () => {
    const d = datos();
    d.hoyVentas = [];
    expect(calcular(d, "lim", "hoy").medio).toBeNull();
  });
});

describe("calcular: 7 y 30 días", () => {
  it("7 días: seis días cerrados más hoy en vivo, contra los 7 anteriores cortados a esta hora", () => {
    const tru = calcular(datos(), "tru", "7d");
    expect(tru.total).toBe(6 * 1000 + 300);
    expect(tru.meta).toBe(7000);
    // los 7 anteriores: 6 días cerrados + el mismo día de la semana pasada hasta esta hora (400)
    expect(tru.prev).toBe(6 * 1000 + 400);
    expect(tru.barras).toHaveLength(7);
    expect(tru.barraActual).toBe(6);
  });

  it("30 días: el último día anterior cuenta por la parte del día que ya pasó", () => {
    const tru = calcular(datos(), "tru", "30d");
    expect(tru.total).toBe(29 * 1000 + 300);
    expect(tru.parteDelDia).toBeCloseTo(0.4, 6); // 400 de 1000 la semana pasada a esta hora
    expect(tru.prev).toBeCloseTo(29 * 1000 + 1000 * 0.4, 6);
    expect(tru.barras).toHaveLength(30);
    expect(tru.curva).toHaveLength(31);
  });
});

describe("ranking y ventas nuevas", () => {
  it("ordena por % de la meta", () => {
    expect(rankear(datos(), "hoy").map((c) => c.foco)).toEqual(["tru", "lim"]);
  });

  it("detecta la venta que no estaba en la lectura anterior", () => {
    const d = datos();
    const nueva = { id: "z", u: "lim", min: 1100, s: 90, p: 1, q: "Marco" };
    expect(ventasNuevas(d.hoyVentas, [...d.hoyVentas, nueva])).toEqual([nueva]);
  });
});

describe("lecturas", () => {
  it("parsea fn_observatorio con números y la sigla de cada tienda", () => {
    const d = parsearObservatorio({
      hoy: HOY,
      ahora_min: "1060",
      tiendas: [{ id: "x", nombre: "Tienda Arequipa", cierre: "21:00", caja: { desde: "605", por: "Lucía" }, turno: null }],
      dias: [{ u: "x", f: HOY, s: "10.5", t: 1, p: 2, m: null }],
      hoy_ventas: [],
      semana_pasada: [],
    });
    expect(d.ahoraMin).toBe(1060);
    expect(d.tiendas[0].sigla).toBe("AQP");
    expect(d.tiendas[0].mapa).toBe("AQP");
    expect(d.tiendas[0].caja).toEqual({ desde: 605, por: "Lucía" });
    expect(d.tiendas[0].turno).toBeNull();
    expect(d.dias[0]).toEqual({ u: "x", f: HOY, s: 10.5, t: 1, p: 2, m: null });
  });

  it("parsea fn_observatorio_tienda por ventana", () => {
    const t = parsearTienda({ categorias: { hoy: [{ cat: "Jeans", s: "99", u: 1 }] }, productos: {}, equipo: {}, pico: [{ d: 6, h: 16, s: 520 }], quietas: { variantes: 3, unidades: 8 } });
    expect(t.categorias.hoy).toEqual([{ cat: "Jeans", s: 99, u: 1 }]);
    expect(t.categorias.d7).toEqual([]);
    expect(t.quietas).toEqual({ variantes: 3, unidades: 8 });
    expect(grillaPico(t.pico)[5][6]).toBe(520);
  });

  it("lo que se va a agotar: solo con ritmo medido y pocos días, del que menos dura al que más", () => {
    const filas = [
      { referencia: "Blusa", color: "Blanco", talla: "M", utilizable: 3, dias: 2.4 },
      { referencia: "Jean", color: "Azul", talla: "28", utilizable: 2, dias: 6 },
      { referencia: "Polo", color: null, talla: null, utilizable: 9, dias: 40 },
      { referencia: "Nuevo", color: null, talla: null, utilizable: 4, dias: null },
    ];
    expect(porAgotarse(filas)).toEqual([
      { nombre: "Blusa", variante: "Blanco · M", unidades: 3, dias: 2 },
      { nombre: "Jean", variante: "Azul · 28", unidades: 2, dias: 6 },
    ]);
  });
});

describe("avisos y formato", () => {
  it("el aro se llena a los 7 días y un aviso al día no tiene aro", () => {
    expect(llenadoDelAro({ nivel: "urg", edad: 7 })).toBe(1);
    expect(llenadoDelAro({ nivel: "urg", edad: 14 })).toBe(1);
    expect(llenadoDelAro({ nivel: "hoy", edad: 0 })).toBeGreaterThan(0);
    expect(llenadoDelAro({ nivel: "ok", edad: 5 })).toBe(0);
    expect(nivelPorCuenta(0, "urg")).toBe("ok");
    expect(nivelPorCuenta(null, "urg")).toBe("urg");
  });

  it("días desde y horas", () => {
    expect(diasDesde("2026-10-01T12:00:00Z", new Date("2026-10-03T13:00:00Z"))).toBe(2);
    expect(hora12(1060)).toBe("5:40 p. m.");
    expect(hora12(600)).toBe("10:00 a. m.");
    expect(horaDe(9 * 60)).toBe(0);
    expect(horaDe(22 * 60)).toBe(10);
  });

  it("el texto del periodo y del «vs» siguen al día de hoy", () => {
    expect(textoDelPeriodo("hoy", HOY, 1060)).toBe("Hoy · sábado 3 de octubre · 5:40 p. m.");
    expect(textoDelPeriodo("7d", HOY, 1060)).toBe("Últimos 7 días · 27 sep – 3 oct");
    expect(textoVsDe("hoy", HOY)).toBe("vs sáb. pasado");
    expect(textoVsDe("hoy", "2026-10-05")).toBe("vs lun. pasado");
    expect(textoVsDe("30d", HOY)).toBe("vs 30 días antes");
    expect(ventanaDe("7d")).toBe("d7");
  });
});
