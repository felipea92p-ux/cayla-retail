import { describe, expect, it } from "vitest";
import type { Repeticion } from "./perdidas-reglas";
import type { TramoPlanilla } from "./planilla-salidas-reglas";
import {
  alMomento,
  avisoPerdidasObs,
  avisoPlanillaObs,
  calcular,
  calcularVentaja,
  diasDesde,
  fraseVentaja,
  grillaPico,
  hora12,
  horaDe,
  indiceCercano,
  llenadoDelAro,
  momentoDe,
  nivelPorCuenta,
  parsearObservatorio,
  parsearTienda,
  porAgotarse,
  rangoPico,
  tonoPico,
  rankear,
  solesConSigno,
  sumarDias,
  textoDelPeriodo,
  textoVsDe,
  ventanaDe,
  ventasNuevas,
  type DatosObservatorio,
  type NombresVentaja,
} from "./observatorio-reglas";
import { formatoSoles } from "./resumen-formato";

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

  it("horas pico: la grilla se ensancha a las horas con ventas y no amontona lo tardío en las 8 pm", () => {
    // Arequipa vende hasta las 22 h; antes esas ventas caían en la columna de las 20 h.
    const pico = [
      { d: 5, h: 20, s: 100 },
      { d: 5, h: 21, s: 300 },
      { d: 5, h: 22, s: 50 },
    ];
    expect(rangoPico(pico)).toEqual({ desde: 10, hasta: 22 });
    const g = grillaPico(pico, 10, 22);
    expect(g[4]).toHaveLength(13);
    expect(g[4][10]).toBe(100); // 20 h
    expect(g[4][11]).toBe(300); // 21 h
    expect(g[4][12]).toBe(50); // 22 h
  });

  it("horas pico: sin ventas, o con ventas dentro de 10 a 20, queda el rango de siempre; una hora sin ventas no ensancha", () => {
    expect(rangoPico([])).toEqual({ desde: 10, hasta: 20 });
    expect(rangoPico([{ d: 1, h: 14, s: 5 }])).toEqual({ desde: 10, hasta: 20 });
    expect(rangoPico([{ d: 1, h: 23, s: 0 }])).toEqual({ desde: 10, hasta: 20 });
    expect(rangoPico([{ d: 1, h: 22, s: -40 }])).toEqual({ desde: 10, hasta: 22 });
    expect(rangoPico([{ d: 1, h: 9, s: 5 }])).toEqual({ desde: 9, hasta: 20 });
    expect(grillaPico([])[0]).toHaveLength(11);
  });

  it("horas pico: el color sube con lo vendido (ámbar, rojo, rojo profundo) y lo flojo se ve tenue", () => {
    expect(tonoPico(0, 100)).toMatchObject({ t: 0, h1: 0, h2: 0, p: 32 });
    expect(tonoPico(50, 100)).toMatchObject({ h1: 100, h2: 0 });
    expect(tonoPico(100, 100)).toMatchObject({ h1: 100, h2: 100, p: 100 });
    expect(tonoPico(5, 0).t).toBe(0);
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

describe("avisoPerdidasObs — pérdidas que se repiten, tienda por tienda (ADR-0328 act. 14)", () => {
  const TRU = { id: "tru", sigla: "TRU" };
  const LIM = { id: "lim", sigla: "LIM" };
  const prenda = (o: Partial<Extract<Repeticion, { tipo: "prenda" }>> = {}): Repeticion => ({
    tipo: "prenda",
    clave: "prenda:v1",
    varianteId: "v1",
    etiqueta: "Polo Básico · M · Negro",
    veces: 2,
    unidades: 3,
    ultimoDia: "2026-09-30",
    ...o,
  });
  const grande: Repeticion = { tipo: "resta_grande", clave: "resta:h1", hechoId: "h1", varianteId: "v2", etiqueta: "Jean Recto · 28 · Azul", unidades: 6, quedaron: 0, dia: "2026-10-02" };

  it("con hallazgos: para esta semana, repartido por tienda, primero la resta grande, con la sigla y el enlace a la pestaña", () => {
    const a = avisoPerdidasObs([{ tienda: TRU, repeticiones: [prenda()] }, { tienda: LIM, repeticiones: [grande] }], HOY);
    expect(a).toMatchObject({ clave: "perdidas", nivel: "semana", n: 2, icono: "alerta", titulo: "Pérdidas que se repiten", porTienda: { tru: 1, lim: 1 } });
    expect(a.href).toBe("/inventario/movimientos?vista=perdidas&p=30");
    expect(a.edad).toBe(3); // la más antigua perdió el 30-sep: 3 días antes de hoy
    expect(a.detalle).toEqual({
      tipo: "lista",
      filas: [
        { titulo: "Se quitaron 6 prendas de Jean Recto · 28 · Azul sin nota y la talla quedó en 0", detalle: "LIM · 2 oct", chip: "Sin nota" },
        { titulo: "Polo Básico · M · Negro perdió 3 prendas en 2 días distintos", detalle: "TRU · 30 sep", chip: "2 días" },
      ],
    });
  });

  it("ninguna tienda repite: al día, sin detalle ni aro", () => {
    const a = avisoPerdidasObs([{ tienda: TRU, repeticiones: [] }, { tienda: LIM, repeticiones: [] }], HOY);
    expect(a).toMatchObject({ nivel: "ok", n: 0, detalle: null, edad: null, porTienda: { tru: 0, lim: 0 } });
  });

  it("si una tienda no se pudo leer, el aviso no dice «al día»: no se pudo leer", () => {
    const a = avisoPerdidasObs(null, HOY);
    expect(a.n).toBeNull();
    expect(a.porTienda).toBeNull();
    expect(a.nivel).not.toBe("ok");
  });

  it("el detalle muestra hasta 6, los que más perdieron primero", () => {
    const muchas = Array.from({ length: 8 }, (_, i) => prenda({ clave: `prenda:v${i}`, varianteId: `v${i}`, etiqueta: `Prenda ${i}`, unidades: i + 1 }));
    const a = avisoPerdidasObs([{ tienda: TRU, repeticiones: muchas }], HOY);
    expect(a.n).toBe(8);
    expect(a.detalle?.tipo === "lista" && a.detalle.filas.map((f) => f.titulo.split(" perdió")[0])).toEqual(["Prenda 7", "Prenda 6", "Prenda 5", "Prenda 4", "Prenda 3", "Prenda 2"]);
  });
});

describe("avisoPlanillaObs — la planilla pagada sin su salida del banco (ADR-0567)", () => {
  const tramo = (o: Partial<TramoPlanilla>): TramoPlanilla => ({
    periodoId: "p",
    fechaIni: "2026-09-28",
    fechaFin: "2026-10-28",
    grupo: "planilla",
    pagadoEl: "2026-10-29",
    banco: "bcp",
    personas: 13,
    neto: 12740,
    movimientoId: null,
    registrado: null,
    netoAlRegistrar: null,
    cuentaId: null,
    cuentaNombre: null,
    fechaRegistrada: null,
    ...o,
  });
  const AHORA = new Date("2026-11-01T15:00:00-05:00");

  it("con algo por registrar: cuántas, desde hace cuánto, una fila por banco con su cuenta, y lleva a Cuentas y dinero ▸ Empresa", () => {
    const a = avisoPlanillaObs(
      { tramos: [tramo({}), tramo({ banco: "interbank", personas: 5, neto: 5512.95 })], cuentas: [{ banco: "bcp", cuentaId: "c1", cuentaNombre: "BCP Empresa" }] },
      AHORA,
    )!;
    expect(a).toMatchObject({ clave: "planilla", n: 2, nivel: "hoy", icono: "dolar", href: "/finanzas/dinero?sede=empresa", porTienda: null, edad: 3 });
    expect(a.titulo).toBe("Planilla pagada sin su salida del banco");
    expect(a.detalle).toMatchObject({ tipo: "lista" });
    const filas = a.detalle?.tipo === "lista" ? a.detalle.filas : [];
    expect(filas.map((f) => f.titulo)).toEqual(["BCP · 13 personas", "Interbank · 5 personas"]);
    expect(filas[0].detalle).toBe("falta registrar · sale de BCP Empresa");
    expect(filas[0].chip).toBe("Falta");
  });

  it("sin nada que registrar no hay aviso; sin leer, dice que no se pudo leer", () => {
    expect(avisoPlanillaObs({ tramos: [tramo({ movimientoId: "m", netoAlRegistrar: 12740 })], cuentas: [] }, AHORA)).toBeUndefined();
    expect(avisoPlanillaObs({ tramos: [], cuentas: [] }, AHORA)).toBeUndefined();
    expect(avisoPlanillaObs(null, AHORA)).toMatchObject({ n: null, detalle: null });
  });
});

describe("calcular: el acumulado en soles", () => {
  it("termina en el total en los tres periodos, también si la tienda tiene meta", () => {
    const d = datos();
    for (const p of ["hoy", "7d", "30d"] as const) {
      const c = calcular(d, "tru", p);
      expect(c.acumulado.at(-1)?.[1]).toBe(c.total);
      expect(c.acumulado.map((x) => x[0])).toEqual(c.curva.map((x) => x[0]));
    }
  });

  it("una venta después de las 9 p. m. entra en el último punto de la curva", () => {
    const d = datos();
    d.ahoraMin = 21 * 60 + 40;
    d.hoyVentas.push({ id: "tarde", u: "tru", min: 21 * 60 + 30, s: 700, p: 1, q: "Rosa" });
    const c = calcular(d, "tru", "hoy");
    expect(c.total).toBe(1000);
    expect(c.acumulado.at(-1)).toEqual([1, 1000]);
    expect(c.curva.at(-1)?.[1]).toBeCloseTo(100, 6);
  });
});

describe("indiceCercano y los momentos de una curva", () => {
  it("elige el punto más cercano a la x", () => {
    const curva: [number, number][] = [[0, 0], [0.5, 1], [1, 2]];
    expect(indiceCercano(curva, 0.1)).toBe(0);
    expect(indiceCercano(curva, 0.4)).toBe(1);
    expect(indiceCercano(curva, 0.95)).toBe(2);
  });

  it("nombra el punto por su fecha o su hora, con el artículo que le toca", () => {
    const dias = { periodo: "7d", dias: 7 } as const;
    const horas = { periodo: "hoy", dias: 1 } as const;
    expect(momentoDe(dias, HOY, 1000, 0)).toBe("Inicio");
    expect(momentoDe(dias, HOY, 1000, 1)).toBe("27 sep");
    expect(alMomento(dias, HOY, 1000, 1)).toBe("el 27 sep");
    expect(alMomento(horas, HOY, 1000, 3)).toBe("la 1:00 p. m.");
    expect(alMomento(horas, HOY, 1000, 4)).toBe("las 2:00 p. m.");
  });
});

describe("calcularVentaja", () => {
  const TRU_LIM: NombresVentaja = { propia: "TRU", rival: "LIM" };
  const LIM_TRU: NombresVentaja = { propia: "LIM", rival: "TRU" };
  const OTRAS: NombresVentaja = { propia: "TRU", rival: null };
  const al = (j: number) => alMomento({ periodo: "7d", dias: 7 }, HOY, 1000, j);
  /** Una tienda con lo que vendió cada uno de los 6 días antes de hoy, de más antiguo a más nuevo. */
  const conVentas = (d: DatosObservatorio, u: string, ventas: readonly number[]) => {
    ventas.forEach((s, i) => {
      const f = sumarDias(HOY, i - 6);
      const fila = d.dias.find((x) => x.u === u && x.f === f);
      if (fila) fila.s = s;
      else d.dias.push({ u, f, s, t: 1, p: 1, m: null });
    });
  };

  it("es lo que lleva una menos lo que lleva la otra, y termina en la diferencia de totales", () => {
    const d = datos();
    const tru = calcular(d, "tru", "7d");
    const lim = calcular(d, "lim", "7d");
    const v = calcularVentaja(tru, [lim]);
    expect(v.brecha).toBe(tru.total - lim.total);
    expect(v.serie.map((p) => p[0])).toEqual(tru.curva.map((p) => p[0]));
    expect(v.propia.at(-1)).toBe(tru.total);
    expect(v.rival.at(-1)).toBe(lim.total);
  });

  it("dice quién va adelante, por cuánto y hasta cuándo iban parejas", () => {
    const d = datos();
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(v.estado).toBe("adelante");
    const f = fraseVentaja(v, TRU_LIM, al);
    expect(f.titular).toBe(`TRU le saca ${formatoSoles(3200)} a LIM.`);
    expect(f.detalle).toBe("Iban parejas hasta el 27 sep.");
  });

  it("desde el otro lado, la misma diferencia se dice como ir detrás", () => {
    const d = datos();
    const v = calcularVentaja(calcular(d, "lim", "7d"), [calcular(d, "tru", "7d")]);
    expect(v.estado).toBe("detras");
    expect(v.brecha).toBe(-3200);
    const f = fraseVentaja(v, LIM_TRU, al);
    expect(f.titular).toBe(`LIM va ${formatoSoles(3200)} detrás de TRU.`);
    expect(f.detalle).toBe("Iban parejas hasta el 27 sep.");
  });

  it("si se despegó desde el primer día, lo dice", () => {
    const d = datos();
    conVentas(d, "lim", [0, 0, 0, 0, 0, 0]);
    d.hoyVentas = d.hoyVentas.filter((x) => x.u !== "lim");
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(v.quiebre).toBe(0);
    expect(fraseVentaja(v, TRU_LIM, al).detalle).toBe("Va adelante desde el inicio.");
    const atras = calcularVentaja(calcular(d, "lim", "7d"), [calcular(d, "tru", "7d")]);
    expect(fraseVentaja(atras, LIM_TRU, al).detalle).toBe("Va detrás desde el inicio.");
  });

  it("si la otra iba adelante y la pasó, dice hasta cuándo iba adelante", () => {
    const d = datos();
    conVentas(d, "tru", [0, 0, 0, 3000, 3000, 3000]);
    conVentas(d, "lim", [1000, 1000, 1000, 0, 0, 0]);
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(v.estado).toBe("adelante");
    expect(v.otraIbaAdelante).toBe(3);
    expect(fraseVentaja(v, TRU_LIM, al).detalle).toBe("LIM iba adelante hasta el 29 sep.");
    const atras = calcularVentaja(calcular(d, "lim", "7d"), [calcular(d, "tru", "7d")]);
    expect(fraseVentaja(atras, LIM_TRU, al).detalle).toBe("LIM iba adelante hasta el 29 sep.");
  });

  it("menos de lo que se vende en un día promedio es ir parejas", () => {
    const d = datos();
    conVentas(d, "lim", [1000, 1000, 1000, 1000, 1000, 800]);
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(v.estado).toBe("parejas");
    const f = fraseVentaja(v, TRU_LIM, al);
    expect(f.titular).toBe(`TRU y LIM van parejas: ${formatoSoles(400)} de diferencia.`);
    expect(f.detalle).toBeNull();
  });

  it("idénticas: van parejas, sin cifra", () => {
    const d = datos();
    conVentas(d, "lim", [1000, 1000, 1000, 1000, 1000, 1000]);
    d.hoyVentas = d.hoyVentas.map((x) => (x.u === "lim" ? { ...x, s: 300 } : x));
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(fraseVentaja(v, TRU_LIM, al).titular).toBe("TRU y LIM van parejas.");
  });

  it("sin ventas de ningún lado, no inventa un ganador", () => {
    const d = datos();
    d.hoyVentas = [];
    const v = calcularVentaja(calcular(d, "tru", "hoy"), [calcular(d, "lim", "hoy")]);
    expect(v.estado).toBe("sin-ventas");
    const f = fraseVentaja(v, TRU_LIM, al);
    expect(f.titular).toBe("Todavía no hay ventas para comparar.");
    expect(f.detalle).toBeNull();
  });

  it("contra varias, compara con su promedio y lo dice", () => {
    const d = datos();
    d.tiendas.push({ id: "aqp", nombre: "Tienda Arequipa", sigla: "AQP", mapa: "AQP", cierre: "21:00", caja: null, turno: null });
    conVentas(d, "aqp", [100, 100, 100, 100, 100, 100]);
    const tru = calcular(d, "tru", "7d");
    const lim = calcular(d, "lim", "7d");
    const aqp = calcular(d, "aqp", "7d");
    const v = calcularVentaja(tru, [lim, aqp]);
    expect(v.rival.at(-1)).toBe((lim.total + aqp.total) / 2);
    expect(fraseVentaja(v, OTRAS, al).titular).toBe(`TRU le saca ${formatoSoles(tru.total - (lim.total + aqp.total) / 2)} al promedio de las otras.`);
    const atras = calcularVentaja(aqp, [tru, lim]);
    expect(fraseVentaja(atras, { propia: "AQP", rival: null }, al).titular).toBe(`AQP va ${formatoSoles((tru.total + lim.total) / 2 - aqp.total)} detrás del promedio de las otras.`);
  });

  it("si iba adelante el promedio, lo nombra con mayúscula al empezar la frase", () => {
    const d = datos();
    d.tiendas.push({ id: "aqp", nombre: "Tienda Arequipa", sigla: "AQP", mapa: "AQP", cierre: "21:00", caja: null, turno: null });
    conVentas(d, "tru", [0, 0, 0, 3000, 3000, 3000]);
    conVentas(d, "lim", [1000, 1000, 1000, 0, 0, 0]);
    conVentas(d, "aqp", [1000, 1000, 1000, 0, 0, 0]);
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d"), calcular(d, "aqp", "7d")]);
    expect(fraseVentaja(v, OTRAS, al).detalle).toBe("El promedio de las otras iba adelante hasta el 29 sep.");
  });

  it("una tienda sin meta también se compara: va en soles, y entonces no se habla de metas", () => {
    const d = datos();
    d.dias = d.dias.map((x) => (x.u === "lim" ? { ...x, m: null } : x));
    const v = calcularVentaja(calcular(d, "tru", "7d"), [calcular(d, "lim", "7d")]);
    expect(v.brecha).toBe(3200);
    expect(v.pctRival).toBeNull();
    expect(fraseVentaja(v, TRU_LIM, al).metas).toBeNull();
  });

  it("con meta de los dos lados, dice el % de cada uno", () => {
    const d = datos();
    const tru = calcular(d, "tru", "7d");
    const lim = calcular(d, "lim", "7d");
    const f = fraseVentaja(calcularVentaja(tru, [lim]), TRU_LIM, al);
    expect(f.metas).toBe(`TRU va en ${Math.round(tru.pct ?? 0)}% de su meta · LIM en ${Math.round(lim.pct ?? 0)}%`);
  });

  it("con «Hoy» cuenta por horas: dice hasta qué hora iban parejas", () => {
    const d = datos();
    d.hoyVentas = [{ id: "a", u: "tru", min: 14 * 60, s: 900, p: 1, q: "Rosa" }];
    const tru = calcular(d, "tru", "hoy");
    const v = calcularVentaja(tru, [calcular(d, "lim", "hoy")]);
    expect(v.estado).toBe("adelante");
    const f = fraseVentaja(v, TRU_LIM, (j) => alMomento(tru, HOY, d.ahoraMin, j));
    expect(f.detalle).toBe("Iban parejas hasta la 1:00 p. m.");
  });

  it("solesConSigno lleva signo solo si hay diferencia", () => {
    expect(solesConSigno(3250)).toBe(`+${formatoSoles(3250)}`);
    expect(solesConSigno(-1200)).toBe(`−${formatoSoles(1200)}`);
    expect(solesConSigno(0.2)).toBe(formatoSoles(0));
  });
});
