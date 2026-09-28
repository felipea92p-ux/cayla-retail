"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import type { Sububicacion } from "@/lib/sububicaciones";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { coloresDe, mezclar, rangoSoles, type ColorDisponible } from "@/lib/productos-vista";
import { IconoPercha, SwatchesColor } from "@/components/ProductoPiezas";
import { alertaDeStock, textoDeStock, EXPLICACION_STOCK_TOTAL, MENSAJE_SIN_RESULTADOS } from "@/lib/productos-stock";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { usePantallaActual } from "@/lib/usePantallaActual";
import { conDesde } from "@/lib/vuelta-productos";
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { useStockEnSede } from "@/components/useStockEnSede";
import { EnlaceEtiquetas } from "@/components/EnlaceEtiquetas";

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
  ubicacionId,
  sede,
  sububicaciones,
  puedeAjustar,
  puedeBajarAlPiso,
  puedeEliminar,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
}: {
  productos: ProductoListado[];
  ubicacionId: string;
  /** El nombre de la sede de `ubicacionId`: el stock por talla de la vista rápida y las etiquetas son de ella. */
  sede: string;
  sububicaciones: Sububicacion[];
  puedeAjustar: boolean;
  /** ¿Su rol ve «Bajada al piso»? Decide si «Ajustar» puede dejar colgadas en el piso las prendas nuevas en la tienda (ADR-0212). */
  puedeBajarAlPiso: boolean;
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
        <TarjetaProducto key={p.productoId} producto={p} ubicacionId={ubicacionId} sede={sede} sububicaciones={sububicaciones} puedeAjustar={puedeAjustar} puedeBajarAlPiso={puedeBajarAlPiso} puedeEliminar={puedeEliminar} />
      ))}
    </div>
  );
}

function TarjetaProducto({
  producto,
  ubicacionId,
  sede,
  sububicaciones,
  puedeAjustar,
  puedeBajarAlPiso,
  puedeEliminar,
}: {
  producto: ProductoListado;
  ubicacionId: string;
  sede: string;
  sububicaciones: Sububicacion[];
  puedeAjustar: boolean;
  puedeBajarAlPiso: boolean;
  puedeEliminar: boolean;
}) {
  const colores = coloresDe(producto.variantes);
  const [colorFijo, setColorFijo] = useState<string | null>(null);
  const [colorHover, setColorHover] = useState<string | null>(null);
  const [vistaRapida, setVistaRapida] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

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
          <span className="text-[15px] font-semibold tabular-nums text-tinta">{rangoSoles(producto.variantes.map((v) => v.precio)) ?? "—"}</span>
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
          ubicacionId={ubicacionId}
          sede={sede}
          colores={colores}
          colorInicial={nombreActivo}
          onClose={() => setVistaRapida(false)}
          puedeAjustar={puedeAjustar}
          onAjustarInventario={() => {
            setVistaRapida(false);
            setAjustando(true);
          }}
          puedeEliminar={puedeEliminar}
          onEliminar={() => {
            setVistaRapida(false);
            setEliminando(true);
          }}
        />
      )}
      {ajustando && (
        <AjustarInventarioModal
          productoId={producto.productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          puedeBajarAlPiso={puedeBajarAlPiso}
          onClose={() => setAjustando(false)}
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
  ubicacionId,
  sede,
  colores,
  colorInicial,
  onClose,
  onAjustarInventario,
  puedeAjustar,
  onEliminar,
  puedeEliminar,
}: {
  producto: ProductoListado;
  ubicacionId: string;
  sede: string;
  colores: ColorDisponible[];
  colorInicial: string | null;
  onClose: () => void;
  onAjustarInventario: () => void;
  puedeAjustar: boolean;
  onEliminar: () => void;
  puedeEliminar: boolean;
}) {
  const pantalla = usePantallaActual();
  const [colorFijo, setColorFijo] = useState<string | null>(colorInicial);
  const [colorHover, setColorHover] = useState<string | null>(null);

  const nombreActivo = colorHover ?? colorFijo ?? colores[0]?.nombre ?? null;
  const activo = colores.find((c) => c.nombre === nombreActivo) ?? null;
  const tinte = activo ? mezclar(activo.hex, 0.16) : "#efe9dd";

  // Stock por talla EN ESTA SEDE, como la ficha de la Tabla: es el mismo número con el que Etiquetas decide cuántas salen.
  // El «Stock» de la tarjeta de afuera es de toda la red; por eso la tabla dice de qué sede es el suyo.
  const stockSede = useStockEnSede(ubicacionId);
  const { leer } = stockSede;
  useEffect(() => {
    void leer([producto.productoId]);
  }, [producto, leer]);
  const stock = stockSede.de(producto.productoId);
  const ids = producto.variantes.map((v) => v.varianteId);
  const totalSede = stock && stock !== "error" ? unidadesEnSede(stock, ids) : null;

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

        {/* min-w-0: sin él, la tabla ensancha la columna (y la hoja) en vez de desplazarse dentro de su caja. */}
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-[12px] text-tinta/60">
            Stock en {sede || "tu sede"}
            {totalSede !== null && <span className="tabular-nums text-tinta">: {totalSede.toLocaleString("es-PE")}</span>}
          </p>
          <div className="scroll-cayla -mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left">
                  <th className="label-cayla py-2 pr-3 text-[10.5px] text-tinta/60">Talla</th>
                  <th className="label-cayla py-2 pr-3 text-[10.5px] text-tinta/60">Color</th>
                  <th className="label-cayla py-2 pr-3 text-right text-[10.5px] text-tinta/60">Precio</th>
                  <th className="label-cayla py-2 pr-3 text-right text-[10.5px] text-tinta/60" title={`Unidades en ${sede || "tu sede"}`}>
                    Stock
                  </th>
                  {/* En el celular no cabe junto a la impresora de cada talla: el código queda en la ficha y en la etiqueta. */}
                  <th className="label-cayla hidden py-2 text-[10.5px] text-tinta/60 sm:table-cell">Código</th>
                  <th className="w-10 py-2" aria-label="Etiqueta de la talla" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {producto.variantes.map((v) => (
                  <tr key={v.varianteId} className={v.activo ? "" : "opacity-50"}>
                    <td className="py-2 pr-3 text-tinta/80">{v.talla ?? "—"}</td>
                    <td className="py-2 pr-3 text-tinta/80">{v.color ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-tinta">S/{v.precio.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right">
                      <StockDeTalla stock={stock} varianteId={v.varianteId} />
                    </td>
                    <td className="hidden py-2 font-mono text-xs text-tinta/65 sm:table-cell">{v.codigo ?? v.sku ?? "—"}</td>
                    {/* La etiqueta de ESTA talla y color, como el ícono que flota sobre la variante en la Tabla. Aquí va
                        siempre a la vista (no al pasar el mouse): la vista rápida también se abre en el celular. */}
                    <td className="py-1 pl-2 text-right">
                      <EnlaceEtiquetas
                        href={urlEtiquetasDePrecio({ variantes: [v.varianteId] }, pantalla)}
                        unidades={async () => {
                          const fresco = await leer([producto.productoId]);
                          return fresco ? unidadesEnSede(fresco, [v.varianteId]) : null;
                        }}
                        que={[v.talla, v.color].filter(Boolean).join(" ") || (v.codigo ?? "Esta talla")}
                        sede={sede}
                        className={(negado) =>
                          `inline-grid h-8 w-8 place-items-center rounded-md transition-colors duration-200 ease-cayla ${
                            negado ? "bg-rojo text-crema hover:bg-rojo-profundo" : "text-tinta/55 hover:bg-hueso hover:text-tinta"
                          }`
                        }
                        aria-label={`Etiqueta de precio de ${[v.talla, v.color].filter(Boolean).join(" ") || (v.codigo ?? "esta talla")}`}
                        title="Imprimir la etiqueta de esta talla"
                      >
                        <Printer aria-hidden className="h-4 w-4" />
                      </EnlaceEtiquetas>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* flex-wrap: con los cuatro botones (líder), a 375 px no caben en una fila y sacaban «Eliminar» de la hoja. */}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Link href={conDesde(`/productos/${producto.productoId}/editar`, pantalla)} className={`${botonCancelar} text-center`}>
              Editar
            </Link>
            <EnlaceEtiquetas
              href={urlEtiquetasDePrecio({ producto: producto.productoId }, pantalla)}
              unidades={async () => {
                const fresco = await leer([producto.productoId]);
                return fresco ? unidadesEnSede(fresco, ids) : null;
              }}
              que={producto.referencia}
              sede={sede}
              className={(negado) =>
                negado
                  ? "label-cayla flex-1 rounded-md border border-rojo bg-rojo px-3 py-2.5 text-center text-[11px] text-crema transition-colors hover:bg-rojo-profundo"
                  : `${botonCancelar} text-center`
              }
            >
              Etiquetas
            </EnlaceEtiquetas>
            {/* D-13: ajustar stock fuera de una venta es del líder o de la terminal administrativa (candado real en `registrar_movimiento`). */}
            {puedeAjustar && (
              <button type="button" onClick={onAjustarInventario} className={botonPrimario}>
                Ajustar inventario
              </button>
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

/** Stock de una talla en la sede, en negrita: es lo que cambia de una talla a otra. Con 0 se apaga (no es rojo:
 *  ADR-0151); mientras se lee, un guion, nunca un 0 que no es cierto. */
function StockDeTalla({ stock, varianteId }: { stock: ReadonlyMap<string, number> | "error" | undefined; varianteId: string }) {
  if (!stock || stock === "error") {
    return (
      <span className="text-tinta/30" title={stock === "error" ? "No se pudo leer el stock de la tienda" : undefined}>
        —
      </span>
    );
  }
  const n = stock.get(varianteId) ?? 0;
  return <span className={`font-semibold tabular-nums ${n === 0 ? "text-tinta/35" : "text-tinta"}`}>{n.toLocaleString("es-PE")}</span>;
}
