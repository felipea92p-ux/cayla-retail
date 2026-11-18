import { CANTIDAD_ILEGIBLE, cantidadTexto, leerCantidad, type TipoMovInsumo, type UnidadInsumo } from "./insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, leerCostoUnitario } from "./monto-plata-reglas";

// «Corregir o eliminar un ingreso» de Insumos (ADR-0570, actividad 6a; Felipe 2026-10-29: «que me permita editar con facilidad, también eliminar con historial de cambio y comentario»).
// Reglas puras, sin React ni red; la hoja las usa para decir de antemano lo que la base (`corregir_ingreso_insumo`, `eliminar_ingreso_insumo`, migración 20261030134000) ya rechazaría.
//
// CONTRATO
//   PROMETE: `motivoParaNoTocarIngreso` dice, con las mismas palabras que la base (`fn_ingreso_insumo_corregible`), por qué un lote que ya se usó no se toca; `problemasDelIngreso` rechaza lo mismo que
//            la base (cantidad mayor que cero con hasta dos decimales, costo que se lee, día que no sea de mañana, textos de hasta 40 letras) y NUNCA rechaza lo que la persona no tocó (un ingreso de
//            después de las 7 p. m. quedó con el día de mañana en UTC; una cantidad con tres decimales viene de otra puerta); `cambiosDelIngreso` dice qué cambió de verdad.
//   ASUME:   `original` es lo que la pantalla leyó del lote al abrir la hoja; la base compara la cantidad con la que tenga en ese momento (`ingreso_cambio_mientras_tanto`) y es la última palabra.
//   NO HACE: no conoce si el lote llegó con una factura u orden recibida (esa pregunta la hace la base al intentar, y `traducirError` la muestra tal cual); no decide quién puede (es del líder).

export const RPC_CORREGIR_INGRESO = "corregir_ingreso_insumo";
export const RPC_ELIMINAR_INGRESO = "eliminar_ingreso_insumo";
export const RPC_RESTAURAR_INGRESO = "restaurar_ingreso_insumo";
export const RPC_INGRESOS_ELIMINADOS = "fn_ingresos_eliminados";

/** @internal Lo que la base repite en `fn_ingreso_insumo_motivo` y en los CHECK de `insumo_lote_cambios`; la prueba lo cruza con la migración. */
export const MAX_MOTIVO_INGRESO = 300;
/** @internal El documento y el código de lote: hasta 40 letras, como en la hoja de «Ingresar insumo» y en la base. */
export const MAX_TEXTO_INGRESO = 40;

/** Lo que pasa casi siempre, a un toque; lo demás se escribe. Las tres primeras corrigen, las dos últimas son para eliminar. */
export const MOTIVOS_CORREGIR_INGRESO = ["Cantidad equivocada", "Costo equivocado", "Día equivocado", "Era de otro color", "Se anotó dos veces"] as const;
export const MOTIVOS_RESTAURAR_INGRESO = ["Se eliminó por error"] as const;

/** La frase de la base cuando de un lote ya salió material (`fn_ingreso_insumo_corregible`): la hoja no la contradice. */
export const MOTIVO_LOTE_USADO = "De este lote ya salió material: lo que entró ya no se cambia. Corrige primero lo que se anotó en la orden.";

/** Lo que de un lote se puede cambiar, como lo lee la pantalla. `costo` es `null` cuando quien mira no ve dinero. */
export type IngresoEditable = { cantidad: number; costo: number | null; fecha: string; documento: string | null; codigo: string | null };

/** Lo escrito en la hoja, tal cual (texto). */
export type EscritoDelIngreso = { cantidad: string; costo: string; fecha: string; documento: string; codigo: string };

/** `null` si el lote se puede tocar desde aquí; si no, la frase para quien lee la hoja. Un lote «se usó» cuando tiene un consumo, una merma o una devolución. */
export function motivoParaNoTocarIngreso(movimientosDelLote: readonly { tipo: TipoMovInsumo }[]): string | null {
  return movimientosDelLote.some((m) => m.tipo === "consumo" || m.tipo === "merma" || m.tipo === "devolucion") ? MOTIVO_LOTE_USADO : null;
}

/** La cantidad como se escribe en el campo: «9», «7.5». */
export function cantidadComoEscrita(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** El costo como se escribe en el campo, de modo que `leerCostoUnitario` lo lea de vuelta igual: a céntimos si alcanza («12.50»), con cuatro decimales si no («11.1111»). Tres decimales serían ambiguos con miles. */
export function costoComoEscrito(n: number): string {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n.toFixed(2) : n.toFixed(4);
}

/** Lo escrito para empezar: el lote tal como está. */
export function escritoDeFabrica(o: IngresoEditable): EscritoDelIngreso {
  return { cantidad: cantidadComoEscrita(o.cantidad), costo: o.costo === null ? "" : costoComoEscrito(o.costo), fecha: o.fecha, documento: o.documento ?? "", codigo: o.codigo ?? "" };
}

/** La cantidad que dice el campo. Si no se tocó, es la del lote aunque tenga tres decimales (otra puerta los permite y este campo solo escribe dos): nunca se rechaza lo que la persona no cambió. */
export function leerCantidadDelIngreso(texto: string, original: IngresoEditable): number | null {
  if (texto.trim() === cantidadComoEscrita(original.cantidad)) return original.cantidad;
  return leerCantidad(texto);
}

/** El costo que dice el campo; si no se tocó, el del lote. Vacío o ilegible, `null`. */
export function leerCostoDelIngreso(texto: string, original: IngresoEditable): number | null {
  if (original.costo !== null && texto.trim() === costoComoEscrito(original.costo)) return original.costo;
  return leerCostoUnitario(texto);
}

const TEXTO_LARGO = `El documento y el código de lote: hasta ${MAX_TEXTO_INGRESO} letras.`;

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. */
export function problemasDelIngreso(e: EscritoDelIngreso, original: IngresoEditable, opciones: { veCostos: boolean; hoy: string }): string[] {
  const problemas: string[] = [];
  const cantidad = leerCantidadDelIngreso(e.cantidad, original);
  if (e.cantidad.trim() === "" || cantidad === null) problemas.push(CANTIDAD_ILEGIBLE);
  else if (!(cantidad > 0)) problemas.push("La cantidad tiene que ser mayor que cero. Si el ingreso entero fue un error, usa «Eliminar».");
  if (opciones.veCostos) {
    if (e.costo.trim() === "") problemas.push("Escribe el costo por unidad (puede ser 0).");
    else if (leerCostoDelIngreso(e.costo, original) === null) problemas.push(COSTO_UNITARIO_ILEGIBLE);
  }
  if (e.fecha === "") problemas.push("Elige el día en que llegó.");
  else if (e.fecha !== original.fecha && e.fecha > opciones.hoy) problemas.push("El día del ingreso no puede ser de mañana.");
  if (e.documento.trim().length > MAX_TEXTO_INGRESO || e.codigo.trim().length > MAX_TEXTO_INGRESO) problemas.push(TEXTO_LARGO);
  return problemas;
}

/** Lo escrito ya leído, para mandarlo a la base; `null` si todavía hay algo que arreglar. */
export function ingresoLeido(e: EscritoDelIngreso, original: IngresoEditable, opciones: { veCostos: boolean; hoy: string }): IngresoEditable | null {
  if (problemasDelIngreso(e, original, opciones).length > 0) return null;
  const cantidad = leerCantidadDelIngreso(e.cantidad, original);
  if (cantidad === null) return null;
  return {
    cantidad,
    costo: opciones.veCostos ? leerCostoDelIngreso(e.costo, original) : original.costo,
    fecha: e.fecha,
    documento: e.documento.trim() || null,
    codigo: e.codigo.trim() || null,
  };
}

export type CambiosDelIngreso = { cantidad: boolean; costo: boolean; fecha: boolean; documento: boolean; codigo: boolean; alguno: boolean };

/** Qué cambió de verdad entre el lote y lo que se escribió (lo vacío y `null` son lo mismo, y espacios de más no cuentan). */
export function cambiosDelIngreso(original: IngresoEditable, nuevo: IngresoEditable): CambiosDelIngreso {
  const texto = (v: string | null) => (v ?? "").trim();
  const c = {
    cantidad: nuevo.cantidad !== original.cantidad,
    costo: nuevo.costo !== null && original.costo !== null && Math.abs(nuevo.costo - original.costo) > 1e-9,
    fecha: nuevo.fecha !== original.fecha,
    documento: texto(nuevo.documento) !== texto(original.documento),
    codigo: texto(nuevo.codigo) !== texto(original.codigo),
  };
  return { ...c, alguno: c.cantidad || c.costo || c.fecha || c.documento || c.codigo };
}

/** «9 m → 7 m · costo · día»: lo que cambió, para el aviso de «listo». */
export function resumenDeCambios(original: IngresoEditable, nuevo: IngresoEditable, unidad: UnidadInsumo): string {
  const c = cambiosDelIngreso(original, nuevo);
  return [
    c.cantidad ? `${cantidadTexto(original.cantidad, unidad)} → ${cantidadTexto(nuevo.cantidad, unidad)}` : null,
    c.costo ? "costo" : null,
    c.fecha ? "día" : null,
    c.documento || c.codigo ? "documento o código" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** El motivo: obligatorio, hasta 300 letras (la base repite: `ingreso_sin_motivo`, `ingreso_motivo_largo`). */
export function problemaDeMotivoIngreso(motivo: string): string | null {
  if (motivo.trim() === "") return "Cuenta por qué: queda en la historia del ingreso.";
  if (motivo.trim().length > MAX_MOTIVO_INGRESO) return `El motivo es muy largo: hasta ${MAX_MOTIVO_INGRESO} letras.`;
  return null;
}
