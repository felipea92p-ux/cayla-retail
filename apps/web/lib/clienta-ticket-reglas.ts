/**
 * La clienta del ticket del Punto de venta (spike 2026-09-26, hallazgo 4). Se busca en la libreta (`buscar_clienta`:
 * DNI, celular o nombre) y, elegida, sus datos pasan solos al comprobante y a la proforma o el apartado.
 *
 * Lo que NO hace todavía, a propósito: la pregunta del club y «es para regalo» (paso 1 del acta de clientas,
 * `docs/datos/DECISIONES-2026-09-26-clientas.md`). Necesitan el historial de permisos (G.2) que la base aún no tiene.
 */
export type ClientaDelTicket = { id: string; nombre: string | null; dni: string | null; celular: string | null };

/** El DNI a medias en pantalla (71•••482): el mostrador lo ve la clienta de al lado. Completo viaja al comprobante. */
export function dniEnmascarado(dni: string | null): string | null {
  if (!dni) return null;
  const d = dni.trim();
  if (d.length < 6) return d;
  return `${d.slice(0, 2)}•••${d.slice(-3)}`;
}

/** Lo que se lee de ella en la fila del ticket: nombre (o, si la ficha no lo tiene, el documento) y un dato para
 *  confirmar que es ella. */
export function lineaDeClienta(c: ClientaDelTicket): { titulo: string; detalle: string } {
  const dni = dniEnmascarado(c.dni);
  const titulo = c.nombre?.trim() || (dni ? `DNI ${dni}` : c.celular ? `Cel. ${c.celular}` : "Clienta sin nombre");
  const partes = [dni && c.nombre ? `DNI ${dni}` : null, c.celular ? `Cel. ${c.celular}` : null].filter(Boolean);
  return { titulo, detalle: partes.join(" · ") };
}

/**
 * Qué muestra la fila «Clienta» del ticket (ADR-0249, actualización 2026-09-28). La libreta es del módulo «Clientas»: la
 * base le rechaza la búsqueda a la cuenta cuyo rol no lo tiene (42501 `clientas_sin_modulo`), así que a esa cuenta no se le
 * ofrece — un botón que siempre falla le enseña a la cajera que el sistema falla —, y se vende igual: el DNI y el nombre van
 * en el comprobante. Una clienta que ya venía en el ticket (retomado de otra cuenta) se deja ver y quitar, no cambiar:
 * cambiarla es buscar.
 *   · `agregar`: sin clienta, con el módulo («Agregar clienta»).
 *   · `nada`: sin clienta, sin el módulo (la fila no aparece).
 *   · `elegida`: con clienta, se puede cambiar o quitar.
 *   · `elegida_fija`: con clienta, sin el módulo: solo quitar.
 */
export type FilaClienta = "agregar" | "nada" | "elegida" | "elegida_fija";
export function filaDeClienta(clienta: ClientaDelTicket | null, puedeBuscar: boolean): FilaClienta {
  if (!clienta) return puedeBuscar ? "agregar" : "nada";
  return puedeBuscar ? "elegida" : "elegida_fija";
}

/** Qué se busca: nada con menos de 3 caracteres (un «7» traería media libreta). */
export function terminoBuscable(texto: string): string | null {
  const t = texto.trim();
  return t.length >= 3 ? t : null;
}
