import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACOMODOS, DISENO_DE_SIEMPRE, FONDOS, INTENSIDADES, PALETAS, PATRONES, SELLOS, TAMANOS, paletaPropia } from "@cayla-retail/portada";
import {
  contextoDeRevision,
  diaSiguiente,
  disenoParaEditar,
  estadoDelBorrador,
  leerEstadoDiseno,
  paletasDeLaCampana,
  piezasDeLaCampana,
  queSaleDespues,
  resumenColores,
  resumenEstilo,
} from "./campana-diseno";
import type { PrendaDeCampana } from "./campana-detalle";

// La base impide los valores que no están en las listas curadas (`check` de 20261017160000_campanas_diseno.sql) y el código las ofrece
// desde @cayla-retail/portada: si una crece y la otra no, la pantalla ofrecería algo que la base rechaza (o al revés).
const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20261017160000_campanas_diseno.sql", import.meta.url), "utf8");
function listaDelCheck(columna: string): string[] {
  const m = MIGRACION.match(new RegExp(`constraint campana_disenos_${columna} check \\(${columna} in \\(([^)]*)\\)\\)`));
  if (!m) throw new Error(`No encuentro el check de ${columna}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
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
  it("abre en el estilo y dice que sigue Colores; al visitarlos, los dos quedan con ✓", async () => {
    const { PASOS_DEL_DISENO, estadoDePasos } = await import("./campana-diseno");
    const alAbrir = estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo"]), "estilo");
    expect(alAbrir.estados).toEqual({ estilo: "ahora", colores: "falta" });
    expect(alAbrir.sigue).toBe("colores");
    const enColores = estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo", "colores"]), "colores");
    expect(enColores.estados).toEqual({ estilo: "hecho", colores: "ahora" });
    expect(enColores.sigue).toBeNull();
    expect(estadoDePasos(PASOS_DEL_DISENO, new Set(["estilo", "colores"]), null).estados).toEqual({ estilo: "hecho", colores: "hecho" });
  });
});
