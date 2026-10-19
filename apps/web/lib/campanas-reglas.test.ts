import { describe, expect, it } from "vitest";
import { DISENO_DE_SIEMPRE, PALETA_DE_SIEMPRE } from "@cayla-retail/portada";
import { nombresEnOrden } from "./campana-diseno";
import {
  barraEn,
  campanasEnLaLinea,
  cifrasDeCampanas,
  conteoPorFiltro,
  coloresDeLaPortada,
  cruceDeHoy,
  datosDeCampana,
  disenoDeLaLista,
  estadoDeCampana,
  leerCampanas,
  leerDiasPortada,
  ordenarYFiltrar,
  porQueNoSale,
  rangoDeLaLinea,
  tramosDePortada,
  type Campana,
  type DiaPortada,
} from "./campanas-reglas";

const HOY = "2026-10-17";
const campana = (x: Partial<Campana> & { id: string }): Campana => ({
  nombre: x.id,
  activo: true,
  estado: "aprobado",
  desde: null,
  hasta: null,
  pct: null,
  modelos: 0,
  variantes: 0,
  categorias: 0,
  ...x,
});

// Las campañas de producción del 2026-10-17 (nombres y fechas reales), con lo que importa para la pantalla.
const GATO = campana({ id: "gato", nombre: "Día Internacional del Gato", desde: "2026-10-01", hasta: "2026-10-30", pct: 10, modelos: 3, variantes: 7 });
const HALLOWEEN = campana({ id: "halloween", nombre: "Halloween", desde: "2026-09-15", hasta: "2026-10-31", modelos: 29, variantes: 33, categorias: 1 });
const ANIVERSARIO = campana({ id: "aniversario", nombre: "Aniversario CAYLA", desde: "2026-10-01", hasta: "2026-10-08", categorias: 3 });
const BLACK = campana({ id: "black", nombre: "Black Friday", desde: "2026-11-09", hasta: "2026-11-30" });
const NAVIDAD = campana({ id: "navidad", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25" });
const CYBER = campana({ id: "cyber", nombre: "CyberWow" });
const GALENTINE = campana({ id: "galentine", nombre: "Galentine's Day", desde: "2026-02-06", hasta: "2026-02-13", activo: false });
const NUEVA = campana({ id: "nueva", nombre: "Día del Padre", desde: "2027-06-01", hasta: "2027-06-20", estado: "pendiente" });
const TODAS = [GATO, HALLOWEEN, ANIVERSARIO, BLACK, NAVIDAD, CYBER, GALENTINE, NUEVA];

describe("leer lo que manda la base", () => {
  const fila = { ...GATO, diseno: null, borrador: null, piezas: [] as unknown[] };
  it("una lista bien formada pasa, con el % de texto convertido a número", () => {
    const leidas = leerCampanas([{ ...fila, pct: "10.00" }]);
    expect(leidas?.[0]?.pct).toBe(10);
  });
  it("trae el diseño publicado, el borrador y las prendas de su portada en chico", () => {
    const pieza = { id: "p1", nombre: "Blusa Emma", foto: null, categoria: "Blusas", prefijo: "BLU", familia: "SUP", color_hex: "#123456" };
    const [c] = leerCampanas([{ ...fila, diseno: { ...DISENO_DE_SIEMPRE, paleta: "bosque" }, borrador: DISENO_DE_SIEMPRE, piezas: [pieza] }])!;
    expect(c?.diseno?.paleta).toBe("bosque");
    expect(c?.borrador).toEqual(DISENO_DE_SIEMPRE);
    expect(c?.piezas).toEqual([{ id: "p1", nombre: "Blusa Emma", foto: null, categoria: "Blusas", prefijo: "BLU", familia: "SUP", colorHex: "#123456" }]);
  });
  it("un diseño que esta versión no sabe leer cuenta como la portada de siempre, sin tumbar la lista", () => {
    expect(leerCampanas([{ ...fila, diseno: { ...DISENO_DE_SIEMPRE, fondo: "video" } }])?.[0]?.diseno).toBeNull();
  });
  it("una forma inesperada devuelve null (la pantalla lo dice en vez de dibujar a medias)", () => {
    expect(leerCampanas([{ id: "x" }])).toBeNull();
    expect(leerCampanas([{ ...fila, piezas: [{ id: 3 }] }])).toBeNull();
    expect(leerCampanas(null)).toBeNull();
    expect(leerDiasPortada([{ dia: "2026-10-17" }])).toBeNull();
    expect(leerDiasPortada([{ dia: "2026-10-17", campana: null }])).toEqual([{ dia: "2026-10-17", campanas: [] }]);
  });
});

describe("en qué está cada campaña", () => {
  it.each([
    [GATO, "vigente"],
    [HALLOWEEN, "vigente"],
    [ANIVERSARIO, "termino"],
    [BLACK, "proxima"],
    [CYBER, "sin_fechas"],
    [GALENTINE, "desactivada"],
    [NUEVA, "por_aprobar"],
  ] as const)("%s → %s", (c, estado) => {
    expect(estadoDeCampana(c, HOY)).toBe(estado);
  });
  it("el último día todavía está vigente, el primero también", () => {
    expect(estadoDeCampana(GATO, "2026-10-30")).toBe("vigente");
    expect(estadoDeCampana(GATO, "2026-10-31")).toBe("termino");
    expect(estadoDeCampana(BLACK, "2026-11-09")).toBe("vigente");
  });
});

describe("filtros y orden", () => {
  it("cada campaña cae en un solo filtro, y Todas las cuenta a todas", () => {
    const c = conteoPorFiltro(TODAS, HOY);
    expect(c).toEqual({ todas: 8, vigentes: 2, proximas: 4, terminadas: 2 });
    expect(c.vigentes + c.proximas + c.terminadas).toBe(c.todas);
  });
  it("arriba lo que corre hoy (la que termina primero), después lo que viene, al final lo que pasó", () => {
    expect(ordenarYFiltrar(TODAS, "todas", HOY).map((c) => c.id)).toEqual([
      "gato", // termina el 30
      "halloween", // termina el 31
      "black", // empieza el 9 nov
      "navidad",
      "nueva", // por aprobar
      "cyber", // sin fechas
      "aniversario", // terminó el 8 oct
      "galentine", // desactivada
    ]);
  });
  it("un filtro deja solo las suyas, en el mismo orden", () => {
    expect(ordenarYFiltrar(TODAS, "vigentes", HOY).map((c) => c.id)).toEqual(["gato", "halloween"]);
    expect(ordenarYFiltrar(TODAS, "terminadas", HOY).map((c) => c.id)).toEqual(["aniversario", "galentine"]);
  });
});

describe("cómo se dice cada campaña", () => {
  it("fechas, descuento y prendas", () => {
    expect(datosDeCampana(GATO)).toEqual(["1 oct. – 30 oct.", "−10 %", "3 modelos"]);
    expect(datosDeCampana(ANIVERSARIO)[2]).toBe("En 3 categorías");
    expect(datosDeCampana(CYBER)).toEqual(["Sin fechas", "Sin descuento", "Sin prendas"]);
    expect(datosDeCampana({ ...GATO, pct: 12.5, modelos: 1 }).slice(1)).toEqual(["−12.5 %", "1 modelo"]);
  });
});

// Lo que la base contestó para el 17 al 20 de octubre: el Gato y Halloween en carrusel los dos primeros días, solo Halloween el tercero,
// ninguna el cuarto.
const DIAS: DiaPortada[] = [
  { dia: "2026-10-17", campanas: ["gato", "halloween"] },
  { dia: "2026-10-18", campanas: ["gato", "halloween"] },
  { dia: "2026-10-19", campanas: ["halloween"] },
  { dia: "2026-10-20", campanas: [] },
];

describe("las cifras de arriba", () => {
  it("en la portada hoy: la que dice la base, no la que adivina la web", () => {
    const c = cifrasDeCampanas(TODAS, DIAS, HOY);
    expect(c.enPortada.map((x) => x.id)).toEqual(["gato", "halloween"]);
    expect(c.vigentes.map((x) => x.id)).toEqual(["gato", "halloween"]);
    expect(c.proxima).toEqual({ campana: BLACK, enDias: 23 });
  });
  it("sin los días (la base no respondió) o sin campaña hoy, la portada no nombra ninguna", () => {
    expect(cifrasDeCampanas(TODAS, null, HOY).enPortada).toEqual([]);
    expect(cifrasDeCampanas(TODAS, DIAS, "2026-10-20").enPortada).toEqual([]);
  });
  it("el cruce: dos corren hoy, salen en carrusel en el orden de la base, y hasta cuándo corren juntas", () => {
    expect(cruceDeHoy(TODAS, DIAS, HOY)).toEqual({ nombres: ["Día Internacional del Gato", "Halloween"], enPortada: [GATO, HALLOWEEN], hasta: "2026-10-30" });
    expect(cruceDeHoy([GATO, BLACK], DIAS, HOY)).toBeNull();
  });
  it("lee los días con varias campañas y los de una base de antes del carrusel (una sola o ninguna)", () => {
    expect(leerDiasPortada([{ dia: "2026-10-17", campana: "gato", campanas: ["gato", "halloween"] }])).toEqual([{ dia: "2026-10-17", campanas: ["gato", "halloween"] }]);
    expect(leerDiasPortada([{ dia: "2026-10-17", campana: "gato" }, { dia: "2026-10-18", campana: null }])).toEqual([
      { dia: "2026-10-17", campanas: ["gato"] },
      { dia: "2026-10-18", campanas: [] },
    ]);
    expect(leerDiasPortada([{ dia: "2026-10-17", campanas: [3] }])).toBeNull();
  });
  it("cómo se nombran las de un carrusel", () => {
    expect(nombresEnOrden(["Gato"])).toBe("Gato");
    expect(nombresEnOrden(["Gato", "Halloween"])).toBe("Gato y Halloween");
    expect(nombresEnOrden(["A", "B", "C"])).toBe("A, B y C");
  });
});

describe("la línea «La portada, día a día»", () => {
  const rango = rangoDeLaLinea(HOY);
  it("tres meses enteros desde el primero del mes de hoy", () => {
    expect(rango).toMatchObject({ desde: "2026-10-01", hasta: "2026-12-31", total: 92 });
    expect(rango.meses.map((m) => m.dias)).toEqual([31, 30, 31]);
    expect(rango.meses[0]?.nombre.toLowerCase()).toBe("octubre");
  });
  it("cruza el año: noviembre a enero", () => {
    expect(rangoDeLaLinea("2026-11-20")).toMatchObject({ desde: "2026-11-01", hasta: "2027-01-31", total: 92 });
  });
  it("una barra se corta en los bordes y lo dice", () => {
    const h = barraEn(HALLOWEEN.desde, HALLOWEEN.hasta, rango)!;
    expect(h.izquierda).toBe(0);
    expect(h.cortadaAntes).toBe(true);
    expect(h.ancho).toBeCloseTo((31 / 92) * 100);
    const g = barraEn(GATO.desde, GATO.hasta, rango)!;
    expect(g.cortadaAntes).toBe(false);
    expect(barraEn("2026-08-01", "2026-08-31", rango)).toBeNull();
  });
  it("los días seguidos con las mismas campañas, en el mismo orden, son un tramo (el de varias es un carrusel)", () => {
    expect(tramosDePortada(DIAS)).toEqual([
      { desde: "2026-10-17", hasta: "2026-10-18", campanas: ["gato", "halloween"] },
      { desde: "2026-10-19", hasta: "2026-10-19", campanas: ["halloween"] },
      { desde: "2026-10-20", hasta: "2026-10-20", campanas: [] },
    ]);
    expect(tramosDePortada([{ dia: "2026-10-17", campanas: ["a", "b"] }, { dia: "2026-10-18", campanas: ["b", "a"] }])).toHaveLength(2);
  });
  it("las filas: solo las aprobadas y activas con fechas que tocan la línea, por cuándo empiezan", () => {
    expect(campanasEnLaLinea(TODAS, rango).map((c) => c.id)).toEqual(["halloween", "aniversario", "gato", "black", "navidad"]);
  });
});

describe("por qué una campaña que corre hoy no sale en la portada", () => {
  const sinDiseno = (c: Campana) => ({ ...c, diseno: null });
  it("la que sale no lleva razón; las que no, dicen la suya", () => {
    expect(porQueNoSale(sinDiseno(GATO), [GATO], HOY)).toBeNull();
    // Desde el carrusel (6b), todas las que pueden salir salen: una sin descuento con prendas que no está en la lista no tiene razón que
    // dar (la lista de hoy es la de la base).
    expect(porQueNoSale(sinDiseno(HALLOWEEN), [GATO, HALLOWEEN], HOY)).toBeNull();
    expect(porQueNoSale(sinDiseno(HALLOWEEN), [GATO], HOY)).toBeNull();
    expect(porQueNoSale(sinDiseno({ ...HALLOWEEN, pct: 15, modelos: 0, categorias: 0 }), [GATO], HOY)).toBe("No sale en la portada: todavía no tiene prendas.");
    expect(porQueNoSale(sinDiseno({ ...HALLOWEEN, modelos: 0, categorias: 0 }), [GATO], HOY)).toBe("No sale en la portada: todavía no tiene prendas ni diseño propio.");
    expect(porQueNoSale({ ...HALLOWEEN, modelos: 0, categorias: 0, diseno: DISENO_DE_SIEMPRE }, [GATO], HOY)).toBeNull();
  });
  it("una que no corre hoy no lleva razón", () => {
    expect(porQueNoSale(sinDiseno(BLACK), [GATO], HOY)).toBeNull();
    expect(porQueNoSale(sinDiseno(ANIVERSARIO), [GATO], HOY)).toBeNull();
  });
});

describe("el diseño de cada campaña en la lista", () => {
  const BOSQUE = { ...DISENO_DE_SIEMPRE, paleta: "bosque" };
  it("sin nada propio: «de siempre»; con un borrador distinto: «borrador»; publicado y sin cambios: «publicado»", () => {
    expect(disenoDeLaLista({ diseno: null, borrador: null })).toBe("de-siempre");
    expect(disenoDeLaLista({ diseno: null, borrador: BOSQUE })).toBe("borrador");
    expect(disenoDeLaLista({ diseno: BOSQUE, borrador: null })).toBe("publicado");
    expect(disenoDeLaLista({ diseno: BOSQUE, borrador: DISENO_DE_SIEMPRE })).toBe("borrador");
  });
  it("un borrador igual a lo publicado (o a la portada de siempre, sin nada publicado) no es un borrador", () => {
    expect(disenoDeLaLista({ diseno: BOSQUE, borrador: { ...BOSQUE } })).toBe("publicado");
    expect(disenoDeLaLista({ diseno: null, borrador: { ...DISENO_DE_SIEMPRE } })).toBe("de-siempre");
  });
  it("la barra y la miniatura llevan los colores de lo publicado; sin diseño, los de siempre", () => {
    expect(coloresDeLaPortada({ diseno: null }).fondo).toBe(PALETA_DE_SIEMPRE.fondo);
    expect(coloresDeLaPortada({ diseno: BOSQUE }).fondo).not.toBe(PALETA_DE_SIEMPRE.fondo);
  });
});
