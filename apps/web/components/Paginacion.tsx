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

/** Los números de página a dibujar: siempre 1 y la última, la actual con un
 *  vecino a cada lado, y `null` donde hay que cortar con "…". Ej. con 36
 *  páginas y la 20 activa: 1 … 19 20 21 … 36. */
function numerosDePagina(total: number, actual: number): (number | null)[] {
  const nums = new Set([1, total, actual - 1, actual, actual + 1]);
  const ordenados = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  for (let i = 0; i < ordenados.length; i++) {
    if (i > 0 && ordenados[i] - ordenados[i - 1] > 1) salida.push(null);
    salida.push(ordenados[i]);
  }
  return salida;
}

/** Paginación por número de página — "1 2 3…36". A diferencia de
 *  `PaginacionCursor`, exige saber el total de antemano (un `count(*)`), así
 *  que solo se usa donde ese costo es chico: ver la nota de decisión en
 *  `20260915160000_productos_listado_filtros.sql` (Productos, no Movimientos). */
export function PaginacionPaginas({
  pagina,
  totalPaginas,
  totalItems,
  params,
  pathname,
  sustantivo,
}: {
  pagina: number;
  totalPaginas: number;
  totalItems: number;
  params: Record<string, string | undefined>;
  pathname: string;
  sustantivo: [singular: string, plural: string];
}) {
  if (totalItems === 0) return null;

  function enlace(p: number) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") q.set(k, v);
    if (p > 1) q.set("pagina", String(p));
    const qs = q.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tinta/65">
      <span>
        {totalItems.toLocaleString("es-PE")} {totalItems === 1 ? sustantivo[0] : sustantivo[1]}
        {totalPaginas > 1 && ` · página ${pagina} de ${totalPaginas}`}
      </span>
      {totalPaginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <Link
            href={enlace(Math.max(1, pagina - 1))}
            aria-disabled={pagina === 1}
            className={`label-cayla px-1.5 py-1 text-[11px] ${pagina === 1 ? "pointer-events-none text-tinta/30" : "hover:text-rojo"}`}
          >
            ‹
          </Link>
          {numerosDePagina(totalPaginas, pagina).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-tinta/40">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={enlace(n)}
                aria-current={n === pagina ? "page" : undefined}
                className={`label-cayla min-w-[1.5rem] rounded-md px-1.5 py-1 text-center text-[11px] ${
                  n === pagina ? "bg-tinta text-crema" : "text-tinta/75 hover:text-rojo"
                }`}
              >
                {n}
              </Link>
            )
          )}
          <Link
            href={enlace(Math.min(totalPaginas, pagina + 1))}
            aria-disabled={pagina === totalPaginas}
            className={`label-cayla px-1.5 py-1 text-[11px] ${pagina === totalPaginas ? "pointer-events-none text-tinta/30" : "hover:text-rojo"}`}
          >
            ›
          </Link>
        </nav>
      )}
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
