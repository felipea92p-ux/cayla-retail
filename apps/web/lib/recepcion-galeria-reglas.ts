import { normalizarBusqueda } from "./combo-reglas";
import type { PrendaRecepcion } from "./recepcion-envio-reglas";

// La galería de «Ya la tenemos» y «¿Esta prenda ya existe?» en Recibir (tablero «Treinta tareas de Recibir», tarea 9, 2026-11-14).
// El problema: la reposición se reconoce por la foto, pero la lista dejaba las 200 prendas de la categoría y solo las ORDENABA al escribir.
// Para descartar una candidata había que abrir su ficha y volver: unos 8 toques por prenda. Aquí se decide, sin red y sin azar, qué tarjetas
// quedan y en qué orden; el componente solo las dibuja.

/** Cuántos colores se dibujan como puntos en una tarjeta; los demás se dicen con «+N». */
export const MAX_COLORES_EN_TARJETA = 4;

export type ColorDeTarjeta = { nombre: string; hex: string | null };

/** Los colores de la prenda, sin repetir, en el orden en que llegan sus variantes. «Sin color» no es un color: no se dibuja. */
export function coloresDeLaPrenda(prenda: Pick<PrendaRecepcion, "variantes">): ColorDeTarjeta[] {
  const vistos = new Map<string, ColorDeTarjeta>();
  for (const v of prenda.variantes) {
    if (!v.color) continue;
    const clave = normalizarBusqueda(v.color);
    if (!vistos.has(clave)) vistos.set(clave, { nombre: v.color, hex: v.colorHex ?? null });
  }
  return [...vistos.values()];
}

/** Todo lo que la persona puede escribir para encontrarla: nombre, código (de la prenda y de sus variantes), marca y colores. */
function textoBuscable(p: PrendaRecepcion): string {
  return normalizarBusqueda(
    [p.nombre, p.codigo, p.marca?.nombre ?? null, ...p.variantes.flatMap((v) => [v.color, v.codigo])].filter(Boolean).join(" "),
  );
}

/**
 * Las tarjetas que quedan y su orden.
 * · Con algo escrito, quedan SOLO las que tienen todas sus palabras (sin tildes ni mayúsculas, en cualquier orden): «blusa roja» encuentra
 *   la «Blusa Aurora» que tiene el color Rojo.
 * · Primero las de las marcas que ya trae este envío (lo más probable es que llegue otra de esas), después las demás; dentro de cada grupo,
 *   por nombre. El orden no depende del orden en que respondió la base.
 */
export function galeriaDePrendas(
  prendas: readonly PrendaRecepcion[],
  { busqueda, marcasDelEnvio = [] }: { busqueda: string; marcasDelEnvio?: readonly (string | null)[] },
): PrendaRecepcion[] {
  const palabras = normalizarBusqueda(busqueda).split(" ").filter(Boolean);
  const delEnvio = new Set(marcasDelEnvio.filter((m): m is string => Boolean(m)));
  const peso = (p: PrendaRecepcion) => (p.marca?.id && delEnvio.has(p.marca.id) ? 0 : 1);
  return prendas
    .filter((p) => {
      if (palabras.length === 0) return true;
      const texto = textoBuscable(p);
      return palabras.every((w) => texto.includes(w));
    })
    .map((p, i) => ({ p, i }))
    .sort((a, b) => peso(a.p) - peso(b.p) || a.p.nombre.localeCompare(b.p.nombre, "es", { sensitivity: "base" }) || a.i - b.i)
    .map(({ p }) => p);
}
