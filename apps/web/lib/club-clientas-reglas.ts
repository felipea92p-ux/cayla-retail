// Lo que /clientas necesita del club (ADR-0288, D-4 reescrita y tandas 1b y 1g), sin React ni red: cómo se lee su cumpleaños,
// el aviso al cambiarle el celular a una socia con novedades y qué le falta a una ficha para unirse desde el cartel. Las
// reglas de verdad (quién puede ser socia, que la publicidad solo nace de ella) las hace cumplir la base.
//
// Tanda 1g (G-7): se fue «Llegó un mensaje de WhatsApp» (`leerMensaje`, `queHacerConElMensaje`): ella se une sola desde el
// cartel, y la BAJA se registra en su ficha y en Avisos.

import { ajustarCelular } from "./club-reglas";

/* ------------------------------------------------------------------
   El cumpleaños (CL-3: día y mes; el año es opcional). La regla que valida lo escrito es UNA para Cobrar y /clientas:
   `lib/club-cumple-reglas.ts`. Aquí solo cómo se lee en la ficha.
   ------------------------------------------------------------------ */

/** «12/3», «12/3/1990» o «—». */
export function cumpleLegible(dia: number | null, mes: number | null, anio: number | null): string {
  if (!dia || !mes) return "—";
  return anio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`;
}

/* ------------------------------------------------------------------
   Cambiar el celular de una socia con publicidad
   ------------------------------------------------------------------ */

export const AVISO_CAMBIO_CELULAR = "Si cambias su celular, deja de recibir novedades hasta que las vuelva a pedir desde el número nuevo.";

/**
 * El aviso ANTES de guardar un celular nuevo en la ficha de una socia que recibe novedades: la base se las quita sola al
 * cambiarlo (`editar_clienta` escribe el `revoca` con medio `cambio_celular`, y el disparador `clientas_celular_con_publicidad`
 * no deja hacerlo por otro camino). null si no pierde nada: sin publicidad, el mismo número, o vacío (eso lo frena otra
 * regla: a una socia no se le borra el celular, `socia_sin_celular`).
 */
export function avisoCambioDeCelular(c: { publicidadDesde: string | null; telefonoWhatsapp: string | null }, celularNuevo: string): string | null {
  if (!c.publicidadDesde || ajustarCelular(celularNuevo) === "") return null;
  return cambiaDeCelular(c.telefonoWhatsapp, celularNuevo) ? AVISO_CAMBIO_CELULAR : null;
}

/** ¿El celular nuevo es otro que el de su ficha? */
export function cambiaDeCelular(celularDeLaFicha: string | null, numeroQueEscribio: string): boolean {
  return ajustarCelular(celularDeLaFicha ?? "") !== ajustarCelular(numeroQueEscribio);
}

/** Tanda 1g (G-2, G-4): en el cartel se une con SU documento, y si ya hay una ficha con ese documento es esa la que pasa a
 *  socia. Una ficha sin documento no se encontraría: al unirse se crearía otra. Esto dice qué le falta ANTES (el nombre lo
 *  trae el padrón o lo escribe ella); `null` si tiene documento. */
export function faltaParaSerSocia(c: { documentoNumero: string | null }): string | null {
  return c.documentoNumero?.trim() ? null : "Para que al unirse desde el cartel sea esta ficha, necesita su documento: complétalo con «Editar».";
}
