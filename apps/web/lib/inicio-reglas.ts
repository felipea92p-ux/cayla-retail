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
