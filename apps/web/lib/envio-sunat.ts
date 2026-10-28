// Envío automático a SUNAT desde el navegador (D-60). Las dos llamadas van en segundo plano y nunca
// avisan nada: si Lucode no responde, la ruta deja el comprobante en la cola de reintento y la
// pantalla Comprobantes lo muestra. `x-espera: no` para que el loader global no bloquee a nadie
// (ADR-0149); `keepalive` para que salgan aunque se cierre la pestaña.

const OPCIONES = { method: "POST", headers: { "Content-Type": "application/json", "x-espera": "no" }, keepalive: true } as const;

/** Las ventas que esta pestaña ya mandó a declarar: una ráfaga de clics en «Cobrar» devuelve la MISMA venta varias veces (el
 *  token), y cada respuesta disparaba otro envío a Lucode (/chaos 2026-10-13, DC-02). Con esto sale uno solo por venta. */
const yaEnviadas = new Set<string>();

/** ¿Es la primera vez que esta pestaña manda esta venta? (La anota.) */
export function primeraVez(ventaId: string, enviadas: Set<string> = yaEnviadas): boolean {
  if (enviadas.has(ventaId)) return false;
  enviadas.add(ventaId);
  return true;
}

/** Declara la boleta o factura de una venta recién cobrada (una sola vez por venta en esta pestaña). */
export function enviarVentaASunat(ventaId: string): void {
  if (!primeraVez(ventaId)) return;
  fetch("/api/lucode/emitir", { ...OPCIONES, body: JSON.stringify({ venta_id: ventaId }) }).catch(() => {
    // Sin red: el comprobante sigue `pendiente` y lo recoge el próximo barrido.
  });
}

/** Lo que hizo una pasada del barrido: cuántos comprobantes intentó, cuántos preguntó y cuántos cambiaron con la consulta.
 *  `lucodeNoDisponible`: algún envío falló porque Lucode no respondió o no aceptó la clave; seguir sería insistirle. */
export type PasadaSunat = { tomados: number; consultados: number; actualizados: number; lucodeNoDisponible: boolean };

/** Motivos de `lib/lucode.ts` que dicen que Lucode no está para nadie (no que un comprobante tenga un problema). */
const SIN_LUCODE = new Set(["sin_respuesta", "sin_credenciales", "credenciales_invalidas"]);

/** Lee la respuesta de `/api/lucode/reintentar`. Pura, para probarla sin red. */
export function leerPasada(j: unknown): PasadaSunat {
  const o = (j && typeof j === "object" ? j : {}) as { tomados?: unknown; consultados?: unknown; actualizados?: unknown; resultados?: unknown };
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const resultados = Array.isArray(o.resultados) ? (o.resultados as { motivo?: unknown }[]) : [];
  return {
    tomados: n(o.tomados),
    consultados: n(o.consultados),
    actualizados: n(o.actualizados),
    lucodeNoDisponible: resultados.some((r) => typeof r?.motivo === "string" && SIN_LUCODE.has(r.motivo)),
  };
}

async function pasada(ubicacionId: string | null): Promise<PasadaSunat | null> {
  try {
    const r = await fetch("/api/lucode/reintentar", { ...OPCIONES, body: JSON.stringify({ ubicacion_id: ubicacionId }) });
    if (!r.ok) return null;
    return leerPasada(await r.json());
  } catch {
    return null;
  }
}

/** Reintenta lo vencido de la cola y pregunta por lo que quedó esperando a SUNAT (`null` = todas las sedes, solo
 *  líder). Devuelve cuántos comprobantes cambiaron o se intentaron: si es más de 0, la pantalla se refresca. */
export async function barrerColaSunat(ubicacionId: string | null): Promise<number> {
  const p = await pasada(ubicacionId);
  return p ? p.tomados + p.actualizados : 0;
}

/** Cuántas pasadas como mucho hace Comprobantes al abrirse: 10 × 3 = 30 comprobantes. Lo que quede, en la próxima visita. */
export const PASADAS_AL_ABRIR = 10;

/**
 * Vacía la cola al abrir Comprobantes (ADR-0378): una pasada toma 3, y con 40 atascados el aviso rojo tardaba 14 visitas
 * en irse. Repite mientras la pasada anterior encontró algo que hacer (y Lucode responde), con un tope. No se queda en un bucle: lo que falla
 * vuelve a la cola con su espera (15 min o más) y lo tomado que no alcanzó a enviarse queda reservado 5 min, así que la
 * pasada siguiente ya no lo ve. `alCambiar` se llama tras cada pasada que hizo algo (la pantalla se refresca y el
 * contador baja a la vista); `seguir` corta si la persona se fue de la pantalla.
 */
export async function vaciarColaSunat(
  ubicacionId: string | null,
  { alCambiar, seguir = () => true, pasadas = PASADAS_AL_ABRIR }: { alCambiar: () => void; seguir?: () => boolean; pasadas?: number },
): Promise<number> {
  let hechas = 0;
  while (hechas < pasadas && seguir()) {
    const p = await pasada(ubicacionId);
    hechas++;
    if (!p || p.tomados + p.consultados === 0) break;
    if (seguir()) alCambiar();
    // Lucode caído o sin clave: insistir no lo levanta. Lo que falló ya volvió a la cola con su espera.
    if (p.lucodeNoDisponible) break;
  }
  return hechas;
}
