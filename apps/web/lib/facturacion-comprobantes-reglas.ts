import type { Comprobante, SerieComprobante, TipoComprobante } from "./comprobantes-reglas";
import { ETIQUETA_TIPO } from "./comprobantes-reglas";

// Reglas de la vista Comprobantes (spec §6 y §9, ADR-0124): qué series le faltan a cada tienda,
// cuánto se facturó de verdad este mes y por qué una fila dice lo que dice. Puras y sin servidor.

/** «Tienda Lima» → «Lima»: como la gente nombra la tienda cuando habla de sus series. */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/^tienda\s+/i, "");
}

/** Los tipos que cada TIENDA debe tener registrados: boleta y factura para vender, y nota de crédito
 *  para las devoluciones (ADR-0100: aprobar una devolución de un comprobante aceptado emite una nota
 *  de crédito y, sin serie, la devolución no se puede aprobar). Las notas de débito no se emiten. */
export const TIPOS_CON_SERIE: TipoComprobante[] = ["boleta", "factura", "nota_credito"];

export type GrupoSeriesFaltantes = { tipo: TipoComprobante; tiendas: { id: string; nombre: string }[] };

/** Las series que faltan, agrupadas por tipo (en el orden boleta, factura, nota de crédito) y con
 *  las tiendas a las que les falta. Solo las tiendas emiten: el Taller y los almacenes nunca
 *  necesitan una serie. Un tipo con todas sus tiendas al día no aparece. */
export function seriesFaltantes(
  series: Pick<SerieComprobante, "ubicacion_id" | "tipo">[],
  ubicaciones: { id: string; nombre: string; tipo: "tienda" | "almacen" | "taller" }[]
): GrupoSeriesFaltantes[] {
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda");
  const registradas = new Set(series.map((s) => `${s.ubicacion_id}|${s.tipo}`));
  return TIPOS_CON_SERIE.map((tipo) => ({
    tipo,
    tiendas: tiendas.filter((t) => !registradas.has(`${t.id}|${tipo}`)).map(({ id, nombre }) => ({ id, nombre })),
  })).filter((g) => g.tiendas.length > 0);
}

/** «Trujillo, Arequipa y Lima». */
function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «Faltan 3 series: nota de crédito en Trujillo, Arequipa y Lima.» (vacío si no falta ninguna). */
export function textoDeSeriesFaltantes(grupos: GrupoSeriesFaltantes[]): string {
  const cuantas = grupos.reduce((suma, g) => suma + g.tiendas.length, 0);
  if (cuantas === 0) return "";
  const detalle = grupos.map((g) => `${ETIQUETA_TIPO[g.tipo].toLowerCase()} en ${listaConY(g.tiendas.map((t) => nombreCorto(t.nombre)))}`).join("; ");
  return `${cuantas === 1 ? "Falta 1 serie" : `Faltan ${cuantas} series`}: ${detalle}.`;
}

const aCentimos = (n: number) => Math.round(n * 100) / 100;

/** Cuánto vale de verdad lo emitido en el mes. «Monto facturado» solo suma lo aceptado por SUNAT
 *  en producción y sin baja en trámite: un comprobante de prueba tiene número y PDF pero no vale
 *  como comprobante de pago, y uno por enviar todavía no es de nadie. Esos dos se cuentan aparte
 *  para decirlos en la tarjeta. `cuantosDePrueba` cuenta los transmitidos al sandbox, en el estado
 *  que estén. */
export function montosDelMes(comprobantes: Comprobante[]): { facturado: number; deprueba: number; sinEnviar: number; cuantosDePrueba: number } {
  let facturado = 0;
  let deprueba = 0;
  let sinEnviar = 0;
  let cuantosDePrueba = 0;
  for (const c of comprobantes) {
    const total = Number(c.total);
    if (c.entorno_transmision === "sandbox") cuantosDePrueba += 1;
    if (c.estado === "aceptado" && c.entorno_transmision === "produccion" && c.anulacion_solicitada_at === null) facturado += total;
    if (c.estado === "aceptado" && c.entorno_transmision === "sandbox") deprueba += total;
    if (c.estado === "pendiente" || c.estado === "rechazado") sinEnviar += total;
  }
  return { facturado: aCentimos(facturado), deprueba: aCentimos(deprueba), sinEnviar: aCentimos(sinEnviar), cuantosDePrueba };
}

/** La línea que va bajo el estado de una fila: por qué se rechazó, por qué se liberó o por qué se
 *  anuló. `esRechazo` pide pintarla en rojo (solo el rechazo de SUNAT; sin motivo no se inventa uno). */
export function motivoDelComprobante(c: Comprobante): { motivo: string | null; esRechazo: boolean } {
  const motivo = c.estado === "rechazado" && c.motivo_rechazo ? c.motivo_rechazo : c.estado === "no_emitido" ? c.motivo_no_emitido : c.motivo_anulacion;
  return { motivo, esRechazo: c.estado === "rechazado" && !!c.motivo_rechazo };
}
