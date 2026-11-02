// El estado de la comparación con SUNAT de un mes, para avisarlo donde se decide (ADR-0601, actividad 4): en «Antes de declarar» de
// Impuestos y en el Cierre de mes. Lógica pura sobre el MISMO cruce de «Comparar con SUNAT» (`aplicarResoluciones`): no hay una segunda
// cuenta de diferencias en otra parte. Solo avisa: nunca frena declarar ni cerrar (Felipe aprobó «aviso», 2026-11-02).

import type { ComparacionSire } from "./sire";
import type { LineaPendiente } from "./impuestos-antes-reglas";
import type { Chequeo } from "./cierre-reglas";

export type EstadoRegistroSire = { subida: boolean; porMirar: number; igv: number; resueltas: number };

/** `null` en un registro: no se pudo leer (sin el módulo Impuestos, la base no respondió). Se calla, no se adivina. */
export type EstadoSire = { mes: string; compras: EstadoRegistroSire | null; ventas: EstadoRegistroSire | null };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lo que importa de una comparación: si se subió, cuánto queda por mirar (con su IGV) y cuánto se resolvió. */
export function estadoDeRegistro(c: Pick<ComparacionSire, "propuesta" | "cruce" | "falla">): EstadoRegistroSire | null {
  if (c.falla) return null;
  if (!c.propuesta) return { subida: false, porMirar: 0, igv: 0, resueltas: 0 };
  if (!c.cruce) return null;
  const r = c.cruce.resumen;
  return {
    subida: true,
    porMirar: r.solo_erp.n + r.solo_sunat.n + r.montos.n,
    igv: redondear(r.solo_erp.igv + r.solo_sunat.igv + r.montos.igv),
    resueltas: c.cruce.resueltas,
  };
}

/**
 * Las líneas de «Antes de declarar» (Impuestos). Solo de un mes que ya terminó: la propuesta de un mes en curso todavía cambia.
 * Compras avisa también si no se subió (ahí se esconde el IGV que no se descuenta); ventas solo si se subió y algo no cuadra.
 */
export function lineasSireImpuestos(e: EstadoSire | null, mesActual: string): LineaPendiente[] {
  if (!e || e.mes >= mesActual) return [];
  const href = (registro: "compras" | "ventas") => `/finanzas/impuestos/sire?mes=${e.mes}${registro === "ventas" ? "&registro=ventas" : ""}`;
  const lineas: LineaPendiente[] = [];
  if (e.compras && !e.compras.subida) {
    lineas.push({ id: "sire_compras_sin_subir", tono: "gris", texto: "Compras sin comparar con SUNAT", monto: 0, detalle: "Baja la propuesta del portal SIRE y compárala antes de que el contador la acepte.", href: href("compras") });
  }
  for (const registro of ["compras", "ventas"] as const) {
    const r = e[registro];
    if (r?.subida && r.porMirar > 0) {
      lineas.push({
        id: `sire_${registro}`,
        tono: "ambar",
        texto: `${plural(r.porMirar, "diferencia", "diferencias")} con SUNAT en ${registro}`,
        monto: r.igv,
        detalle: "IGV de lo que no cuadra. Resuélvelas antes de que el contador acepte la propuesta.",
        href: href(registro),
      });
    }
  }
  return lineas;
}

/**
 * El aviso del Cierre de mes (la unidad «empresa»: la propuesta es del RUC entero). Nunca bloquea. `null` si no se sabe nada de compras:
 * un aviso sin dato confunde más de lo que ayuda.
 */
export function chequeoSire(e: EstadoSire | null): Chequeo | null {
  if (!e?.compras) return null;
  const porMirar = e.compras.porMirar + (e.ventas?.subida ? e.ventas.porMirar : 0);
  return {
    clave: "sire",
    ok: e.compras.subida && porMirar === 0,
    bloquea: false,
    datos: { subida: e.compras.subida, por_mirar: porMirar, resueltas: e.compras.resueltas + (e.ventas?.resueltas ?? 0) },
  };
}
