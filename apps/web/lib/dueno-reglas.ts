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
