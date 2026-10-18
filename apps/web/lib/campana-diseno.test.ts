import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACOMODOS,
  DISENO_DE_SIEMPRE,
  FONDOS,
  INTENSIDADES,
  PALETAS,
  PATRONES,
  SELLOS,
  TAMANOS,
  mismoDiseno,
  paletaPropia,
  partirTitulo,
  revisarDiseno,
  type DisenoDeCampana,
} from "@cayla-retail/portada";
import {
  NOMBRES_ACOMODO,
  NOMBRES_FONDO,
  NOMBRES_INTENSIDAD,
  NOMBRES_PATRON,
  NOMBRES_SELLO,
  NOMBRES_TAMANO,
  contextoDeRevision,
  cortarEn,
  corteEfectivo,
  diaSiguiente,
  disenoParaEditar,
  estadoDelBorrador,
  leerEstadoDiseno,
  paletasDeLaCampana,
  piezasDeLaCampana,
  prendasMarcadas,
  queSaleDespues,
  resumenAcomodo,
  resumenColores,
  resumenDetalles,
  resumenEstilo,
  resumenFondo,
  resumenPrendas,
  resumenTexto,
  sellosDeLaCampana,
  sorprendeme,
  tocarPrenda,
} from "./campana-diseno";
import type { PrendaDeCampana } from "./campana-detalle";

// La base impide los valores que no están en las listas curadas (`check` de 20261017160000_campanas_diseno.sql; el de `fondo`, desde la
// actividad 8, el de 20261017231000_campanas_fondo_con_foto.sql) y el código las ofrece desde @cayla-retail/portada: si una crece y la otra
// no, la pantalla ofrecería algo que la base rechaza (o al revés). Vale la ÚLTIMA migración que define cada `check`.
const CARPETA = new URL("../../../supabase/migrations/", import.meta.url);
const MIGRACIONES = readdirSync(CARPETA)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, CARPETA), "utf8"));
function listaDelCheck(columna: string): string[] {
  const patron = new RegExp(`constraint campana_disenos_${columna} check \\(${columna} in \\(([^)]*)\\)\\)`, "g");
  const ultima = MIGRACIONES.flatMap((sql) => [...sql.matchAll(patron)]).pop();
  if (!ultima) throw new Error(`No encuentro el check de ${columna}`);
  return [...ultima[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe("las listas del diseño son las mismas en la base y en el código", () => {
  it("paletas (las curadas y «propia»)", () => expect(listaDelCheck("paleta").sort()).toEqual([...PALETAS.map((p) => p.id), "propia"].sort()));
  it("fondos", () => expect(listaDelCheck("fondo")).toEqual([...FONDOS]));
  it("dibujos", () => expect(listaDelCheck("patron")).toEqual([...PATRONES]));
  it("intensidades", () => expect(listaDelCheck("intensidad")).toEqual([...INTENSIDADES]));
  it("acomodos", () => expect(listaDelCheck("acomodo")).toEqual([...ACOMODOS]));
  it("tamaños", () => expect(listaDelCheck("tamano")).toEqual([...TAMANOS]));
  it("sellos", () => expect(listaDelCheck("sello")).toEqual([...SELLOS]));
});

const BOSQUE = { ...DISENO_DE_SIEMPRE, paleta: "bosque" };
const OLIVA = { ...DISENO_DE_SIEMPRE, paleta: "oliva" };

describe("lo que hay de una campaña", () => {
  it("lee el borrador, el publicado y el anterior", () => {
    const e = leerEstadoDiseno({
      borrador: { diseno: BOSQUE, version: 3, actualizado_en: "2026-10-17T10:00:00Z" },
      publicado: { diseno: OLIVA, publicado_en: "2026-10-16T10:00:00Z", publicado_por: "Rosa Medina" },
      anterior: { diseno: DISENO_DE_SIEMPRE, publicado_en: "2026-10-01T10:00:00Z" },
    });
    expect(e?.borrador).toEqual({ diseno: BOSQUE, version: 3 });
    expect(e?.publicado?.publicadoPor).toBe("Rosa Medina");
    expect(e?.anterior?.diseno).toEqual(DISENO_DE_SIEMPRE);
  });

  it("un diseño que esta versión no sabe leer cuenta como que no está; una respuesta sin forma, null", () => {
    expect(leerEstadoDiseno({ borrador: { diseno: { ...BOSQUE, fondo: "video" }, version: 1 }, publicado: null, anterior: null })?.borrador).toBeNull();
    expect(leerEstadoDiseno("nada")).toBeNull();
  });

  it("el editor abre el borrador; sin borrador, lo publicado (versión 0); sin nada, la portada de siempre", () => {
    const base = { borrador: null, publicado: null, anterior: null };
    expect(disenoParaEditar({ ...base, borrador: { diseno: BOSQUE, version: 2 } })).toEqual({ diseno: BOSQUE, version: 2 });
    expect(disenoParaEditar({ ...base, publicado: { diseno: OLIVA, publicadoEn: "x", publicadoPor: null } })).toEqual({ diseno: OLIVA, version: 0 });
    expect(disenoParaEditar(base)).toEqual({ diseno: DISENO_DE_SIEMPRE, version: 0 });
  });

  it("dice si lo que se ve ya es lo publicado, un borrador o la portada de siempre", () => {
    const publicado = { diseno: OLIVA, publicadoEn: "x", publicadoPor: null };
    expect(estadoDelBorrador({ publicado }, OLIVA)).toBe("publicado");
    expect(estadoDelBorrador({ publicado }, BOSQUE)).toBe("borrador");
    expect(estadoDelBorrador({ publicado: null }, DISENO_DE_SIEMPRE)).toBe("de-siempre");
  });

  it("resume el estilo y los colores elegidos", () => {
    expect(resumenEstilo(DISENO_DE_SIEMPRE)).toBe("Clásico CAYLA");
    expect(resumenEstilo(OLIVA)).toBe("Personalizado");
    expect(resumenColores({ ...DISENO_DE_SIEMPRE, paleta: "propia", colores: paletaPropia("#2f6f73") })).toBe("Mi color");
  });

  it("cuenta las prendas y cuántas tienen foto", () => {
    expect(contextoDeRevision([{ foto: "a.jpg" }, { foto: null }])).toEqual({ prendas: 2, prendasConFoto: 1 });
  });
});

const prenda = (x: Partial<PrendaDeCampana> & { nombre: string }): PrendaDeCampana => ({
  productoId: x.nombre,
  codigo: null,
  categoria: "Blusas",
  prefijo: "BLU",
  familia: "SUP",
  foto: null,
  variantes: 1,
  colores: [],
  ...x,
});

describe("las prendas de la portada", () => {
  it("van como las elige la tienda: primero las que tienen foto, después por nombre; sin foto, con su color y su categoría", () => {
    const piezas = piezasDeLaCampana([
      prenda({ nombre: "Top Luna", colores: [{ nombre: "Sin color", hex: null }, { nombre: "Negro", hex: "#1a1a18" }] }),
      prenda({ nombre: "Blusa Emma", foto: "emma.jpg" }),
      prenda({ nombre: "Abrigo Sol" }),
    ]);
    expect(piezas.map((p) => p.nombre)).toEqual(["Blusa Emma", "Abrigo Sol", "Top Luna"]);
    expect(piezas[2]).toEqual({ id: "Top Luna", nombre: "Top Luna", foto: null, colorHex: "#1a1a18", categoria: "Blusas", prefijo: "BLU", familia: "SUP" });
  });

  it("las paletas salen de los colores con #hex de sus prendas", () => {
    const paletas = paletasDeLaCampana([prenda({ nombre: "Blusa Emma", colores: [{ nombre: "Vino", hex: "#5a1a2a" }, { nombre: "Sin color", hex: null }] })]);
    expect(paletas.map((p) => p.nombre)).toEqual(["De Blusa Emma vino"]);
    expect(paletasDeLaCampana([prenda({ nombre: "Blusa Emma", colores: [{ nombre: "Sin color", hex: null }] })])).toEqual([]);
  });
});

describe("qué sale en la portada cuando la campaña termina", () => {
  const nombres = new Map([["halloween", "Halloween"]]);
  it("el día siguiente, con su nombre; sin campaña, «Lo nuevo»; sin respuesta, null", () => {
    expect(diaSiguiente("2026-10-31")).toBe("2026-11-01");
    expect(queSaleDespues([{ dia: "2026-10-31", campanas: ["halloween"] }], nombres)).toBe("Halloween");
    expect(queSaleDespues([{ dia: "2026-10-31", campanas: [] }], nombres)).toBe("Lo nuevo");
    // Con el carrusel (6b): todas, en su orden. Una que no tiene nombre (otra pestaña la borró) no se adivina.
    expect(queSaleDespues([{ dia: "2026-10-31", campanas: ["halloween", "navidad"] }], new Map([...nombres, ["navidad", "Navidad"]]))).toBe("Halloween y Navidad, en carrusel");
    expect(queSaleDespues([{ dia: "2026-10-31", campanas: ["otra"] }], nombres)).toBeNull();
    expect(queSaleDespues(null, nombres)).toBeNull();
    expect(queSaleDespues([], nombres)).toBeNull();
  });
});

describe("la guía de foco del editor", () => {
  it("abre en el estilo y lleva por los cuatro pasos que arman la portada; los tres últimos son opcionales", async () => {
    const { PASOS_DEL_DISENO, estadoDePasos } = await import("./campana-diseno");
    expect(PASOS_DEL_DISENO.map((p) => p.clave)).toEqual(["estilo", "colores", "fondo", "acomodo", "texto", "prendas", "detalles"]);
    const alAbrir = estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo"]), "estilo");
    expect(alAbrir.estados).toEqual({ estilo: "ahora", colores: "falta", fondo: "falta", acomodo: "falta", texto: "opcional", prendas: "opcional", detalles: "opcional" });
    expect(alAbrir.sigue).toBe("colores");
    expect(estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo", "colores", "fondo"]), null).sigue).toBe("acomodo");
    // Con los cuatro visitados nada «sigue»: lo opcional no se exige.
    const listos = estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo", "colores", "fondo", "acomodo"]), "acomodo");
    expect(listos.sigue).toBeNull();
    expect(listos.estados.acomodo).toBe("ahora");
    expect(estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo", "texto"]), null).estados.texto).toBe("hecho");
  });
});

describe("los nombres y los resúmenes de cada paso", () => {
  it("cada opción de la base tiene su nombre en pantalla", () => {
    expect(Object.keys(NOMBRES_FONDO)).toEqual([...FONDOS]);
    expect(Object.keys(NOMBRES_PATRON)).toEqual([...PATRONES]);
    expect(Object.keys(NOMBRES_INTENSIDAD)).toEqual([...INTENSIDADES]);
    expect(Object.keys(NOMBRES_ACOMODO)).toEqual([...ACOMODOS]);
    expect(Object.keys(NOMBRES_TAMANO)).toEqual([...TAMANOS]);
    expect(Object.keys(NOMBRES_SELLO)).toEqual([...SELLOS]);
  });

  it("el sello del descuento solo se ofrece con descuento", () => {
    expect(sellosDeLaCampana(15)).toEqual(["ninguno", "descuento", "dias", "nuevo"]);
    expect(sellosDeLaCampana(null)).toEqual(["ninguno", "dias", "nuevo"]);
  });

  it("fondo, acomodo y texto dicen lo elegido", () => {
    expect(resumenFondo(DISENO_DE_SIEMPRE)).toBe("Degradado");
    expect(resumenFondo({ ...DISENO_DE_SIEMPRE, fondo: "dibujo", patron: "corazones" })).toBe("Con dibujo: corazones");
    expect(resumenAcomodo({ ...DISENO_DE_SIEMPRE, acomodo: "letras" })).toBe("Solo letras");
    expect(resumenTexto(DISENO_DE_SIEMPRE)).toBe("Grande · sin frase");
    expect(resumenTexto({ ...DISENO_DE_SIEMPRE, tamano: "enorme", frase: " Mimos para tu michi " })).toBe("Enorme · «Mimos para tu michi»");
  });

  it("las prendas: sin prendas, con solo letras, las de la web o las elegidas (las que siguen en la campaña)", () => {
    const piezas = [{ id: "a" }, { id: "b" }];
    expect(resumenPrendas(DISENO_DE_SIEMPRE, [])).toBe("Esta campaña no tiene prendas");
    expect(resumenPrendas({ ...DISENO_DE_SIEMPRE, acomodo: "letras" }, piezas)).toBe("Con solo letras no salen prendas");
    expect(resumenPrendas(DISENO_DE_SIEMPRE, piezas)).toBe("Las elige la web");
    expect(resumenPrendas({ ...DISENO_DE_SIEMPRE, prendas: ["b"] }, piezas)).toBe("1 elegida por ti");
    expect(resumenPrendas({ ...DISENO_DE_SIEMPRE, prendas: ["b", "a", "z"] }, piezas)).toBe("2 elegidas por ti");
    expect(resumenPrendas({ ...DISENO_DE_SIEMPRE, prendas: ["z"] }, piezas)).toBe("Las elige la web");
  });

  it("los detalles: solo los que de verdad salen", () => {
    const conTodo = { pct: 15, hasta: "2026-10-30" };
    expect(resumenDetalles(DISENO_DE_SIEMPRE, conTodo)).toBe("Cuenta regresiva, % gigante, colibrí");
    // Sin fecha de fin no hay cuenta; sin descuento, ni % gigante ni sello del descuento.
    expect(resumenDetalles({ ...DISENO_DE_SIEMPRE, sello: "descuento" }, { pct: null, hasta: null })).toBe("Colibrí");
    expect(resumenDetalles({ ...DISENO_DE_SIEMPRE, cuenta: false, pctGigante: false, colibri: false }, conTodo)).toBe("Sin detalles");
    expect(resumenDetalles({ ...DISENO_DE_SIEMPRE, colibri: false, cuenta: false, pctGigante: false, sello: "dias" }, conTodo)).toBe("Sello");
  });
});

describe("el texto: desde qué palabra va la cursiva", () => {
  const nombre = "Día Internacional del Gato";
  it("sin elegir, la última palabra (como siempre); con una sola palabra, ninguna", () => {
    expect(corteEfectivo(DISENO_DE_SIEMPRE, nombre)).toBe(3);
    expect(corteEfectivo(DISENO_DE_SIEMPRE, "Navidad")).toBe(1);
  });
  it("elegir una palabra pone la cursiva desde ahí; elegir la última vuelve a «sin elegir»", () => {
    const d = cortarEn(DISENO_DE_SIEMPRE, nombre, 1);
    expect(partirTitulo(nombre, d.corte)).toEqual(["Día", "Internacional del Gato"]);
    expect(cortarEn(d, nombre, 3).corte).toBeNull();
    expect(mismoDiseno(cortarEn(d, nombre, 3), DISENO_DE_SIEMPRE)).toBe(true);
    expect(partirTitulo(nombre, cortarEn(d, nombre, 4).corte)).toEqual([nombre, ""]);
  });
});

describe("las prendas: cuáles salen y en qué orden", () => {
  const piezas = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  it("sin elegir, se marcan las que la web pondría (tantas como caben)", () => {
    expect(prendasMarcadas(DISENO_DE_SIEMPRE, piezas)).toEqual(["a", "b", "c"]);
    expect(prendasMarcadas({ ...DISENO_DE_SIEMPRE, acomodo: "mosaico" }, piezas)).toEqual(["a", "b", "c", "d"]);
    expect(prendasMarcadas({ ...DISENO_DE_SIEMPRE, acomodo: "letras" }, piezas)).toEqual([]);
  });
  it("tocar saca la que estaba; tocar otra la suma al final y, si no cabe, sale la primera", () => {
    const sinB = tocarPrenda(DISENO_DE_SIEMPRE, piezas, "b");
    expect(sinB.prendas).toEqual(["a", "c"]);
    const conE = tocarPrenda(sinB, piezas, "e");
    expect(conE.prendas).toEqual(["a", "c", "e"]);
    expect(tocarPrenda(conE, piezas, "d").prendas).toEqual(["c", "e", "d"]);
  });
  it("con foto grande, tocar otra la cambia; sacar la única deja que la web elija", () => {
    const grande: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, acomodo: "grande", prendas: ["c"] };
    expect(tocarPrenda(grande, piezas, "e").prendas).toEqual(["e"]);
    expect(tocarPrenda(grande, piezas, "c").prendas).toBeNull();
  });
  it("con solo letras, o una prenda que no es de la campaña, no cambia nada", () => {
    const letras = { ...DISENO_DE_SIEMPRE, acomodo: "letras" as const };
    expect(tocarPrenda(letras, piezas, "a")).toBe(letras);
    expect(tocarPrenda(DISENO_DE_SIEMPRE, piezas, "z")).toBe(DISENO_DE_SIEMPRE);
  });
  it("nunca guarda más de las que la base admite (4)", () => {
    let d: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, acomodo: "mosaico" };
    for (const p of [...piezas, ...piezas]) d = tocarPrenda(d, piezas, p.id);
    expect((d.prendas ?? []).length).toBeLessThanOrEqual(4);
  });
});

describe("«Sorpréndeme»", () => {
  // Un azar repetible (Park-Miller): la misma semilla da el mismo diseño. Las semillas se esparcen para que la primera tirada no sea casi 0.
  const semilla = (i: number) => {
    let n = 1 + ((i * 2654435761) % 2147483646);
    return () => {
      n = (n * 16807) % 2147483647;
      return (n - 1) / 2147483646;
    };
  };
  const base: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, frase: "Mimos", prendas: ["11111111-1111-4111-8111-111111111111"], corte: 1, cuenta: false };
  const corridas = Array.from({ length: 300 }, (_, i) => sorprendeme(base, { pct: 15, conPrendas: true }, semilla(i + 1)));

  it("siempre cambia algo, siempre se puede publicar y nunca dice el descuento dos veces", () => {
    for (const d of corridas) {
      expect(mismoDiseno(d, base)).toBe(false);
      expect(revisarDiseno(d, { prendas: 3, prendasConFoto: 3 }).bloquea).toBe(false);
      expect(d.pctGigante && (d.sello === "descuento" || d.acomodo === "mosaico")).toBe(false);
    }
  });

  it("deja el texto, las prendas elegidas, la cuenta y el colibrí como estaban", () => {
    for (const d of corridas) expect([d.frase, d.prendas, d.corte, d.cuenta, d.colibri]).toEqual([base.frase, base.prendas, base.corte, base.cuenta, base.colibri]);
  });

  it("recorre de verdad las opciones (no siempre lo mismo)", () => {
    expect(new Set(corridas.map((d) => d.paleta)).size).toBeGreaterThan(5);
    expect(new Set(corridas.map((d) => d.acomodo))).toEqual(new Set(ACOMODOS));
  });

  it("sin prendas, solo letras; sin descuento, ni sello del descuento ni % gigante", () => {
    for (let i = 1; i <= 100; i++) {
      const d = sorprendeme(base, { pct: null, conPrendas: false }, semilla(i));
      expect(d.acomodo).toBe("letras");
      expect(d.sello).not.toBe("descuento");
      expect(d.pctGigante).toBe(false);
    }
  });

  it("es repetible con la misma semilla", () => {
    expect(sorprendeme(base, { pct: 15, conPrendas: true }, semilla(7))).toEqual(sorprendeme(base, { pct: 15, conPrendas: true }, semilla(7)));
  });
});

describe("lo que el editor manda a guardar y lo que dice su pie (/chaos ENT-02, 2026-10-17)", () => {
  it("la frase va sin espacios a los lados (la base la rechaza con ellos y el borrador no se guardaba)", async () => {
    const { disenoParaGuardar } = await import("./campana-diseno");
    expect(disenoParaGuardar({ ...DISENO_DE_SIEMPRE, frase: "Mimos " }).frase).toBe("Mimos");
    expect(disenoParaGuardar({ ...DISENO_DE_SIEMPRE, frase: "     " }).frase).toBe("");
    expect(disenoParaGuardar({ ...DISENO_DE_SIEMPRE, frase: "Para ti y tu michi" }).frase).toBe("Para ti y tu michi");
  });

  it("si el último guardado falló, el pie no dice «guardado»", async () => {
    const { textoDelPie } = await import("./campana-diseno");
    expect(textoDelPie("error", "borrador", true)).not.toMatch(/guardado/i);
    expect(textoDelPie("choque", "borrador", true)).not.toMatch(/guardado/i);
    expect(textoDelPie("al-dia", "borrador", true)).toBe("Borrador guardado: la web sigue mostrando el diseño publicado.");
    expect(textoDelPie("al-dia", "borrador", false)).toBe("Borrador guardado: la web sigue mostrando la portada de siempre.");
    expect(textoDelPie("guardando", "borrador", true)).toBe("Guardando el borrador…");
    expect(textoDelPie("al-dia", "publicado", true)).toBe("Es el diseño que ve el cliente hoy.");
  });
});
