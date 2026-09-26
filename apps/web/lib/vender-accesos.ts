import type { ClaveModulo } from "./modulos";

/**
 * Accesos del Punto de venta a las pantallas que trabajan de la mano con él (spike
 * `docs/maquetas/punto-venta-spike-2026-09/`, aprobado por Felipe el 2026-09-26). Antes eran tres enlaces de 11 px
 * que desaparecían en el celular; ahora son botones con ícono y, lo que no cabe, va en «Más».
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
  /** A la vista en la cabecera de escritorio. Los demás van en «Más»: medido en el spike, seis no caben junto a
   *  «Hoy» y «Cerrar caja» (la cabecera desbordaba 58 px a 1320 px, y más con el lateral abierto). */
  principal: boolean;
};

export const ACCESOS_VENTA: readonly AccesoVenta[] = [
  { modulo: "caja", texto: "Caja", href: "/caja", icono: "caja", principal: true },
  { modulo: "apartados", texto: "Apartados", href: "/vender/apartados", icono: "apartados", principal: true },
  { modulo: "cambios", texto: "Cambios", href: "/cambios", icono: "cambios", principal: true },
  { modulo: "devoluciones", texto: "Devoluciones", href: "/devoluciones", icono: "devoluciones", principal: true },
  { modulo: "historial", texto: "Historial", href: "/vender/historial", icono: "historial", principal: false },
  { modulo: "facturacion", texto: "Proformas", href: "/vender/comprobantes/proformas", icono: "proformas", principal: false },
];

/** Los accesos que esta cuenta puede abrir, en el orden de la cabecera. */
export function accesosVisibles(modulos: readonly ClaveModulo[]): AccesoVenta[] {
  return ACCESOS_VENTA.filter((a) => modulos.includes(a.modulo));
}

/** Cómo se reparten en la cabecera de escritorio: los principales a la vista y el resto en «Más». Si «Más» tendría
 *  uno solo, ese uno va a la vista: un menú de una opción es un clic de más. */
export function repartirAccesos(visibles: readonly AccesoVenta[]): { aLaVista: AccesoVenta[]; enMas: AccesoVenta[] } {
  const enMas = visibles.filter((a) => !a.principal);
  if (enMas.length <= 1) return { aLaVista: [...visibles], enMas: [] };
  return { aLaVista: visibles.filter((a) => a.principal), enMas };
}
