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
    expect(codigo).toMatch(/<aside[^>]*\bclassName="[^"]*\bmin-w-0\b[^"]*"[^>]*>/);
  });

  // Desde el 2026-09-30 cada prenda es UNA fila compacta (`punto-de-venta/LineaDelTicket.tsx`, spike del club):
  // nombre | − 1 + | importe | quitar. Lo que no puede encogerse (paso, importe, basurero) lleva `shrink-0`; lo que
  // cede el ancho es el bloque del nombre (`min-w-0 flex-1`), que corta el nombre en 2 líneas y deja bajar a otra
  // línea el «color · talla · stock». Sin esas clases, a 320-375 px la fila empuja al ticket fuera de la pantalla.
  it("la fila de cada prenda cede el ancho por el nombre y el detalle baja de línea", () => {
    const linea = readFileSync(join(__dirname, "punto-de-venta", "LineaDelTicket.tsx"), "utf8");
    expect(codigo).toContain("<LineaDelTicket");
    expect(linea).toMatch(/<div className="min-w-0 flex-1" title=/);
    expect(linea).toContain("line-clamp-2");
    expect(linea).toMatch(/<p className="[^"]*\bflex-wrap\b[^"]*">\s*<span>\{f\.detalle\}/);
    // El paso, el importe y el basurero no se encogen: se encoge el nombre.
    expect(linea.match(/\bshrink-0\b/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("la fila «Descuento» + «Dejar en espera» puede bajar a una segunda línea", () => {
    // Arriba de ella van la del cupón del Club y la de los puntos que gana: se busca a partir de su comentario. Desde el programa de
    // puntos la fila suma «Código de cupón», por eso el tramo que se mira es más largo.
    const comentario = codigo.indexOf("{/* Fila «Descuento», solo mientras");
    expect(comentario).toBeGreaterThan(-1);
    const inicio = codigo.indexOf("mb-3 flex", comentario);
    expect(inicio).toBeGreaterThan(-1);
    const fila = codigo.slice(inicio, inicio + 90);
    expect(fila).toContain("flex-wrap");
    expect(codigo.slice(inicio, inicio + 3200)).toContain("Dejar en espera");
  });

  // Programa de puntos (2026-10-19): «Cupón del Club CAY-XXXX-XXXX · S/ 10 en compras desde S/ 30  −S/ 10  Quitar» sobre el total
  // (reemplaza la línea del 10 % de cumpleaños). A 320 px el texto y el monto no caben en una línea: el monto baja, no empuja el ticket
  // fuera de la pantalla.
  it("la línea del cupón del club puede bajar a una segunda línea", () => {
    const inicio = codigo.indexOf("{vale && vale.monto > 0 && (");
    expect(inicio).toBeGreaterThan(-1);
    const fila = codigo.slice(inicio, inicio + 160);
    expect(fila).toContain("flex-wrap");
    expect(codigo.slice(inicio, inicio + 700)).toContain("TEXTO_PIE_CUPON");
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
