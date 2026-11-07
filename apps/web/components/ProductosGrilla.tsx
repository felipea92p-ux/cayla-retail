"use client";

import { Fragment, useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { InsigniaEmpresa } from "@/components/InsigniaEmpresa";
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import { CambiarEstadoProductosHoja } from "@/components/CambiarEstadoProductosHoja";
import { destinoDelBoton, type EstadoProducto } from "@/lib/cambiar-estado-productos-reglas";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { colorPrincipal, coloresDe, variantesQueSeVenden } from "@/lib/productos-vista";
import { detalleCampana, insigniaCampana, precioDeHoy, type CampanaDeVariante } from "@/lib/precio-de-hoy";
import { rangoDeCatalogo } from "@/lib/precio-de-catalogo";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { SwatchesColor } from "@/components/ProductoPiezas";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { precargarMiniaturas } from "@/components/ui/precargar-miniaturas";
import { SIZES_TARJETA_PRODUCTOS as SIZES_FOTO, SIZES_VISTA_RAPIDA } from "@/lib/fotos-tamanos";
import { lugaresDeStock, stockDeTarjeta, MENSAJE_SIN_RESULTADOS, SIN_EXISTENCIAS, type ExistenciasProducto } from "@/lib/productos-stock";
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { useStockEnSede, type LugaresDeModelo, type StockDeModelo } from "@/components/useStockEnSede";
import { VistaRapidaProducto } from "@/components/vista-rapida/VistaRapidaProducto";
import type { ColorConFicha } from "@/lib/ficha-del-color";
import type { TarjetaLook } from "@/lib/combinar-reglas";
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
 *
 * La tarjeta es «A · Catálogo de moda» (Felipe 2026-11-02, docs/maquetas/productos-vidrio-2026-11/): la foto al aire, como en Vender
 * (sin tarjeta de papel; esquinas de 18 px y su sombra, sube al pasar el mouse), con solo sus insignias encima; debajo, tres renglones
 * apretados: el nombre y el precio (sin «.00»), qué es y de qué color, y los puntos de color con el stock tenue. Marca · proveedor y
 * lo de la sede van en el `title` del stock (y en la vista rápida). Una cuarta línea dice en qué sede está cada unidad (Felipe 2026-11-05).
 * Los estilos: `.prod-*` en app/estilos/vidrio/pantalla.css.
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
  campanasHoy,
  colores,
  tarjetasLook,
}: {
  productos: ProductoListado[];
  /** La campaña que cobra la caja hoy por variante (`campanasQueCobra`, ADR-0472): la tarjeta tacha el precio de lista y dice el de
   *  la caja. Ausente = no se pudo leer: el precio de siempre. */
  campanasHoy?: Record<string, CampanaDeVariante>;
  /** La ficha de cada color activo (ADR-0316): la vista rápida dice con qué se combina el color de la foto. Ausente = no dice nada. */
  colores?: ColorConFicha[];
  /** El catálogo de la sede como tarjetas prenda×color con piso: la frase «Combina bien con un jean…» de la vista rápida. */
  tarjetasLook?: TarjetaLook[];
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
    <div className={`prod-grilla grid ${CLASES_GRILLA[tamano]}`}>
      {productos.map((p) => (
        <TarjetaProducto
          key={p.productoId}
          producto={p}
          existencias={existencias === null ? null : (existencias.get(p.productoId) ?? SIN_EXISTENCIAS)}
          veExistencias={veExistencias}
          veMovimientos={veMovimientos}
          stock={stockSede.de(p.productoId)}
          lugares={stockSede.lugaresDe(p.productoId)}
          leer={leer}
          sede={sede}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          otrosPrecios={preciosTienda[p.productoId]}
          preciosAqui={preciosAqui}
          campanasHoy={campanasHoy}
          fichasColor={colores}
          tarjetasLook={tarjetasLook}
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
  lugares,
  leer,
  sede,
  puedeEditar,
  puedeEliminar,
  otrosPrecios,
  preciosAqui,
  campanasHoy,
  fichasColor,
  tarjetasLook,
}: {
  producto: ProductoListado;
  otrosPrecios?: PrecioDeTienda[];
  preciosAqui?: Record<string, number>;
  campanasHoy?: Record<string, CampanaDeVariante>;
  /** Las fichas de color del vocabulario (ADR-0316), para la vista rápida. `colores`, abajo, son los de ESTA prenda. */
  fichasColor?: ColorConFicha[];
  tarjetasLook?: TarjetaLook[];
  existencias: ExistenciasProducto | null;
  veExistencias: boolean;
  veMovimientos: boolean;
  /** Stock de este modelo en la sede (`useStockEnSede`, leído una vez para toda la página). */
  stock: StockDeModelo;
  /** Lo mismo, repartido por lugar (piso, almacén): lo usa la vista rápida para decir dónde está cada unidad. */
  lugares: LugaresDeModelo;
  leer: (productoIds: string[]) => Promise<Map<string, number> | null>;
  sede: string;
  puedeEditar: boolean;
  puedeEliminar: boolean;
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
  const sinFoto = (
    <>
      {/* Sin foto de ese color: el ícono de su categoría sobre el color (`MosaicoPrenda`, ADR-0333). La capa absoluta es de este
          contenedor: el mosaico trae su propio `relative`. */}
      <div className="absolute inset-0">
        <MosaicoPrenda forma="relleno" colorHex={activo?.hex} {...categoriaDe(producto)} className="h-full w-full !rounded-none transition-colors duration-300" />
      </div>
      <span className="prod-sobre-foto label-cayla absolute right-2.5 top-2.5 rounded-full px-2 py-1 text-[9px] text-tinta/70">
        Muestra{activo ? ` — ${activo.nombre}` : ""}
      </span>
    </>
  );

  const descontinuado = producto.estado !== "activo";
  const enSede = stock === "error" ? "error" : stock ? unidadesEnSede(stock, producto.variantes.map((v) => v.varianteId)) : null;
  // El stock tenue de la tarjeta: solo pesa si es poco o nada (las alertas de la red); marca · proveedor y lo de la sede, en su title.
  const enStock = stockDeTarjeta(producto, { existencias, enSede, sede });
  // Y en qué sede está, a la vista: Trujillo, Arequipa, Lima y el Taller, cada uno con su nombre (Felipe 2026-11-05).
  const dondeEsta = lugaresDeStock(existencias, sede, producto.stockTotal);
  // El precio de la tienda elegida arriba (su precio propio, si tiene) y, si una campaña lo rebaja hoy, lo que cobra la caja (ADR-0472).
  const precios = variantesQueSeVenden(producto.variantes).map((v) => ({ id: v.varianteId, precio: preciosAqui?.[v.varianteId] ?? v.precio }));
  const deHoy = campanasHoy ? precioDeHoy(precios, (id) => campanasHoy[id]) : null;
  const queEs = [producto.categoria, activo?.nombre].filter(Boolean).join(" · ") || "Sin categoría";

  return (
    <div
      data-guia="productos.tarjeta"
      // Con el mouse encima, las fotos de los otros colores empiezan a bajar: cuando toque un punto de color, la foto ya está.
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        // La foto de la vista rápida (la del color que se ve ahora) se adelanta: un clic abre la hoja con la foto ya lista.
        precargarMiniaturas([activo?.fotoUrl], SIZES_VISTA_RAPIDA);
        precargarMiniaturas(colores.map((c) => c.fotoUrl), SIZES_FOTO);
      }}
      className="prod-tarjeta flex flex-col"
    >
      <button
        type="button"
        onClick={() => setVistaRapida(true)}
        aria-label={`Vista rápida de ${producto.referencia}${descontinuado ? " (descontinuado)" : ""}`}
        className="prod-foto relative aspect-[4/5] w-full overflow-hidden bg-sand/40 text-left outline-none focus-visible:ring-2 focus-visible:ring-rojo/40 focus-visible:ring-inset"
      >
        {/* Detrás de una foto recortada (fondo transparente) se ve la arena suave de la foto de Vender, no el fondo de la pantalla. */}
        {activo?.fotoUrl ? <ImagenDePrenda src={activo.fotoUrl} alt={`${producto.referencia} — ${activo.nombre}`} fill sizes={SIZES_FOTO} className="object-cover" fondo={activo.hex} fallback={sinFoto} /> : sinFoto}
        {/* Sobre la foto solo van las insignias, en gota: la empresa (ADR-0505: «CLAURE» en Lima), la campaña que la rebaja hoy y
            «2 precios» si otra tienda la vende a otro. Arriba a la izquierda, donde no chocan con «Muestra — color» (a la derecha). */}
        {(!!producto.empresa || !!deHoy || (otrosPrecios?.length ?? 0) > 0) && (
          <span className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
            {producto.empresa && (
              <span className="prod-sobre-foto rounded-full">
                <InsigniaEmpresa nombre={producto.empresa} />
              </span>
            )}
            {deHoy && (
              <span className="prod-sobre-foto rounded-full" title={detalleCampana(deHoy)}>
                <Chip tono="pizarra" versalitas={false}>
                  {insigniaCampana(deHoy)}
                </Chip>
              </span>
            )}
            <InsigniaPrecios lista={otrosPrecios} className="prod-sobre-foto rounded-full" />
          </span>
        )}
        {descontinuado && (
          // Abajo a la izquierda: arriba a la derecha ya vive «Muestra — color» y en una tarjeta angosta chocarían.
          <span className="prod-sobre-foto absolute bottom-2.5 left-2.5 rounded-full">
            <Chip tono="apagado" tachado={false}>
              Descontinuado
            </Chip>
          </span>
        )}
      </button>

      {/* Los tres renglones, pegados a la foto: lo que se busca primero (nombre y precio), qué es y de qué color, y sus colores con
          el stock. En una tarjeta angosta (consulta de contenedor) el precio baja bajo el nombre y el stock bajo los puntos. */}
      <div data-guia="productos.precio-stock" className="prod-info">
        <div className="prod-renglon-1">
          <p data-guia="productos.nombre" className="prod-nombre" title={producto.referencia}>
            {producto.referencia}
          </p>
          {/* El precio de la tienda elegida arriba (su precio propio, si tiene): el que cobra la caja aquí (Felipe 2026-10-10). */}
          {deHoy ? (
            <span className="prod-precio" title={detalleCampana(deHoy)}>
              <span className="sr-only">{detalleCampana(deHoy)}</span>
              <s aria-hidden className="prod-precio-lista">
                {rangoDeCatalogo([deHoy.lista.desde, deHoy.lista.hasta])}
              </s>{" "}
              <span aria-hidden>{rangoDeCatalogo([deHoy.cobra.desde, deHoy.cobra.hasta])}</span>
            </span>
          ) : (
            <span className="prod-precio">{rangoDeCatalogo(precios.map((p) => p.precio)) ?? "—"}</span>
          )}
        </div>
        <p className="prod-renglon-2" title={queEs}>
          {queEs}
        </p>
        <div className="prod-renglon-3">
          <div data-guia="productos.colores">
            <SwatchesColor forma="punto" colores={colores} activo={nombreActivo} onHover={setColorHover} onFijar={setColorFijo} max={3} onMas={() => setVistaRapida(true)} />
          </div>
          <span className="prod-stock" data-tono={enStock.tono} title={enStock.titulo}>
            {enStock.texto}
          </span>
        </div>
        {dondeEsta && (
          <p className="prod-lugares">
            {dondeEsta.map((l, i) => (
              <Fragment key={l.lugar}>
                {/* El separador va fuera de la pieza que no se parte: ahí es donde la línea puede bajar en una tarjeta angosta. */}
                {i > 0 && " · "}
                <span className="prod-lugar" data-cero={l.n === 0 || undefined}>
                  {l.lugar} <b>{l.n.toLocaleString("es-PE")}</b>
                </span>
              </Fragment>
            ))}
          </p>
        )}
      </div>

      {vistaRapida && (
        <VistaRapidaProducto
          producto={producto}
          stock={stock}
          lugares={lugares}
          leer={leer}
          sede={sede}
          existencias={existencias}
          colorInicial={nombreActivo}
          onClose={() => setVistaRapida(false)}
          preciosAqui={preciosAqui}
          campanasHoy={campanasHoy}
          colores={fichasColor}
          tarjetasLook={tarjetasLook}
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
