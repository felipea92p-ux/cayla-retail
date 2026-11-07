// La hoja «IGV del mes» de Impuestos (ADR-0620): el líder dice cuánto va a pagar de IGV por un mes, para que Ganancias y pérdidas lea el mes como se vive. Sin React ni red.
//
// PROMETE: lee lo escrito con la regla única de los montos, y aquí 0 es un monto válido y distinto de vacío: «no pago IGV este mes» se dice escribiendo 0. Las cifras de referencia salen de lo
// que Impuestos ya calcula y nunca precargan el campo: si la hoja propusiera el monto, se aceptaría sin pensarlo y dejaría de ser lo que dijo el líder.
// ASUME: la base vuelve a validar todo en `decir_igv_del_mes` (líder, mes abierto, dos decimales). Lo de aquí solo adelanta el error.
// NO HACE: no toca el libro ni Impuestos: el monto no cambia lo que se declara ni lo que dice el Balance.

import { MAX_MONTO_FINANZAS } from "./finanzas-topes";
import { solesCentimos } from "./flujo-caja-reglas";
import { nombreMes, type PanelImpuestos } from "./impuestos-reglas";
import { MONTO_ILEGIBLE, leerMontoPlata } from "./monto-plata-reglas";

export const NOTA_IGV_MAX = 500;

export type MontoDelIgv = { estado: "vacio" } | { estado: "mal"; motivo: string } | { estado: "ok"; monto: number };

/** Lo escrito en el campo. 0 vale: es decir que este mes no se paga IGV. */
export function leerMontoDelIgv(texto: string): MontoDelIgv {
  if (texto.trim() === "") return { estado: "vacio" };
  const n = leerMontoPlata(texto);
  if (n === null) return { estado: "mal", motivo: MONTO_ILEGIBLE };
  if (n < 0) return { estado: "mal", motivo: "El monto no puede ser negativo. Si no pagas IGV este mes, escribe 0." };
  if (n > MAX_MONTO_FINANZAS) return { estado: "mal", motivo: "El monto se pasa de S/ 1 000 000: revisa que no sobre un cero." };
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return { estado: "mal", motivo: "El monto lleva dos decimales como máximo." };
  return { estado: "ok", monto: n };
}

export type ReferenciaIgv = { clave: string; nombre: string; monto: number };

/** Con qué comparar antes de decir el monto: lo que calcula Impuestos de IGV (nunca la cifra grande, que puede ser solo renta), lo descontado por las compras, el saldo a favor y lo ya pagado. */
export function referenciasDelIgv(p: Pick<PanelImpuestos, "foco" | "pagos" | "mes">): ReferenciaIgv[] {
  const f = p.foco;
  const pagado = p.pagos?.find((x) => x.mes === p.mes)?.igv ?? 0;
  return [
    ...(f
      ? [
          { clave: "calcula", nombre: "Impuestos calcula de IGV", monto: f.aPagar },
          { clave: "compras", nombre: "IGV de tus compras del mes", monto: f.credito },
          ...(f.saldoAFavor > 0 ? [{ clave: "a_favor", nombre: "Saldo a favor al cerrar el mes", monto: f.saldoAFavor }] : []),
        ]
      : []),
    ...(pagado > 0 ? [{ clave: "pagado", nombre: "Ya pagaste de IGV", monto: pagado }] : []),
  ];
}

/** Lo que dice la pantalla bajo la cifra de Impuestos, para que no parezca que «Pagas» y lo dicho son lo mismo. */
export function fraseDelIgvDicho(dicho: number | null, mes: string): string {
  const nombre = nombreMes(mes);
  return dicho === null ? `Todavía no dijiste el IGV de ${nombre}: Ganancias resta todo el incluido en las ventas.` : `Dijiste ${solesCentimos(dicho)} de IGV en ${nombre}: es lo que resta Ganancias.`;
}

/** El aviso al guardar. `nuevo` falso: ya estaba dicho ese mismo monto y la base no agregó nada. */
export function avisoDelIgvDicho(monto: number, mes: string, nuevo: boolean): { titulo: string; detalle: string } {
  const nombre = nombreMes(mes);
  return nuevo
    ? { titulo: `IGV de ${nombre}: ${solesCentimos(monto)}`, detalle: "Ganancias y pérdidas ya lo usa. El libro y lo que declaras no cambian." }
    : { titulo: `El IGV de ${nombre} ya era ${solesCentimos(monto)}`, detalle: "No cambió nada." };
}
