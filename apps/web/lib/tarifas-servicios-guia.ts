// La guía de foco de la hoja «Tarifa» de un servicio (CLAUDE.md «Guía de foco», ADR-0284; ADR-0400, actividad 8c). Sin React ni red.
//
// CONTRATO
//   PROMETE: dada lo escrito en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón.
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de `problemasDeTarifa`, que repite lo que `guardar_tarifa_servicio` rechaza (`lib/tarifas-servicios-reglas.test.ts` lo compara con la migración).
//   NO HACE: no pinta ni toca la base. El mínimo y el fijo son opcionales: solo bloquean si se escribió algo que la base rechazaría.

import type { CampoDeGuia } from "./guia-campos";
import { problemasDeTarifa, type EntradaDeTarifa } from "./tarifas-servicios-reglas";

export function camposDeTarifa(e: EntradaDeTarifa, responsableListo: boolean): CampoDeGuia[] {
  const problema = (campo: string) => problemasDeTarifa(e).find((p) => p.campo === campo)?.texto ?? null;
  const minimoEscrito = e.minimo.trim() !== "";
  const fijoEscrito = e.fijo.trim() !== "";
  return [
    { id: "servicio", nombre: "A qué servicio", requerido: true, hecho: problema("servicio") === null, pendiente: problema("servicio") ?? "" },
    { id: "fase", nombre: "En qué fase", requerido: true, hecho: problema("fase") === null, pendiente: problema("fase") ?? "" },
    { id: "tarifa", nombre: "Cuánto cobra por prenda", requerido: true, hecho: problema("tarifa") === null, pendiente: problema("tarifa") ?? "" },
    // Lo opcional solo exige algo cuando se escribió: un mínimo a medias se rechaza igual que en la base.
    { id: "minimo", nombre: "Mínimo de prendas", requerido: minimoEscrito, hecho: minimoEscrito && problema("minimo") === null, pendiente: problema("minimo") ?? "Escribe desde cuántas prendas cobra esa tarifa." },
    { id: "fijo", nombre: "Fijo por orden", requerido: fijoEscrito, hecho: fijoEscrito && problema("fijo") === null, pendiente: problema("fijo") ?? "Escribe cuánto cobra fijo por orden." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: responsableListo, pendiente: "Elige quién anota esta tarifa." },
  ];
}
