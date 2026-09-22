// Reglas puras de la pantalla Inicio (sin base de datos: se prueban solas).
// Las lecturas viven en `lib/inicio.ts`.

/** Suma las unidades de las filas de `stock` de una sede. `null` = la lectura falló: no es
 *  «0 unidades», es «no sé», y la pantalla lo dice con «—» en vez de una cifra que parezca
 *  normalidad. */
export function sumarUnidades(filas: { cantidad: number }[] | null): number | null {
  if (filas === null) return null;
  return filas.reduce((acc, f) => acc + f.cantidad, 0);
}

/** Lo que se pinta en una tarjeta: la cifra, o «—» si no se pudo leer. */
export function textoCifra(n: number | null): string {
  return n === null ? "—" : String(n);
}

/** Las tarjetas comparten una sola línea de aviso: muestra la primera que falló. */
export function primerAviso(avisos: (string | null)[]): string | null {
  return avisos.find((a): a is string => a !== null) ?? null;
}

/** Un renglón de «Por atender»: algo que espera a quien mira. */
export type PendienteInicio = { clave: string; texto: string; href: string };

/** Cuántas cosas de cada tipo esperan. `null` = la lectura falló (no es «cero»);
 *  `undefined` = no aplica a este rol (una integrante no aprueba devoluciones). */
export type ConteosPendientes = { traslados: number | null; devoluciones: number | null | undefined };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Arma la bandeja «Por atender». Se ESCONDE cuando no hay nada (su valor está en cuándo no
 * aparece) — y por eso una lectura caída jamás puede esconderla: entra como un renglón más,
 * «esta bandeja está incompleta». Sin eso, un fallo se leería igual que un día tranquilo
 * (BACKLOG, lección de `lib/pendientes`).
 */
export function armarPendientes(c: ConteosPendientes): { items: PendienteInicio[]; incompleta: boolean } {
  const items: PendienteInicio[] = [];
  if (c.traslados !== null && c.traslados > 0) {
    items.push({
      clave: "traslados",
      texto: `${plural(c.traslados, "traslado espera", "traslados esperan")} tu acción`,
      href: "/inventario/traslados",
    });
  }
  if (c.devoluciones !== undefined && c.devoluciones !== null && c.devoluciones > 0) {
    items.push({
      clave: "devoluciones",
      texto: `${plural(c.devoluciones, "devolución por aprobar", "devoluciones por aprobar")}`,
      href: "/devoluciones",
    });
  }
  return { items, incompleta: c.traslados === null || c.devoluciones === null };
}

/** El bloque «Hoy en tu sede»: caja, ventas del día y meta. Visible para todo rol —
 *  la integrante ya ve pasar cada venta por caja; sin la meta al lado el número no
 *  le sirve para decidir nada (decisión de Felipe, 2026-09-22: transparencia real,
 *  no jerarquía, en lo que no compromete a otra persona — costo/margen quedan fuera). */
export type EstadoHoy = {
  cajaAbierta: boolean | null; // null = no se pudo leer
  ventasHoy: number | null;
  metaVentaDiaria: number | null;
};

/** % de la meta alcanzado, tope 100 (igual que la barra de Caja, `CajaAbiertaPanel.tsx:123`).
 *  `null` si falta la venta, la meta, o la sede no tiene meta configurada. */
export function progresoMeta(ventasHoy: number | null, meta: number | null): number | null {
  if (ventasHoy === null || meta === null || meta <= 0) return null;
  return Math.min(100, Math.round((ventasHoy / meta) * 100));
}
