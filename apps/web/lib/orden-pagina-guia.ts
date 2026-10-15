// La guía de foco de las dos hojas de la página de la orden: «Terminé» (anotar lo terminado en una fase) y «Cambiar quién» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
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
