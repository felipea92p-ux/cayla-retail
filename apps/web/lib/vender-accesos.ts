import type { ClaveModulo } from "./modulos";

/**
 * Accesos del Punto de venta a las pantallas que trabajan de la mano con él (spike
 * `docs/maquetas/punto-venta-spike-2026-09/`, aprobado por Felipe el 2026-09-26). Antes eran tres enlaces de 11 px
 * que desaparecían en el celular. Desde el spike «el ticket a lo alto» (2026-09-26) todos viven en «Más», salvo Apartados.
 *
 * Cada acceso sale SOLO si la cuenta ve su módulo (ADR-0161): la regla la hace cumplir `exigirModulo` en cada ruta,
 * y acá solo evita ofrecer una puerta que diría «Sin acceso».
 */
export type IconoAcceso = "caja" | "apartados" | "cambios" | "devoluciones" | "historial" | "proformas";

export type AccesoVenta = {
  modulo: ClaveModulo;
  texto: string;
  href: string;
  icono: IconoAcceso;
};

export const ACCESOS_VENTA: readonly AccesoVenta[] = [
  { modulo: "caja", texto: "Caja", href: "/caja", icono: "caja" },
  { modulo: "apartados", texto: "Apartados", href: "/vender/apartados", icono: "apartados" },
  { modulo: "cambios", texto: "Cambios", href: "/cambios", icono: "cambios" },
  { modulo: "devoluciones", texto: "Devoluciones", href: "/devoluciones", icono: "devoluciones" },
  { modulo: "historial", texto: "Historial", href: "/vender/historial", icono: "historial" },
  { modulo: "facturacion", texto: "Proformas", href: "/vender/comprobantes/proformas", icono: "proformas" },
];

/** Los accesos que esta cuenta puede abrir, en el orden de la cabecera. */
export function accesosVisibles(modulos: readonly ClaveModulo[]): AccesoVenta[] {
  return ACCESOS_VENTA.filter((a) => modulos.includes(a.modulo));
}

/** Lo que va dentro de «Más» (spike «el ticket a lo alto», Felipe 2026-09-26): todo menos Apartados, que se queda a la
 *  vista porque es el único que se lleva el ticket (`BotonApartados`). La franja de arriba ya no existe: le quitaba alto
 *  al ticket. */
export function accesosDeMas(visibles: readonly AccesoVenta[]): AccesoVenta[] {
  return visibles.filter((a) => a.modulo !== "apartados");
}
