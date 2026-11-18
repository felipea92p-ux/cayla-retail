// Configuración ▸ Gastos con CLAURE (ADR-0560, actividad 17): lógica pura, sin servidor ni navegador. La base dice qué parte de cada categoría de gasto de Tienda Lima es de CLAURE
// (`fn_reparto_claure`, 20261029161000) y la guarda (`guardar_reparto_claure`); aquí solo se lee esa lista, se valida lo escrito y se dice en palabras de tienda.

export type FilaReparto = {
  /** El código de `categorias_gasto`. */
  categoria: string;
  nombre: string;
  /** Qué se anota ahí («Lejía, detergente, trapeador…»). */
  ejemplos: string;
  /** La parte de CLAURE: de 0 (todo de CAYLA) a 100 (todo de CLAURE). */
  pct: number;
  /** Cuándo se cambió por última vez (`null` si nunca: vale el de fábrica). */
  actualizadoEn: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function leerReparto(crudo: unknown): FilaReparto[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.map((f) => {
    const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    return {
      categoria: String(r.categoria ?? ""),
      nombre: String(r.nombre ?? r.categoria ?? ""),
      ejemplos: String(r.ejemplos ?? ""),
      pct: num(r.pct_claure),
      actualizadoEn: r.actualizado_en ? String(r.actualizado_en) : null,
    };
  });
}

/**
 * Lo que la persona escribió en la casilla («50», «12,5», «12.5 %»). De 0 a 100, con hasta dos decimales: los mismos límites que `guardar_reparto_claure`, dichos con las mismas palabras
 * para que la pantalla y la base no se contradigan.
 */
export function validarPct(texto: string): { ok: true; valor: number } | { ok: false; error: string } {
  const limpio = texto.replace(/%/g, "").trim().replace(",", ".");
  if (limpio === "" || !/^\d+(\.\d{0,2})?$/.test(limpio)) return { ok: false, error: "Escribe un número de 0 a 100 (por ejemplo, 50)." };
  const valor = Number(limpio);
  if (!(valor >= 0 && valor <= 100)) return { ok: false, error: "La parte de CLAURE va de 0 % a 100 %." };
  return { ok: true, valor: Math.round(valor * 100) / 100 };
}

/** Lo que significa ese porcentaje, en palabras de tienda. */
export function etiquetaReparto(pct: number): string {
  if (pct <= 0) return "Todo de CAYLA";
  if (pct >= 100) return "Todo de CLAURE";
  if (pct === 50) return "Mitad y mitad";
  return `${pct} % de CLAURE y el resto de CAYLA`;
}

/** La casilla como se muestra: sin ceros de más («50», «12.5»). */
export function textoPct(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}
