// Saldos de arranque: qué le falta a la hoja para poder guardar (CLAUDE.md «Guía de foco», tarea 171). Sin React ni red.
//
// PROMETE: los campos de la guía, cada uno con la frase que dice bajo él al intentar guardar.
// ASUME: sale de la misma validación que tenía la hoja (`registrar_saldo_inicial` la exige igual): aquí no nace ninguna regla.
// NO HACE: lo que no se arregla llenando un campo de la hoja (no cambió nada, una cuenta que empieza después): eso sigue apagando el botón y se dice aparte.

import type { CampoDeGuia } from "./guia-campos";

const MINIMO_DEL_MOTIVO = 5;

export function camposDeArranque({
  corrige,
  montosIlegibles,
  cuadra,
  motivo,
  responsableListo,
  responsableMotivo,
}: {
  /** Ya hay arranque: lo que se guarda es una corrección, y pide su motivo. */
  corrige: boolean;
  /** El nombre de cada cuenta cuyo monto no se entiende. */
  montosIlegibles: readonly string[];
  cuadra: boolean;
  motivo: string;
  responsableListo: boolean;
  responsableMotivo: string | null;
}): CampoDeGuia[] {
  return [
    { id: "montos", nombre: "Montos", requerido: true, hecho: montosIlegibles.length === 0, pendiente: `No se entiende el monto de: ${montosIlegibles.join(", ")}. Escribe solo el número.` },
    { id: "cuadre", nombre: "Cuadre", requerido: true, hecho: cuadra, pendiente: "Todavía no cuadra: revisa el capital y las utilidades acumuladas con el contador." },
    ...(corrige ? [{ id: "motivo", nombre: "Por qué se corrige", requerido: true, hecho: motivo.trim().length >= MINIMO_DEL_MOTIVO, pendiente: `Di por qué se corrige, con al menos ${MINIMO_DEL_MOTIVO} letras.` }] : []),
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsableListo, pendiente: responsableMotivo ?? "Elige quién lo registra." },
  ];
}
