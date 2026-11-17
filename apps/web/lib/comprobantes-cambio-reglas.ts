import type { Comprobante } from "./comprobantes-reglas";
import { textoDelNumero } from "./facturacion-actividad";

// Los documentos de un cambio en Facturación (ADR-0671). Un cambio con diferencia deja dos documentos colgados del cambio
// (`comprobantes.cambio_id`): su comprobante nuevo, SIN venta, y su nota de crédito sobre la original. Sin esto, Facturación
// mostraba una boleta suelta («Cliente varios», sin «Ver la venta»), leía la nota del cambio como una devolución («Se devolvió») y
// le apagaba Posventa a la boleta original por una sola prenda cambiada. Aquí se decide cómo se leen: de dónde salen, que la nota
// del cambio no es una devolución y a qué venta lleva «Ver la venta». Puras y sin servidor; la lectura vive en `comprobantes.ts`
// (`getExtrasDeComprobantes`), que solo junta las filas y llama a `armarExtras`.

/** Un comprobante enlazado, con su número como se escribe en todo Facturación (`B004-000031`). */
export type DocEnlazado = { id: string; numero: string };

/** De dónde sale un documento de un cambio: la original del cambio (`null` si no se pudo leer), su venta y la sede de esa venta. El
 *  comprobante nuevo nace en la sede del CAMBIO, que puede ser otra: «Ver la venta» dice e imprime la sede de la venta, no la suya. */
export type DocDelCambio = { original: DocEnlazado | null; ventaId: string | null; ubicacionId: string | null };

/** Lo que conecta cada comprobante con el resto del ERP (2026-09-26; los cambios, ADR-0671): su venta, el WhatsApp del cliente,
 *  las notas de crédito que lo corrigen (o el comprobante que corrige una nota), la devolución que la originó y el cambio del que sale. */
export type ExtraComprobante = {
  telefono: string | null;
  /** La nota de crédito que corrige a este comprobante y NO sale de un cambio (una devolución, un pedido web): con ella ya se devolvió,
   *  y Posventa se apaga. */
  notaDeCredito: DocEnlazado | null;
  /** Las notas de crédito de los cambios sobre este comprobante (ADR-0671): una prenda cambiada no es una devolución y no apaga Posventa. */
  notasDeCambio: DocEnlazado[];
  /** Si este es una nota de crédito: el comprobante que corrige. */
  corrige: DocEnlazado | null;
  /** La devolución que emitió la nota (en una nota) o que se hizo sobre este comprobante (en el original). */
  devolucionId: string | null;
  /** Si este documento sale de un cambio (su comprobante nuevo o su nota): la original y su venta. `null` en todo lo demás. */
  cambio: DocDelCambio | null;
};

/** Un comprobante leído para encontrar la original de un cambio: por su id (lo que corrige la nota del cambio) o por su venta. */
export type CandidatoOriginal = {
  id: string;
  serie: string;
  numero: number;
  venta_id: string | null;
  /** La sede de la original: la de su venta. */
  ubicacion_id?: string | null;
  tipo?: string;
  estado?: string;
  created_at?: string;
  es_anticipo?: boolean | null;
};

const TIPOS_ORIGINAL = new Set(["boleta", "factura", "nota_venta"]);
const MUERTO = new Set(["anulado", "no_emitido"]);

/** La original de una venta, con la MISMA regla de `retail.fn_original_del_cambio`: boleta, factura o nota de venta, nunca un
 *  anticipo de apartado; la viva primero y, entre iguales, la más reciente. `null` si la venta no tiene ninguna. */
export function originalDeLaVenta(candidatos: readonly CandidatoOriginal[]): CandidatoOriginal | null {
  const validos = candidatos.filter((c) => TIPOS_ORIGINAL.has(c.tipo ?? "") && !c.es_anticipo);
  validos.sort((a, b) => {
    const muertoA = MUERTO.has(a.estado ?? "") ? 1 : 0;
    const muertoB = MUERTO.has(b.estado ?? "") ? 1 : 0;
    if (muertoA !== muertoB) return muertoA - muertoB;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
  return validos[0] ?? null;
}

/**
 * De dónde sale cada cambio de la lista. La nota de crédito del cambio dice su original con certeza (`comprobante_original_id`); si la
 * nota todavía no sale (la original no está aceptada) o el cambio vino de una nota de venta (sin nota de crédito), se busca por la venta
 * del cambio (`cambios → venta_items → venta_id`) con la regla de la base. La venta, para «Ver la venta», es la del cambio o, si no se
 * pudo leer, la de la original.
 */
export function documentosDeLosCambios(
  cambioIds: readonly string[],
  notasDeLosCambios: readonly { cambio_id: string | null; comprobante_original_id: string | null }[],
  ventaDelCambio: ReadonlyMap<string, string>,
  candidatos: readonly CandidatoOriginal[],
): Map<string, DocDelCambio> {
  const originalDeNota = new Map<string, string>();
  for (const n of notasDeLosCambios) if (n.cambio_id && n.comprobante_original_id) originalDeNota.set(n.cambio_id, n.comprobante_original_id);
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const resultado = new Map<string, DocDelCambio>();
  for (const cambioId of new Set(cambioIds)) {
    const venta = ventaDelCambio.get(cambioId) ?? null;
    const idDeNota = originalDeNota.get(cambioId);
    const original = idDeNota ? (porId.get(idDeNota) ?? null) : venta ? originalDeLaVenta(candidatos.filter((c) => c.venta_id === venta)) : null;
    resultado.set(cambioId, {
      original: original ? { id: original.id, numero: textoDelNumero(original) } : null,
      ventaId: venta ?? original?.venta_id ?? null,
      ubicacionId: original?.ubicacion_id ?? null,
    });
  }
  return resultado;
}

/** Una nota de crédito leída sobre un comprobante de la lista (de cualquier mes). `cambio_id` es `null` antes de la migración. */
export type NotaLeida = { id: string; serie: string; numero: number; comprobante_original_id: string | null; cambio_id: string | null };

export type LecturasDeExtras = {
  /** El WhatsApp de cada ficha de cliente, por DNI. */
  telefonos: ReadonlyMap<string, string>;
  /** Las notas de crédito que corrigen a comprobantes de la lista. */
  notas: readonly NotaLeida[];
  /** Los comprobantes que corrigen las notas de la lista (para decir «Corrige B001-…»). */
  originales: readonly { id: string; serie: string; numero: number }[];
  /** La devolución que emitió cada nota de crédito, por id de la nota. */
  devolucionDeNota: ReadonlyMap<string, string>;
  /** De dónde sale cada cambio de la lista, por id de cambio (`documentosDeLosCambios`). */
  cambios: ReadonlyMap<string, DocDelCambio>;
};

/** Junta lo leído en el extra de cada fila. Una nota que sale de un cambio va a `notasDeCambio`, nunca a `notaDeCredito`: la boleta
 *  original no pasa a «se devolvió» ni pierde Posventa por una prenda cambiada. */
export function armarExtras(filas: readonly Comprobante[], l: LecturasDeExtras): Record<string, ExtraComprobante> {
  const notaDe = new Map<string, DocEnlazado>();
  const deCambio = new Map<string, DocEnlazado[]>();
  for (const n of l.notas) {
    if (!n.comprobante_original_id) continue;
    const doc = { id: n.id, numero: textoDelNumero(n) };
    if (n.cambio_id) deCambio.set(n.comprobante_original_id, [...(deCambio.get(n.comprobante_original_id) ?? []), doc]);
    else notaDe.set(n.comprobante_original_id, doc);
  }
  const originalPorId = new Map(l.originales.map((o) => [o.id, textoDelNumero(o)]));

  return Object.fromEntries(
    filas.map((c) => {
      const nc = notaDe.get(c.id) ?? null;
      const corrige = c.comprobante_original_id ? { id: c.comprobante_original_id, numero: originalPorId.get(c.comprobante_original_id) ?? "otro mes" } : null;
      const devolucionId = c.tipo === "nota_credito" ? (l.devolucionDeNota.get(c.id) ?? null) : nc ? (l.devolucionDeNota.get(nc.id) ?? null) : null;
      let cambio: DocDelCambio | null = null;
      if (c.cambio_id) {
        const leido = l.cambios.get(c.cambio_id) ?? { original: null, ventaId: null, ubicacionId: null };
        // La nota del cambio ya sabe qué corrige: si la lectura del cambio no lo trajo, vale el que dice la nota. Y nace en la sede de su
        // original (`fn_emitir_nota_del_cambio`): su propia sede es la de la venta. El comprobante nuevo no: nace en la sede del cambio.
        const original = leido.original ?? (corrige && originalPorId.has(corrige.id) ? corrige : null);
        const ubicacionId = leido.ubicacionId ?? (c.tipo === "nota_credito" ? c.ubicacion_id : null);
        cambio = { original, ventaId: leido.ventaId, ubicacionId };
      }
      const notasDeCambio = [...(deCambio.get(c.id) ?? [])].sort((a, b) => a.numero.localeCompare(b.numero));
      const extra: ExtraComprobante = {
        telefono: c.cliente_num_doc ? (l.telefonos.get(c.cliente_num_doc) ?? null) : null,
        notaDeCredito: nc,
        notasDeCambio,
        corrige,
        devolucionId,
        cambio,
      };
      return [c.id, extra];
    }),
  );
}

/** De qué comprobante sale un documento de un cambio, con las mismas palabras en la fila, en su búsqueda y en la hoja: «Cambio de
 *  B004-000031», o «De un cambio» si la original no se pudo leer. */
export function textoDelCambio(cambio: DocDelCambio): string {
  return cambio.original ? `Cambio de ${cambio.original.numero}` : "De un cambio";
}

/** Una línea bajo el número de la fila: qué la enlaza con otro comprobante. `cambio` va con las flechas del cambio; `nota`, con el eslabón. */
export type VinculoDeFila = { tipo: "nota" | "cambio"; texto: string };

/** Las líneas de enlace de una fila, en el orden en que se dibujan (y se buscan). Un documento de un cambio dice de qué comprobante
 *  sale («Cambio de B004-000031»), nunca «Corrige»: es la mitad de un cambio, no una corrección suelta. */
export function vinculosDeFila(extra: ExtraComprobante | undefined): VinculoDeFila[] {
  if (!extra) return [];
  const vinculos: VinculoDeFila[] = [];
  if (extra.cambio) vinculos.push({ tipo: "cambio", texto: textoDelCambio(extra.cambio) });
  else if (extra.corrige) vinculos.push({ tipo: "nota", texto: `Corrige ${extra.corrige.numero}` });
  if (extra.notaDeCredito) vinculos.push({ tipo: "nota", texto: `Tiene ${extra.notaDeCredito.numero}` });
  const [primera, ...resto] = extra.notasDeCambio;
  if (primera) vinculos.push({ tipo: "cambio", texto: `Nota del cambio ${primera.numero}${resto.length > 0 ? ` y ${resto.length} más` : ""}` });
  return vinculos;
}

/** ¿La hoja ofrece empezar un cambio o una devolución desde este comprobante? Solo una boleta o factura aceptada de una venta, que no
 *  sale de un cambio (volver a cambiar lo recibido en un cambio es obra aparte, ADR-0671 decisión 10) y sin una nota que ya la devolvió.
 *  La nota de un cambio no cuenta: el resto de las prendas sigue en Posventa. */
export function puedeIrAPosventa(c: Comprobante, extra: ExtraComprobante | undefined): boolean {
  return c.estado === "aceptado" && c.tipo !== "nota_credito" && !!c.venta_id && !c.cambio_id && !extra?.notaDeCredito;
}

/** La venta que abre «Ver la venta» y su sede: la del comprobante o, en un documento de un cambio (sin venta propia), la venta original
 *  del cambio con la sede de esa venta (`null` si no se pudo leer: mejor sin sede que con la del cambio, que se imprimiría como la tienda). */
export type VentaParaVer = { id: string; ubicacionId: string | null };

export function ventaParaVer(c: Comprobante, extra: ExtraComprobante | undefined): VentaParaVer | null {
  if (c.venta_id) return { id: c.venta_id, ubicacionId: c.ubicacion_id };
  const cambio = extra?.cambio;
  return cambio?.ventaId ? { id: cambio.ventaId, ubicacionId: cambio.ubicacionId } : null;
}
