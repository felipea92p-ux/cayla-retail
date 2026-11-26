import type { ReactNode } from "react";
import Link from "next/link";
import { SearchX, ShoppingBag } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Chip } from "@/components/ui/Chip";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { estadoDeCompra, llegadaDeCompra, nombreDelPapel, type CompraDelLibro } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { primerNombre } from "@/lib/fondos-reglas";

// Lo que se DIBUJA de Compras ▸ Todas las compras (ADR-0704, maqueta docs/maquetas/compras-reestructura-2026-11/, pantalla 3): reemplaza al
// Historial de compras. Una sola lista con lo de «Mis compras» desde que salió en un envío (decisión de Felipe, 2026-11-26) y lo que registró
// la oficina. Arriba, solo buscar, el mes y la persona; nada de cifras de contador, píldoras de estado ni orden por vencimiento. Cada fila
// dice quién compró, a quién, con qué papel, en qué envío salió, si ya se revisó y cuánto. No lee nada: lo arma la página.

// Día · Quién · Proveedor · Envío · Estado · Monto · flecha.
const PLANTILLA = "sm:grid-cols-[4.5rem_9.5rem_minmax(0,1fr)_12.5rem_10.5rem_7rem_1rem]";

export type PersonaDelFiltro = { id: string; nombre: string };

export function TodasLasComprasVista({
  compras,
  personas,
  personaId,
  busqueda,
  buscador,
  selectorMes,
  descargar,
  hrefPersona,
}: {
  /** `null`: no se pudo leer. */
  compras: CompraDelLibro[] | null;
  /** Quién compró en el mes (para el filtro), sin la persona elegida filtrada todavía. */
  personas: readonly PersonaDelFiltro[];
  personaId: string | null;
  busqueda: string;
  buscador: ReactNode;
  selectorMes: ReactNode;
  descargar?: ReactNode;
  /** La URL con esa persona elegida (`null` = todas), conservando el mes y la búsqueda. */
  hrefPersona: (id: string | null) => string;
}) {
  const total = (compras ?? []).reduce((a, c) => a + c.monto, 0);
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Todas las compras"
        subtitulo="Cada compra ya enviada a una tienda: quién la hizo y a quién se le compró."
        ayuda="Una compra de «Mis compras» aparece aquí cuando sale en un envío a la tienda: desde ahí ya no se edita. Antes, la ves en Compradores, en la tarjeta de quien la hizo."
        acciones={descargar}
      />

      <div className="card-cayla space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_18rem]">{buscador}</div>
          {selectorMes}
        </div>
        {personas.length > 1 && (
          // `suppressHydrationWarning`: `FilasQueSeDeslizan` (app/layout.tsx) le pone `data-mas-izq`/`data-mas-der` desde afuera de React.
          <nav aria-label="Quién compró" data-guia="todas.personas" className="pildoras-desliza gap-2 sm:flex-wrap" suppressHydrationWarning>
            <Link href={hrefPersona(null)} aria-current={personaId === null ? "page" : undefined} className="pildora-cayla shrink-0">
              Todas las personas
            </Link>
            {personas.map((p) => (
              <Link key={p.id} href={hrefPersona(p.id)} aria-current={personaId === p.id ? "page" : undefined} className="pildora-cayla shrink-0">
                {primerNombre(p.nombre)}
              </Link>
            ))}
          </nav>
        )}
        {compras && compras.length > 0 && (
          <p className="text-sm text-secundario" data-guia="todas.total">
            <span className="font-medium tabular-nums text-tinta">{soles(total)}</span> en {compras.length} {compras.length === 1 ? "compra" : "compras"}
          </p>
        )}
      </div>

      {compras === null ? (
        <Aviso tono="error" titulo="No se pudieron leer las compras">
          Vuelve a intentarlo en un momento.
        </Aviso>
      ) : compras.length === 0 ? (
        <div className="card-cayla">
          {personaId ? (
            <Vacio icono={<SearchX />} titulo={`${nombreDe(personas, personaId)} no tiene compras este mes${busqueda ? ` con «${busqueda}»` : ""}`} tamano="chico" />
          ) : busqueda ? (
            <Vacio icono={<SearchX />} titulo={`Nada con «${busqueda}» este mes`} tamano="chico" />
          ) : (
            <Vacio icono={<ShoppingBag />} titulo="Sin compras este mes" tamano="chico">
              Cuando una compra salga a la tienda, aparece aquí.
            </Vacio>
          )}
        </div>
      ) : (
        <div data-resultados>
          <Tabla guia="todas.lista">
            <Encabezado
              plantilla={PLANTILLA}
              columnas={[
                { titulo: "Día" },
                { titulo: "Quién" },
                { titulo: "Proveedor" },
                { titulo: "Envío" },
                { titulo: "Estado" },
                { titulo: "Monto", alinear: "der" },
                { titulo: "" },
              ]}
            />
            {compras.map((c) => (
              <FilaDelLibro key={`${c.origen}-${c.id}`} c={c} />
            ))}
          </Tabla>
        </div>
      )}
    </div>
  );
}

/** A dónde lleva la fila: al comprobante si ya existe; si no, a quien la compró (donde se revisa). */
export function hrefDeCompra(c: Pick<CompraDelLibro, "comprobante" | "personaId" | "origen" | "id">): string {
  if (c.comprobante) return `/compras/factura/${c.comprobante.id}`;
  if (c.personaId) return `/compras/compradores/${c.personaId}`;
  return `/compras/factura/${c.id}`;
}

/** El nombre de la persona del filtro; si la búsqueda la dejó fuera de la lista, «Esa persona». */
const nombreDe = (personas: readonly PersonaDelFiltro[], id: string) => {
  const p = personas.find((x) => x.id === id);
  return p ? primerNombre(p.nombre) : "Esa persona";
};

const MEDIOS: Record<string, string> = { yape: "Yape", efectivo: "Efectivo", transferencia: "Transferencia" };

function FilaDelLibro({ c }: { c: CompraDelLibro }) {
  const estado = estadoDeCompra(c, soles);
  const envio = c.envios.at(-1);
  const detalle = [nombreDelPapel(c.tipo), c.prendas > 0 ? `${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"}` : null, c.medioPago ? (MEDIOS[c.medioPago] ?? c.medioPago) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={hrefDeCompra(c)} className={fila(PLANTILLA)}>
      <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(c.fecha)}</span>
      <span className={celda("izq", "flex min-w-0 items-center gap-2 text-sm text-tinta")}>
        {c.personaId ? (
          <>
            <AvatarPersona personaId={c.personaId} nombre={c.persona ?? ""} tamano={24} />
            <span className="truncate">{primerNombre(c.persona ?? "")}</span>
          </>
        ) : (
          <span className="text-secundario">La oficina</span>
        )}
      </span>
      <span className={celda("izq", "min-w-0")}>
        <span className="block truncate text-sm font-medium text-tinta">{c.proveedor}</span>
        <span className="block whitespace-normal text-sm text-secundario">{c.comprobante?.documento ? `${detalle} · ${c.comprobante.documento}` : detalle}</span>
      </span>
      <span className={celda("izq", "whitespace-normal text-sm")}>
        {envio ? (
          <>
            <span className="block tabular-nums text-tinta">{envio.numero}</span>
            <span className="block text-secundario">{llegadaDeCompra(c)}</span>
          </>
        ) : (
          <span className="text-secundario">—</span>
        )}
      </span>
      <span className={celda("izq", "overflow-visible")}>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </span>
      <span className={celda("der", "text-sm tabular-nums text-tinta")}>{soles(c.monto)}</span>
      <span aria-hidden className="hidden text-right text-base leading-none text-tenue sm:block">
        ›
      </span>
    </Link>
  );
}
