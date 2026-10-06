import "server-only";

// Análisis v4 (ADR-0356): «Lo que más rinde» por categoría en 90 días. PROVISIONAL: vacío hasta la actividad 5.

export async function getRindePorCategoria(ubicacionId: string): Promise<{ rinde: { categoria: string; porSol: number }[]; falla: string | null }> {
  return { rinde: [], falla: ubicacionId ? null : "Falta la tienda" };
}
