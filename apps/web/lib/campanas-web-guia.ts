// La guía de foco del editor de Campañas (ADR-0284, Felipe 2026-10-21). No agrega reglas: «falta» es lo que el candado de lectura y la base ya
// exigen (un ambiente elegido y letras que se lean); quién lo cambia lo pide `guardar_campana_diseno` (el responsable firma). El color propio
// es opcional: nunca bloquea. La prueba `campanas-web-guia.test.ts` exige que «falta» y `faltanDelDiseno` digan lo mismo.

import type { CampoDeGuia } from "./guia-campos";
import { faltanDelDiseno, type BorradorDiseno } from "./campanas-web-editor";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/** Los campos del editor, en el orden de la pantalla: el ambiente, los colores (la paleta y que se lean), el color propio y quién lo cambia. */
export function camposDeDiseno(b: BorradorDiseno, r: Responsable): CampoDeGuia[] {
  const hayAmbiente = b.plantilla !== null;
  return [
    { id: "ambiente", nombre: "Ambiente", requerido: true, hecho: hayAmbiente, pendiente: "Elige un ambiente." },
    {
      id: "colores",
      nombre: "Colores",
      requerido: true,
      hecho: hayAmbiente && !faltanDelDiseno(b).some((f) => f.paso === "colores"),
      pendiente: hayAmbiente ? "Elige una paleta o un color que se lea bien." : "Primero elige un ambiente.",
    },
    { id: "acento", nombre: "Color propio", requerido: false, hecho: b.acento !== null, pendiente: "" },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: r.responsableListo, pendiente: r.responsableMotivo ?? "Elige quién hace el cambio." },
  ];
}

/** @internal Existe PARA la prueba: la guía y la validación real tienen que decir lo mismo (`campanas-web-guia.test.ts`). */
export const faltanDelDisenoEnLaGuia = (b: BorradorDiseno): string[] =>
  camposDeDiseno(b, { responsableListo: true, responsableMotivo: null })
    .filter((c) => c.requerido && !c.hecho)
    .map((c) => c.id);
