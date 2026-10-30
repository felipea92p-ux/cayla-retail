// La guía de foco de la hoja «Proceso del Taller» (CLAUDE.md «Guía de foco», ADR-0284; ADR-0570, actividad 5). Sin React ni red.
//
// CONTRATO
//   PROMETE: dada lo escrito en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón.
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de `problemasDeProceso`, que repite lo que `guardar_proceso_produccion` rechaza (`lib/procesos-reglas.test.ts` lo compara con la migración).
//   NO HACE: no pinta ni toca la base. La explicación es opcional: solo bloquea si pasa del tope.

import type { CampoDeGuia } from "./guia-campos";
import type { FaseDelCatalogo } from "./orden-fases-reglas";
import { problemasDeProceso, type EntradaDeProceso } from "./procesos-reglas";

export function camposDeProceso(e: EntradaDeProceso, catalogo: ReadonlyArray<FaseDelCatalogo>, responsableListo: boolean): CampoDeGuia[] {
  const problemas = problemasDeProceso(e, catalogo);
  const problema = (campo: string) => problemas.find((p) => p.campo === campo)?.texto ?? null;
  return [
    { id: "nombre", nombre: "Nombre del proceso", requerido: true, hecho: problema("nombre") === null, pendiente: problema("nombre") ?? "" },
    ...(e.clave === null ? [{ id: "despues", nombre: "Va después de", requerido: true, hecho: problema("despues") === null, pendiente: problema("despues") ?? "" }] : []),
    { id: "quien-lo-hace", nombre: "Quién lo hace de costumbre", requerido: true, hecho: true, pendiente: "" },
    { id: "ayuda", nombre: "Qué es", requerido: e.ayuda.trim() !== "", hecho: e.ayuda.trim() !== "" && problema("ayuda") === null, pendiente: problema("ayuda") ?? "" },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}
