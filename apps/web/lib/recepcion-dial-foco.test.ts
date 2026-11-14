import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El foco del número abierto del Dial (Recibir ▸ Contar). Felipe eligió mirando, el 2026-11-14, la demo «El número de siempre, vivo»: abierto, el número no lleva
// caja, fondo ni raya; su foco es el cursor y la selección en la paleta. Esa selección contra el papel mide 1,39:1 en claro y 1,62:1 en oscuro, y el anillo común del
// ERP (ADR-0351) pide 3:1. Hasta que Felipe decida una señal más fuerte para todos, quien pidió «más contraste» o colores forzados en su aparato ve ese anillo, y los
// demás ven lo que se aprobó.
//
// Contrato. PROMETE: (1) con `forced-colors: active` o `prefers-contrast: more`, `.rc-dial-caja:focus-visible` pinta el anillo común (tinta, 2 px, con su separación);
// (2) fuera de esos modos ninguna regla de foco toca al número abierto: ponerle caja, raya o anillo a todos es decisión de Felipe, no un arreglo.
// NO PROMETE: medir el contraste (se mide en el navegador) ni cubrir el número cerrado, cuyo botón ya lleva su anillo (`.rc-dial-numero:focus-visible`).

const MAS_CONTRASTE = "@media (forced-colors: active), (prefers-contrast: more) {";

/** Lo que el CSS de verdad dice: sin comentarios, que mencionan las reglas sin serlo. */
function sinComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Separa el bloque `@media` que abre con `abre` (su contenido, sin sus llaves) de todo lo demás. `null` si no existe. */
function partirBloque(css: string, abre: string): { dentro: string; fuera: string } | null {
  const inicio = css.indexOf(abre);
  if (inicio < 0) return null;
  let profundidad = 1;
  let fin = inicio + abre.length;
  while (fin < css.length && profundidad > 0) {
    if (css[fin] === "{") profundidad++;
    else if (css[fin] === "}") profundidad--;
    fin++;
  }
  return { dentro: css.slice(inicio + abre.length, fin - 1), fuera: css.slice(0, inicio) + css.slice(fin) };
}

/** Una regla de foco del número abierto: la caja, o su envoltorio con `:focus-within`. El selector no cruza la llave de otra regla. */
const FOCO_DEL_NUMERO = /\.rc-dial-(?:caja|vivo)[^{}]*:focus/;

describe("cómo se reconoce el foco del número abierto", () => {
  it("separa el bloque de más contraste, con sus llaves anidadas, de todo lo demás", () => {
    const css = `.a { x: 1; } ${MAS_CONTRASTE} .b:focus-visible { y: 2; } } .c { z: 3; }`;
    expect(partirBloque(css, MAS_CONTRASTE)).toEqual({ dentro: " .b:focus-visible { y: 2; } ", fuera: ".a { x: 1; }  .c { z: 3; }" });
    expect(partirBloque(".a { x: 1; }", MAS_CONTRASTE)).toBeNull();
  });
  it("ve el foco de la caja y el de su envoltorio, y no el del número cerrado ni el de otra regla", () => {
    expect(FOCO_DEL_NUMERO.test(".rc-dial-caja:focus-visible { outline: var(--x); }")).toBe(true);
    expect(FOCO_DEL_NUMERO.test(".rc-dial-vivo:focus-within { outline: var(--x); }")).toBe(true);
    expect(FOCO_DEL_NUMERO.test(".rc-dial-numero:focus-visible { outline: var(--x); }")).toBe(false);
    expect(FOCO_DEL_NUMERO.test(".rc-dial-caja { outline: 0; } .rc-dial-numero:focus-visible { outline: var(--x); }")).toBe(false);
  });
  it("no toma por regla lo que solo se menciona en un comentario", () => {
    expect(sinComentarios("/* .rc-dial-caja:focus-visible */ .a { b: c; }")).toBe(" .a { b: c; }");
  });
});

describe("el foco del número abierto del Dial", () => {
  const css = sinComentarios(readFileSync(join(__dirname, "..", "app/estilos/recepcion-viva.css"), "utf8"));
  const masContraste = partirBloque(css, MAS_CONTRASTE);

  it("quien pidió más contraste o colores forzados ve el anillo común del ERP (ADR-0351)", () => {
    expect(masContraste, "falta el @media de más contraste del número abierto en recepcion-viva.css").not.toBeNull();
    const dentro = masContraste?.dentro ?? "";
    expect(dentro).toContain(".rc-dial-caja:focus-visible");
    expect(dentro).toMatch(/outline:\s*var\(--foco-ancho\) solid var\(--foco-color\)/);
    expect(dentro).toMatch(/outline-offset:\s*var\(--foco-separacion\)/);
  });

  it("fuera de esos modos el número abierto no gana caja, raya ni anillo: eso lo decide Felipe", () => {
    expect(FOCO_DEL_NUMERO.test(masContraste?.fuera ?? css)).toBe(false);
  });
});
