// «¿Cómo estaba esta prenda en el sistema?», deducido del libro (ADR-0328 actividad 5, rescatado de #788 el 2026-10-12 sobre la mesa de
// ADR-0360). Lógica pura, sin React ni red: los hechos los trae la base (`retail.fn_candidatas_por_regularizar`, 20261004203000) y esto
// los convierte en una SUGERENCIA con su porqué en palabras de tienda.
//
// EL PROBLEMA. Contestar mal «¿Cómo estaba?» no se nota en el momento y descuadra el stock para siempre: «Perdió la etiqueta» de una
// prenda que nunca se contó la DESCUENTA DOS VECES (el sistema queda una por debajo de la percha), y «Llegó nueva» de una que sí estaba
// contada deja una prenda FANTASMA (el sistema queda una por encima). Nadie lo sabe de memoria; el libro de movimientos sí: cuántas
// tenía el sistema de esa prenda en esa tienda a la hora de la venta, y qué llegó o se ajustó después.
//
// CONTRATO
//   PROMETE: `deducirForma`, con el libro de ESA prenda en ESA tienda: «Llegó nueva» si a la hora de la venta el sistema no tenía
//            ninguna (no pudo estar contada); «Perdió la etiqueta» (`ya_registrada`) si tenía y después no llegó ni se ajustó nada
//            (estaba contada); SIN respuesta (`forma: null`, con el porqué y la fecha) si tenía y después llegó o se ajustó algo (pudo
//            ser de lo que había o de lo que llegó sin registrar); `null` si el libro no alcanza (saldo desconocido o fecha rota).
//            `avisoDeRespuesta`: el aviso en ámbar cuando la persona elige lo contrario de lo deducido, o `null`.
//   ASUME:   que los hechos son los de la tienda de la venta y las fechas vienen en ISO (las de la base); que la hora de la venta es
//            `prendas_por_regularizar.vendido_en` y que una llegada se registró al llegar (si se registró días después, el saldo a
//            la venta sale de menos: por eso es sugerencia y no candado).
//   NO HACE: no elige por nadie ni cambia qué se puede confirmar (CLAUDE.md «Guía de foco», punto 5): la persona responde, y
//            `regularizar_prenda` guarda lo que ella eligió. Por eso tampoco es un candado en la base (ver 20261004203000).
//
// POR QUÉ EL SALDO Y NO LA PRIMERA ENTRADA (revisión adversarial de #788, R7). Con la primera entrada sola, una prenda que se agotó y
// volvió a llegar salía «ya estaba registrada» aunque el sistema tuviera 0 a la hora de la venta: la respuesta que descuenta dos veces.
import { diaYHoraLima } from "./fechas-lima";
import { FORMAS, type FormaRegularizar } from "./por-regularizar-mesa";

/** Lo que dice el libro de UNA prenda en la tienda de UNA venta (una fila de `fn_candidatas_por_regularizar`). */
export type HechoDelLibro = {
  /** Cuántas tenía el sistema justo antes de la venta (sin Cuarentena); `null` = no se sabe (tienda apagada). */
  saldoALaVenta: number | null;
  /** La primera vez que esa prenda sumó a esa tienda (ISO) y por qué (carga_inicial, recepcion…), o `null`. */
  primeraEntrada: string | null;
  primeraEntradaMotivo: string | null;
  /** Lo primero que llegó o se ajustó de esa prenda en esa tienda DESPUÉS de la venta (ISO y motivo), o `null` si nada. */
  cambioPosterior: string | null;
  cambioPosteriorMotivo: string | null;
};

/** `venta → (prenda → lo que dice el libro)`. Una venta o una prenda que no está = no hay nada que deducir. */
export type LibroPorVenta = Readonly<Record<string, Readonly<Record<string, HechoDelLibro>>>>;

/** La respuesta que dice el libro, con su porqué. `forma: null` = el libro no alcanza para decidir (el porqué dice por qué). */
export type FormaDeducida = { forma: FormaRegularizar | null; porque: string };

/** Lo que fue la primera entrada, para el porqué. */
const QUE_FUE: Readonly<Record<string, string>> = {
  carga_inicial: "su carga inicial",
  recepcion: "su recepción",
  traslado_entrada: "el traslado que la trajo",
  movimiento_interno: "el traslado que la trajo",
  conteo: "un conteo",
  cambio: "un cambio",
  devolucion: "una devolución",
  produccion: "su ingreso desde el Taller",
};
const queFue = (motivo: string | null) => (motivo && QUE_FUE[motivo]) || "su primera entrada";

/** Lo que cambió lo contado después de la venta, dicho en la tienda: «llegó una recepción», «se ajustó en un conteo». */
const QUE_CAMBIO: Readonly<Record<string, string>> = {
  carga_inicial: "se cargó su stock inicial",
  recepcion: "llegó una recepción",
  traslado_entrada: "llegó un traslado",
  transferencia: "llegó un traslado",
  produccion: "llegó del Taller",
  conteo: "se ajustó en un conteo",
  conteo_fisico: "se ajustó contándola",
  hallazgo_conteo: "apareció tras un conteo",
  reposicion: "se ajustó a mano",
  merma: "se ajustó a mano",
  otro: "se ajustó a mano",
};
const queCambio = (motivo: string | null) => (motivo && QUE_CAMBIO[motivo]) || "cambió su stock";

/** «04/10 a las 11:40»: con la hora, porque una venta y una carga del mismo día se ordenan por ella. */
function cuando(iso: string): string {
  const { dia, hora } = diaYHoraLima(iso);
  return `${dia} a las ${hora}`;
}

/**
 * «¿Perdió la etiqueta o llegó nueva?», deducida del libro de ESA prenda en ESA tienda:
 *   · a la hora de la venta el sistema no tenía ninguna → «Llegó nueva» (no pudo estar contada: entra 1 y sale 1, el stock no cambia);
 *   · tenía, y después no llegó ni se ajustó nada → «Perdió la etiqueta» (estaba contada: sale 1);
 *   · tenía, pero después llegó o se ajustó algo → sin respuesta (`forma: null`): pudo ser de lo que había o de lo que llegó sin
 *     registrar (o un conteo ya la descontó). El porqué lo dice con la fecha, para que la persona mire.
 * Sin saldo conocido o con una fecha rota: `null` (nada que decir).
 */
export function deducirForma(h: HechoDelLibro, vendidoEn: string, sede: string): FormaDeducida | null {
  const saldo = h.saldoALaVenta;
  if (saldo === null || !Number.isFinite(saldo) || !Number.isFinite(Date.parse(vendidoEn))) return null;
  if (saldo <= 0) {
    const entrada = h.primeraEntrada ? Date.parse(h.primeraEntrada) : Number.NaN;
    // La más clara de decir: se vendió antes de que esa prenda entrara por primera vez a la tienda.
    if (h.primeraEntrada && Number.isFinite(entrada) && Date.parse(vendidoEn) < entrada) {
      return {
        forma: "llego_nueva",
        porque: `Se vendió el ${cuando(vendidoEn)}, antes de ${queFue(h.primeraEntradaMotivo)} en ${sede} (${cuando(h.primeraEntrada)}): ese conteo ya no la incluyó.`,
      };
    }
    return { forma: "llego_nueva", porque: `Cuando se vendió (${cuando(vendidoEn)}), el sistema no tenía ninguna en ${sede}: no pudo estar contada.` };
  }
  if (!h.cambioPosterior) {
    return {
      forma: "ya_registrada",
      porque: `Cuando se vendió (${cuando(vendidoEn)}), el sistema tenía ${saldo} en ${sede} y después no llegó ni se ajustó ninguna: estaba contada en el stock.`,
    };
  }
  return {
    forma: null,
    porque: `No lo podemos deducir: cuando se vendió (${cuando(vendidoEn)}) el sistema tenía ${saldo} en ${sede}, pero el ${cuando(h.cambioPosterior)} ${queCambio(h.cambioPosteriorMotivo)}. Pudo ser una de las que ya estaban contadas o una que llegó sin registrar: mira tú si estaba contada.`,
  };
}

/**
 * El aviso en ámbar cuando la persona elige lo CONTRARIO de lo deducido (nunca la detiene: puede tener razón, p. ej. una carga contada en
 * papel y registrada días después). `null` si no eligió nada, si eligió lo sugerido o si el libro no sugirió nada.
 */
export function avisoDeRespuesta(deducida: FormaDeducida | null, elegida: FormaRegularizar | null, sede: string): string | null {
  if (!deducida?.forma || !elegida || elegida === deducida.forma) return null;
  if (elegida === "ya_registrada") {
    return `Ojo: cuando se vendió, el sistema no tenía ninguna en ${sede}, así que no pudo estar contada. Con «${FORMAS.ya_registrada.titulo}» se descuenta una que nunca entró: contestar mal descuenta dos veces.`;
  }
  return `Ojo: el sistema ya la tenía contada en ${sede} y después no llegó ninguna. Con «${FORMAS.llego_nueva.titulo}» el stock no baja y queda una prenda de más que ya no está en la tienda: contestar mal deja una prenda fantasma.`;
}

/**
 * Una fila de `fn_candidatas_por_regularizar` con lo que la deducción usa. OJO con los nombres de la base: `prenda_id` es la VENTA sin
 * registrar (`prendas_por_regularizar.id`, el talón de la mesa) y `variante_id` es la PRENDA del catálogo (la tarjeta).
 */
export type FilaDelLibro = {
  prenda_id: string;
  variante_id: string;
  saldo_a_la_venta: number | null;
  primera_entrada: string | null;
  primera_entrada_motivo: string | null;
  cambio_posterior: string | null;
  cambio_posterior_motivo: string | null;
};

/** Las filas de la base, agrupadas por venta y por prenda. Una fila sin saldo conocido no entra: no hay nada que deducir de ella. */
export function libroDesdeFilas(filas: readonly FilaDelLibro[]): LibroPorVenta {
  const libro: Record<string, Record<string, HechoDelLibro>> = {};
  for (const f of filas) {
    if (f.saldo_a_la_venta === null) continue;
    (libro[f.prenda_id] ??= {})[f.variante_id] = {
      saldoALaVenta: Number(f.saldo_a_la_venta),
      primeraEntrada: f.primera_entrada,
      primeraEntradaMotivo: f.primera_entrada_motivo,
      cambioPosterior: f.cambio_posterior,
      cambioPosteriorMotivo: f.cambio_posterior_motivo,
    };
  }
  return libro;
}

/** Lo que dice el libro de la prenda elegida para esa venta, o `null` si el libro no se pudo leer o no trae esa prenda. */
export function deduccionPara(
  libro: LibroPorVenta | null,
  venta: { id: string; vendidoEn: string; sede: string } | null,
  prendaId: string | null,
): FormaDeducida | null {
  if (!libro || !venta || !prendaId) return null;
  const hecho = libro[venta.id]?.[prendaId];
  return hecho ? deducirForma(hecho, venta.vendidoEn, venta.sede) : null;
}
