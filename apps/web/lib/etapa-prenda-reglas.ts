// Las tres etapas de una prenda del Taller (ADR-0614, actividad 14; ADR-0551, decisión 8 y D). La etapa la decide la base
// (`fn_productos_por_etapa`); aquí solo se aplica a lo que la web ya tiene en memoria. Lo que no aparece en la lista, se muestra: un
// modelo sin orden, uno que ya está en una tienda y, si la lectura falló (`null`), todos. Nunca se esconde una prenda por no saber.

export type EtapaOculta = "en_produccion" | "terminada";
export type EtapasOcultas = ReadonlyMap<string, EtapaOculta> | null;

/** La respuesta de `fn_productos_aun_no_en_tienda`, sin lo que no se reconoce (una etapa desconocida no esconde nada). */
export function etapasDesdeFilas(filas: readonly { producto_id: string; etapa: string }[]): Map<string, EtapaOculta> {
  const etapas = new Map<string, EtapaOculta>();
  for (const f of filas) if (f.etapa === "en_produccion" || f.etapa === "terminada") etapas.set(f.producto_id, f.etapa);
  return etapas;
}

/** Vender, Apartados, Cambios y Buscar: solo se ofrece lo que ya llegó a una tienda. Lo oculto nunca tiene stock en una tienda. */
export function soloLasQueLlegaron<T extends { productoId: string }>(catalogo: readonly T[], etapas: EtapasOcultas): T[] {
  if (!etapas) return [...catalogo];
  return catalogo.filter((v) => !etapas.has(v.productoId));
}

/** Existencias: lo terminado sí se ve (el Taller lo tiene); solo se quita lo que todavía no es prenda. */
export function sinLasEnProduccion<T extends { id: string }>(productos: readonly T[], etapas: EtapasOcultas): T[] {
  if (!etapas) return [...productos];
  return productos.filter((p) => etapas.get(p.id) !== "en_produccion");
}
