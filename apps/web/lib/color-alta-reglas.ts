// Crear un color sin salir de «Nuevo producto» (spike producto-nuevo-v2, Felipe 2026-09-28).
//
// PROMETE: lógica pura del formulario corto de `NuevoColorAlta`: el nombre como se guarda, si ya existe un
//   color con ese nombre (o sinónimo), qué familia sugerir para el tono elegido, qué falta para poder crearlo y
//   cómo se lee la respuesta de `POST /api/productos/colores`.
// ASUME: `colores` es la lista que ya tiene la pantalla (los activos); el candado real está en la base
//   (`colores_pkey` para el código, `colores_clave_unica` para el nombre) y la API traduce sus rechazos.
// NO HACE: no decide por la persona. La familia y el código son sugerencias que ella puede cambiar; un color
//   que se ve casi igual a otro se avisa, no se bloquea (Blanco y Crudo se parecen y son dos colores).

import type { ColorAlta } from "./alta-producto";
import { clave } from "./buscar-prenda-v2";
import { distanciaEntreHex, esHexValido } from "./color-parecido";
import { FAMILIAS_COLOR } from "./colores-familias";

/** El nombre como se guarda: sin espacios de más y con la primera letra en mayúscula («palo de rosa» → «Palo de rosa»). */
export function nombreDeColor(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  return limpio ? limpio[0].toLocaleUpperCase("es") + limpio.slice(1) : "";
}

/**
 * El color de la lista que ya se llama así (por su nombre o por un sinónimo), sin tildes ni mayúsculas. Sirve para
 * ofrecer «elígelo» en vez de dejar que la base rechace el duplicado después de llenar todo.
 */
export function colorConEseNombre(texto: string, colores: readonly ColorAlta[]): ColorAlta | undefined {
  const k = clave(nombreDeColor(texto));
  if (!k) return undefined;
  return colores.find((c) => clave(c.nombre) === k) ?? colores.find((c) => (c.sinonimos ?? []).some((s) => clave(s) === k));
}

// Un tono plano rara vez es metálico o estampado: esas dos familias no se sugieren por cercanía (una muestra plana de
// «Plata vieja» siempre queda cerca de «Gris» y arrastraría la sugerencia).
const FAMILIAS_POR_TONO: ReadonlySet<string> = new Set(FAMILIAS_COLOR.map((f) => f.valor).filter((v) => v !== "metalico" && v !== "estampado"));

/**
 * La familia del color existente que más se parece al tono elegido (ΔE2000, `lib/color-parecido.ts`). Se deduce de
 * cómo CAYLA ya agrupó su paleta —Nude es neutro aunque sea rosado— y no de una regla de matiz inventada acá.
 * Devuelve "" si el hex no es válido o no hay con qué comparar.
 */
export function familiaSugerida(hex: string | null, colores: readonly ColorAlta[]): string {
  if (!esHexValido(hex)) return "";
  let mejor: { familia: string; distancia: number } | null = null;
  for (const c of colores) {
    if (!esHexValido(c.hex) || !FAMILIAS_POR_TONO.has(c.familiaColor)) continue;
    const distancia = distanciaEntreHex(hex, c.hex);
    if (!mejor || distancia < mejor.distancia) mejor = { familia: c.familiaColor, distancia };
  }
  return mejor?.familia ?? "";
}

export type BorradorColor = { nombre: string; hex: string | null; familia: string; codigo: string };

/** Lo primero que falta para poder crear el color, en palabras de la pantalla; `null` si ya se puede. */
export function faltaParaCrear(b: BorradorColor): string | null {
  if (!nombreDeColor(b.nombre)) return "Escribe el nombre del color.";
  if (!esHexValido(b.hex)) return "Toca la muestra y elige el tono.";
  if (!FAMILIAS_COLOR.some((f) => f.valor === b.familia)) return "Elige la familia del color.";
  if (!/^[A-Z]{3}$/.test(b.codigo)) return "El código son 3 letras (ej. PAR).";
  return null;
}

/**
 * Lo que devuelve `POST /api/productos/colores` (`{ color: { codigo, nombre, familia_color, hex, estado, sinonimos, pantone_tcx } }`)
 * como lo usa el alta. `pendiente`: lo creó alguien que no es Líder; ya se puede usar, falta que un Líder lo apruebe.
 */
export function colorDeRespuesta(datos: unknown): { color: ColorAlta; pendiente: boolean } | null {
  const c = (datos as { color?: Record<string, unknown> } | null)?.color;
  if (!c || typeof c.codigo !== "string" || typeof c.nombre !== "string") return null;
  return {
    color: {
      codigo: c.codigo,
      nombre: c.nombre,
      hex: typeof c.hex === "string" ? c.hex : null,
      familiaColor: typeof c.familia_color === "string" ? c.familia_color : "",
      tipo: typeof c.tipo === "string" ? c.tipo : undefined,
      sinonimos: Array.isArray(c.sinonimos) ? c.sinonimos.filter((s): s is string => typeof s === "string") : [],
      pantoneTcx: typeof c.pantone_tcx === "string" ? c.pantone_tcx : null,
      // La ficha (ADR-0316) también llega en la respuesta: un color recién creado se señala en la carta como cualquier otro.
      descripcion: typeof c.descripcion === "string" ? c.descripcion : null,
      combinaCon: Array.isArray(c.combina_con) ? c.combina_con.filter((s): s is string => typeof s === "string") : [],
    },
    pendiente: c.estado === "pendiente",
  };
}
