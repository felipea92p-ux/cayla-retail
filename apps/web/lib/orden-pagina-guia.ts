// La guía de foco de las hojas de la página de la orden: «Terminé» (anotar lo terminado en una fase), «Cambiar quién», y la «Salida» y la «Vuelta» de un servicio (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo que la persona ya hizo en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón.
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de lo que la base ya exige (`registrar_avance` rechaza un avance vacío; `fn_produccion_fases_normalizar` rechaza una fase de servicio
//            sin proveedor, tarifa o fecha válidos; `fn_actor_persona_id(true)` exige a alguien que firme). `lib/orden-pagina-guia.test.ts` recorre las combinaciones contra esas reglas.
//   NO HACE: no pinta ni toca la base; y ningún campo es «sugerido»: aquí no hay recomendaciones que avisen sin bloquear.

import type { CampoDeGuia } from "./guia-campos";

export type EleccionAvance = {
  /** Cuántas prendas se anotaron en total (la suma de las celdas, enteras y mayores que cero). */
  total: number;
  /** Ya hay quién anota (el combo «Responsable», ADR-0161/0162). */
  responsableListo: boolean;
};

/** «Terminé»: lo único que falta es escribir cuántas (ya viene precargado con lo que falta) y elegir quién lo anota. */
export function camposDeAvance(e: EleccionAvance): CampoDeGuia[] {
  return [
    { id: "cantidades", nombre: "Cuántas terminaste", requerido: true, hecho: e.total > 0, pendiente: "Escribe cuántas terminaste en cada talla y color." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esto." },
  ];
}

export type EleccionCambioDeQuien = {
  /** Lo que `problemasFases` dice de la fase tal como quedó (vacío = la base la aceptaría). */
  faltas: readonly string[];
  responsableListo: boolean;
};

/** «Cambiar quién»: la fase entera es UN campo (quién la hace, a quién y a cuánto, como en la hoja de Nueva orden) y después quién lo anota. */
export function camposDeCambiarQuien(e: EleccionCambioDeQuien): CampoDeGuia[] {
  return [
    { id: "fase", nombre: "Quién la hace", requerido: true, hecho: e.faltas.length === 0, pendiente: e.faltas[0] ?? "Elige quién hace esta fase." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

export type EleccionSalida = {
  /** Cuántas prendas se mandan en total. */
  total: number;
  /** Lo que la base rechazaría de la Salida (`problemasDeSalida`); vacío = la aceptaría. */
  excesos: readonly string[];
  responsableListo: boolean;
};

/** «Salida»: cuántas se mandan (precargado con lo que ya puede salir), y quién lo anota. La guía y el botón dicen lo mismo que `registrar_salida`. */
export function camposDeSalida(e: EleccionSalida): CampoDeGuia[] {
  const malas = e.total <= 0 || e.excesos.length > 0;
  return [
    { id: "cantidades", nombre: "Cuántas mandas", requerido: true, hecho: !malas, pendiente: e.excesos[0] ?? "Escribe cuántas mandas en cada talla y color." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta salida." },
  ];
}

export type EleccionVuelta = {
  /** Lo que `problemasDeVuelta` dice de lo escrito (vacío = la base lo aceptaría), SIN contar el «qué pasó». */
  excesos: readonly string[];
  /** Cuántas prendas se anotan en total (buenas + segundas + faltantes). */
  total: number;
  /** Hay segundas o faltantes: entonces la base exige decir qué pasó. */
  hayExcepciones: boolean;
  /** Ya se escribió qué pasó. */
  conMotivo: boolean;
  responsableListo: boolean;
};

/** «Vuelta»: cuántas volvieron, qué pasó con lo que no volvió bueno (solo si hay algo así) y quién lo anota. */
export function camposDeVuelta(e: EleccionVuelta): CampoDeGuia[] {
  const malas = e.total <= 0 || e.excesos.length > 0;
  const campos: CampoDeGuia[] = [{ id: "cantidades", nombre: "Cuántas volvieron", requerido: true, hecho: !malas, pendiente: e.excesos[0] ?? "Escribe cuántas volvieron en cada talla y color." }];
  if (e.hayExcepciones) campos.push({ id: "motivo", nombre: "Qué pasó", requerido: true, hecho: e.conMotivo, pendiente: "Cuéntanos qué pasó con lo que no volvió bueno." });
  campos.push({ id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta vuelta." });
  return campos;
}
