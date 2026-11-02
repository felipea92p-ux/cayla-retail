// La guía de foco de «Subir la propuesta del SIRE» (ADR-0284, ADR-0601): el archivo y quién lo sube. «Hecho» es lo mismo que deja guardar:
// un archivo que `leerPropuestaSire` leyó bien (la misma regla que frena otro RUC, otro mes o un archivo que no es una propuesta) y un
// responsable listo. No agrega reglas: el texto de lo que falta es el error del lector, tal cual.

import type { CampoDeGuia } from "./guia-campos";
import type { LecturaSire } from "./sire-propuesta-reglas";

export function camposDeLaPropuesta(lectura: LecturaSire | null, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  return [
    {
      id: "archivo",
      nombre: "Archivo de SUNAT",
      requerido: true,
      hecho: lectura?.ok === true,
      pendiente: lectura && !lectura.ok ? lectura.error : "Elige el archivo de la propuesta que bajaste del portal SIRE.",
    },
    { id: "responsable", nombre: "Quién lo sube", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién sube la propuesta." },
  ];
}

/** La guía de «Resolver una diferencia» (actividad 2): la decisión ya viene elegida del menú; la nota es opcional; falta quién lo decide. */
export function camposDeResolver(responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  return [{ id: "responsable", nombre: "Quién lo decide", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién toma la decisión." }];
}
