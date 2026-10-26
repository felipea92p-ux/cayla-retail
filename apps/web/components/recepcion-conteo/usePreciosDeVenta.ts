import { useState } from "react";
import { validarPrecioEnRecepcion } from "@/lib/recepcion-conteo-acciones";
import {
  ALCANCE_DE_FABRICA,
  hoyDelPrecio,
  precioComoTexto,
  type CambioDePrecio,
  type PrecioEditado,
  type RangoDePrecio,
} from "@/lib/recepcion-conteo-reglas";
import type { Firma } from "@/lib/responsable-reglas";

/**
 * El precio de venta de cada prenda ya identificada (por producto): su precio de hoy, lo escrito, dónde vale y por qué la base no lo aceptaría. Lo
 * comparten el cierre (las prendas separadas al contar) y «Hacer ahora» (las que se identifican después, en «Para después»); cada pantalla aplica
 * los cambios en su momento, después de validarlos y confirmarlos (`validar`, `ConfirmarPrecios`).
 */
export function usePreciosDeVenta() {
  const [ventas, setVentas] = useState<Record<string, PrecioEditado>>({});

  /**
   * El precio de hoy ya se leyó (el general y el de esta sede): se guarda y, si no hay nada escrito, se pone en el campo el de hoy del alcance con que
   * nace (la sede donde se recibe). Un precio solo; con un rango (tallas que valen distinto), vacío.
   */
  const ponerActual = (productoId: string, general: RangoDePrecio | null, enSede: RangoDePrecio | null | undefined) =>
    setVentas((v) => {
      const hay = v[productoId];
      if (hay && hay.actual !== undefined) return v;
      const base: PrecioEditado = { actual: general, actualSede: enSede, valor: hay?.valor ?? "", alcance: hay?.alcance ?? ALCANCE_DE_FABRICA };
      return { ...v, [productoId]: { ...base, valor: base.valor ? base.valor : precioComoTexto(hoyDelPrecio(base)) } };
    });

  /**
   * Lo escrito o el alcance cambió: el motivo de un rechazo anterior ya no vale. Al cambiar de alcance, un campo que nadie tocó (vacío o con el de hoy)
   * pasa al precio de hoy del alcance nuevo (el de la sede puede ser otro que el general).
   */
  const cambiarVenta = (productoId: string, cambio: Partial<Pick<PrecioEditado, "valor" | "alcance">>) =>
    setVentas((v) => {
      const e: PrecioEditado = v[productoId] ?? { actual: undefined, valor: "", alcance: ALCANCE_DE_FABRICA };
      let n: PrecioEditado = { ...e, ...cambio, rechazo: null };
      if (cambio.alcance && cambio.alcance !== e.alcance && cambio.valor === undefined) {
        const sinTocar = e.valor.trim() === "" || e.valor === precioComoTexto(hoyDelPrecio(e));
        if (sinTocar) n = { ...n, valor: precioComoTexto(hoyDelPrecio(n)) };
      }
      return { ...v, [productoId]: n };
    });

  /** La base no guardaría este precio: el motivo sale junto al campo. */
  const rechazar = (productoId: string, texto: string) =>
    setVentas((v) => (v[productoId] ? { ...v, [productoId]: { ...v[productoId], rechazo: texto } } : v));

  /** El cambio ya quedó aplicado en la base: lo escrito pasa a ser el precio de hoy y deja de ser un cambio (un reintento no lo manda otra vez). */
  const aplicado = (productoId: string, despues: number, alcance: "todas" | "sede") =>
    setVentas((v) => {
      const hoy: RangoDePrecio = { desde: despues, hasta: despues };
      const e = v[productoId];
      return { ...v, [productoId]: { ...e, ...(alcance === "sede" ? { actualSede: hoy } : { actual: hoy }), rechazo: null } as PrecioEditado };
    });

  /**
   * Antes de pedir la confirmación: la base dice si cada precio se podría guardar y, si no, por qué (la misma regla de siempre, sin guardar nada). Los
   * que no valen quedan marcados junto a su campo; devuelve cuáles, con su motivo. Si no se pudo preguntar, no frena: la base decide al guardar.
   */
  const validar = async (despachoId: string, cambios: readonly (CambioDePrecio & { productoId: string })[], firma: Firma | null) => {
    const rechazos: { productoId: string; nombre: string; texto: string }[] = [];
    for (const c of cambios) {
      const r = await validarPrecioEnRecepcion({ p_despacho_id: despachoId, p_producto_id: c.productoId, p_precio: c.despues, p_alcance: c.alcance ?? ALCANCE_DE_FABRICA }, firma);
      if (r.estado !== "rechazado") continue;
      rechazar(c.productoId, r.texto);
      rechazos.push({ productoId: c.productoId, nombre: c.nombre, texto: r.texto });
    }
    return rechazos;
  };

  return { ventas, ponerActual, cambiarVenta, rechazar, aplicado, validar };
}
