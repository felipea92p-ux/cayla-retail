// El ticket que se está armando sobrevive a que Android cierre la pestaña (ADR-0674, Fase 2; Felipe 2026-11-17).
//
// EL PROBLEMA. En un teléfono de 2–4 GB, si la vendedora salta a WhatsApp o a la cámara, Android descarta la pestaña de Chrome y al
// volver la recarga: el ticket que estaba armando vivía solo en la pantalla y se perdía (`lib/version-nueva-reglas.ts`). Los tickets EN
// ESPERA sí sobrevivían (localStorage), el que se estaba armando no.
//
// QUÉ HACE. Mientras se arma, Vender guarda una FOTO del ticket en la memoria de ESA pestaña (`sessionStorage`, por sede): sobrevive a la
// recarga y al descarte, y no la ven las otras pestañas. Al volver, la foto entra a «En espera» como un ticket más, con un aviso: la
// vendedora lo toca y pasa por `retomar()`, que pone los precios y las campañas al día, devuelve la clienta y quién atendió. Nada se
// restaura en silencio.
//
// LO QUE NO PUEDE PASAR. Que vuelva un ticket que ya se cobró: la vendedora lo cobraría dos veces. Por eso, desde que sale el cobro, no se
// guarda ninguna foto (y la que había se borra en el mismo instante en que se anota el cobro): si la pestaña muere en pleno cobro, manda
// el «cobro en duda» de siempre (`CobroEnDuda`). La foto vuelve recién si el cobro falla o se descarta, o con el ticket siguiente.

/** El nombre que lleva en «En espera» un ticket recuperado que no tenía nombre. */
export const NOMBRE_RECUPERADO = "Recuperado";

/** ¿Se guarda la foto del ticket o se borra? Sin prendas no hay nada que recuperar; con un cobro en el aire, nunca. */
export function queHacerConLaFoto(prendas: number, cobroEnCurso: boolean): "guardar" | "borrar" {
  return prendas > 0 && !cobroEnCurso ? "guardar" : "borrar";
}

type TicketMinimo = { id: string; nombre?: string; carrito: unknown[] };

/** ¿Lo leído del navegador es una foto con la que se puede armar un ticket? Una vieja, rota o vacía no se recupera. */
function fotoQueSirve(x: unknown): x is TicketMinimo {
  if (typeof x !== "object" || x === null) return false;
  const carrito = (x as { carrito?: unknown }).carrito;
  return (
    Array.isArray(carrito) &&
    carrito.length > 0 &&
    carrito.every((l) => {
      const { varianteId, cantidad } = (l ?? {}) as { varianteId?: unknown; cantidad?: unknown };
      return typeof varianteId === "string" && typeof cantidad === "number" && cantidad > 0;
    })
  );
}

/**
 * Al abrir Vender: si la pestaña guardó la foto de un ticket a medio armar, entra al final de «En espera» con un id nuevo (y con el
 * nombre «Recuperado» si no tenía). Con la caja cerrada no se recupera, como la espera (`esperaAlCargar`). Devuelve la espera nueva y
 * el ticket recuperado (o `null` si no había nada que recuperar). `id` se recibe hecho: el generador de UUID no entra a una función pura.
 */
export function recuperarEnLaEspera<T extends TicketMinimo>(
  espera: readonly T[],
  foto: unknown,
  cajaCerrada: boolean,
  id: string,
): { espera: T[]; recuperado: T | null } {
  if (cajaCerrada || !fotoQueSirve(foto)) return { espera: [...espera], recuperado: null };
  const recuperado = { ...(foto as T), id, nombre: (foto.nombre ?? "").trim() || NOMBRE_RECUPERADO };
  return { espera: [...espera, recuperado], recuperado };
}
