import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del cableado de «apartada para una clienta» (Vender y Cambios). Las reglas de decir «apartada» o «agotada»
// están probadas (`vender-reglas.test.ts`, `vender-stock-local.test.ts`, `cambio-reemplazo-reglas.test.ts`), pero lo
// que las conecta a las pantallas vive en componentes y páginas que ninguna prueba renderiza: borrar una línea de ahí
// deja `tsc` y toda la suite en verde y la pantalla vuelve a decir «agotada» sin ningún error (la revisión lo hizo con
// cada uno de estos cables). Lo que el tipado sí cubre no está aquí: `VarianteCatalogo.apartadoAqui` y
// `validarCambio(...).nueva.apartadoAqui` son obligatorios, así que olvidarlos no compila. En Vender `apartadoAqui` es
// opcional (como `almacenAqui`, D-40: quien arma variantes sin ese dato se comporta como antes), y por eso el cable de
// `vender/page.tsx` sí necesita esta prueba: borrar esa línea compila y la pantalla volvería a decir «agotada».
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
    cable: "cada variante lleva su `apartadoAqui`, del mismo mapa de stock que `stockAqui` y `almacenAqui` (no un 0 fijo)",
    patron: /apartadoAqui:\s*apartadoEnPiso\(stockAqui\.get\(v\.varianteId\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "las variantes de la caja pasan por `conApartadoAjustado` (con el almacén y el stock ya ajustados)",
    patron: /conStockAjustado\(\s*conApartadoAjustado\(\s*conAlmacenAjustado\(\s*variantes\s*,\s*ajustesAlmacen\s*\)\s*,\s*ajustesApartado\s*\)\s*,\s*ajustesStock\s*\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "`releerStock` guarda también lo apartado que trajo la base (`releido.apartado`)",
    patron: /setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.releido\.apartado\]\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "el sondeo de stock en vivo también guarda lo apartado (si no, tras cada sondeo la palabra vuelve a ser «agotada»)",
    patron: /\(releido,\s*almacen,\s*apartado\)\s*=>\s*\{[^}]*setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.apartado\]\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "un catálogo nuevo del servidor borra lo apartado releído (manda el servidor)",
    patron: /setAjustesAlmacen\(new Map\(\)\);\s*setAjustesApartado\(new Map\(\)\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "el aviso al agregar recibe el `apartadoAqui` de la prenda (`avisoSinPiso` decide «apartada» o «agotada»)",
    patron: /almacenAqui:\s*v\.almacenAqui,\s*apartadoAqui:\s*v\.apartadoAqui/,
  },
  {
    archivo: "lib/useStockEnVivo.ts",
    cable: "la lectura trae lo apartado de las MISMAS filas (`apartadoReleido`)",
    patron: /apartado:\s*apartadoReleido\(pedidas,\s*cantidades\)/,
  },
  {
    archivo: "lib/useStockEnVivo.ts",
    cable: "el sondeo le pasa a la pantalla el stock, el almacén Y lo apartado de la misma lectura",
    patron: /alLeerRef\.current\(\s*releido\.cobrable,\s*releido\.almacen,\s*releido\.apartado\s*\)/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "`agregar()` devuelve el `motivo` tal cual cuando no se cobra (así «apartada» llega a la cámara y no se reescribe a «agotada»)",
    patron: /if \(motivo !== "cobrable"\) \{[\s\S]*?return motivo;\s*\}/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "la cámara (`alEscanear`) reenvía el estado que devuelve `agregar()` sin remapearlo",
    patron: /const estado = agregar\(v,\s*\{\s*silencioso:\s*true\s*\}\)\s*\?\?\s*"agotada";[\s\S]*?return \{ estado, codigo, nombre, prenda/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "la cámara decide qué queda «en el almacén» con `quedoEnAlmacen` (probada) y cualquier otro resultado saca la prenda",
    patron: /if \(quedoEnAlmacen\(estado,\s*v\.almacenAqui\)\)\s*quedaronEnAlmacen\.current\.set\(v\.varianteId,\s*nombre\);\s*else quedaronEnAlmacen\.current\.delete\(v\.varianteId\);/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "el texto de la fila del buscador sale de `textoStockDeFila(v)` (probada), no de una cadena de ternarios en el componente",
    patron: /\{textoStockDeFila\(v\)\}/,
  },
  {
    archivo: "components/PuntoDeVenta.tsx",
    cable: "`agregar()` calcula el motivo con la VARIANTE entera (con su `apartadoAqui`), no con un objeto recortado",
    patron: /const motivo = motivoNoCobrable\(v\);/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "la casilla de talla apartada NO se tacha y usa el token informativo (agotada sí: `line-through`)",
    patron: /motivoNoCobrable\(t\.variante\) === "apartada" \? "border-pizarra\/50 text-pizarra" : "border-sand text-tinta\/35 line-through"/,
  },
  {
    archivo: "components/PuntoDeVentaCatalogo.tsx",
    cable: "la talla sin piso dice su motivo en el aria-label y en el tooltip (`tooltipTallaSinPiso`)",
    patron: /motivoNoCobrable\(t\.variante\) === "apartada" \? "apartada para una clienta"[\s\S]*tooltipTallaSinPiso\(\s*t\.variante\s*,/,
  },
  {
    archivo: "components/ElegirTallaModal.tsx",
    cable: "la casilla de talla sabe cuándo es «apartada» (`motivo === \"apartada\"`, no un `false` fijo)",
    patron: /const apartada = motivo === "apartada"/,
  },
  {
    archivo: "components/ElegirTallaModal.tsx",
    cable: "la casilla de talla dice «Apartada para una clienta» cuando el motivo es `apartada`",
    patron: /apartada\s*\?\s*"Apartada para una clienta"/,
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
    patron: /\(releido,\s*_almacen,\s*apartado\)\s*=>\s*\{[^}]*setAjustesApartado\(\s*\(prev\)\s*=>\s*new Map\(\[\.\.\.prev,\s*\.\.\.apartado\]\)\)/,
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
