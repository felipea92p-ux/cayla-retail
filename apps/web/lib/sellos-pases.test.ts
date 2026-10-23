import { describe, expect, it } from "vitest";
import {
  ESTILO_DE_VISTA,
  VISTAS_SELLOS,
  avanceDeCampana,
  bajadaDelPase,
  columnasQueCaben,
  diasEntre,
  fechaLarga,
  loQueTiene,
  lookbookVisible,
  marcaDelPase,
  paseInicial,
  pilasDeLaVista,
  prendasDelSello,
  rangoCorto,
  vistaDeEstilo,
  vistaInicial,
  type FilaSello,
  type TallaVitrina,
} from "./sellos-pases";

// Las fechas y las insignias de producción del 2026-10-22, el día en que Felipe eligió la billetera de pases.
const HOY = "2026-10-22";
const fila = (id: string, estilo: FilaSello["estilo"], desde: string | null, hasta: string | null, extra: Partial<FilaSello> = {}): FilaSello => ({
  id,
  nombre: id,
  activo: true,
  estado: "aprobado",
  estilo,
  vigenteDesde: desde,
  vigenteHasta: hasta,
  descuentoPct: null,
  ...extra,
});
const FILAS: FilaSello[] = [
  fila("Aniversario CAYLA", "campana", "2026-10-01", "2026-10-25", { descuentoPct: 10 }),
  fila("Halloween", "campana", "2026-09-15", "2026-10-31"),
  fila("Día del Gato", "campana", "2026-10-24", "2026-10-30"),
  fila("Black Friday", "campana", "2026-11-09", "2026-11-30"),
  fila("Navidad", "campana", "2026-12-11", "2026-12-25"),
  fila("CyberWow", "campana", null, null),
  fila("San Valentín", "campana", "2026-01-31", "2026-02-14"),
  fila("Día de la Madre", "campana", "2026-04-26", "2026-05-10"),
  fila("Galentine's Day", "campana", "2026-02-06", "2026-02-13", { activo: false }),
  fila("Nuevo", "urgencia", null, null),
  fila("Últimas unidades", "urgencia", "2026-09-01", "2027-01-31"),
  fila("Hecho a mano", "positivo", null, null),
  fila("Sorteo", "neutral", null, null, { descuentoPct: 100 }),
  fila("Para liquidar — Taller", "neutral", null, null, { activo: false }),
];

describe("las vistas son los cuatro grupos de insignias", () => {
  it("cada estilo va a una sola vista, y crear desde una vista nace con su estilo", () => {
    for (const v of VISTAS_SELLOS) expect(vistaDeEstilo(ESTILO_DE_VISTA[v])).toBe(v);
  });
  it("Campañas abre primero; una vista pedida que la cuenta no ve no se abre", () => {
    expect(vistaInicial(undefined, VISTAS_SELLOS)).toBe("campanas");
    expect(vistaInicial("rotacion", VISTAS_SELLOS)).toBe("rotacion");
    expect(vistaInicial("rotacion", ["campanas"])).toBe("campanas");
    expect(vistaInicial("cualquiera", ["rotacion", "general"])).toBe("rotacion");
    expect(vistaInicial(undefined, [])).toBeNull();
  });
});

describe("las pilas de pases", () => {
  it("Campañas: rigen hoy (la que termina antes arriba), lo que viene (la más cercana primero), guardadas y desactivadas", () => {
    const pilas = pilasDeLaVista(FILAS, "campanas", HOY);
    expect(pilas.map((p) => [p.clave, p.pases.map((f) => f.id)])).toEqual([
      ["ahora", ["Aniversario CAYLA", "Halloween"]],
      ["viene", ["Día del Gato", "Black Friday", "Navidad"]],
      ["guardadas", ["CyberWow", "San Valentín", "Día de la Madre"]],
      ["apagadas", ["Galentine's Day"]],
    ]);
    expect(paseInicial(pilas)?.id).toBe("Aniversario CAYLA");
  });
  it("una insignia no cae en Campañas aunque tenga fechas, y una pila vacía no sale", () => {
    expect(pilasDeLaVista(FILAS, "rotacion", HOY).map((p) => [p.clave, p.pases.map((f) => f.id)])).toEqual([["activos", ["Nuevo", "Últimas unidades"]]]);
    expect(pilasDeLaVista(FILAS, "general", HOY).map((p) => p.clave)).toEqual(["activos", "apagadas"]);
    expect(pilasDeLaVista([], "artesanal", HOY)).toEqual([]);
    expect(paseInicial([])).toBeNull();
  });
});

describe("la cabecera de un pase", () => {
  it("dice los días que quedan, los que faltan, cuándo pasó o lo vendido", () => {
    expect(marcaDelPase(FILAS[0]!, HOY, null)).toEqual({ cifra: 3, texto: "días" });
    expect(marcaDelPase(FILAS[2]!, HOY, null)).toEqual({ cifra: 2, texto: "faltan" });
    expect(marcaDelPase(FILAS[6]!, HOY, null)).toEqual({ cifra: null, texto: "14 feb" });
    expect(marcaDelPase(FILAS[5]!, HOY, null)).toEqual({ cifra: null, texto: "sin fechas" });
    expect(marcaDelPase(FILAS[9]!, HOY, 52)).toEqual({ cifra: 52, texto: "en 30 días" });
    expect(marcaDelPase(FILAS[9]!, HOY, null)).toEqual({ cifra: null, texto: "" });
    expect(marcaDelPase(fila("Hoy", "campana", "2026-10-01", HOY), HOY, null)).toEqual({ cifra: null, texto: "último día" });
    expect(marcaDelPase(fila("Mañana", "campana", "2026-10-01", "2026-10-23"), HOY, null)).toEqual({ cifra: 1, texto: "día" });
  });
  it("su bajada, con el día de la semana y el año solo si no es el de hoy", () => {
    expect(bajadaDelPase(FILAS[0]!, HOY)).toBe("hasta el domingo 25 de octubre");
    expect(bajadaDelPase(FILAS[2]!, HOY)).toBe("empieza el sábado 24 de octubre");
    expect(bajadaDelPase(FILAS[6]!, HOY)).toBe("31 ene – 14 feb");
    expect(bajadaDelPase(FILAS[5]!, HOY)).toBe("ponle cuándo rige");
    expect(bajadaDelPase(FILAS[10]!, HOY)).toBe("hasta el domingo 31 de enero de 2027");
    expect(bajadaDelPase(FILAS[12]!, HOY)).toBe("100 % de descuento");
    expect(bajadaDelPase(FILAS[9]!, HOY)).toBe("sin fechas: rige siempre");
  });
  it("las fechas se cuentan en días enteros de Lima", () => {
    expect(diasEntre("2026-10-22", "2026-11-09")).toBe(18);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(fechaLarga("2026-12-11")).toBe("viernes 11 de diciembre");
    expect(rangoCorto("2026-09-01", "2027-01-31", HOY)).toBe("1 sep – 31 ene 2027");
    expect(rangoCorto(null, null, HOY)).toBeNull();
  });
  it("el avance de una campaña que rige hoy: el día de hoy contado como uno", () => {
    expect(avanceDeCampana("2026-10-01", "2026-10-25", HOY)).toEqual({ dia: 22, total: 25, pct: 88 });
    expect(avanceDeCampana("2026-10-24", "2026-10-30", HOY)).toBeNull();
    expect(avanceDeCampana(null, null, HOY)).toBeNull();
  });
});

describe("las prendas de una insignia, por modelo y color", () => {
  const talla = (id: string, productoId: string, color: string, categoriaId: string | null = "cat-acc"): TallaVitrina => ({
    id,
    categoriaId,
    productoId,
    referencia: productoId,
    colorCodigo: color,
    colorNombre: color,
    colorHex: null,
    categoria: null,
    fotoUrl: null,
  });
  const TALLAS = [talla("v1", "Chaleco", "NEG"), talla("v2", "Chaleco", "NEG"), talla("v3", "Chaleco", "BLA"), talla("v4", "Polvo", "ROS", "cat-maq"), talla("v5", "Otra", "AZU")];

  it("entra lo marcado a mano o lo de una categoría elegida (la regla de la base), juntando tallas del mismo color", () => {
    const r = prendasDelSello(TALLAS, new Set(["cat-maq"]), new Set(["v1", "v2", "v3"]), null);
    expect(r.modelos.map((m) => [m.clave, m.tallas])).toEqual([
      ["Chaleco·BLA", 1],
      ["Chaleco·NEG", 2],
      ["Polvo·ROS", 1],
    ]);
    expect(r.unidades).toBeNull();
    expect(r.vendidas).toBeNull();
    expect(r.modelos.every((m) => m.unidades === null)).toBe(true);
  });
  it("con lectura: suma lo que queda y lo vendido, y ordena por unidades", () => {
    const lectura = new Map([
      ["v1", { stock: 2, vendidas: 1 }],
      ["v2", { stock: 3, vendidas: 0 }],
      ["v3", { stock: 9, vendidas: 4 }],
    ]);
    const r = prendasDelSello(TALLAS, new Set(), new Set(["v1", "v2", "v3", "v4"]), lectura);
    expect(r.modelos.map((m) => [m.clave, m.unidades])).toEqual([
      ["Chaleco·BLA", 9],
      ["Chaleco·NEG", 5],
      ["Polvo·ROS", 0],
    ]);
    expect(r).toMatchObject({ unidades: 14, vendidas: 5 });
  });
  it("sin prendas, nada", () => {
    expect(prendasDelSello(TALLAS, new Set(), new Set(), new Map())).toEqual({ modelos: [], unidades: 0, vendidas: 0 });
  });
});

describe("lo que dice el pase abierto", () => {
  it("lo que tiene una campaña: fechas y prendas la hacen funcionar; el descuento es opcional", () => {
    expect(loQueTiene(FILAS[0]!, 0, [], HOY).map((x) => [x.clave, x.hecho, x.opcional])).toEqual([
      ["fechas", true, false],
      ["prendas", false, false],
      ["descuento", true, true],
    ]);
    expect(loQueTiene(FILAS[1]!, 47, ["Maquillaje"], HOY)[1]!.detalle).toBe("47 prendas + toda Maquillaje");
    expect(loQueTiene(FILAS[5]!, 0, [], HOY)[0]).toMatchObject({ hecho: false, detalle: "sin fechas" });
  });
});

describe("el lookbook: dos filas y el «+N» abajo a la derecha", () => {
  it("si todas caben se ven todas, sin «+N»", () => {
    expect(lookbookVisible(0, 5)).toEqual({ visibles: 0, resto: 0 });
    expect(lookbookVisible(3, 5)).toEqual({ visibles: 3, resto: 0 });
    expect(lookbookVisible(10, 5)).toEqual({ visibles: 10, resto: 0 });
  });
  it("si sobran, la última casilla de la segunda fila es el «+N»", () => {
    // La captura de Felipe: 39 prendas, 5 columnas → 9 prendas y «+30».
    expect(lookbookVisible(39, 5)).toEqual({ visibles: 9, resto: 30 });
    expect(lookbookVisible(11, 5)).toEqual({ visibles: 9, resto: 2 });
    // En el celular entran 3 por fila.
    expect(lookbookVisible(39, 3)).toEqual({ visibles: 5, resto: 34 });
  });
  it("nunca menos de una columna ni de una fila", () => {
    expect(lookbookVisible(4, 0)).toEqual({ visibles: 1, resto: 3 });
    expect(lookbookVisible(4, 2, 0)).toEqual({ visibles: 1, resto: 3 });
  });
});

describe("cuántas columnas caben (la cuenta de `auto-fill`)", () => {
  it("como el navegador: casillas de al menos el mínimo, con su hueco entre ellas", () => {
    // El pase en grande a 1440 px mide ~633 px: casillas de 132 con 14 de hueco → 4.
    expect(columnasQueCaben(633, 132, 14)).toBe(4);
    // La captura de Felipe: ~790 px → 5.
    expect(columnasQueCaben(790, 132, 14)).toBe(5);
    // Justo: 2 casillas de 132 y un hueco de 14 caben en 278.
    expect(columnasQueCaben(278, 132, 14)).toBe(2);
    expect(columnasQueCaben(277, 132, 14)).toBe(1);
    // Celular: ~343 px con casillas de 96 y 10 de hueco → 3.
    expect(columnasQueCaben(343, 96, 10)).toBe(3);
  });
  it("sin ancho todavía (antes de medir), una", () => {
    expect(columnasQueCaben(0, 132, 14)).toBe(1);
    expect(columnasQueCaben(500, 0, 14)).toBe(1);
  });
});

