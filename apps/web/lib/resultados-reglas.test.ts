import { describe, expect, it } from "vitest";
import {
  avisosER,
  columnasER,
  conceptosER,
  csvEstado,
  deltaTexto,
  extraNecesario,
  fraseCampanasMalas,
  leerCampana,
  leerFilaER,
  leerVerER,
  margenQueSePierde,
  mesAnterior,
  mesTitulo,
  nombreCorto,
  nombreEje,
  origenDeCifra,
  porcentaje,
  puntoDeEquilibrio,
  separarCampanas,
  solesER,
  veredictoCampana,
  type CampanaFila,
  type FilaER,
  type LineaDiario,
} from "./resultados-reglas";

// Las reglas de presentación del Estado de resultados y de Campañas (ADR-0195 F5). Las cifras las da la base; aquí se
// prueba qué se muestra, cómo, y la única cuenta de la pantalla: cuánto más vender para compensar un descuento.

const fila = (p: Partial<FilaER> & Pick<FilaER, "unidad" | "nombre">): FilaER => ({
  ubicacionId: null,
  orden: 1,
  ventas: 0,
  costo: 0,
  fletes: 0,
  mermas: 0,
  margen: 0,
  planilla: 0,
  depreciacion: 0,
  gastos: 0,
  resultado: 0,
  igvVentas: 0,
  detalleGastos: [],
  detalleMermas: [],
  sinCosto: 0,
  mermasSinCosto: 0,
  descuadres: 0,
  planillaVisible: true,
  planillaNota: null,
  ...p,
});

const TRU = fila({
  ubicacionId: "u-tru",
  unidad: "tienda",
  nombre: "Tienda Trujillo",
  ventas: 44100,
  costo: 19850,
  mermas: 160,
  margen: 24090,
  planilla: 7800,
  gastos: 12500,
  resultado: 11590,
  detalleGastos: [
    { cuenta: "62", nombre: "Gastos de personal", monto: 7800 },
    { cuenta: "635", nombre: "Alquileres", monto: 4500 },
    { cuenta: "681", nombre: "Depreciación", monto: 87 },
    { cuenta: "639", nombre: "Otros servicios", monto: 113 },
  ],
});
const LIM = fila({
  ubicacionId: "u-lim",
  unidad: "tienda",
  nombre: "Tienda Lima",
  ventas: 19800,
  margen: 10000,
  gastos: 12000,
  resultado: -2000,
  sinCosto: 3,
});
const TAL = fila({
  ubicacionId: "u-tal",
  unidad: "taller",
  nombre: "Taller",
  gastos: 1100,
  resultado: -1100,
});
const EMP = fila({
  unidad: "empresa",
  nombre: "De la empresa",
  gastos: 300,
  resultado: -300,
  detalleGastos: [{ cuenta: "655", nombre: "Bajas", monto: 50 }],
});
const CONS = fila({
  unidad: "consolidado",
  nombre: "CAYLA",
  ventas: 63900,
  margen: 34090,
  gastos: 25900,
  resultado: 8190,
});
const TODAS = [TRU, LIM, TAL, EMP, CONS];

describe("leer lo que manda la base", () => {
  it("los numeric llegan como texto y se vuelven números; los detalles, listas", () => {
    const f = leerFilaER({
      ubicacion_id: null,
      unidad: "consolidado",
      nombre: "CAYLA",
      orden: 4,
      ventas_netas: "513.55",
      resultado: "-28934.71",
      detalle_gastos: [{ cuenta: "635", nombre: "Alquileres", monto: "900.00" }],
      detalle_mermas: [{ regla: "merma_merma", monto: "80" }],
      planilla_visible: true,
    });
    expect(f.ventas).toBe(513.55);
    expect(f.resultado).toBe(-28934.71);
    expect(f.detalleGastos).toEqual([{ cuenta: "635", nombre: "Alquileres", monto: 900 }]);
    expect(f.detalleMermas[0]!.monto).toBe(80);
    expect(f.unidad).toBe("consolidado");
    expect(f.planillaVisible).toBe(true);
  });
});

describe("«Ver»: qué columnas se muestran", () => {
  it("el líder arranca en la sede donde trabaja, con CAYLA al lado", () => {
    const ver = leerVerER(undefined, TODAS, true, "u-tru");
    expect(ver).toBe("u-tru");
    expect(columnasER(TODAS, ver).map(nombreCorto)).toEqual(["Trujillo", "CAYLA"]);
  });
  it("«todas» pone cada unidad en su columna y CAYLA al final; «empresa», solo lo de la empresa", () => {
    expect(columnasER(TODAS, "todas").map(nombreCorto)).toEqual(["Trujillo", "Lima", "Taller", "De la empresa", "CAYLA"]);
    expect(columnasER(TODAS, "empresa").map(nombreCorto)).toEqual(["De la empresa", "CAYLA"]);
  });
  it("una sede que no existe (o sin sede) cae en «todas»", () => {
    expect(leerVerER("otra", TODAS, true, null)).toBe("todas");
  });
  it("quien tiene el módulo sin ser líder ve solo su tienda, sin CAYLA, aunque pida otra cosa", () => {
    const suyas = [TRU];
    const ver = leerVerER("todas", suyas, false, "u-lim");
    expect(ver).toBe("u-tru");
    expect(columnasER(suyas, ver).map(nombreCorto)).toEqual(["Trujillo"]);
  });
});

describe("las filas del cuadro", () => {
  const conceptos = conceptosER(columnasER(TODAS, "todas"));
  const claves = conceptos.map((k) => k.clave);

  it("ventas, costo, fletes y mermas; margen; los gastos del spike; depreciación y bajas al final; utilidad", () => {
    expect(claves.slice(0, 5)).toEqual(["ventas", "costo", "fletes", "mermas", "margen"]);
    expect(claves.slice(5, 13)).toEqual(["g62", "g635", "g636", "g632", "g637", "g631", "g656", "g634"]);
    expect(claves.slice(-4)).toEqual(["g639", "g681", "g655", "utilidad"]);
  });
  it("una cuenta de gasto que nadie usa y no está entre las de siempre no aparece", () => {
    expect(claves).not.toContain("g651");
    expect(conceptosER([TAL]).map((k) => k.clave)).not.toContain("g655");
  });
  it("lo que resta se muestra en negativo; el margen y la utilidad con su signo", () => {
    const valor = (clave: string, f: FilaER) => conceptos.find((k) => k.clave === clave)!.valor(f);
    expect(valor("ventas", TRU)).toBe(44100);
    expect(valor("costo", TRU)).toBe(-19850);
    expect(valor("g62", TRU)).toBe(-7800);
    expect(valor("g635", LIM)).toBe(-0);
    expect(valor("utilidad", LIM)).toBe(-2000);
  });
  it("cada gasto dice su cuenta y su nombre del negocio", () => {
    const planilla = conceptos.find((k) => k.clave === "g62")!;
    expect([planilla.nombre, planilla.cuenta]).toEqual(["Planilla (Dynamic)", "62"]);
    expect(conceptos.find((k) => k.clave === "g639")!.nombre).toBe("Comisiones bancarias");
  });
});

describe("cómo se escribe", () => {
  it("soles redondos con el signo menos de verdad", () => {
    expect(solesER(44100)).toBe("S/ 44,100");
    expect(solesER(-19850.4)).toBe("−S/ 19,850");
    expect(solesER(0.2)).toBe("S/ 0");
  });
  it("porcentaje con coma decimal; sin base no hay porcentaje", () => {
    expect(porcentaje(23670, 44100)).toBe("53,7 %");
    expect(porcentaje(-1000, 44100)).toBe("−2,3 %");
    expect(porcentaje(5, 0)).toBeNull();
  });
  it("la diferencia contra el mes anterior", () => {
    expect(deltaTexto(44100, 42900, "2026-08")).toBe("+1,200 vs ago.");
    expect(deltaTexto(100, 400, "2026-08")).toBe("−300 vs ago.");
    expect(deltaTexto(100, null, "2026-08")).toBeNull();
  });
  it("meses: el anterior de enero es diciembre del año anterior", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-09")).toBe("2026-08");
    expect(mesTitulo("2026-08")).toBe("Agosto 2026");
  });
});

describe("avisos", () => {
  it("un descuadre va en rojo y dice dónde; las prendas sin costo, en ámbar", () => {
    const avisos = avisosER([fila({ ...TRU, descuadres: 2 }), LIM], false);
    expect(avisos[0]).toMatchObject({ tono: "rojo" });
    expect(avisos[0]!.texto).toContain("Hay 2 operaciones");
    expect(avisos[0]!.texto).toContain("Trujillo");
    expect(avisos[1]!.texto).toContain("3 prendas vendidas sin costo cargado (Lima)");
  });
  it("sin permiso en Dynamic lo dice; en un mes en curso sin planilla, avisa que se suma al pagarse", () => {
    expect(avisosER([fila({ ...TRU, planillaVisible: false })], false).map((a) => a.tono)).toEqual(["pizarra"]);
    expect(avisosER([fila({ ...TRU, planilla: 0 })], true).at(-1)!.texto).toContain("cuando Dynamic la pague");
    expect(avisosER([TRU], false)).toEqual([]);
  });
});

describe("de dónde sale una cifra", () => {
  const l = (p: Partial<LineaDiario>): LineaDiario => ({
    fecha: "2026-09-10",
    ubicacionId: "u-tru",
    asiento: "a",
    regla: "venta",
    cuenta: "7011",
    debe: 0,
    haber: 0,
    origenTabla: "ventas",
    origenId: "x",
    glosa: "",
    ...p,
  });
  const lineas = [
    l({ haber: 169.49, asiento: "v1" }),
    l({ haber: 84.75, asiento: "v2" }),
    l({ regla: "devolucion", debe: 84.75, asiento: "d1" }),
    l({ ubicacionId: "u-lim", haber: 127.12, asiento: "v3" }),
    l({ cuenta: "691", debe: 80, asiento: "v1" }),
  ];
  it("suma con el signo de la cuenta y agrupa por la operación que la generó", () => {
    const o = origenDeCifra(lineas, ["7011"], "u-tru");
    expect(Math.round(o.total * 100) / 100).toBe(169.49);
    expect(o.porRegla.map((g) => [g.texto, g.n])).toEqual([
      ["Ventas", 2],
      ["Devoluciones", 1],
    ]);
    expect(o.mayores[0]!.asiento).toBe("v1");
  });
  it("CAYLA suma todas las unidades; «empresa», solo lo que no tiene tienda", () => {
    expect(Math.round(origenDeCifra(lineas, ["7011"], "consolidado").total * 100) / 100).toBe(296.61);
    expect(origenDeCifra(lineas, ["7011"], "empresa").total).toBe(0);
  });
});

describe("punto de equilibrio (para el Resumen)", () => {
  it("gastos ÷ margen %: con 50 % de margen y 5,000 de gastos hay que vender 10,000", () => {
    expect(puntoDeEquilibrio({ ventas: 8000, margen: 4000, gastos: 5000 })).toEqual({ ventas: 10000, cubre: 0.8 });
  });
  it("sin ventas o con margen negativo no hay punto de equilibrio", () => {
    expect(puntoDeEquilibrio({ ventas: 0, margen: 0, gastos: 100 })).toBeNull();
    expect(puntoDeEquilibrio({ ventas: 100, margen: -5, gastos: 100 })).toBeNull();
  });
});

describe("descargar", () => {
  it("un CSV con «;», montos exactos y el nombre de cada columna", () => {
    const cols = columnasER(TODAS, "u-tru");
    const csv = csvEstado(conceptosER(cols), cols, "2026-08");
    expect(csv.startsWith("﻿Estado de resultados · Agosto 2026")).toBe(true);
    expect(csv).toContain("Concepto;Cuenta;Trujillo;CAYLA");
    expect(csv).toContain("Costo de lo vendido;691;-19850.00;0.00");
  });
});

// ---- Campañas ---------------------------------------------------------------------------------------------------------------

const campana = (p: Partial<CampanaFila>): CampanaFila => ({
  id: "c",
  nombre: "Campaña",
  desde: "2026-10-01",
  hasta: "2026-10-14",
  descuentoPct: null,
  momento: "viene",
  dias: 14,
  tiendas: 3,
  ventas: null,
  normal: null,
  descuento: 0,
  prendas: null,
  margenPct: null,
  margenNormalPct: 0.52,
  margenExtra: null,
  metaPct: null,
  metaCampana: null,
  metaNormal: null,
  conEfecto: false,
  ...p,
});

describe("cuánto más hay que vender para compensar un descuento", () => {
  it("con 52 % de margen: 15 % pide +40,5 % y 30 %, +136 % (los ejemplos del plan)", () => {
    expect(extraNecesario(0.52, 15)).toBeCloseTo(0.4054, 3);
    expect(extraNecesario(0.52, 30)).toBeCloseTo(1.3636, 3);
  });
  it("sin descuento, lo mismo; sin margen conocido, no se sabe; si el descuento se come el margen, no alcanza", () => {
    expect(extraNecesario(0.52, null)).toBe(0);
    expect(extraNecesario(null, 15)).toBeNull();
    expect(extraNecesario(0.3, 30)).toBe(Number.POSITIVE_INFINITY);
  });
  it("cuánto margen se pierde por prenda: 28,8 % con 15 % y 57,7 % con 30 % (el pie del spike)", () => {
    expect(margenQueSePierde(0.52, 15)).toBeCloseTo(0.2885, 3);
    expect(margenQueSePierde(0.52, 30)).toBeCloseTo(0.5769, 3);
  });
});

describe("qué dice el sistema de una campaña que viene", () => {
  it("si la meta sube más de lo que pide el descuento, gana más; si no, gana menos aunque llegue", () => {
    expect(veredictoCampana(campana({ descuentoPct: 15, conEfecto: true, metaPct: 45 }))).toEqual({
      tono: "verde",
      texto: "si llega a la meta, gana más",
    });
    expect(veredictoCampana(campana({ descuentoPct: 15, conEfecto: true, metaPct: 30 })).tono).toBe("ambar");
  });
  it("sin descuento: con efecto en caja, todo lo extra es ganancia; sin efecto, solo etiqueta", () => {
    expect(veredictoCampana(campana({ conEfecto: true, metaPct: 40 })).texto).toBe("sin descuento: todo lo extra es ganancia");
    expect(veredictoCampana(campana({})).texto).toBe("solo etiqueta");
  });
  it("con descuento y sin meta que suba, avisa; si el descuento pasa el margen, se vende bajo el costo", () => {
    expect(veredictoCampana(campana({ descuentoPct: 10 })).texto).toBe("la meta no sube: gana menos");
    expect(veredictoCampana(campana({ descuentoPct: 60, conEfecto: true, metaPct: 100 })).tono).toBe("rojo");
    expect(veredictoCampana(campana({ descuentoPct: 15, margenNormalPct: null })).texto).toBe("sin ventas normales para comparar");
  });
});

describe("las campañas que pasaron", () => {
  const pasadas = [
    campana({
      id: "c4",
      nombre: "Día de la Madre",
      momento: "pasada",
      desde: "2026-04-26",
      ventas: 52400,
      normal: 40100,
      margenExtra: 6920,
    }),
    campana({
      id: "c6",
      nombre: "Día Internacional del Gato",
      momento: "pasada",
      desde: "2026-07-25",
      ventas: 43200,
      normal: 41600,
      descuento: 1900,
      margenExtra: -1328,
    }),
    campana({
      id: "c7",
      nombre: "Día Internacional del Perro",
      momento: "pasada",
      desde: "2026-08-12",
      ventas: 41800,
      normal: 41200,
      descuento: 2600,
      margenExtra: -2614,
    }),
    campana({
      id: "c0",
      nombre: "Sin ventas",
      momento: "pasada",
      desde: "2026-01-01",
      ventas: null,
    }),
    campana({
      id: "c9",
      nombre: "CyberWow",
      momento: "sin_fechas",
      desde: null,
      hasta: null,
    }),
    campana({
      id: "c8",
      nombre: "Aniversario",
      momento: "viene",
      desde: "2026-10-01",
    }),
    campana({
      id: "c5",
      nombre: "En curso",
      momento: "en_curso",
      desde: "2026-09-20",
    }),
  ];
  it("separa las que pasaron (con ventas, por fecha), las que vienen (con la que está en curso) y las sin fechas", () => {
    const s = separarCampanas(pasadas);
    expect(s.pasadas.map((c) => c.id)).toEqual(["c4", "c6", "c7"]);
    expect(s.vienen.map((c) => c.id)).toEqual(["c5", "c8"]);
    expect(s.sinFechas.map((c) => c.id)).toEqual(["c9"]);
  });
  it("la frase de las que no se pagaron (la del spike)", () => {
    expect(fraseCampanasMalas(pasadas)).toBe(
      "Día del Gato y Día del Perro vendieron +3,8 % y +1,5 % contra un día normal y se descontaron S/ 4,500: dejaron S/ 3,942 menos que no hacerlas.",
    );
    expect(fraseCampanasMalas([pasadas[0]!])).toBeNull();
    expect(nombreEje("Día Internacional del Gato")).toBe("Día del Gato");
  });
  it("leer una campaña de la base", () => {
    const c = leerCampana({
      etiqueta_id: "e1",
      nombre: "X",
      momento: "pasada",
      ventas: "1120.00",
      normal: "700.00",
      margen_extra: "140.00",
      descuento: "280",
      con_efecto: false,
    });
    expect([c.ventas, c.normal, c.margenExtra, c.descuento, c.momento]).toEqual([1120, 700, 140, 280, "pasada"]);
    expect(c.metaPct).toBeNull();
  });
});
