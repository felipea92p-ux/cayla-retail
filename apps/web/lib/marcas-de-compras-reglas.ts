// La marca primero (ADR-0644, Felipe 2026-11-11): las listas de Compras dicen las MARCAS de cada compra como título y la razón social debajo.
// Las marcas llegan aparte (`fn_marcas_de_compras`): si la función no está o falla, el mapa viene vacío y la fila se ve como antes.
// Sin Supabase: lo importan el servidor y la pantalla.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_MARCAS_DE_COMPRAS = "fn_marcas_de_compras";

/** Las marcas de cada compra o papel, por su id. */
export type MarcasDeCompras = ReadonlyMap<string, readonly string[]>;

/** Lo que manda `fn_marcas_de_compras` (`[{ id, marcas }]`): ilegible o roto, un mapa vacío. */
export function leerMarcasDeCompras(data: unknown): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (!Array.isArray(data)) return mapa;
  for (const x of data) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || !Array.isArray(o.marcas)) continue;
    const marcas = o.marcas.filter((m): m is string => typeof m === "string" && m.trim() !== "");
    if (marcas.length > 0) mapa.set(o.id, marcas);
  }
  return mapa;
}

/**
 * El título de una compra por sus marcas: «Kero», «Kero · Lolita» y, de tres en adelante, «Kero y 2 más». `null` sin marcas (un papel de
 * servicios, una compra sin líneas por prenda): la fila sigue con la razón social.
 */
export function tituloDeCompra(marcas: readonly string[] | undefined): string | null {
  if (!marcas || marcas.length === 0) return null;
  if (marcas.length <= 2) return marcas.join(" · ");
  return `${marcas[0]} y ${marcas.length - 1} más`;
}

/** Los ids sin repetir, para pedir sus marcas de una vez (con el tope de la base). */
export function idsParaMarcas(ids: readonly string[], tope = 500): string[] {
  return [...new Set(ids)].slice(0, tope);
}
