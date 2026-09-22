"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import type { Sububicacion } from "@/lib/sububicaciones";
import type { ProductoListado, VarianteCatalogo } from "@/lib/catalogo-v2";
import { alertaDeStock, textoDeStock, EXPLICACION_STOCK_TOTAL, MENSAJE_SIN_RESULTADOS } from "@/lib/productos-stock";

/**
 * Catálogo en grilla (ADR-0077) — alternativa visual a `ProductosAgrupados`,
 * misma fuente de datos (`ProductoListado[]`, ya filtrada/paginada por
 * `fn_productos`), sin pedir nada nuevo al servidor.
 *
 * Foto real por color cuando existe (20260917190000, `variantes[].fotoUrl`)
 * — si un color todavía no tiene foto, la tarjeta muestra un tinte derivado
 * de ese color en vez de un ícono de "foto rota": un placeholder honesto,
 * nunca genérico.
 */

type ColorDisponible = { nombre: string; hex: string; fotoUrl: string | null };

function coloresDe(variantes: VarianteCatalogo[]): ColorDisponible[] {
  const vistos = new Map<string, ColorDisponible>();
  for (const v of variantes) {
    if (!v.color) continue;
    if (!vistos.has(v.color)) vistos.set(v.color, { nombre: v.color, hex: v.colorHex ?? "#8A8A8A", fotoUrl: v.fotoUrl });
  }
  return [...vistos.values()];
}

/** Mismo criterio que `rangoCosto` en `ProductosAgrupados.tsx`, aplicado a precio. */
function rangoPrecio(variantes: VarianteCatalogo[]): string {
  if (variantes.length === 0) return "—";
  const precios = variantes.map((v) => v.precio);
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  return min === max ? `S/${min.toFixed(2)}` : `S/${min.toFixed(2)}–${max.toFixed(2)}`;
}

/** Tinte de fondo del color activo, mezclado hacia crema — el mismo cálculo
 *  que se probó en el mockup antes de escribir este componente. */
function mezclar(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16) || 0;
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const base = { r: 245, g: 240, b: 232 }; // crema
  const mr = Math.round(r * pct + base.r * (1 - pct));
  const mg = Math.round(g * pct + base.g * (1 - pct));
  const mb = Math.round(b * pct + base.b * (1 - pct));
  return `rgb(${mr}, ${mg}, ${mb})`;
}

function IconoPercha({ color, size = 36 }: { color?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? "#1a1a18"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-45"
      aria-hidden
    >
      <path d="M32 8a5 5 0 1 1 5 5" />
      <path d="M32 13v6" />
      <path d="M8 40 L32 19 L56 40" />
      <path d="M8 40 Q32 52 56 40" />
    </svg>
  );
}

/** Grupo de swatches — vista previa al pasar el mouse o enfocar, se fija con
 *  clic/Enter. `activo` es el nombre del color que se está mostrando ahora
 *  (hover, o si no hay hover, el fijado, o si no hay ninguno, el primero). */
function SwatchesColor({
  colores,
  activo,
  onHover,
  onFijar,
  tamano = "h-4 w-4",
}: {
  colores: ColorDisponible[];
  activo: string | null;
  onHover: (nombre: string | null) => void;
  onFijar: (nombre: string) => void;
  tamano?: string;
}) {
  if (colores.length === 0) return null;
  return (
    // onMouseLeave/onBlur van en el GRUPO, no en cada botón: `mouseleave` no
    // burbujea entre hermanos, así que mover el mouse de un swatch al
    // vecino nunca pasa por un instante "sin hover" — antes, con el
    // handler en cada botón, ese instante hacía caer `activo` al primer
    // color de la lista (el fallback de `nombreActivo`) y el anillo
    // "saltaba" ahí antes de asentarse en el nuevo, un parpadeo que se
    // sentía trabado. Mismo motivo para el blur por teclado: `relatedTarget`
    // decide si el foco se fue del grupo entero, no solo del botón actual.
    <div
      role="radiogroup"
      aria-label="Color"
      className="flex items-center gap-1.5"
      onMouseLeave={() => onHover(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onHover(null);
      }}
    >
      {colores.map((c) => (
        <button
          key={c.nombre}
          type="button"
          role="radio"
          aria-checked={c.nombre === activo}
          aria-label={c.nombre}
          onMouseEnter={() => onHover(c.nombre)}
          onFocus={() => onHover(c.nombre)}
          onClick={() => onFijar(c.nombre)}
          className={`${tamano} shrink-0 rounded-full transition-transform duration-150 hover:scale-110 ${
            c.nombre === activo ? "ring-2 ring-tinta ring-offset-1 ring-offset-papel" : "ring-1 ring-tinta/20"
          }`}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}

export function ProductosGrilla({
  productos,
  ubicacionId,
  sububicaciones,
  puedeAjustar,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
}: {
  productos: ProductoListado[];
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  puedeAjustar: boolean;
  mensajeVacio?: string;
}) {
  if (productos.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/75">{mensajeVacio}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {productos.map((p) => (
        <TarjetaProducto key={p.productoId} producto={p} ubicacionId={ubicacionId} sububicaciones={sububicaciones} puedeAjustar={puedeAjustar} />
      ))}
    </div>
  );
}

function TarjetaProducto({
  producto,
  ubicacionId,
  sububicaciones,
  puedeAjustar,
}: {
  producto: ProductoListado;
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  puedeAjustar: boolean;
}) {
  const colores = coloresDe(producto.variantes);
  const [colorFijo, setColorFijo] = useState<string | null>(null);
  const [colorHover, setColorHover] = useState<string | null>(null);
  const [vistaRapida, setVistaRapida] = useState(false);
  const [ajustando, setAjustando] = useState(false);

  const nombreActivo = colorHover ?? colorFijo ?? colores[0]?.nombre ?? null;
  const activo = colores.find((c) => c.nombre === nombreActivo) ?? null;
  const tinte = activo ? mezclar(activo.hex, 0.16) : "#efe9dd";

  // Una prenda descontinuada no dispara alertas y se ve como tal; «Sin stock» no es rojo (lib/productos-stock.ts).
  // /70 y no /55: el número de una descontinuada con stock (una liquidación) es justo el que más hay que poder leer.
  const descontinuado = producto.estado !== "activo";
  const alerta = alertaDeStock(producto);
  const tonoStock = descontinuado ? "text-tinta/70" : "text-tinta/75";

  return (
    <div className="card-cayla flex flex-col overflow-hidden transition-transform duration-260 ease-cayla hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => setVistaRapida(true)}
        aria-label={`Vista rápida de ${producto.referencia}${descontinuado ? " (descontinuado)" : ""}`}
        className="relative aspect-[4/5] w-full text-left outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-rojo/40 focus-visible:ring-inset"
        style={activo?.fotoUrl ? undefined : { background: tinte }}
      >
        {activo?.fotoUrl ? (
          <Image src={activo.fotoUrl} alt={`${producto.referencia} — ${activo.nombre}`} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" unoptimized />
        ) : (
          <>
            <div className="flex h-full items-center justify-center">
              <IconoPercha color={activo?.hex} />
            </div>
            <span className="label-cayla absolute right-2.5 top-2.5 rounded-full bg-papel/85 px-2 py-1 text-[9px] text-tinta/70">
              Muestra{activo ? ` — ${activo.nombre}` : ""}
            </span>
          </>
        )}
        {descontinuado && (
          // Abajo a la izquierda: arriba a la derecha ya vive «Muestra — color» y en una tarjeta angosta chocarían.
          // Con fondo propio: sobre una foto oscura, un chip transparente no se lee.
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-papel/90">
            <Chip tono="apagado" tachado={false}>
              Descontinuado
            </Chip>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2.5 px-4 py-4">
        <div>
          <p className="font-display text-[17px] leading-tight text-tinta">{producto.referencia}</p>
          <p className="label-cayla mt-0.5 text-[10px] text-tinta/55">
            {producto.codigo ?? "sin código"} · {producto.categoria ?? "sin categoría"}
          </p>
          {/* De quién es y quién lo trae (ADR-0109). */}
          <p className="mt-0.5 truncate text-[11px] text-tinta/60" title={`${producto.marca} · ${producto.proveedor}`}>
            {producto.marca} <span className="text-tinta/35">·</span> {producto.proveedor}
          </p>
        </div>
        <div className="h-px bg-sand" />
        {/* «Stock total N» es más largo que el «Stock N» de antes: en la grilla de 2 columnas de un teléfono no cabe junto al precio y baja a la línea siguiente. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1.5">
          <span className="text-[15px] font-semibold tabular-nums text-tinta">{rangoPrecio(producto.variantes)}</span>
          <span title={EXPLICACION_STOCK_TOTAL} className={`ml-auto whitespace-nowrap text-[12.5px] font-semibold tabular-nums ${tonoStock}`}>
            {alerta === "sin_stock" ? (
              <Chip tono="neutro" versalitas={false}>
                Sin stock
              </Chip>
            ) : alerta === "bajo" ? (
              <Chip tono="ambar" versalitas={false}>
                Stock bajo: {producto.stockTotal}
              </Chip>
            ) : (
              textoDeStock(producto.stockTotal)
            )}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <SwatchesColor colores={colores} activo={nombreActivo} onHover={setColorHover} onFijar={setColorFijo} />
          <span className="text-[11px] text-tinta/55">{activo?.nombre ?? ""}</span>
        </div>
      </div>

      {vistaRapida && (
        <VistaRapidaModal
          producto={producto}
          colores={colores}
          colorInicial={nombreActivo}
          onClose={() => setVistaRapida(false)}
          puedeAjustar={puedeAjustar}
          onAjustarInventario={() => {
            setVistaRapida(false);
            setAjustando(true);
          }}
        />
      )}
      {ajustando && (
        <AjustarInventarioModal
          productoId={producto.productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          onClose={() => setAjustando(false)}
        />
      )}
    </div>
  );
}

function VistaRapidaModal({
  producto,
  colores,
  colorInicial,
  onClose,
  onAjustarInventario,
  puedeAjustar,
}: {
  producto: ProductoListado;
  colores: ColorDisponible[];
  colorInicial: string | null;
  onClose: () => void;
  onAjustarInventario: () => void;
  puedeAjustar: boolean;
}) {
  const [colorFijo, setColorFijo] = useState<string | null>(colorInicial);
  const [colorHover, setColorHover] = useState<string | null>(null);

  const nombreActivo = colorHover ?? colorFijo ?? colores[0]?.nombre ?? null;
  const activo = colores.find((c) => c.nombre === nombreActivo) ?? null;
  const tinte = activo ? mezclar(activo.hex, 0.16) : "#efe9dd";

  return (
    <Modal titulo={producto.referencia} subtitulo={producto.codigo ?? undefined} onClose={onClose} ancho="max-w-3xl">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,260px)_1fr]">
        <div>
          <div
            className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg transition-colors duration-300"
            style={activo?.fotoUrl ? undefined : { background: tinte }}
          >
            {activo?.fotoUrl ? (
              <Image src={activo.fotoUrl} alt={`${producto.referencia} — ${activo.nombre}`} fill sizes="260px" className="object-cover" unoptimized />
            ) : (
              <IconoPercha color={activo?.hex} size={56} />
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <SwatchesColor colores={colores} activo={nombreActivo} onHover={setColorHover} onFijar={setColorFijo} tamano="h-5 w-5" />
            <span className="text-xs text-tinta/60">{activo?.nombre ?? ""}</span>
          </div>
          <Chip tono={producto.estado === "activo" ? "verde" : "apagado"} tachado={false} className="mt-3">
            {producto.estado === "activo" ? "Activo" : "Descontinuado"}
          </Chip>
        </div>

        <div className="flex flex-col gap-4">
          <div className="scroll-cayla overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left">
                  <th className="label-cayla py-2 pr-3 text-[10.5px] text-tinta/60">Talla</th>
                  <th className="label-cayla py-2 pr-3 text-[10.5px] text-tinta/60">Color</th>
                  <th className="label-cayla py-2 pr-3 text-right text-[10.5px] text-tinta/60">Precio</th>
                  <th className="label-cayla py-2 text-[10.5px] text-tinta/60">Código</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {producto.variantes.map((v) => (
                  <tr key={v.varianteId} className={v.activo ? "" : "opacity-50"}>
                    <td className="py-2 pr-3 text-tinta/80">{v.talla ?? "—"}</td>
                    <td className="py-2 pr-3 text-tinta/80">{v.color ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-tinta">S/{v.precio.toFixed(2)}</td>
                    <td className="py-2 font-mono text-xs text-tinta/65">{v.codigo ?? v.sku ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-auto flex gap-2 pt-2">
            <Link href={`/productos/${producto.productoId}/editar`} className={`${botonCancelar} text-center`}>
              Editar
            </Link>
            {/* D-13: ajustar stock fuera de una venta es del líder o de la terminal administrativa (candado real en `registrar_movimiento`). */}
            {puedeAjustar && (
              <button type="button" onClick={onAjustarInventario} className={botonPrimario}>
                Ajustar inventario
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
