"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { coloresDe, mezclar, rangoSoles, type ColorDisponible } from "@/lib/productos-vista";
import { IconoPercha, SwatchesColor } from "@/components/ProductoPiezas";
import {
  alertaDeStock,
  textoDeStock,
  lineasDeStock,
  hrefEnExistencias,
  EXPLICACION_STOCK_TOTAL,
  MENSAJE_SIN_RESULTADOS,
  SIN_EXISTENCIAS,
  type ExistenciasProducto,
} from "@/lib/productos-stock";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { usePantallaActual } from "@/lib/usePantallaActual";
import { conDesde } from "@/lib/vuelta-productos";

/**
 * Catálogo en grilla (ADR-0077) — alternativa visual a `ProductosTabla`,
 * misma fuente de datos (`ProductoListado[]`, ya filtrada/paginada por
 * `fn_productos`), sin pedir nada nuevo al servidor.
 *
 * Foto real por color cuando existe (20260917190000, `variantes[].fotoUrl`)
 * — si un color todavía no tiene foto, la tarjeta muestra un tinte derivado
 * de ese color en vez de un ícono de "foto rota": un placeholder honesto,
 * nunca genérico.
 */

export function ProductosGrilla({
  productos,
  existencias,
  veExistencias,
  puedeEliminar,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
}: {
  productos: ProductoListado[];
  /** Lo de la sede elegida por producto (ADR-0270). `null`: no se pudo leer, y las tarjetas dicen «Stock total N» como antes. */
  existencias: Map<string, ExistenciasProducto> | null;
  /** ¿Ve el módulo Existencias? Ahí se ajusta el stock (ADR-0270, decisión 9): el Catálogo solo enlaza. */
  veExistencias: boolean;
  /** Solo Admin y Líder (`fn_es_lider()`): borrar un producto que nunca se movió. La ventana pregunta a la base antes de ofrecerlo. */
  puedeEliminar: boolean;
  mensajeVacio?: string;
}) {
  if (productos.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/75">{mensajeVacio}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {productos.map((p) => (
        <TarjetaProducto key={p.productoId} producto={p} existencias={existencias === null ? null : (existencias.get(p.productoId) ?? SIN_EXISTENCIAS)} veExistencias={veExistencias} puedeEliminar={puedeEliminar} />
      ))}
    </div>
  );
}

function TarjetaProducto({
  producto,
  existencias,
  veExistencias,
  puedeEliminar,
}: {
  producto: ProductoListado;
  existencias: ExistenciasProducto | null;
  veExistencias: boolean;
  puedeEliminar: boolean;
}) {
  const colores = coloresDe(producto.variantes);
  const [colorFijo, setColorFijo] = useState<string | null>(null);
  const [colorHover, setColorHover] = useState<string | null>(null);
  const [vistaRapida, setVistaRapida] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const nombreActivo = colorHover ?? colorFijo ?? colores[0]?.nombre ?? null;
  const activo = colores.find((c) => c.nombre === nombreActivo) ?? null;
  const tinte = activo ? mezclar(activo.hex, 0.16) : "#efe9dd";

  // Una prenda descontinuada no dispara alertas y se ve como tal; «Sin stock» no es rojo (lib/productos-stock.ts).
  // /70 y no /55: el número de una descontinuada con stock (una liquidación) es justo el que más hay que poder leer.
  const descontinuado = producto.estado !== "activo";
  const alerta = alertaDeStock(producto);
  // ADR-0270: lo de la sede elegida en grande y el resto aparte. «Sin stock» (nada en ninguna sede) sigue siendo el chip.
  const lineas = existencias && alerta !== "sin_stock" ? lineasDeStock(existencias) : null;
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
          <span className="text-[15px] font-semibold tabular-nums text-tinta">{rangoSoles(producto.variantes.map((v) => v.precio)) ?? "—"}</span>
          <span title={EXPLICACION_STOCK_TOTAL} className={`ml-auto whitespace-nowrap text-[12.5px] font-semibold tabular-nums ${tonoStock}`}>
            {alerta === "sin_stock" ? (
              <Chip tono="neutro" versalitas={false}>
                Sin stock
              </Chip>
            ) : lineas ? (
              lineas.principal
            ) : alerta === "bajo" ? (
              <Chip tono="ambar" versalitas={false}>
                Stock bajo: {producto.stockTotal}
              </Chip>
            ) : (
              textoDeStock(producto.stockTotal)
            )}
          </span>
        </div>
        {lineas && (lineas.detalle || lineas.avisos.length > 0 || alerta === "bajo") && (
          <p className="-mt-1.5 text-right text-[11px] leading-snug text-tinta/60">
            {alerta === "bajo" && (
              <span className="mr-1 inline-block align-middle">
                <Chip tono="ambar" versalitas={false}>
                  Stock bajo
                </Chip>
              </span>
            )}
            {[lineas.detalle, ...lineas.avisos].filter(Boolean).join(" · ")}
          </p>
        )}
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
          hrefExistencias={veExistencias ? hrefEnExistencias(producto.variantes, nombreActivo) : null}
          puedeEliminar={puedeEliminar}
          onEliminar={() => {
            setVistaRapida(false);
            setEliminando(true);
          }}
        />
      )}
      {eliminando && (
        <EliminarProductoModal
          producto={{ productoId: producto.productoId, referencia: producto.referencia, estado: producto.estado, numVariantes: producto.variantes.length }}
          onClose={() => setEliminando(false)}
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
  hrefExistencias,
  onEliminar,
  puedeEliminar,
}: {
  producto: ProductoListado;
  colores: ColorDisponible[];
  colorInicial: string | null;
  onClose: () => void;
  /** «Ver en Existencias» (null si no ve ese módulo). */
  hrefExistencias: string | null;
  onEliminar: () => void;
  puedeEliminar: boolean;
}) {
  const pantalla = usePantallaActual();
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
            <Link href={conDesde(`/productos/${producto.productoId}/editar`, pantalla)} className={`${botonCancelar} text-center`}>
              Editar
            </Link>
            <Link href={urlEtiquetasDePrecio({ producto: producto.productoId }, pantalla)} className={`${botonCancelar} text-center`}>
              Etiquetas
            </Link>
            {/* ADR-0270, decisión 9 (Felipe, 2026-09-28): el stock se ajusta solo en Inventario. Antes había aquí un «Ajustar
                inventario» propio que validaba contra otro número que la base (aceptaba «2 → 0» con 1 apartada y la base lo
                rechazaba). Existencias abre esta prenda en su talla, con su Ajustar y su candado (ADR-0250). */}
            {hrefExistencias && (
              <Link href={hrefExistencias} className={`${botonPrimario} text-center`}>
                Ver en Existencias
              </Link>
            )}
            {/* Solo Admin y Líder. Abre una ventana que pregunta a la base si nunca se movió; con historia explica por qué no. */}
            {puedeEliminar && (
              <button type="button" onClick={onEliminar} className={botonCancelar}>
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
