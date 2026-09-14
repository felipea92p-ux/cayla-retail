import Link from "next/link";
import type { Cursor } from "@/lib/compras";

// Paginación por cursor (keyset). Solo hay "siguiente" y "volver al inicio":
// un cursor dice "las 50 después de ESTA fila", y eso Postgres lo resuelve
// saltando por el índice sin importar cuántas haya antes. Un "página 7 de
// 2.000" exigiría OFFSET (leer y descartar 300 filas × 6) o un COUNT(*) de
// toda la tabla en cada carga — las dos cosas que un millón de filas no
// perdona. Para ir a un punto exacto están los filtros, no el número de página.
export function serializarCursor(c: Cursor): string {
  return `${c.fecha}~${c.id}`;
}

export function leerCursor(texto: string | undefined): Cursor | null {
  if (!texto) return null;
  const [fecha, id] = texto.split("~");
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") && /^[0-9a-f-]{36}$/i.test(id ?? "") ? { fecha, id } : null;
}

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
  if (mostradas === 0 && !hayCursor) return null;

  function enlace(cursor: Cursor | null) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "cursor") p.set(k, v);
    if (cursor) p.set("cursor", serializarCursor(cursor));
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tinta/65">
      <span>
        {mostradas === 0 ? "Sin resultados en esta página." : `${mostradas} factura${mostradas === 1 ? "" : "s"} en esta página`}
      </span>
      <span className="flex gap-4">
        {hayCursor && (
          <Link href={enlace(null)} className="label-cayla text-[11px] hover:text-rojo">
            ← Volver al inicio
          </Link>
        )}
        {siguiente && (
          <Link href={enlace(siguiente)} className="label-cayla text-[11px] text-tinta hover:text-rojo">
            Siguiente página →
          </Link>
        )}
      </span>
    </div>
  );
}
