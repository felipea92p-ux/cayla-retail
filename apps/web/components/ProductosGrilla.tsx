"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Chip } from "@/components/ui/Chip";
import { MarcaProveedorLinea } from "@/components/MarcaProveedorLinea";
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import { CambiarEstadoProductosHoja } from "@/components/CambiarEstadoProductosHoja";
import { destinoDelBoton, type EstadoProducto } from "@/lib/cambiar-estado-productos-reglas";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { colorPrincipal, coloresDe, rangoSoles, variantesQueSeVenden } from "@/lib/productos-vista";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { SwatchesColor } from "@/components/ProductoPiezas";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import {
  alertaDeStock,
  textoDeStock,
  lineasDeStock,
  EXPLICACION_STOCK_TOTAL,
  MENSAJE_SIN_RESULTADOS,
  SIN_EXISTENCIAS,
  type ExistenciasProducto,
} from "@/lib/productos-stock";
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { useStockEnSede, type StockDeModelo } from "@/components/useStockEnSede";
import { VistaRapidaProducto } from "@/components/vista-rapida/VistaRapidaProducto";
import type { ColorConFicha } from "@/lib/ficha-del-color";
import { useTamanoGrilla } from "@/components/SelectorTamanoGrilla";
import { CLASES_GRILLA, TAMANO_GRILLA_POR_DEFECTO, type TamanoGrilla } from "@/lib/tamano-grilla";
import { FunnelX } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { InsigniaPrecios } from "@/components/ficha-producto/InsigniaPrecios";
import type { PrecioDeTienda } from "@/lib/precio-sede-reglas";

/**
 * Catálogo en grilla (ADR-0077) — alternativa visual a `ProductosTabla`,
 * misma fuente de datos (`ProductoListado[]`, ya filtrada/paginada por
 * `fn_productos_listado`, ADR-0308), sin pedir nada nuevo al servidor.
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
  veMovimientos,
  ubicacionId,
  sede,
  puedeEditar,
  puedeEliminar,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
  hrefLimpiar,
  tamanoInicial = TAMANO_GRILLA_POR_DEFECTO,
  preciosTienda = {},
  preciosAqui,
  colores,
}: {
  productos: ProductoListado[];
  /** La ficha de cada color activo (ADR-0316): la vista rápida dice con qué se combina el color de la foto. Ausente = no dice nada. */
  colores?: ColorConFicha[];
  /** Por prenda, las tiendas que la venden a otro precio: la insignia «2 precios» (Felipe 2026-10-09). */
  preciosTienda?: Record<string, PrecioDeTienda[]>;
  /** Precio propio de esta sede por variante: la vista rápida muestra el que cobra su caja (ADR-0370). */
  preciosAqui?: Record<string, number>;
  /** El tamaño de las tarjetas que la persona dejó la última vez (cookie, leída en el servidor). */
  tamanoInicial?: TamanoGrilla;
  /** Lo de la sede elegida por producto (ADR-0270). `null`: no se pudo leer, y las tarjetas dicen «Stock total N» como antes. */
  existencias: Map<string, ExistenciasProducto> | null;
  /** ¿Ve el módulo Existencias? Ahí se ajusta el stock (ADR-0270, decisión 9): el Catálogo solo enlaza. */
  veExistencias: boolean;
  /** ¿Ve Movimientos? El historial de la prenda (ADR-0354) enlaza ahí para ventas y stock, que ya no muestra. */
  veMovimientos: boolean;
  ubicacionId: string;
  /** El nombre de la sede de `ubicacionId`: el stock por talla de la vista rápida y las etiquetas son de ella. */
  sede: string;
  /** Quien edita el catálogo (`fn_puede_editar_catalogo`): sin eso, «Editar» de la vista rápida no se ofrece (rebotaba en silencio a /productos). */
  puedeEditar: boolean;
  /** Quien edita el catálogo (`fn_puede_editar_catalogo`, ADR-0252 act. 2026-10-03). La ventana pregunta a la base antes de ofrecerlo. */
  puedeEliminar: boolean;
  mensajeVacio?: string;
  /** «Limpiar filtros» dentro del vacío (Felipe 2026-10-08: deshacerlo ahí mismo). */
  hrefLimpiar?: string;
}) {
  // El stock de la sede de TODA la página en una sola lectura (una por tarjeta serían 24), y otra vez cuando la página
  // cambia o se refresca (un ajuste): `productos` es otro arreglo.
  const stockSede = useStockEnSede(ubicacionId);
  const { leer } = stockSede;
  useEffect(() => {
    if (productos.length > 0) void leer(productos.map((p) => p.productoId));
  }, [productos, leer]);
  // Cuánto ver de un vistazo (Felipe, 2026-09-29): cambia cuántas tarjetas caben por fila, no cuántas trae la página. El control
  // vive en la barra de resultados, junto al conteo (`SelectorTamanoGrilla`, 2026-10-09).
  const [tamano] = useTamanoGrilla(tamanoInicial);

  if (productos.length === 0) {
    // Los filtros (o la búsqueda) dejaron cero: la pieza única del vacío (ADR-0358 ronda 5). Limpiar vive en la barra de filtros.
    return (
      <div className="card-cayla">
        <Vacio icono={<FunnelX />} acciones={hrefLimpiar ? <BotonEnlace href={hrefLimpiar}>Limpiar filtros</BotonEnlace> : null}>
          {mensajeVacio}
        </Vacio>
      </div>
    );
  }

  return (
    <div className={`grid ${CLASES_GRILLA[tamano]}`}>
      {productos.map((p) => (
        <TarjetaProducto
          key={p.productoId}
          producto={p}
          existencias={existencias === null ? null : (existencias.get(p.productoId) ?? SIN_EXISTENCIAS)}
          veExistencias={veExistencias}
          veMovimientos={veMovimientos}
          stock={stockSede.de(p.productoId)}
          leer={leer}
          sede={sede}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          compacta={tamano === "pequeno"}
          otrosPrecios={preciosTienda[p.productoId]}
          preciosAqui={preciosAqui}
          fichasColor={colores}
        />
      ))}
    </div>
  );
}

function TarjetaProducto({
  producto,
  existencias,
  veExistencias,
  veMovimientos,
  stock,
  leer,
  sede,
  puedeEditar,
  puedeEliminar,
  compacta = false,
  otrosPrecios,
  preciosAqui,
  fichasColor,
}: {
  producto: ProductoListado;
  otrosPrecios?: PrecioDeTienda[];
  preciosAqui?: Record<string, number>;
  /** Las fichas de color del vocabulario (ADR-0316), para la vista rápida. `colores`, abajo, son los de ESTA prenda. */
  fichasColor?: ColorConFicha[];
  existencias: ExistenciasProducto | null;
  veExistencias: boolean;
  veMovimientos: boolean;
  /** Stock de este modelo en la sede (`useStockEnSede`, leído una vez para toda la página). */
  stock: StockDeModelo;
  leer: (productoIds: string[]) => Promise<Map<string, number> | null>;
  sede: string;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** Tamaño «Pequeño»: la tarjeta angosta deja solo lo que se lee de un vistazo (nombre, código, precio, stock, colores). */
  compacta?: boolean;
}) {
  const colores = coloresDe(producto.variantes);
  const [colorFijo, setColorFijo] = useState<string | null>(null);
  const [colorHover, setColorHover] = useState<string | null>(null);
  const [vistaRapida, setVistaRapida] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // A qué estado va la hoja, FIJADO al abrirla: si otra persona cambia esta prenda con la hoja abierta (la pantalla se refresca sola, ADR-0363),
  // el destino no se da vuelta bajo el dedo; la hoja solo dice «Ya está…: queda igual» y no deja confirmar.
  const [cambiandoEstado, setCambiandoEstado] = useState<EstadoProducto | null>(null);

  const nombreActivo = colorHover ?? colorFijo ?? colorPrincipal(colores)?.nombre ?? null;
  const activo = colores.find((c) => c.nombre === nombreActivo) ?? null;

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
      >
        {activo?.fotoUrl ? (
          <Image src={activo.fotoUrl} alt={`${producto.referencia} — ${activo.nombre}`} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" unoptimized />
        ) : (
          <>
            {/* Sin foto de ese color: el ícono de su categoría sobre el color (`MosaicoPrenda`, ADR-0333). La capa absoluta es de este
                contenedor: el mosaico trae su propio `relative`. */}
            <div className="absolute inset-0">
              <MosaicoPrenda forma="relleno" colorHex={activo?.hex} {...categoriaDe(producto)} className="h-full w-full !rounded-none transition-colors duration-300" />
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
          <span className="text-[15px] font-semibold tabular-nums text-tinta">
            {rangoSoles(variantesQueSeVenden(producto.variantes).map((v) => v.precio)) ?? "—"}
            <InsigniaPrecios lista={otrosPrecios} className="ml-1.5 align-middle" />
          </span>
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
        <VistaRapidaProducto
          producto={producto}
          stock={stock}
          leer={leer}
          sede={sede}
          existencias={existencias}
          colorInicial={nombreActivo}
          onClose={() => setVistaRapida(false)}
          preciosAqui={preciosAqui}
          colores={fichasColor}
          veExistencias={veExistencias}
          veMovimientos={veMovimientos}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onEliminar={() => {
            setVistaRapida(false);
            setEliminando(true);
          }}
          onCambiarEstado={() => {
            setVistaRapida(false);
            setCambiandoEstado(destinoDelBoton(producto.estado));
          }}
        />
      )}
      {eliminando && (
        <EliminarProductoModal
          producto={{ productoId: producto.productoId, referencia: producto.referencia, estado: producto.estado, numVariantes: producto.variantes.length }}
          onClose={() => setEliminando(false)}
          // Una prenda que ya se vendió no se borra: la salida es desactivarla ahí mismo (solo quien edita el catálogo, como «Editar»).
          onDesactivar={
            puedeEditar
              ? () => {
                  setEliminando(false);
                  setCambiandoEstado("descontinuado");
                }
              : undefined
          }
        />
      )}
      {cambiandoEstado && (
        <CambiarEstadoProductosHoja
          estado={cambiandoEstado}
          productos={[producto]}
          vocabulario="desactivar"
          onClose={() => setCambiandoEstado(null)}
          onHecho={() => setCambiandoEstado(null)}
        />
      )}
    </div>
  );
}
