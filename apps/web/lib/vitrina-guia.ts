// La guía de foco de las hojas de Catálogo ▸ Vitrina web (ADR-0284, ADR-0408). No agrega reglas: cada «falta» es exactamente lo que
// la base rechaza (`vitrina_guardar_modelo`, `vitrina_cambiar_precios`, `vitrina_mostrar`) o lo que apaga el botón, y la prueba lo
// compara contra `problemaDePrecioWeb` y `nuevoPrecioLote`.

import type { CampoDeGuia } from "./guia-campos";
import { problemaDePrecioWeb, valorDeLote, type DireccionLote, type UnidadLote } from "./vitrina-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

const responsable = (h: Responsable): CampoDeGuia => ({
  id: "responsable",
  nombre: "Quién lo cambia",
  requerido: true,
  hecho: h.responsableListo,
  pendiente: h.responsableMotivo ?? "Elige quién hace el cambio.",
});

/** La hoja de un modelo: el precio web y quién lo cambia. La descripción para la web es opcional (sin ella sale la del catálogo);
 *  mostrar u ocultar y «Lo nuevo» ya vienen elegidos. */
export function camposDeModelo(h: { precio: string; costo: number | null; descripcion: string } & Responsable): CampoDeGuia[] {
  const problema = problemaDePrecioWeb(h.precio, h.costo);
  return [
    { id: "precio", nombre: "Precio web", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    { id: "descripcion", nombre: "Descripción para la web", requerido: false, hecho: h.descripcion.trim() !== "", pendiente: "" },
    responsable(h),
  ];
}

/** El lote de precios: cuánto subir o bajar (que deje a todos con un precio que se pueda guardar) y quién lo cambia. */
export function camposDeLotePrecio(
  h: { valor: string; direccion: DireccionLote; unidad: UnidadLote; sinPrecio: number } & Responsable,
): CampoDeGuia[] {
  const valor = valorDeLote(h.valor, h.direccion, h.unidad);
  const pendiente =
    h.valor.trim() === ""
      ? "Escribe cuánto subir o bajar."
      : valor === null
        ? h.unidad === "pct"
          ? "Escribe un porcentaje mayor que cero (para bajar, menos de 100)."
          : "Escribe un monto mayor que cero, con hasta dos decimales."
        : "Con ese cambio algún modelo queda en cero o menos: baja menos.";
  return [{ id: "cuanto", nombre: "Cuánto", requerido: true, hecho: valor !== null && h.sinPrecio === 0, pendiente }, responsable(h)];
}

/** Mostrar u ocultar varios: solo quién lo cambia (lo demás ya está elegido en la lista). */
export function camposDeLoteMostrar(h: Responsable): CampoDeGuia[] {
  return [responsable(h)];
}
