import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Candado de la hoja de cobro que se ajusta a la pantalla (Felipe, 2026-10-05). En un laptop de ~650 px de alto la hoja medía 480 y su
// contenido pedía 715: «Confirmar cobro» quedaba bajo el pliegue y para cobrar había que bajar el scroll de TODA la hoja. Las
// piezas del arreglo son tres y las tres se rompen en silencio (la pantalla se ve bien en un monitor grande y mal en el laptop):
//   1. el scroll vive en el CUERPO de los pasos, nunca en la hoja entera, y el botón está fuera de ese cuerpo;
//   2. la hoja es un contenedor de tamaño con nombre (`cobro`) y se compacta por SU alto, no por el de la ventana;
//   3. lo que la compactación cambia no lleva utilidades de Tailwind en el JSX: viven en la capa `utilities` y le ganan a toda
//      regla de `@layer components` (ADR-0105), así que el valor compacto nunca se aplicaría.
//
// Contrato (3 líneas). PROMETE: que la hoja de escritorio no scrollea entera, que el botón no está dentro del cuerpo que scrollea y que
// existe la compactación por alto. ASUME: las clases `hoja-cobro-*` de `globals.css` y la forma actual de `HojaDeCobro.tsx`.
// NO PROMETE: las medidas (se miden en el navegador a 1024×768, 1280×650, 1366×650, 1440×800, 1536×730 y 1920×1080).

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const HOJA = leer("components/punto-de-venta/HojaDeCobro.tsx");
const PUNTO_DE_VENTA = leer("components/PuntoDeVenta.tsx");
const CSS = leer("app/globals.css");

describe("la hoja de cobro de escritorio no scrollea entera", () => {
  it("la hoja de PuntoDeVenta no tiene overflow-y-auto: recorta, y el scroll es del cuerpo", () => {
    const abre = PUNTO_DE_VENTA.indexOf('aria-label="Cobro"');
    expect(abre, "no encontré la hoja de cobro («aria-label=\"Cobro\"») en PuntoDeVenta.tsx").toBeGreaterThan(-1);
    const clase = PUNTO_DE_VENTA.slice(abre).match(/className="([^"]*)"/)?.[1] ?? "";
    expect(clase).toContain("hoja-cobro");
    expect(clase).toContain("overflow-hidden");
    expect(clase).not.toMatch(/overflow-y-(auto|scroll)/);
  });

  it("el cuerpo de los pasos scrollea y «Confirmar cobro» queda FUERA de él", () => {
    expect(HOJA).toMatch(/hoja-cobro-cuerpo scroll-cayla/);
    // El cuerpo se cierra justo tras el paso 2 y antes del pie fijo, que es donde vive el botón de enviar.
    expect(HOJA).toMatch(/<\/section>\s*<\/div>\s*\{!compacta && \(\s*<div className="hoja-cobro-pie/);
    expect(HOJA.indexOf('type="submit"')).toBeGreaterThan(HOJA.indexOf('hoja-cobro-pie'));
    expect(CSS).toMatch(/\.hoja-cobro-cuerpo\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("en el celular (`compacta`) el cuerpo no existe: la hoja del ticket es la que scrollea", () => {
    expect(HOJA).toContain('compacta ? "contents" : "hoja-cobro-cuerpo scroll-cayla"');
  });
});

describe("la hoja se compacta por su propio alto", () => {
  it("la hoja es un contenedor de tamaño llamado cobro", () => {
    expect(CSS).toMatch(/\.hoja-cobro\s*\{[^}]*container:\s*cobro\s*\/\s*size/);
  });

  it("hay compactación bajo 52 rem y la cabecera se esconde bajo 40 rem, ambas dentro de una @layer", () => {
    expect(CSS).toContain("@container cobro (max-height: 52rem)");
    expect(CSS).toMatch(/@container cobro \(max-height: 40rem\)\s*\{\s*\.hoja-cobro-cabeza\s*\{\s*display:\s*none/);
  });

  it("la hoja angosta usa la disposición ajustada hasta 80 rem: a una columna el diseño de siempre pide ~1150 px con efectivo", () => {
    expect(CSS).toMatch(/@container cobro \(max-height: 80rem\)\s*\{\s*@container \(max-width: 32\.49rem\)/);
  });

  it("las fichas se achican con el alto (hoja ancha y angosta) en vez de ser siempre cuadradas", () => {
    const compacto = CSS.slice(CSS.indexOf("@container cobro (max-height: 52rem)"));
    expect(compacto).toMatch(/@container \(min-width: 32\.5rem\)\s*\{\s*\.hoja-cobro-medio\s*\{\s*aspect-ratio:\s*auto;\s*height:\s*clamp\(/);
    expect(compacto).toMatch(/@container \(max-width: 32\.49rem\)[\s\S]*?\.hoja-cobro-medio\s*\{\s*aspect-ratio:\s*auto;\s*height:\s*clamp\(/);
  });

  it("la FORMA no cambia con el alto: dos filas de tres fichas, nunca seis en una fila (Felipe, 2026-10-05)", () => {
    // Una versión de la tarde del 2026-10-05 pasaba a seis fichas en una fila bajo cierto alto: íconos chicos, nombres de 7 px y la
    // mitad de la hoja vacía. Felipe: «quiero el diseño anterior en dos filas de 3 donde se veían más grandes; que sea responsive».
    const hoja = CSS.slice(CSS.indexOf("Hoja de cobro (Felipe, 2026-10-02"));
    expect(hoja).toMatch(/\.hoja-cobro-medios\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
    expect(hoja).not.toMatch(/\.hoja-cobro-medios[^{]*\{[^}]*grid-template-columns:\s*repeat\((?!3,)/);
    expect(hoja).not.toMatch(/repeat\(\s*6\b/);
    // Y en pantalla alta la ficha de siempre sigue siendo cuadrada: la base lleva aspect-ratio 1/1 y solo el bloque bajo 52 rem lo suelta.
    expect(hoja).toMatch(/\.hoja-cobro-medio\s*\{[^}]*aspect-ratio:\s*1 \/ 1/);
  });
});

describe("lo que la compactación cambia no lleva utilidades de Tailwind en el JSX", () => {
  // Cada clase `hoja-cobro-*` que el bloque compacto de globals.css modifica, con la FAMILIA de propiedades que modifica. Una utilidad
  // de esa familia en el mismo elemento (`gap-2`, `h-14`, `text-5xl`, `mb-3`…) le ganaría al valor compacto: la capa `utilities` va
  // después de `components`. Pasó con `gap-2` en la raíz: el hueco entre cabecera y pasos nunca se achicaba.
  const ALTO = /^h-/;
  const FUENTE = /^text-(xs|sm|base|lg|\dxl|\[)/;
  const MARGEN = /^-?m[trblxy]?-/;
  const RELLENO = /^p[trblxy]?-/;
  const HUECO = /^gap-/;
  const COLUMNAS = /^grid-cols-/;
  const INTERLINEA = /^leading-/;
  const DISPLAY = /^(flex|grid|hidden|block|inline-flex|contents)$/;
  const CAMBIAN: [clase: string, familias: RegExp[]][] = [
    ["hoja-cobro-raiz", [RELLENO, HUECO]],
    ["hoja-cobro-cabeza", [DISPLAY, RELLENO, HUECO]],
    ["hoja-cobro-total", [FUENTE]],
    ["hoja-cobro-volver", [ALTO]],
    ["hoja-cobro-cabeza-paso", [MARGEN]],
    ["hoja-cobro-numero", [ALTO, /^w-/, FUENTE]],
    ["hoja-cobro-pago", [HUECO, COLUMNAS]],
    ["hoja-cobro-medios", [HUECO, COLUMNAS]],
    ["hoja-cobro-pista", [RELLENO, FUENTE, INTERLINEA]],
    ["hoja-cobro-nota", [MARGEN, RELLENO, FUENTE, INTERLINEA]],
    ["hoja-cobro-pregunta", [MARGEN, FUENTE]],
    ["hoja-cobro-billetes", [HUECO, COLUMNAS]],
    ["hoja-cobro-vuelto", [MARGEN, HUECO]],
    ["hoja-cobro-vuelto-monto", [FUENTE]],
    ["hoja-cobro-doc", [MARGEN]],
    ["hoja-cobro-pie", [RELLENO]],
    ["hoja-cobro-confirmar", [ALTO, RELLENO, HUECO]],
    ["hoja-cobro-confirmar-monto", [FUENTE]],
    ["hoja-cobro-confirmar-rotulo", [FUENTE]],
    ["hoja-cobro-comprobante-nombre", [FUENTE, /^(truncate|whitespace-)/]],
  ];

  // Cada `className` del archivo como lista de clases. Si es una plantilla con `${cond ? "a" : "b"}`, se arma una lista por rama: la
  // de la raíz del celular (`gap-3`) y la de escritorio (`hoja-cobro-raiz`) no están juntas en el mismo elemento.
  const elementos = [...HOJA.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].flatMap((m) => {
    const texto = m[1] ?? m[2] ?? "";
    const fijo = texto.replace(/\$\{[^}]*\}/g, " ");
    const ramas = [...texto.matchAll(/\$\{([^}]*)\}/g)].flatMap((x) => [...x[1].matchAll(/"([^"]*)"/g)].map((q) => q[1]));
    return [fijo, ...ramas.map((r) => `${fijo} ${r}`)].map((c) => c.split(/\s+/).filter(Boolean));
  });

  it.each(CAMBIAN.map(([clase, familias]) => [clase, familias] as const))("%s no se mezcla con utilidades que le ganen al CSS", (clase, familias) => {
    const con = elementos.filter((partes) => partes.includes(clase));
    expect(con.length, `no encontré ningún elemento con la clase ${clase} en HojaDeCobro.tsx`).toBeGreaterThan(0);
    for (const partes of con) {
      const conflictivas = partes.filter((u) => !u.startsWith("hoja-cobro") && familias.some((f) => f.test(u)));
      expect(conflictivas, `${clase}: ${partes.join(" ")} trae utilidades que ganarían a la compactación`).toEqual([]);
    }
  });
});
