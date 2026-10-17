import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// «Servicios y tarifas» se rompía a 1024 px (Formidable de Producción, H4, 2026-10-15): las siete columnas fijas (712 px) cambiaban en el corte de la VENTANA
// (`sm:`, 640 px) y no en el ancho de la TARJETA. Con el lateral abierto la tarjeta mide ventana − 352: a 1024 px el nombre del servicio medía 0 px
// y se encimaba con «Fase»; a 1280, 80 px; a 1366, 166. Aquí la tabla decide por su tarjeta (`@container`, como Órdenes): con ancho de sobra,
// las siete columnas; por debajo, cada fila se apila (nombre arriba, datos debajo).
//
// Contrato. PROMETE: que la plantilla de siete columnas solo se activa cuando al nombre le quedan al menos MINIMO_NOMBRE px de sobra; que ninguna
// plantilla de columnas depende de la ventana (`sm:grid-cols`); que el encabezado se esconde por debajo del mismo corte y que la tabla es un
// `@container`. NO PROMETE: que se vea bien (se mira en el navegador a 1024, 1280 y 1440 px).

const FUENTE = readFileSync(join(__dirname, "..", "components/proveedores-produccion/ServiciosYTarifas.tsx"), "utf8");
const MINIMO_NOMBRE = 160; // lo que necesita un nombre como «Taller Rosa Bordados» para leerse (con los puntos suspensivos de `truncate`)
const GAP_X = 16; // gap-x-4
const RELLENO_X = 40; // px-5 de cada fila

const plantilla = /const PLANTILLA =\s*"([^"]+)"/.exec(FUENTE)?.[1] ?? "";
const ancha = /@min-\[(\d+)px\]:grid-cols-\[([^\]]+)\]/.exec(plantilla);

/** Lo que miden las columnas que no son el nombre, más los huecos y el relleno de la fila. */
function anchoFijo(pistas: string[]): number {
  const fijas = pistas.filter((p) => !p.startsWith("minmax(")).reduce((suma, p) => suma + parseFloat(p) * 16, 0);
  return fijas + GAP_X * (pistas.length - 1) + RELLENO_X;
}

describe("Servicios y tarifas: la tabla decide por el ancho de su tarjeta", () => {
  it("la plantilla ancha tiene siete columnas y se activa por el ancho de la tarjeta", () => {
    expect(ancha, "PLANTILLA debe traer las columnas fijas a partir del ancho de la tarjeta (consulta de contenedor)").not.toBeNull();
    expect(ancha![2]!.split("_")).toHaveLength(7);
  });

  it("a ningún ancho de tarjeta el nombre del servicio queda en 0 px", () => {
    const corte = Number(ancha![1]);
    const nombre = corte - anchoFijo(ancha![2]!.split("_"));
    // Por encima del corte el nombre recibe más; por debajo, no hay columnas (la fila se apila): el peor caso es justo en el corte.
    expect(nombre).toBeGreaterThanOrEqual(MINIMO_NOMBRE);
  });

  it("por debajo del corte la fila es de dos columnas (nombre y botón) y no de siete", () => {
    const base = plantilla.split(/\s+/).find((c) => c.startsWith("grid-cols-["));
    expect(base, "PLANTILLA debe traer una plantilla angosta sin prefijo").toBeDefined();
    expect(base!.slice("grid-cols-[".length, -1).split("_").length).toBeLessThanOrEqual(2);
  });

  it("ninguna plantilla ni celda depende del corte de la ventana", () => {
    expect(plantilla).not.toMatch(/(^|\s)sm:grid-cols/);
    expect(FUENTE).not.toMatch(/sm:col-span/);
  });

  it("el encabezado se esconde por debajo del mismo corte y la tabla es un @container", () => {
    const corte = ancha![1];
    expect(FUENTE).toContain(`visible="hidden @min-[${corte}px]:grid"`);
    expect(FUENTE).toMatch(/<Tabla[^>]*className="@container"/);
  });
});

// Contraste (Formidable de Producción, H11): «Sin fijo» (2,85:1) y «Sin color» (3,82:1) se escribían tan tenues que no llegaban a 4,5:1. Desde `/70`
// pasan en claro y en oscuro (el piso de `tema.css` solo sube lo que está entre `/35` y `/60`).
describe("textos tenues de Producción que pasan 4,5:1", () => {
  it("«Sin fijo» de Servicios y tarifas va a /70", () => {
    expect(FUENTE).toMatch(/<span className="text-tinta\/70">Sin fijo<\/span>/);
    expect(FUENTE).not.toMatch(/text-tinta\/45">Sin fijo/);
  });

  it("«Sin color» de Insumos (la ficha sin tejido ni color) va a /70", () => {
    const insumos = readFileSync(join(__dirname, "..", "components/InsumosPanel.tsx"), "utf8");
    expect(insumos).toMatch(/ficha\.tejido === null && ficha\.color === null \? "text-tinta\/70"/);
    expect(insumos).not.toMatch(/ficha\.tejido === null && ficha\.color === null \? "text-tinta\/55"/);
  });
});

