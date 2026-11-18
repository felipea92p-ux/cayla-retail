import { CONCEPTOS_GASTO, type ConceptoGasto } from "./mi-plata-reglas";
import type { CambioHecho } from "./corregir-compra-reglas";
import { leerMontoPlata } from "./monto-plata-reglas";
import { soles } from "./compras-reglas";

// «Corregir un gasto de otra cosa» (ADR-0572, Felipe 2026-10-29): la compradora cambia lo que anotó mal de un gasto (Comida, Taxi, «Otro: Saco
// Piñata»…), mientras Compras no lo revise y su ronda siga abierta. Esta es la parte pura: leer lo que manda `fn_gasto_para_corregir`, decir qué
// cambió (lo mismo que escribe la base en su rastro: la guía no agrega reglas, ADR-0284), armar lo que se manda y la frase de qué pasa con su plata.

export const RPC_GASTO_PARA_CORREGIR = "fn_gasto_para_corregir";
export const RPC_CORREGIR_GASTO = "corregir_gasto_rapido";
export const RPC_GASTO_CORRECCIONES = "fn_gasto_correcciones";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const redondear = (n: number): number => Math.round(n * 100) / 100;
const esConcepto = (v: unknown): v is ConceptoGasto => typeof v === "string" && v in CONCEPTOS_GASTO;

/** El gasto tal como está hoy, con la respuesta de la base a «¿se puede corregir?». */
export type GastoParaCorregir = {
  id: string;
  concepto: ConceptoGasto;
  nota: string | null;
  monto: number;
  conFoto: boolean;
  fecha: string;
  sePuede: boolean;
  /** Por qué ya no (las claves son las de `fn_compra_gasto_corregible`), o nada si se puede. */
  motivo: string | null;
};

/** Lo que manda la base. Lo que no se entiende, `null`: nunca un gasto a medias. */
export function leerGastoParaCorregir(data: unknown): GastoParaCorregir | null {
  if (!esObjeto(data) || !esObjeto(data.gasto)) return null;
  const g = data.gasto;
  const id = texto(g.id);
  const monto = typeof g.monto === "number" ? g.monto : typeof g.monto === "string" ? Number(g.monto) : NaN;
  if (!id || !esConcepto(g.concepto) || !Number.isFinite(monto)) return null;
  return {
    id,
    concepto: g.concepto,
    nota: texto(g.nota),
    monto,
    conFoto: g.con_foto === true,
    fecha: texto(g.fecha) ?? "",
    sePuede: data.se_puede === true,
    motivo: texto(data.motivo),
  };
}

/** Por qué un gasto ya no se corrige, en palabras de tienda (las claves son las de `fn_compra_gasto_corregible`). */
export function textoMotivoGasto(motivo: string | null): string {
  switch (motivo) {
    case "revisado":
      return "Compras ya revisó este gasto: ya no se corrige desde aquí. Avísale a Compras.";
    case "ronda_cerrada":
      return "Este gasto es de una ronda que ya cerraste. Reábrela desde «Rondas anteriores» para corregirlo.";
    case "sin_ronda":
      return "Este gasto no es de ninguna ronda: avísale a Compras.";
    case "anulado":
      return "Este gasto se anuló: ya no se corrige.";
    default:
      return "Este gasto ya no se puede corregir.";
  }
}

/** Lo que la hoja escribe: lo mismo que «Gasté en otra cosa», salvo que parte de lo anotado. */
export type BorradorGasto = { concepto: ConceptoGasto; nota: string; monto: string };

export function borradorDelGasto(g: Pick<GastoParaCorregir, "concepto" | "nota" | "monto">): BorradorGasto {
  return { concepto: g.concepto, nota: g.nota ?? "", monto: g.monto.toFixed(2) };
}

/** La nota que cuenta: solo con «Otro» (con otro concepto, lo escrito antes no se manda). Sin nada, `null`. */
const notaDe = (b: Pick<BorradorGasto, "concepto" | "nota">): string | null => (b.concepto === "otro" ? b.nota.trim() || null : null);

/** Una línea de «lo que cambió»: el dato, cómo estaba y cómo queda. */
export type CambioDelGasto = { campo: "concepto" | "nota" | "monto" | "foto"; titulo: string; antes: string; ahora: string };

const nombreDeConcepto = (c: ConceptoGasto): string => CONCEPTOS_GASTO[c].nombre;

/**
 * Solo lo que cambió, en el orden de la hoja. `fotoNueva`: eligió otra foto (o sumó una). Lo mismo que la base escribe en su rastro; si el monto
 * escrito no se entiende, no cuenta como cambio (la hoja ya lo marca como problema).
 */
export function cambiosDelGasto(g: GastoParaCorregir, b: BorradorGasto, fotoNueva: boolean): CambioDelGasto[] {
  const lista: CambioDelGasto[] = [];
  if (b.concepto !== g.concepto) lista.push({ campo: "concepto", titulo: "En qué gastaste", antes: nombreDeConcepto(g.concepto), ahora: nombreDeConcepto(b.concepto) });
  const antesNota = g.nota;
  const ahoraNota = notaDe(b);
  if (ahoraNota !== antesNota) lista.push({ campo: "nota", titulo: "Qué fue", antes: antesNota ?? "nada", ahora: ahoraNota ?? "nada" });
  const monto = leerMontoPlata(b.monto);
  if (monto !== null && Math.abs(monto - g.monto) >= 0.005) lista.push({ campo: "monto", titulo: "Cuánto fue", antes: soles(g.monto), ahora: soles(monto) });
  if (fotoNueva) lista.push({ campo: "foto", titulo: "Foto del papel", antes: g.conFoto ? "con foto" : "sin foto", ahora: g.conFoto ? "otra foto" : "con foto" });
  return lista;
}

/** Cuánto sube (+) o baja (−) lo que tiene para comprar: restar un gasto más grande baja su plata. */
export function cambioDeLaPlata(g: Pick<GastoParaCorregir, "monto">, b: Pick<BorradorGasto, "monto">): number {
  const monto = leerMontoPlata(b.monto);
  return monto === null ? 0 : redondear(g.monto - monto);
}

/** Lo que pasa con su plata, en una frase. */
export function textoDeLaPlataDelGasto(plata: number): string {
  if (Math.abs(plata) < 0.005) return "Tu plata para comprar no cambia";
  return plata > 0 ? `Tu plata sube ${soles(plata)}` : `Tu plata baja ${soles(-plata)}`;
}

/** El botón dice lo que va a pasar. */
export function fraseCorregirGasto(cambios: number): string {
  return cambios === 0 ? "Guardar cambios" : cambios === 1 ? "Guardar 1 cambio" : `Guardar ${cambios} cambios`;
}

/** Lo que se manda a `corregir_gasto_rapido`. `ruta`: la foto recién subida; sin ella, la que tenía se queda. */
export function argumentosParaCorregir(g: GastoParaCorregir, b: BorradorGasto, lote: string, ruta: string | null) {
  return {
    p_gasto_id: g.id,
    p_lote: lote,
    p_concepto: b.concepto,
    p_nota: notaDe(b),
    p_monto: leerMontoPlata(b.monto) ?? g.monto,
    p_foto_ruta: ruta,
  };
}

/** Un cambio del rastro de un gasto en una frase: «Cuánto fue: S/ 4.00 → S/ 14.00». */
export function textoDeCambioGasto(c: CambioHecho): string {
  const ver = (v: string | null): string => {
    if (v == null) return c.campo === "foto" ? "sin foto" : "nada";
    if (c.campo === "monto") return Number.isFinite(Number(v)) ? soles(Number(v)) : v;
    if (c.campo === "concepto") return esConcepto(v) ? nombreDeConcepto(v) : v;
    if (c.campo === "foto") return "con foto";
    return v;
  };
  const dato = c.campo === "concepto" ? "en qué gastó" : c.campo === "nota" ? "qué fue" : c.campo === "monto" ? "cuánto fue" : c.campo === "foto" ? "foto del papel" : c.campo;
  return `${dato}: ${ver(c.antes)} → ${ver(c.despues)}`;
}
