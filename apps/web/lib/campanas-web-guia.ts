// La guía de foco del editor de Campañas (ADR-0284, Felipe 2026-10-21). No agrega reglas: «falta» es lo que el candado de lectura y la base ya
// exigen (un ambiente elegido, letras que se lean y al menos una pieza de la tienda donde se vea); quién lo cambia lo pide
// `guardar_campana_diseno` (el responsable firma). El color propio, el movimiento y los textos son opcionales: nunca bloquean. La prueba `campanas-web-guia.test.ts` exige que «falta» y `faltanDelDiseno` digan lo mismo.

import type { CampoDeGuia } from "./guia-campos";
import { conAmbiente, BORRADOR_VACIO, faltanDelDiseno, hayDonde, type BorradorDiseno } from "./campanas-web-editor";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/** Los campos del editor, en el orden de la pantalla: el ambiente, los colores (la paleta y que se lean), el color propio, el movimiento, dónde se ve y
 *  quién lo cambia. */
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
    // El movimiento nace elegido (el de su ambiente): «hecho» es que ya se apartó de él.
    { id: "movimiento", nombre: "Movimiento", requerido: false, hecho: hayAmbiente && !mismoMovimiento(b), pendiente: "" },
    // Los textos son opcionales (sin ellos sale el nombre de la campaña): «hecho» es que ya se escribió alguno.
    { id: "textos", nombre: "Textos", requerido: false, hecho: hayAmbiente && [b.titular, b.bajada, b.boton].some((t) => t.trim() !== ""), pendiente: "" },
    { id: "donde", nombre: "Dónde se ve", requerido: true, hecho: hayAmbiente && hayDonde(b), pendiente: hayAmbiente ? "Elige al menos una pieza de la tienda." : "Primero elige un ambiente." },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: r.responsableListo, pendiente: r.responsableMotivo ?? "Elige quién hace el cambio." },
  ];
}

/** @internal Existe PARA la prueba: la guía y la validación real tienen que decir lo mismo (`campanas-web-guia.test.ts`). */
export const faltanDelDisenoEnLaGuia = (b: BorradorDiseno): string[] =>
  camposDeDiseno(b, { responsableListo: true, responsableMotivo: null })
    .filter((c) => c.requerido && !c.hecho)
    .map((c) => c.id);

/** ¿El movimiento sigue siendo el de fábrica de su ambiente? (la entrada, la intensidad, la duración y la cuenta de siempre y la franja y el efecto del ambiente). */
function mismoMovimiento(b: BorradorDiseno): boolean {
  const fabrica = b.plantilla ? conAmbiente({ ...BORRADOR_VACIO }, b.plantilla) : BORRADOR_VACIO;
  return (["franja", "entrada", "efecto", "intensidad", "duracion", "cuenta"] as const).every((k) => b[k] === fabrica[k]);
}
