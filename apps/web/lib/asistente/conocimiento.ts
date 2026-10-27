// «Pregúntale a CAYLA» (ADR-0529, actividad 7): qué reglas de tienda y qué errores conocidos se le muestran a la IA para una pregunta.
// Sin red: se prueba en `conocimiento.test.ts`. Como con las guías, la IA no ve todo: ve los pocos que más se parecen y elige uno por su
// id; el texto que llega a la persona lo pone el sistema (`revisarRespuesta`: la respuesta aprobada o la frase de la pantalla), nunca la IA.

import { raices } from "./preseleccion";
import { REGLAS_DE_TIENDA, reglasAprobadas, type ReglaDeTienda } from "./reglas-de-tienda";

type Candidato<T> = { item: T; puntos: number };

/** Los que más palabras comparten con la pregunta; a igual puntaje, el orden de la lista. Sin ninguna palabra en común, ninguno. */
function masParecidos<T>(pregunta: string, items: readonly T[], texto: (t: T) => string, cuantos: number): T[] {
  const buscadas = raices(pregunta);
  if (buscadas.size === 0) return [];
  return items
    .map((item, i): Candidato<T> & { i: number } => {
      const propias = raices(texto(item));
      let puntos = 0;
      for (const r of buscadas) if (propias.has(r)) puntos++;
      return { item, puntos, i };
    })
    .filter((c) => c.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.i - b.i)
    .slice(0, cuantos)
    .map((c) => c.item);
}

/** Las reglas APROBADAS que más se parecen a la pregunta: el filtro va aquí adentro, así una en borrador nunca llega a la IA. */
export function reglasParecidas(pregunta: string, reglas: readonly ReglaDeTienda[] = REGLAS_DE_TIENDA, cuantas = 3): ReglaDeTienda[] {
  return masParecidos(pregunta, reglasAprobadas(reglas), (r) => `${r.pregunta} ${r.respuesta}`, cuantas);
}

/** Los errores conocidos (la frase que ya ve la persona en la pantalla) que más se parecen a la pregunta. */
export function erroresParecidos(pregunta: string, errores: readonly { marca: string; frase: string }[], cuantos = 4): { marca: string; frase: string }[] {
  return masParecidos(pregunta, errores, (e) => e.frase, cuantos);
}
