import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del bug de 2026-09-25 (auditoría de producción, `/vender`). En móvil el `<aside>`
// del ticket es un ítem de grid/flex y por defecto tiene `min-width: auto`: si CUALQUIER fila
// de adentro no puede encogerse, ese ancho mínimo empuja a TODO el ticket más ancho que el
// viewport, y el ancestro con `overflow-hidden` de la pantalla (`PuntoDeVenta.tsx`) recorta el
// sobrante en silencio —sin scroll horizontal, así que ni `scrollWidth` ni un test que solo
// mire eso lo detectan—. Pasaba desde 320 hasta ~410 px de ancho real, con o sin descuento.
//
// La corrección tiene dos partes y las dos son necesarias:
//  1. `min-w-0` en el `<aside>`: le permite encogerse al ancho real del viewport en vez de
//     imponerle su contenido mínimo a toda la pantalla.
//  2. `flex-wrap` en las tres filas cuyo contenido no cabe en un ancho angosto (cantidad/precio/
//     importe de cada prenda; descuento + «Dejar en espera»; subtotal+IGV + Total): sin esto,
//     encoger el `<aside>` con (1) simplemente movería el recorte de «toda la pantalla» a
//     «esta fila» — cada una necesita poder bajar a una segunda línea en vez de recortarse.
//
// jsdom no calcula layout real (todo `getBoundingClientRect()` da 0), así que no se puede medir
// el recorte aquí como hizo la auditoría (con un navegador real). Este test es más modesto pero
// cubre el error más probable: que un refactor futuro del componente borre alguna de las cuatro
// clases sin darse cuenta de que existen por esto. La auditoría con navegador real (capturas +
// `getBoundingClientRect()` en los 20 viewports críticos) es la que de verdad prueba el layout;
// vive en `docs/auditoria-responsive-pos-2026-09-25/` y no se repite en cada CI.

const ruta = join(__dirname, "PuntoDeVentaTicket.tsx");
const codigo = readFileSync(ruta, "utf8");

describe("PuntoDeVentaTicket — el ticket no se desborda en móvil angosto", () => {
  it("el <aside> raíz puede encogerse al ancho real del viewport (min-w-0)", () => {
    expect(codigo).toMatch(/<aside className="[^"]*\bmin-w-0\b[^"]*">/);
  });

  it("la fila cantidad/precio unitario/importe de cada prenda puede bajar a una segunda línea", () => {
    const inicio = codigo.indexOf('mt-3 flex');
    expect(inicio).toBeGreaterThan(-1);
    const fila = codigo.slice(inicio, inicio + 80);
    expect(fila).toContain("flex-wrap");
    // Confirma que es la fila correcta: la que sigue trae el stepper de Cantidad.
    expect(codigo.slice(inicio, inicio + 400)).toContain("Cantidad");
  });

  it("la fila «Descuento» + «Dejar en espera» puede bajar a una segunda línea", () => {
    const inicio = codigo.indexOf('mb-3 flex');
    expect(inicio).toBeGreaterThan(-1);
    const fila = codigo.slice(inicio, inicio + 90);
    expect(fila).toContain("flex-wrap");
    expect(codigo.slice(inicio, inicio + 2200)).toContain("Dejar en espera");
  });

  it("la fila subtotal/IGV + Total puede bajar a una segunda línea, y el Total sigue a la derecha", () => {
    const inicio = codigo.indexOf('mb-4 flex');
    expect(inicio).toBeGreaterThan(-1);
    const fila = codigo.slice(inicio, inicio + 90);
    expect(fila).toContain("flex-wrap");
    const bloque = codigo.slice(inicio, inicio + 1700);
    expect(bloque).toContain("Subtotal");
    // `ml-auto` en el contenedor del Total: si cae a su propia línea (el número no puede
    // encogerse, no tiene espacios), debe quedar pegado al borde derecho igual que antes,
    // no a la izquierda —que es donde un solo ítem cae por defecto con `justify-between`.
    expect(bloque).toMatch(/<div className="ml-auto text-right">/);
  });
});
