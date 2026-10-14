import { soles } from "./compras-reglas";

// Lo «no deducible» (ADR-0362, fase 6 · actividad 6; decisiones 55, 56, 57, 68 y 70). La regla vive en la base
// (`retail.fn_pago_no_bancarizado` y `retail.fn_no_deducibles`, 20261014002000); aquí está su espejo para AVISAR antes de pagar —la base
// no frena el pago: Felipe eligió dejarlo pasar marcado (decisión 56)— y cómo se dice en pantalla lo que la base responde de lo ya pagado.
//
// La regla, en palabras: en un comprobante de S/ 2 000 o más (su TOTAL, aunque se pague en partes), lo que se paga en efectivo o sale de
// un fondo por rendir (con cualquier medio: el Yape personal de quien compra no es bancarización de CAYLA, decisión 57) no cuenta para
// impuestos y su IGV se pierde. Y lo que pasa el tope diario de la planilla de movilidad, por persona y por día, tampoco (decisión 68; sin
// tope, que lo fija el contador, no se marca nada).

/** S/ 2 000: desde aquí un pago tiene que pasar por el banco (Ley 28194, D. Leg. 1529). El mismo número que `fn_pago_no_bancarizado`. */
export const UMBRAL_BANCARIZACION = 2000;

/** La regla de la bancarización, igual que `retail.fn_pago_no_bancarizado`: el total es el del COMPROBANTE, no el del pago. */
export function pagoNoBancarizado(total: number | null | undefined, medio: string | null | undefined, tipoCuenta: string | null | undefined): boolean {
  const t = typeof total === "number" && Number.isFinite(total) ? total : 0;
  return t >= UMBRAL_BANCARIZACION && (medio === "efectivo" || tipoCuenta === "fondo");
}

/** Una línea de pago tal como está en el formulario: el monto como se escribió, el medio y el tipo de la cuenta de donde sale. */
export type LineaParaAviso = { monto: string | number; medio: string; tipoCuenta?: string | null };

export type AvisoBancarizacion = { monto: number; titulo: string; texto: string };

/** La frase del aviso al pagar (en lenguaje de tienda: sin «bancarización» ni «crédito fiscal»). */
export const TEXTO_AVISO_BANCARIZACION =
  "SUNAT pide que un comprobante de S/ 2,000 o más se pague por el banco. Lo que se paga en efectivo o desde un fondo no cuenta para " +
  "impuestos y su IGV se pierde. Puedes pagar igual: queda marcado.";

const montoDe = (v: string | number): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v.replace(/[S/\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * El aviso al pagar: cuánto de lo que se va a pagar queda «no deducible», o null si nada. `total` es el del comprobante (o el monto del
 * gasto del viaje, que es su papel entero). Con una línea sin monto todavía no avisa por ella.
 */
export function avisoBancarizacion(total: number | null | undefined, lineas: readonly LineaParaAviso[]): AvisoBancarizacion | null {
  if (typeof total !== "number" || !Number.isFinite(total) || total < UMBRAL_BANCARIZACION) return null;
  let monto = 0;
  for (const l of lineas) {
    const n = montoDe(l.monto);
    if (n > 0 && pagoNoBancarizado(total, l.medio, l.tipoCuenta ?? null)) monto += n;
  }
  monto = Math.round(monto * 100) / 100;
  if (monto <= 0) return null;
  return {
    monto,
    titulo: `${soles(monto)} quedan «no deducibles»`,
    texto: TEXTO_AVISO_BANCARIZACION,
  };
}

/**
 * «Pagar juntos»: un pago que se reparte en cascada entre varios comprobantes del mismo proveedor (`registrar_pago_compras_medios`). Lo
 * que queda no deducible depende de a qué comprobante va cada medio, así que se avisa con un tope honesto: si todos los comprobantes que
 * reciben plata son de S/ 2 000 o más, es todo lo que va en efectivo o desde un fondo; si solo algunos, «hasta» lo menor entre eso y lo
 * que reciben los grandes.
 */
export function avisoBancarizacionLote(
  aplicaciones: readonly { total: number; monto: number }[],
  lineas: readonly LineaParaAviso[],
): AvisoBancarizacion | null {
  const conPlata = aplicaciones.filter((a) => a.monto > 0);
  const aGrandes = Math.round(conPlata.filter((a) => a.total >= UMBRAL_BANCARIZACION).reduce((s, a) => s + a.monto, 0) * 100) / 100;
  if (aGrandes <= 0) return null;
  const fuera = Math.round(lineas.reduce((s, l) => s + (l.medio === "efectivo" || l.tipoCuenta === "fondo" ? Math.max(0, montoDe(l.monto)) : 0), 0) * 100) / 100;
  if (fuera <= 0) return null;
  const todos = conPlata.every((a) => a.total >= UMBRAL_BANCARIZACION);
  const monto = todos ? fuera : Math.min(fuera, aGrandes);
  const base = avisoBancarizacion(UMBRAL_BANCARIZACION, [{ monto, medio: "efectivo" }]);
  if (!base) return null;
  return todos ? base : { ...base, titulo: `Hasta ${soles(monto)} quedan «no deducibles»` };
}

// ---------- Lo que responde la base de lo ya pagado ----------

export const RPC_NO_DEDUCIBLES = "fn_no_deducibles";

export type MotivoNoDeducible = "bancarizacion" | "planilla_tope";

export type NoDeducible = {
  clave: string;
  motivo: MotivoNoDeducible;
  /** Lo que no cuenta para impuestos: el pago entero (bancarización) o lo que pasa el tope (planilla). */
  monto: number;
  /** El total que se miró: el del comprobante (bancarización) o lo que suman las planillas de esa persona ese día. */
  total: number;
  /** El umbral (S/ 2 000) o el tope diario que regía ese día. */
  tope: number;
};

/** Las claves del libro que la base sabe responder: pagos a proveedores, pagos del Taller y gastos (del viaje). */
export function clavesQueSePreguntan(claves: readonly string[]): string[] {
  return [...new Set(claves.filter((c) => /^(pago|pagoprod|gasto):[0-9a-f-]{36}$/i.test(c)))];
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Las filas de `fn_no_deducibles`, por clave. Una fila sin clave o con un motivo que no se conoce no se puede mostrar: se descarta. */
export function leerNoDeducibles(data: unknown): Map<string, NoDeducible> {
  const m = new Map<string, NoDeducible>();
  for (const f of Array.isArray(data) ? (data as Record<string, unknown>[]) : []) {
    const clave = typeof f?.clave === "string" ? f.clave : "";
    const motivo = f?.motivo;
    if (!clave || (motivo !== "bancarizacion" && motivo !== "planilla_tope")) continue;
    m.set(clave, { clave, motivo, monto: num(f.monto), total: num(f.total), tope: num(f.tope) });
  }
  return m;
}

/**
 * Cómo se dice en una fila. `etiqueta` va en la insignia («No deducible», o con el monto si es solo una parte); `porque` es la razón, a
 * la vista bajo la fila (nunca solo al pasar el mouse).
 */
export function textoNoDeducible(nd: NoDeducible, montoDeLaFila?: number): { etiqueta: string; porque: string } {
  const parte = montoDeLaFila !== undefined && Math.abs(Math.abs(montoDeLaFila) - nd.monto) >= 0.005;
  const etiqueta = parte ? `No deducible: ${soles(nd.monto)}` : "No deducible";
  if (nd.motivo === "planilla_tope") {
    return { etiqueta, porque: `Pasa el tope diario de la planilla de movilidad (${soles(nd.tope)} por persona): ese día suman ${soles(nd.total)}.` };
  }
  return { etiqueta, porque: `Comprobante de ${soles(nd.total)} pagado en efectivo o desde un fondo: SUNAT lo pide por el banco.` };
}
