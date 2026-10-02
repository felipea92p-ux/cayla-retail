"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { MarcaProveedorLinea } from "@/components/MarcaProveedorLinea";
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
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { useStockEnSede, type StockDeModelo } from "@/components/useStockEnSede";
import { EnlaceEtiquetas } from "@/components/EnlaceEtiquetas";
import { SelectorTamanoGrilla } from "@/components/SelectorTamanoGrilla";
import { CLASES_GRILLA, TAMANO_GRILLA_POR_DEFECTO, guardarTamanoGrilla, type TamanoGrilla } from "@/lib/tamano-grilla";

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
  ubicacionId,
  sede,
  puedeEliminar,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
  tamanoInicial = TAMANO_GRILLA_POR_DEFECTO,
}: {
  productos: ProductoListado[];
  /** El tamaño de las tarjetas que la persona dejó la última vez (cookie, leída en el servidor). */
  tamanoInicial?: TamanoGrilla;
  /** Lo de la sede elegida por producto (ADR-0270). `null`: no se pudo leer, y las tarjetas dicen «Stock total N» como antes. */
  existencias: Map<string, ExistenciasProducto> | null;
  /** ¿Ve el módulo Existencias? Ahí se ajusta el stock (ADR-0270, decisión 9): el Catálogo solo enlaza. */
  veExistencias: boolean;
  ubicacionId: string;
  /** El nombre de la sede de `ubicacionId`: el stock por talla de la vista rápida y las etiquetas son de ella. */
  sede: string;
  /** Solo Admin y Líder (`fn_es_lider()`): borrar un producto que nunca se movió. La ventana pregunta a la base antes de ofrecerlo. */
  puedeEliminar: boolean;
  mensajeVacio?: string;
}) {
  // El stock de la sede de TODA la página en una sola lectura (una por tarjeta serían 24), y otra vez cuando la página
  // cambia o se refresca (un ajuste): `productos` es otro arreglo.
  const stockSede = useStockEnSede(ubicacionId);
  const { leer } = stockSede;
  useEffect(() => {
    if (productos.length > 0) void leer(productos.map((p) => p.productoId));
  }, [productos, leer]);
  // Cuánto ver de un vistazo (Felipe, 2026-09-29): cambia cuántas tarjetas caben por fila, no cuántas trae la página.
  const [tamano, setTamano] = useState<TamanoGrilla>(tamanoInicial);
  const elegirTamano = (t: TamanoGrilla) => {
    setTamano(t);
    guardarTamanoGrilla(t);
  };

  if (productos.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/75">{mensajeVacio}</p>;
  }

  return (
    <div className="space-y-4">
      <SelectorTamanoGrilla valor={tamano} onCambiar={elegirTamano} />
      <div className={`grid ${CLASES_GRILLA[tamano]}`}>
        {productos.map((p) => (
          <TarjetaProducto
            key={p.productoId}
            producto={p}
            existencias={existencias === null ? null : (existencias.get(p.productoId) ?? SIN_EXISTENCIAS)}
            veExistencias={veExistencias}
            stock={stockSede.de(p.productoId)}
            leer={leer}
            sede={sede}
            puedeEliminar={puedeEliminar}
            compacta={tamano === "pequeno"}
          />
        ))}
      </div>
    </div>
  );
}

function TarjetaProducto({
  producto,
  existencias,
  veExistencias,
  stock,
  leer,
  sede,
  puedeEliminar,
  compacta = false,
}: {
  producto: ProductoListado;
  existencias: ExistenciasProducto | null;
  veExistencias: boolean;
  /** Stock de este modelo en la sede (`useStockEnSede`, leído una vez para toda la página). */
  stock: StockDeModelo;
  leer: (productoIds: string[]) => Promise<Map<string, number> | null>;
  sede: string;
  puedeEliminar: boolean;
  /** Tamaño «Pequeño»: la tarjeta angosta deja solo lo que se lee de un vistazo (nombre, código, precio, stock, colores). */
  compacta?: boolean;
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
  const enSede = stock && stock !== "error" ? unidadesEnSede(stock, producto.variantes.map((v) => v.varianteId)) : null;

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

      <div className={`flex flex-1 flex-col ${compacta ? "gap-2 px-3 py-3" : "gap-2.5 px-4 py-4"}`}>
        <div>
          <p className={`font-display leading-tight text-tinta ${compacta ? "text-[14px]" : "text-[17px]"}`}>{producto.referencia}</p>
          <p className="label-cayla mt-0.5 truncate text-[10px] text-tinta/55">
            {compacta ? (producto.codigo ?? "sin código") : `${producto.codigo ?? "sin código"} · ${producto.categoria ?? "sin categoría"}`}
          </p>
          {/* De quién es y quién lo trae (ADR-0109). En «Pequeño» solo la marca: el proveedor no cabe y se ve en la Tabla. */}
          {/* Lo que falta sale como chip ámbar (ADR-0283): un producto puede crearse sin marca y/o sin proveedor. */}
          <MarcaProveedorLinea marca={producto.marca} proveedor={producto.proveedor} compacta={compacta} className="mt-0.5 truncate text-[11px] text-tinta/60" />
        </div>
        <div className="h-px bg-sand" />
        {/* «Stock total N» es más largo que el «Stock N» de antes: en la grilla de 2 columnas de un teléfono no cabe junto al precio y baja a la línea siguiente. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1.5">
          <span className="text-[15px] font-semibold tabular-nums text-tinta">{rangoSoles(producto.variantes.map((v) => v.precio)) ?? "—"}</span>
          <span
            title={EXPLICACION_STOCK_TOTAL}
            className={`ml-auto font-semibold tabular-nums ${compacta ? "text-[11.5px]" : "whitespace-nowrap text-[12.5px]"} ${tonoStock}`}
          >
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
            {/* Sin la cifra única (SQL sin pegar), el total de la red y debajo las unidades de la sede. Con ella, «N aquí» ya
                lo dice arriba: dos cifras de «aquí» que no coinciden (una cuenta apartadas y dañadas) confunden (ADR-0270). */}
            {!lineas && <span
              className="mt-1 block text-right text-[11.5px] font-normal text-tinta/60"
              title={stock === "error" ? "No se pudo leer el stock de la tienda" : `Unidades en ${sede || "tu sede"}`}
            >
              En tu sede:{" "}
              <span className={`font-semibold ${enSede === null ? "text-tinta/30" : enSede === 0 ? "text-tinta/45" : "text-tinta"}`}>
                {enSede === null ? "—" : enSede.toLocaleString("es-PE")}
              </span>
            </span>}
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
        <div className="flex items-center justify-between gap-2">
          <SwatchesColor colores={colores} activo={nombreActivo} onHover={setColorHover} onFijar={setColorFijo} max={3} onMas={() => setVistaRapida(true)} />
          <span className="min-w-0 truncate text-right text-[11px] text-tinta/55" title={activo?.nombre ?? undefined}>{activo?.nombre ?? ""}</span>
        </div>
      </div>

      {vistaRapida && (
        <VistaRapidaModal
          producto={producto}
          stock={stock}
          leer={leer}
          sede={sede}
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
  stock,
  leer,
  sede,
  colores,
  colorInicial,
  onClose,
  hrefExistencias,
  onEliminar,
  puedeEliminar,
}: {
  producto: ProductoListado;
  stock: StockDeModelo;
  leer: (productoIds: string[]) => Promise<Map<string, number> | null>;
  sede: string;
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

  // Stock por talla EN ESTA SEDE, como la ficha de la Tabla: es el mismo número con el que Etiquetas decide cuántas salen.
  // Viene de la lectura de toda la página; al abrir se relee este modelo, por si cambió desde que se cargó la grilla.
  useEffect(() => {
    void leer([producto.productoId]);
  }, [producto, leer]);
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

/** Stock de una talla en la sede, en negrita: es lo que cambia de una talla a otra. Con 0 se apaga (no es rojo:
 *  ADR-0151); mientras se lee, un guion, nunca un 0 que no es cierto. */
function StockDeTalla({ stock, varianteId }: { stock: StockDeModelo; varianteId: string }) {
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
