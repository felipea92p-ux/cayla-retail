import type { ClaveModulo } from "@/lib/modulos";

// «Historial de compras» (ADR-0504): UNA fila del menú y tres pestañas —Historial, Revisar compras y Por pagar—, que son tres pantallas
// de siempre con sus URLs de siempre. Cada una sigue pidiendo SU módulo en Roles y accesos: la pestaña que la cuenta no ve no está, y
// escribir su URL cae en «Sin acceso» (`exigirModulo` de cada pantalla). Aquí vive lo puro: qué pestañas trae cada cuenta, a cuál
// llega quien entra por la fila, y qué dice el contador de cada una.

export type VistaCompras = "historial" | "revisar" | "porpagar";

export const VISTAS_DE_COMPRAS: readonly { clave: VistaCompras; etiqueta: string; href: string; modulo: ClaveModulo }[] = [
  { clave: "historial", etiqueta: "Historial", href: "/compras", modulo: "facturas_compra" },
  { clave: "revisar", etiqueta: "Revisar compras", href: "/compras/fondos", modulo: "fondos" },
  { clave: "porpagar", etiqueta: "Por pagar", href: "/compras/por-pagar", modulo: "por_pagar" },
];

/** Las pestañas que trae esta cuenta, en el orden de siempre: Historial, Revisar compras, Por pagar. */
export function vistasDeCompras(modulos: readonly ClaveModulo[]) {
  return VISTAS_DE_COMPRAS.filter((v) => modulos.includes(v.modulo));
}

/**
 * A dónde cae quien entra por la fila «Historial de compras» (`/compras`): al Historial, y si su rol no lo trae (tiene solo «Revisar
 * compras» o solo «Por pagar»), a la primera pestaña que sí ve. `null` si no ve ninguna.
 */
export function entradaDeCompras(modulos: readonly ClaveModulo[]): string | null {
  return vistasDeCompras(modulos)[0]?.href ?? null;
}

/** Lo que cada pantalla ya leyó o la cabecera pide: `undefined` = no se sabe aún, `null` = se intentó leer y falló. */
export type ConteosDeCompras = {
  /** Cuánto espera a Compras: plata por confirmar, compras por completar, gastos por revisar y cierres por recibir. */
  revisar?: number | null;
  /** Los comprobantes con saldo y cuántos de ellos ya vencieron. */
  porPagar?: { conSaldo: number; vencidas: number } | null;
};

export type PestanaDeCompras = {
  clave: VistaCompras;
  etiqueta: string;
  href: string;
  conteo?: number;
  pide?: string;
  tono?: "neutro";
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Las pestañas con su contador. Ámbar = hay algo que hacer (con su texto para el lector); gris = solo informa. Si un conteo no se pudo
 * leer, la pestaña no lo muestra: nunca un 0 inventado (principio 9). El Historial no lleva contador: es el libro, no una tarea.
 */
export function pestanasDeCompras(vistas: ReturnType<typeof vistasDeCompras>, conteos: ConteosDeCompras): PestanaDeCompras[] {
  return vistas.map(({ clave, etiqueta, href }) => {
    const base: PestanaDeCompras = { clave, etiqueta, href };
    if (clave === "revisar" && typeof conteos.revisar === "number") {
      const n = conteos.revisar;
      return n > 0 ? { ...base, conteo: n, pide: "por revisar" } : { ...base, conteo: 0, pide: "por revisar", tono: "neutro" };
    }
    if (clave === "porpagar" && conteos.porPagar) {
      const { conSaldo, vencidas } = conteos.porPagar;
      if (conSaldo > 0 && vencidas > 0) return { ...base, conteo: conSaldo, pide: `por pagar, ${vencidas} ${plural(vencidas, "vencida", "vencidas")}` };
      return { ...base, conteo: conSaldo, pide: "por pagar", tono: "neutro" };
    }
    return base;
  });
}

/** Cuánto espera en «Revisar compras»: la suma de lo que muestran sus cuatro cifras. */
export function totalPorRevisar(c: { plata: number; papeles: number; gastos: number; cierres: number }): number {
  return c.plata + c.papeles + c.gastos + c.cierres;
}
