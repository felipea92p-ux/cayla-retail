// La guía de foco de «Abrir un conteo» (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo que la persona ya eligió en la tarjeta, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál
//            está hecho, cuál sigue y qué falta antes de «Empezar conteo».
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de lo que `abrir_conteo` ya exige (`lib/conteo-inicio-guia.test.ts` recorre todas
//            las combinaciones contra esas reglas). Si mañana la base pide otra cosa, se cambia aquí y la prueba avisa.
//   NO HACE: no pinta ni toca la base; y ningún campo es «sugerido»: aquí no hay recomendaciones que avisen sin bloquear.

import type { CampoDeGuia } from "./guia-campos";

/** «Prendas» (2026-10-01): una o varias prendas exactas. Hoy la base abre el conteo del lugar completo y la elección acota la LISTA
 *  (ADR-0241), así que `abrir_conteo` no sabe de este valor: la pantalla lo traduce a `todo` al llamarla. */
export type AlcanceElegido = "todo" | "categoria" | "prendas";

export type EleccionApertura = {
  /** ¿La sede separa piso y almacén? El Taller no: su conteo es de toda la ubicación y la pregunta «dónde» ni aparece. */
  separaPisoAlmacen: boolean;
  /** El piso o el almacén elegido; vacío si aún no. */
  lugarId: string;
  alcance: AlcanceElegido;
  /** La categoría elegida (solo importa con `alcance: "categoria"`); vacía si aún no. */
  categoriaId: string;
  /** Cuántas prendas exactas se eligieron (solo importa con `alcance: "prendas"`). */
  prendasElegidas: number;
  /** Ya hay quién cuenta (el combo «Responsable», ADR-0161/0162). */
  responsableListo: boolean;
};

/**
 * Los campos, en el orden de la pantalla. «Qué vas a contar» nace hecho (por defecto es «Todo», que ya es una respuesta válida) y
 * deja de estarlo solo al pedir una categoría sin elegirla o «por prenda» sin ninguna prenda; lo que quedó elegido de otra opción
 * (una categoría al volver a «Todo») no cuenta. «Quién cuenta» está hecho cuando el combo ya tiene a alguien.
 */
export function camposDeApertura(e: EleccionApertura): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (e.separaPisoAlmacen) {
    campos.push({ id: "donde", nombre: "Dónde", requerido: true, hecho: e.lugarId !== "", pendiente: "Elige almacén de tienda o piso de venta." });
  }
  campos.push({
    id: "que",
    nombre: e.alcance === "prendas" ? "Prendas" : "Categoría",
    requerido: true,
    hecho: e.alcance === "todo" || (e.alcance === "categoria" && e.categoriaId !== "") || (e.alcance === "prendas" && e.prendasElegidas > 0),
    pendiente: e.alcance === "prendas" ? "Elige al menos una prenda." : "Elige la categoría que vas a contar.",
  });
  campos.push({ id: "quien", nombre: "Quién cuenta", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién cuenta." });
  return campos;
}
