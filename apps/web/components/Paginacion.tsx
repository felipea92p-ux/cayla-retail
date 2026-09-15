import Link from "next/link";
import type { Cursor } from "@/lib/compras";

// Paginación por cursor (keyset). Solo hay "siguiente" y "volver al inicio":
// un cursor dice "las 50 después de ESTA fila", y eso Postgres lo resuelve
// saltando por el índice sin importar cuántas haya antes. Un "página 7 de
// 2.000" exigiría OFFSET (leer y descartar 300 filas × 6) o un COUNT(*) de
// toda la tabla en cada carga — las dos cosas que un millón de filas no
// perdona. Para ir a un punto exacto están los filtros, no el número de página.
export function serializarCursor(c: Cursor): string {
  return `${c.fecha}~${c.creadoEn}~${c.id}`;
}

// `creadoEn` viaja tal cual lo devuelve Postgres (ISO con microsegundos y
// zona): se le reenvía sin tocar, así el `<` del cursor compara exacto.
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const ES_UUID = /^[0-9a-f-]{36}$/i;

export function leerCursor(texto: string | undefined): Cursor | null {
  if (!texto) return null;
  const [fecha, creadoEn, id] = texto.split("~");
  return ES_FECHA.test(fecha ?? "") && ES_TIMESTAMP.test(creadoEn ?? "") && ES_UUID.test(id ?? "")
    ? { fecha, creadoEn, id }
    : null;
}

/** La paginación de cualquier listado por cursor. Recibe el cursor YA
 *  serializado: cada módulo tiene el suyo (Compras, tres partes; Movimientos,
 *  dos) y este componente no necesita saber cómo se arma — solo lo pone en
 *  la URL. `sustantivo` en singular y plural para «12 facturas en esta página». */
export function PaginacionCursor({
  mostradas,
  cursorSiguiente,
  hayCursor,
  params,
  pathname,
  sustantivo,
}: {
  mostradas: number;
  cursorSiguiente: string | null;
  hayCursor: boolean;
  params: Record<string, string | undefined>;
  pathname: string;
  sustantivo: [singular: string, plural: string];
}) {
  if (mostradas === 0 && !hayCursor) return null;

  function enlace(cursor: string | null) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "cursor") p.set(k, v);
    if (cursor) p.set("cursor", cursor);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tinta/65">
      <span>
        {mostradas === 0 ? "Sin resultados en esta página." : `${mostradas} ${mostradas === 1 ? sustantivo[0] : sustantivo[1]} en esta página`}
      </span>
      <span className="flex gap-4">
        {hayCursor && (
          <Link href={enlace(null)} className="label-cayla text-[11px] hover:text-rojo">
            ← Volver al inicio
          </Link>
        )}
        {cursorSiguiente && (
          <Link href={enlace(cursorSiguiente)} className="label-cayla text-[11px] text-tinta hover:text-rojo">
            Siguiente página →
          </Link>
        )}
      </span>
    </div>
  );
}

/** La paginación de Compras: mismo comportamiento de siempre, sobre `PaginacionCursor`. */
export function Paginacion({
  mostradas,
  siguiente,
  hayCursor,
  params,
  pathname,
}: {
  mostradas: number;
  siguiente: Cursor | null;
  hayCursor: boolean;
  params: Record<string, string | undefined>;
  pathname: string;
}) {
  return (
    <PaginacionCursor
      mostradas={mostradas}
      cursorSiguiente={siguiente ? serializarCursor(siguiente) : null}
      hayCursor={hayCursor}
      params={params}
      pathname={pathname}
      sustantivo={["factura", "facturas"]}
    />
  );
}
