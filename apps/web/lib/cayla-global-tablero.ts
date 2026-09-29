// CAYLA Global ▸ Salud del negocio (ADR-0275): las reglas del tablero, sin tocar la base. Lógica pura: la usan la
// página (servidor) y sus pruebas (`cayla-global-tablero.test.ts`).
//
// PROMETE: leer lo que devuelve `fn_global_cobertura()` sin confiar en su forma, y decir de cada sede si tiene datos en
// el ERP con palabras del negocio. Nunca convierte «no hay datos» en un cero: una sede que no opera en el ERP dice eso,
// no «vendió 0» (la operación real de CAYLA sigue en Alegra al 2026-09-28; el tablero lo tiene que decir, no esconder).

export type FilaCobertura = {
  ubicacionId: string;
  nombre: string;
  tipo: "tienda" | "taller" | "almacen";
  /** Fecha de Lima (YYYY-MM-DD) de la primera venta completada en el ERP, o `null` si nunca vendió en el ERP. */
  primeraVenta: string | null;
  ultimaVenta: string | null;
  ventas30d: number;
  unidadesStock: number;
};

export type EstadoCobertura = { texto: string; tono: "verde" | "ambar" | "pizarra" };

function texto(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x : null;
}

function numero(x: unknown): number {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Lee las filas de `fn_global_cobertura()`. Una fila sin id o sin nombre se descarta (no se inventa una sede). */
export function leerCobertura(datos: unknown): FilaCobertura[] {
  if (!Array.isArray(datos)) return [];
  return datos.flatMap((d): FilaCobertura[] => {
    const f = (d ?? {}) as Record<string, unknown>;
    const ubicacionId = texto(f.ubicacion_id);
    const nombre = texto(f.nombre);
    if (!ubicacionId || !nombre) return [];
    const tipo = f.tipo === "taller" || f.tipo === "almacen" ? f.tipo : "tienda";
    return [{
      ubicacionId,
      nombre,
      tipo,
      primeraVenta: texto(f.primera_venta),
      ultimaVenta: texto(f.ultima_venta),
      ventas30d: numero(f.ventas_30d),
      unidadesStock: numero(f.unidades_stock),
    }];
  });
}

/** Qué decir de una sede. El Taller no le vende a clientas (se mide contra maquilar afuera, ADR-0275): que no tenga
 *  ventas no es falta de datos; lo que dice si opera en el ERP es su stock. */
export function estadoDeCobertura(f: FilaCobertura): EstadoCobertura {
  if (f.tipo !== "tienda") {
    return f.unidadesStock > 0 ? { texto: "Con stock en el ERP", tono: "verde" } : { texto: "Aún no opera en el ERP", tono: "pizarra" };
  }
  if (!f.primeraVenta) return { texto: "Aún no vende en el ERP", tono: "pizarra" };
  if (f.ventas30d === 0) return { texto: "Sin ventas en 30 días", tono: "ambar" };
  return { texto: "Vende en el ERP", tono: "verde" };
}

/** «Tiene datos» para la cifra de arriba: una tienda que ya vendió en el ERP, o un taller o almacén con stock. */
export function tieneDatos(f: FilaCobertura): boolean {
  return f.tipo === "tienda" ? f.primeraVenta !== null : f.unidadesStock > 0;
}

export function resumenCobertura(filas: readonly FilaCobertura[]) {
  return {
    conDatos: filas.filter(tieneDatos).length,
    total: filas.length,
    ventas30d: filas.reduce((s, f) => s + f.ventas30d, 0),
    unidadesStock: filas.reduce((s, f) => s + f.unidadesStock, 0),
    /** La primera venta de toda CAYLA en el ERP: desde cuándo hay historia propia. */
    desde: filas.map((f) => f.primeraVenta).filter((x): x is string => x !== null).sort()[0] ?? null,
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «28 sep 2026» de una fecha `aaaa-mm-dd` (sin `Intl`: servidor y navegador dicen lo mismo). `—` si no hay fecha. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  const mes = MESES[Number(m) - 1];
  return mes && a && d ? `${Number(d)} ${mes} ${a}` : "—";
}
