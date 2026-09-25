import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del cableado de «apartada para una clienta» (Vender y Cambios). Las reglas de decir «apartada» o «agotada»
// están probadas (`vender-reglas.test.ts`, `vender-stock-local.test.ts`, `cambio-reemplazo-reglas.test.ts`), pero lo
// que las conecta a las pantallas vive en componentes y páginas que ninguna prueba renderiza: borrar una línea de ahí
// deja `tsc` y toda la suite en verde y la pantalla vuelve a decir «agotada» sin ningún error (la revisión lo hizo con
// cada uno de estos cables). Lo que el tipado sí cubre no está aquí: `VarianteVenta.apartadoAqui`,
// `VarianteCatalogo.apartadoAqui` y `validarCambio(...).nueva.apartadoAqui` son obligatorios, así que olvidarlos no compila.
// Mismo espíritu que `globals-capas.test.ts`: leer los fuentes y fallar si dejan de cumplirse.

const APP = join(__dirname, "..");

/** El fuente sin comentarios: una línea comentada no cuenta como cableada. */
function fuente(ruta: string): string {
  return readFileSync(join(APP, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CABLES: { archivo: string; cable: string; patron: RegExp }[] = [
  // ---- Vender ----
  {
    archivo: "app/(app)/vender/page.tsx",
    cable: "el mapa de lo apartado en el piso sale de `apartadoEnPiso`, sobre el mismo stock del que sale `stockAqui`",
    patron: /apartadoPorVariante\s*=\s*new Map\(\[\.\.\.stockAqui\]\.map\(\(\[id, c\]\) => \[id, apartadoEnPiso\(c\)\]\)\)/,
  },
  {
    archivo: "app/(app)/vender/page.tsx",
    cable: "cada variante lleva su `apartadoAqui` (no un 0 fijo)",
    patron: /apartadoAqui:\s*apartadoPorVariante\.get\(v\.varianteId\)\s*\?\?\s*0/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "las variantes de la caja pasan por `conApartadoAjustado` sobre el stock ya ajustado",
    patron: /conApartadoAjustado\(\s*conStockAjustado\(\s*variantes\s*,\s*ajustesStock\s*\)\s*,\s*ajustesApartado\s*\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "`releerStock` guarda también lo apartado que trajo la base (`leido.apartado`)",
    patron: /setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.leido\.apartado\]\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "el sondeo de stock en vivo también guarda lo apartado (si no, tras cada sondeo la palabra vuelve a ser «agotada»)",
    patron: /\(releido,\s*apartado\)\s*=>\s*\{[^}]*setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.apartado\]\)\)/,
  },
  {
    archivo: "lib/useStockEnVivo.ts",
    cable: "el sondeo le pasa a la pantalla el stock Y lo apartado de la misma lectura",
    patron: /alLeerRef\.current\(\s*leido\.stock,\s*leido\.apartado\s*\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "un catálogo nuevo del servidor borra lo apartado releído (manda el servidor)",
    patron: /setAjustesStock\(new Map\(\)\);\s*setAjustesApartado\(new Map\(\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "el aviso al agregar sale de `avisoSinStockAqui`",
    patron: /avisoSinStockAqui\(\s*nombreVariante\s*,\s*v\s*,\s*ubicacionEtiqueta\s*\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "la cámara (`alEscanear`) dice «apartada» y no «agotada» si lo que falta en el piso es de una clienta",
    patron: /resultado === "agotada" && sinStockPorApartado\(v\) \? "apartada" : resultado/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "la fila del buscador dice `textoSinStock(v, …)`",
    patron: /v\.stockAqui <= 0 \? textoSinStock\(v,\s*"sin stock aquí"\)/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "la talla del catálogo dice `textoSinStock(t.variante, …)` y su tooltip sale de `tooltipSinStock`",
    patron: /textoSinStock\(t\.variante,\s*"sin stock aquí"\)[\s\S]*tooltipSinStock\(t\.variante\)/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "`tooltipSinStock` explica el motivo con `textoSinStock`",
    patron: /const motivo = textoSinStock\(v,\s*"Sin stock aquí"\)/,
  },
  {
    archivo: "components/ElegirTallaModal.tsx",
    cable: "la casilla de talla usa `textoSinStock`",
    patron: /textoSinStock\(t\.variante,\s*"Sin stock aquí"\)/,
  },
  // ---- Cambios ----
  {
    archivo: "components/CambiosFlujo.tsx",
    cable: "el catálogo de Cambios se ajusta con el stock Y lo apartado releídos",
    patron: /conApartadoAjustado\(\s*conStockAjustado\(\s*catalogoProp\s*,\s*ajustesStock\s*\)\s*,\s*ajustesApartado\s*\)/,
  },
  {
    archivo: "components/CambiosFlujo.tsx",
    cable: "el sondeo de Cambios guarda también lo apartado",
    patron: /\(releido,\s*apartado\)\s*=>\s*\{[^}]*setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.apartado\]\)\)/,
  },
  {
    archivo: "components/CambiosFlujo.tsx",
    cable: "un catálogo nuevo del servidor borra lo apartado releído (manda el servidor)",
    patron: /setAjustesStock\(new Map\(\)\);\s*setAjustesApartado\(new Map\(\)\)/,
  },
  {
    archivo: "app/(app)/cambios/page.tsx",
    cable: "el mapa de lo apartado en el piso sale de `apartadoEnPiso`",
    patron: /apartadoAquiPorVariante\s*=\s*new Map\(\[\.\.\.stock\]\.map\(\(\[id, c\]\) => \[id, apartadoEnPiso\(c\)\]\)\)/,
  },
  {
    archivo: "app/(app)/cambios/page.tsx",
    cable: "cada variante lleva su `apartadoAqui` (no un 0 fijo)",
    patron: /apartadoAqui:\s*apartadoAquiPorVariante\.get\(v\.varianteId\)\s*\?\?\s*0/,
  },
  {
    archivo: "components/CambiosFlujo.tsx",
    cable: "la validación recibe el `apartadoAqui` de la prenda elegida (no un 0 fijo)",
    patron: /apartadoAqui:\s*r\.varianteNueva\.apartadoAqui/,
  },
  {
    archivo: "components/CambiosFlujo.tsx",
    cable: "la validación recibe la descripción ya con respaldo (`r.descripcionNueva`, no la armada a mano)",
    patron: /descripcion:\s*r\.descripcionNueva\b/,
  },
  {
    archivo: "components/CambioReemplazo.tsx",
    cable: "el chip de talla y el de color dicen `r.sinStockTexto(...)`",
    patron: /r\.sinStockTexto\(t,[\s\S]*r\.sinStockTexto\(t,[\s\S]*r\.sinStockTexto\(r\.tallaEfectiva,\s*nombre\)/,
  },
  {
    archivo: "components/CambioReemplazo.tsx",
    cable: "el aviso de la prenda elegida es `r.avisoSinStock`",
    patron: /r\.avisoSinStock\s*&&[\s\S]*\{r\.avisoSinStock\}/,
  },
];

describe("apartada — cableado de las pantallas que el tipado no ve", () => {
  for (const { archivo, cable, patron } of CABLES) {
    it(`${archivo}: ${cable}`, () => {
      // `test` y no `toMatch`: si falla, que diga qué cable falta y no vuelque el archivo entero.
      expect(patron.test(fuente(archivo)), `falta en ${archivo}: ${cable}`).toBe(true);
    });
  }

  it("CambioReemplazo no escribe a mano «no queda aquí»: ese texto vive en `derivarReemplazo`, probado", () => {
    expect(fuente("components/CambioReemplazo.tsx")).not.toContain("no queda aquí");
  });
});
