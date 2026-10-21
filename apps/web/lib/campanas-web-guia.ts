// La guía de foco del editor de Campañas (ADR-0284, Felipe 2026-10-21). No agrega reglas: «falta» es lo que el candado de lectura y la base ya
// exigen (un ambiente elegido, letras que se lean y al menos una pieza de la tienda donde se vea); quién lo cambia lo pide
// `guardar_campana_diseno` (el responsable firma). El color propio, el movimiento y los textos son opcionales: nunca bloquean. La prueba `campanas-web-guia.test.ts` exige que «falta» y `faltanDelDiseno` digan lo mismo.

import type { CampoDeGuia } from "./guia-campos";
import { faltanDelDiseno, hayDiseno, hayDonde, movimientoDeFabrica, type BorradorDiseno } from "./campanas-web-editor";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/** Los campos del editor, en el orden de la pantalla: el ambiente, los colores (la paleta y que se lean), el color propio, el movimiento, dónde se ve y
 *  quién lo cambia. */
export function camposDeDiseno(b: BorradorDiseno, r: Responsable): CampoDeGuia[] {
  const hay = hayDiseno(b);
  const conImagen = b.modo === "imagen";
  return [
    { id: "ambiente", nombre: conImagen ? "Imagen" : "Ambiente", requerido: true, hecho: hay, pendiente: conImagen ? "Sube tu imagen." : "Elige un ambiente." },
    {
      id: "colores",
      nombre: conImagen ? "Color del botón" : "Colores",
      requerido: true,
      hecho: hay && !faltanDelDiseno(b).some((f) => f.paso === "colores"),
      pendiente: hay ? (conImagen ? "Elige un color de botón que se lea bien." : "Elige una paleta o un color que se lea bien.") : conImagen ? "Primero sube la imagen." : "Primero elige un ambiente.",
    },
    { id: "acento", nombre: "Color propio", requerido: false, hecho: b.acento !== null, pendiente: "" },
    // El movimiento nace elegido (el de su ambiente o el de la imagen): «hecho» es que ya se apartó de él.
    { id: "movimiento", nombre: "Movimiento", requerido: false, hecho: hay && !mismoMovimiento(b), pendiente: "" },
    // Los textos son del ambiente (la imagen los trae dentro) y opcionales: «hecho» es que ya se escribió alguno.
    ...(conImagen ? [] : [{ id: "textos", nombre: "Textos", requerido: false, hecho: hay && [b.titular, b.bajada, b.boton].some((t) => t.trim() !== ""), pendiente: "" }]),
    { id: "donde", nombre: "Dónde se ve", requerido: true, hecho: hay && hayDonde(b), pendiente: hay ? "Elige al menos una pieza de la tienda." : conImagen ? "Primero sube la imagen." : "Primero elige un ambiente." },
    { id: "responsable", nombre: "Quién lo cambia", requerido: true, hecho: r.responsableListo, pendiente: r.responsableMotivo ?? "Elige quién hace el cambio." },
  ];
}

/** @internal Existe PARA la prueba: la guía y la validación real tienen que decir lo mismo (`campanas-web-guia.test.ts`). */
export const faltanDelDisenoEnLaGuia = (b: BorradorDiseno): string[] =>
  camposDeDiseno(b, { responsableListo: true, responsableMotivo: null })
    .filter((c) => c.requerido && !c.hecho)
    .map((c) => c.id);

/** ¿El movimiento sigue siendo el de fábrica de su modo y su ambiente? */
function mismoMovimiento(b: BorradorDiseno): boolean {
  const fabrica = movimientoDeFabrica(b);
  return (["franja", "entrada", "efecto", "intensidad", "duracion", "cuenta"] as const).every((k) => b[k] === fabrica[k]);
}
