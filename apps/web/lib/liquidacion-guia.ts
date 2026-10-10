// La guía de foco de las hojas de Liquidación (ADR-0284, ADR-0371): qué está hecho, qué sigue y qué falta. No agrega reglas: cada
// campo «falta» es exactamente lo que la base rechaza (`crear_pieza_liquidacion`, `cambiar_precio_pieza_liquidacion`,
// `retirar_pieza_liquidacion`) y la prueba lo compara contra `problemaDePrecio`.

import type { CampoDeGuia } from "./guia-campos";
import { precioDeTexto, problemaDePrecio } from "./liquidacion-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

const responsable = (h: Responsable): CampoDeGuia => ({
  id: "responsable",
  nombre: "Quién etiqueta",
  requerido: true,
  hecho: h.responsableListo,
  pendiente: h.responsableMotivo ?? "Elige quién etiqueta.",
});

const precio = (texto: string, minimo: number, esLider: boolean, nombre: string): CampoDeGuia => {
  const problema = problemaDePrecio(texto, minimo, esLider);
  return { id: "precio", nombre, requerido: true, hecho: problema === null, pendiente: problema ?? "" };
};

/** «Etiquetar una prenda»: la categoría, el precio y quién etiqueta; «Para reconocerla» es opcional (nunca bloquea ni se lista como
 *  «falta»): la base acepta la prenda sin ella. */
export function camposDeEtiquetar(
  h: { categoriaId: string; precio: string; descripcion?: string; minimo: number; esLider: boolean } & Responsable,
): CampoDeGuia[] {
  return [
    { id: "categoria", nombre: "Categoría", requerido: true, hecho: h.categoriaId !== "", pendiente: "Elige qué prenda es." },
    { id: "descripcion", nombre: "Para reconocerla", requerido: false, hecho: (h.descripcion ?? "").trim() !== "", pendiente: "" },
    precio(h.precio, h.minimo, h.esLider, "Precio"),
    responsable(h),
  ];
}

/** «Cambiar el precio»: un precio nuevo, distinto del de ahora (la base lo rechaza si es el mismo). */
export function camposDeCambiarPrecio(
  h: { precio: string; actual: number; minimo: number; esLider: boolean } & Responsable,
): CampoDeGuia[] {
  const base = precio(h.precio, h.minimo, h.esLider, "Precio nuevo");
  const mismo = base.hecho && precioDeTexto(h.precio) === h.actual;
  return [mismo ? { ...base, hecho: false, pendiente: "Ese ya es su precio: escribe el nuevo." } : base, responsable(h)];
}

/** «Retirar»: por qué sale (se perdió, se dañó, se donó). */
export function camposDeRetirar(h: { motivo: string } & Responsable): CampoDeGuia[] {
  const m = h.motivo.trim();
  return [
    {
      id: "motivo",
      nombre: "Por qué sale",
      requerido: true,
      hecho: m !== "" && m.length <= 120,
      pendiente: m.length > 120 ? "Dilo en menos palabras (hasta 120 letras)." : "Escribe por qué sale de la liquidación.",
    },
    responsable(h),
  ];
}
