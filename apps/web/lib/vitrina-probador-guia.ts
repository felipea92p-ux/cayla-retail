// La guía de foco de las hojas de Vitrina web ▸ Probador (ADR-0284, ADR-0434 actividades 1 y 3). No agrega reglas: «falta» es exactamente
// lo que `registrar_recorte`, `revisar_recorte`, `vitrina_guardar_largo` y `vitrina_guardar_largos_tipicos` rechazarían, y quién lo hace.
// Un largo vacío es válido (vuelve al típico); solo «falta» cuando la categoría no tiene típico, porque sin él la prenda no entra.

import type { CampoDeGuia } from "./guia-campos";
import { leerLargo } from "./vitrina-probador-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/** «Preparar recortes» y «Revisar recortes»: solo quién lo hace. `pide` es la frase con que se pide si falta. */
export function camposDeRecortes(h: Responsable, pide = "Elige quién prepara los recortes."): CampoDeGuia[] {
  return [
    {
      id: "responsable",
      nombre: "Quién lo hace",
      requerido: true,
      hecho: h.responsableListo,
      pendiente: h.responsableMotivo ?? pide,
    },
  ];
}

/**
 * El largo de una prenda: si su categoría no tiene típico, el largo es lo que la hace entrar al probador (requerido); si tiene, es
 * opcional (vacío usa el típico). Lo que no sirve (una letra, menos de 5 cm) siempre falta.
 */
export function camposDeLargo(h: { escrito: string; tipico: number | null } & Responsable): CampoDeGuia[] {
  const leido = leerLargo(h.escrito);
  const valido = !("error" in leido);
  const conValor = valido && leido.valor !== null;
  return [
    {
      id: "largo",
      nombre: "Largo",
      requerido: h.tipico === null || !valido,
      hecho: valido && (conValor || h.tipico !== null),
      pendiente: "error" in leido ? leido.error : "Anota el largo: sin él no entra al probador.",
    },
    ...camposDeRecortes(h, "Elige quién anota el largo."),
  ];
}

/** Los largos típicos: que ninguno esté mal escrito (vacío es «sin típico»), y quién los cambia. */
export function camposDeTipicos(h: { malEscritos: number } & Responsable): CampoDeGuia[] {
  return [
    {
      id: "tipicos",
      nombre: "Largos típicos",
      requerido: true,
      hecho: h.malEscritos === 0,
      pendiente: h.malEscritos === 1 ? "Corrige el largo marcado: va de 5 a 250 cm." : `Corrige los ${h.malEscritos} largos marcados: van de 5 a 250 cm.`,
    },
    ...camposDeRecortes(h, "Elige quién cambia los típicos."),
  ];
}
