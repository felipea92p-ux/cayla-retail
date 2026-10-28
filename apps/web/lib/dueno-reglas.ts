// De quién son las unidades que una pantalla ingresa, ajusta, vende o cuenta en una sede con dos empresas (ADR-0542). Lógica pura.
//
// LA REGLA (Felipe, 2026-10-27): en Tienda LIM lo indica la persona que hace la operación, con un botón; la marca y el proveedor no cuentan.
// SIN RESPUESTA DE FÁBRICA: una prenda en el dueño equivocado no se nota hasta tarde (misma razón que en ADR-0463).
//
// CÓMO VIAJA. Como el responsable (ADR-0162): en un encabezado de la llamada. `x-dueno` = la empresa de todo lo que mueve la llamada;
// `x-dueno-lineas` = {variante: empresa} cuando una misma venta mezcla dueños. El disparador de `movimientos` lo lee
// (`fn_dueno_de_la_llamada`); ninguna de las funciones que escriben movimientos cambió.

export const ENCABEZADO_DUENO = "x-dueno";
export const ENCABEZADO_DUENO_LINEAS = "x-dueno-lineas";

/** Una empresa que se puede elegir como dueña aquí. */
export type EmpresaElegible = { id: string; clave: string; nombre: string };

/** ¿Hay que preguntar de quién es? Solo donde operan dos empresas (hoy Lima). Sin lista (la base no respondió), no se pregunta: la base decide. */
export function hayQueElegirDueno(empresas: readonly EmpresaElegible[] | null | undefined): boolean {
  return !!empresas && empresas.length >= 2;
}

/** ¿Falta contestar? Pregunta pendiente = hay que elegir y todavía no se eligió una empresa que opere aquí. */
export function faltaElegirDueno(empresas: readonly EmpresaElegible[] | null | undefined, duenoId: string): boolean {
  return hayQueElegirDueno(empresas) && !empresas!.some((e) => e.id === duenoId);
}

/** Pone el dueño en una consulta de supabase-js (`.rpc(...)`), igual que `firmar`. Sin dueño, la consulta sale como antes. */
export function conDueno<C extends { setHeader(nombre: string, valor: string): C }>(consulta: C, duenoId: string | null | undefined): C {
  return duenoId ? consulta.setHeader(ENCABEZADO_DUENO, duenoId) : consulta;
}

/** Lo mismo para una venta con prendas de dueños distintos: `{variante: empresa}`. Vacío = sin encabezado. */
export function conDuenoPorLineas<C extends { setHeader(nombre: string, valor: string): C }>(consulta: C, lineas: Readonly<Record<string, string>>): C {
  return Object.keys(lineas).length > 0 ? consulta.setHeader(ENCABEZADO_DUENO_LINEAS, JSON.stringify(lineas)) : consulta;
}

// ---- El ticket de Vender ------------------------------------------------------------------------------------------------------------
// Una prenda con unidades de las dos empresas en Lima obliga a decir de cuál sale lo que se vende; una con unidades de una sola (o sin
// reparto) no pregunta nada: la base toma al único dueño. Lo que el reparto no dice (la base no respondió) tampoco pregunta.

/** Las unidades de un dueño de una prenda en la sede (lo que entrega `lib/stock-por-dueno-reglas.ts`). */
export type UnidadesDeDueno = { empresaId: string; clave: string; nombre: string; cantidad: number; cantidadApartada: number };

/** Los dueños entre los que hay que elegir para vender esta prenda, o `null` si no hay duda (menos de dos tienen unidades disponibles). */
export function duenosParaElegir(duenos: readonly UnidadesDeDueno[] | null | undefined): EmpresaElegible[] | null {
  const conUnidades = (duenos ?? []).filter((d) => d.cantidad - d.cantidadApartada > 0);
  return conUnidades.length >= 2 ? conUnidades.map((d) => ({ id: d.empresaId, clave: d.clave, nombre: d.nombre })) : null;
}

/** Las prendas del ticket (por variante, sin repetir) a las que todavía les falta elegir de quién sale. */
export function variantesSinDueno(
  variantesDelTicket: readonly string[],
  duenosPorVariante: Readonly<Record<string, readonly UnidadesDeDueno[]>> | null | undefined,
  elegido: Readonly<Record<string, string>>,
): string[] {
  const faltan: string[] = [];
  for (const v of new Set(variantesDelTicket)) {
    const opciones = duenosParaElegir(duenosPorVariante?.[v]);
    if (opciones && !opciones.some((o) => o.id === elegido[v])) faltan.push(v);
  }
  return faltan;
}

/** `{variante: empresa}` de las líneas de una venta ya armada (`p_items`): lo que viaja en `x-dueno-lineas`, también al subir desde la cola. */
export function duenoDeLasLineas(items: readonly { variante_id?: string | null; empresa_id?: string | null }[] | null | undefined): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const it of items ?? []) if (it.variante_id && it.empresa_id) mapa[it.variante_id] = it.empresa_id;
  return mapa;
}

// ---- Un conteo o un ajuste por líneas (Contar, ADR-0542) --------------------------------------------------------------------------
/**
 * Entre quiénes hay que elegir para una línea que sube o baja: si SUBE (se encontró más), de quién es lo que apareció; si BAJA, de quién
 * falta, y solo hay duda si de esa prenda hay unidades de las dos empresas. Sin dos empresas aquí, o sin cambio, no se pregunta.
 */
export function duenosParaAjustar(
  diferencia: number,
  empresas: readonly EmpresaElegible[] | null | undefined,
  duenosDeLaPrenda: readonly UnidadesDeDueno[] | null | undefined,
): EmpresaElegible[] | null {
  if (!hayQueElegirDueno(empresas)) return null;
  if (diferencia > 0) return [...empresas!];
  if (diferencia < 0) return duenosParaElegir(duenosDeLaPrenda);
  return null;
}
