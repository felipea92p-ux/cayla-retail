// Lo que dicen las cuatro cifras de arriba del Resumen de Producción, y desde cuándo hay ventas que las respalden (Formidable, 2026-10-27). Puro: sin Supabase ni React.
//
// Una persona nueva vio tres «0» seguidos (S/ 0.00 de capital, S/ 0.00 en proceso, 0 entregas) y no supo distinguir «no hay nada» de «todavía no se cargó». Un cero es un dato
// solo cuando de verdad se sabe: aquí, si el dato falta, la cifra lo dice y dice qué hacer (`TarjetaCifra valor={null}` con su motivo, ADR-0358). Los números que sí se
// saben no cambian: esto solo decide la frase y si la cifra va «sin dato».

import { soles } from "./compras-reglas";
import type { CifrasResumen } from "./produccion-decisiones";

export type TextoDeCifra = {
  /** El dato no se conoce (no se cargó): la tarjeta no pone un número sino «—» y este motivo. */
  sinDato: boolean;
  /** La línea de contexto, o el motivo si `sinDato`. */
  contexto: string;
};

export type TextosDeCifras = { capital: TextoDeCifra; valorEnProceso: TextoDeCifra; porPagar: TextoDeCifra; entregas: TextoDeCifra };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function textosDeCifras(c: CifrasResumen): TextosDeCifras {
  const capital: TextoDeCifra =
    c.insumosCargados === 0
      ? { sinDato: true, contexto: "Aún no hay insumos cargados. Cárgalos en Insumos y verás aquí cuánto tienes." }
      : c.capitalInsumos === null
        ? { sinDato: true, contexto: "Los insumos todavía no tienen costo cargado." }
        : { sinDato: false, contexto: c.insumosBajoMinimo > 0 ? plural(c.insumosBajoMinimo, "insumo bajo el mínimo", "insumos bajo el mínimo") : "a costo de cada lote" };

  const valorEnProceso: TextoDeCifra =
    c.ordenesEnProceso === 0
      ? { sinDato: false, contexto: "no hay órdenes abiertas" }
      : c.valorEnProceso === 0 && c.ordenesSinCosto > 0
        ? { sinDato: true, contexto: `${plural(c.ordenesSinCosto, "orden abierta", "órdenes abiertas")} todavía sin costo de tela ni avíos.` }
        : { sinDato: false, contexto: `tela y avíos de ${plural(c.ordenesEnProceso, "orden abierta", "órdenes abiertas")}${c.ordenesSinCosto > 0 ? ` · ${c.ordenesSinCosto} sin costo cargado` : ""}` };

  const porPagar: TextoDeCifra =
    c.facturasCargadas === 0
      ? { sinDato: true, contexto: "Aún no hay facturas de proveedores cargadas." }
      : { sinDato: false, contexto: c.vencido > 0 ? `${soles(c.vencido)} ya vencidos` : c.porPagar > 0 ? "nada vencido" : "no se debe nada" };

  const entregas: TextoDeCifra = {
    sinDato: false,
    contexto:
      c.entregasEnRiesgo > 0
        ? "vencidas o por vencer en 2 días"
        : c.ordenesSinFecha > 0
          ? `ninguna vencida · ${plural(c.ordenesSinFecha, "orden sin fecha de entrega", "órdenes sin fecha de entrega")}`
          : "ninguna vencida ni por vencer",
  };

  return { capital, valorEnProceso, porPagar, entregas };
}

// ---------------------------------------------------------------------------
// La edad de los datos
// ---------------------------------------------------------------------------

/** El día del primer movimiento del ERP en las tiendas (el censo de TRU, consultado en producción el 2026-10-27). Desde ahí se cuentan las ventas que respaldan un ritmo. */
export const VENTAS_DESDE = "2026-09-29";
/** Mientras haya menos semanas de ventas que esto, el Resumen avisa que las cantidades son una guía. Es el primer número razonable, NO ajustado con meses de venta: lo cambia Felipe tocando esta constante. */
export const SEMANAS_DE_HISTORIA_CORTA = 8;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * El aviso de que el sistema lleva poco tiempo midiendo ventas, o `null` si ya lleva suficiente (la nota se apaga sola). `hoy` es el día de Lima, «AAAA-MM-DD».
 * «El sistema lleva 4 semanas de ventas (desde el 29 de setiembre): las cantidades son una guía, no una orden.»
 */
export function notaDeHistoria(hoy: string, desde: string = VENTAS_DESDE): string | null {
  const dias = Math.floor((dia(hoy) - dia(desde)) / 86_400_000);
  const semanas = Math.floor(dias / 7);
  if (dias < 0 || semanas >= SEMANAS_DE_HISTORIA_CORTA) return null;
  const cuanto = semanas < 1 ? "menos de una semana" : semanas === 1 ? "1 semana" : `${semanas} semanas`;
  return `El sistema lleva ${cuanto} de ventas (desde el ${Number(desde.slice(8, 10))} de ${MESES[Number(desde.slice(5, 7)) - 1]}): las cantidades son una guía, no una orden.`;
}
