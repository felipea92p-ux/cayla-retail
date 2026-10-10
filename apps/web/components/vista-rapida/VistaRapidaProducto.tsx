"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, Info, PackageOpen, PauseCircle, Pencil, PlayCircle, Printer, SignpostBig, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { EnlaceEtiquetas } from "@/components/EnlaceEtiquetas";
import type { StockDeModelo } from "@/components/useStockEnSede";
import type { ProductoListado } from "@/lib/catalogo-v2";
import { corta, hrefEnExistencias, lineasDeStock, type ExistenciasProducto } from "@/lib/productos-stock";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { urlRotulos } from "@/lib/rotulos-reglas";
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { usePantallaActual } from "@/lib/usePantallaActual";
import { conDesde } from "@/lib/vuelta-productos";
import { rangoSoles } from "@/lib/productos-vista";
import { alternarVariantes, armarMatriz, etiquetasDeLaSeleccion, fichaCorta, soloLasQueExisten } from "@/lib/vista-rapida-producto-reglas";
import { FotoVistaRapida } from "./FotoVistaRapida";
import { MatrizUnidades } from "./MatrizUnidades";
import { HistorialPrenda } from "@/components/historial-prenda/HistorialPrenda";
import { useHistorialPrenda } from "@/components/historial-prenda/useHistorialPrenda";
import { FichaDelColor } from "@/components/ui/FichaDelColor";
import { fichaDelColor, type ColorConFicha } from "@/lib/ficha-del-color";

const SIN_COLORES: ColorConFicha[] = [];

const BOTON = "btn-cayla btn-secundario min-h-10 text-[12.5px]";
// El botón que cambia el estado vive junto al chip de estado, en el encabezado (Felipe 2026-10-09: al fondo a la derecha «es difícil de ver»).
// Compacto, para que la línea de datos no crezca: 32 px con mouse y 44 con el dedo (ADR-0350).
const BOTON_ESTADO = "btn-cayla min-h-8 px-3 py-1 text-[12px] max-sm:min-h-11";

/**
 * La vista rápida de una prenda (Catálogo ▸ Productos ▸ Grilla, al tocar una tarjeta). Maqueta A «Matriz», elegida por Felipe el 2026-10-05
 * (docs/maquetas/catalogo-modal-producto-2026-10/): el modal de antes listaba una fila por variante —18 filas de 41 px— y los botones
 * quedaban bajo el pliegue. Ahora las variantes son una matriz color × talla (6 filas en vez de 18), la foto sigue al color que se señala, el
 * precio se dice UNA vez y los botones viven en un pie fijo. Para etiquetar se elige una celda, un color o una talla, y el botón dice qué
 * va a imprimir. El movimiento, con su excepción escrita, es el de ADR-0136 «Actualización 2026-10-05» (vista-rapida.css).
 *
 * «Historial» (ADR-0354, maqueta A elegida por Felipe el 2026-10-06): la hoja NO se cierra, da vuelta la página. Lo de la ficha sale
 * corto hacia la izquierda y el hilo de cambios entra desde la derecha; «← Volver» hace lo inverso. Solo cambios de la prenda
 * (precio, colores, etiquetas, ficha, fotos) y quién los hizo: las ventas y el stock viven en Movimientos.
 *
 * El stock sigue siendo el de siempre —`useStockEnSede`, la tabla `stock` de la sede—; lo de las otras sedes sale de `existencias` (la
 * cifra única de ADR-0270) y solo se NOMBRA, nunca se suma a lo de «aquí»: dos cifras de «aquí» que no coinciden confunden.
 */
export function VistaRapidaProducto({
  producto,
  stock,
  leer,
  sede,
  existencias,
  colorInicial,
  onClose,
  veExistencias,
  veMovimientos = false,
  puedeEditar,
  puedeEliminar,
  onEliminar,
  onCambiarEstado,
  preciosAqui,
  colores = SIN_COLORES,
}: {
  producto: ProductoListado;
  /** Precio propio de esta sede por variante (ADR-0370): la matriz muestra el que cobra su caja. */
  preciosAqui?: Record<string, number>;
  /** La ficha de cada color activo (ADR-0316; Felipe 2026-10-10): bajo la foto, con qué se combina el color que está en ella. Vacío = nada. */
  colores?: ColorConFicha[];
  stock: StockDeModelo;
  leer: (productoIds: string[]) => Promise<Map<string, number> | null>;
  sede: string;
  /** Lo de la sede y de las otras (ADR-0270); `null` si no se pudo leer: entonces no se dice nada de las otras sedes. */
  existencias: ExistenciasProducto | null;
  /** El color que la tarjeta tenía fijo al abrir. */
  colorInicial: string | null;
  onClose: () => void;
  /** ¿Ve el módulo Existencias? «Ver en Existencias» se ofrece solo a quien lo ve. */
  veExistencias: boolean;
  /** ¿Ve Movimientos? El historial enlaza ahí las ventas y el stock, que no muestra. */
  veMovimientos?: boolean;
  /** Quien edita el catálogo (`fn_puede_editar_catalogo`): sin eso, «Editar» rebotaba en silencio a /productos (hallazgo #4 de docs/pantallas/productos.md). */
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onEliminar: () => void;
  /** «Desactivar» (activa) o «Reactivar» (descontinuada): abre la hoja que cambia el estado de la prenda. Quien lo ve es quien edita el
   *  catálogo (`puedeEditar`, el mismo permiso de `cambiar_estado_productos`). Debe cerrar ESTA hoja y abrir la otra. */
  onCambiarEstado: () => void;
}) {
  const pantalla = usePantallaActual();
  const mapa = stock && stock !== "error" ? stock : null;
  const lectura = stock === "error" ? "error" : mapa ? "ok" : "leyendo";

  // Stock por talla EN ESTA SEDE, como la ficha de la Tabla: es el mismo número con el que Etiquetas decide cuántas salen. Viene de la lectura
  // de toda la página; al abrir se relee este modelo, por si cambió desde que se cargó la grilla.
  useEffect(() => {
    void leer([producto.productoId]);
  }, [producto, leer]);

  const matriz = useMemo(() => armarMatriz(producto.variantes, mapa, preciosAqui), [producto.variantes, mapa, preciosAqui]);
  const [fijado, setFijado] = useState<string>(() => (matriz.filas.find((f) => f.clave === colorInicial) ?? matriz.filas[0])?.clave ?? "");
  const [vista, setVista] = useState<string | null>(null);
  const [elegidasCrudas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const elegidas = useMemo(() => soloLasQueExisten(elegidasCrudas, matriz), [elegidasCrudas, matriz]);

  const sedeCorta = corta(sede) || "tu sede";
  const detalleOtras = existencias ? lineasDeStock(existencias).detalle : null;
  const claveEnFoto = vista ?? fijado;
  const filaEnFoto = matriz.filas.find((f) => f.clave === claveEnFoto) ?? matriz.filas[0];
  // La ficha del color que está en la foto: la fila de la matriz lleva el NOMBRE del color (único en el vocabulario, `colores_clave_unica`),
  // y por él se llega al código y a su ficha. Sin stock del catálogo entero a mano, los compañeros no dicen cuántos cuelgan aquí.
  const vocabularioColores = useMemo(() => {
    const porCodigo = new Map(colores.map((c) => [c.codigo, c]));
    const codigoPorNombre = new Map(colores.map((c) => [c.nombre, c.codigo]));
    return { porCodigo, codigoPorNombre };
  }, [colores]);
  const fichaEnFoto = filaEnFoto ? fichaDelColor(vocabularioColores.codigoPorNombre.get(filaEnFoto.nombre), vocabularioColores.porCodigo) : null;
  const etiquetas = etiquetasDeLaSeleccion(matriz, elegidas, producto.referencia);
  const idsTodos = producto.variantes.map((v) => v.varianteId);
  const elegidasIds = matriz.celdas.filter((c) => elegidas.has(c.varianteId)).map((c) => c.varianteId);
  const hrefEtiquetas = urlEtiquetasDePrecio(elegidasIds.length === 0 ? { producto: producto.productoId } : { variantes: elegidasIds }, pantalla);
  // «Ver en Existencias» abre la talla que se eligió (si fue una sola) o la primera del color que se está mirando.
  const hrefExistencias = !veExistencias
    ? null
    : elegidasIds.length === 1
      ? `/inventario?variante=${elegidasIds[0]}`
      : hrefEnExistencias(producto.variantes, fijado === "" ? null : fijado);

  const nVariantes = matriz.nVariantes;
  const descontinuado = producto.estado !== "activo";

  // La vuelta de página ficha ↔ historial: lo de antes sale (190 ms), después entra lo nuevo (ADR-0136, respuesta a un clic).
  const [pagina, setPagina] = useState<"ficha" | "historial">("ficha");
  const [paso, setPaso] = useState<"" | "hp-sale-izq" | "hp-sale-der" | "hp-entra-der" | "hp-entra-izq">("");
  const [yaAbrioHistorial, setYaAbrioHistorial] = useState(false);
  const historial = useHistorialPrenda(producto.productoId, yaAbrioHistorial);
  const irA = (destino: "ficha" | "historial") => {
    if (destino === pagina) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (destino === "historial") setYaAbrioHistorial(true);
    setPaso(destino === "historial" ? "hp-sale-izq" : "hp-sale-der");
    window.setTimeout(() => {
      setPagina(destino);
      setPaso(destino === "historial" ? "hp-entra-der" : "hp-entra-izq");
      window.setTimeout(() => setPaso(""), 440);
    }, quieto ? 0 : 190);
  };
  const hrefMovimientos = veMovimientos ? `/inventario/movimientos?q=${encodeURIComponent(producto.codigo ?? producto.referencia)}` : null;

  return (
    <Modal
      titulo={<span className="vr-titulo">{pagina === "historial" ? "Historial" : producto.referencia}</span>}
      subtitulo={
        pagina === "historial" ? (
          <span className="vr-meta">
            <span className="vr-dato">«{producto.referencia}» · lo que cambió en esta prenda, quién lo hizo y cuándo</span>
          </span>
        ) : (
        <span className="vr-meta">
          <span className="vr-dato vr-cod" style={{ ["--vr-j" as string]: 0 }}>
            {producto.codigo ?? "sin código"}
          </span>
          <span className="vr-dato" style={{ ["--vr-j" as string]: 1 }}>
            {producto.categoria ?? "sin categoría"}
          </span>
          {/* El estado y lo que lo cambia, juntos: ves «Activo» y ahí mismo está «Desactivar». «Desactivar» NO borra nada (sale de la lista de
              activas y su historia queda); es la salida de una prenda que ya se vendió, que «Eliminar» no deja borrar. Una descontinuada ofrece
              «Reactivar», que no es peligroso. Quien edita el catálogo (`puedeEditar`, el permiso de `cambiar_estado_productos`). */}
          <span className="vr-dato vr-estado-prenda" style={{ ["--vr-j" as string]: 2 }}>
            <Chip tono={descontinuado ? "apagado" : "verde"} tachado={false}>
              {descontinuado ? "Descontinuado" : "Activo"}
            </Chip>
            {puedeEditar && (
              <button type="button" onClick={onCambiarEstado} className={`${BOTON_ESTADO} ${descontinuado ? "btn-secundario" : "btn-peligro"}`} data-cambiar-estado>
                {descontinuado ? <PlayCircle aria-hidden className="h-3.5 w-3.5" /> : <PauseCircle aria-hidden className="h-3.5 w-3.5" />}
                {descontinuado ? "Reactivar" : "Desactivar"}
              </button>
            )}
          </span>
          <span className="vr-dato vr-sep" style={{ ["--vr-j" as string]: 3 }}>
            {matriz.precioUnico ? (
              <>
                <b className="tabular-nums">{rangoSoles([matriz.precioMin])}</b> en {nVariantes === 1 ? "la variante" : `las ${nVariantes} variantes`}
              </>
            ) : (
              <>
                <b className="tabular-nums">{rangoSoles([matriz.precioMin, matriz.precioMax])}</b> <span className="vr-ex">· lo distinto está marcado</span>
              </>
            )}
          </span>
          <span className="vr-dato vr-sep" style={{ ["--vr-j" as string]: 4 }}>
            <b>{matriz.filas.length}</b> {matriz.filas.length === 1 ? "color" : "colores"} · <b>{matriz.columnas.length}</b> {matriz.columnas.length === 1 ? "talla" : "tallas"}
          </span>
        </span>
        )
      }
      onClose={onClose}
      ancho="max-w-4xl"
      conCerrar
      tituloGrande
    >
      {pagina === "historial" ? (
        <div className={paso}>
          <HistorialPrenda
            lectura={historial.lectura}
            nombre={producto.referencia}
            totalVariantes={nVariantes}
            hrefMovimientos={hrefMovimientos}
            onVolver={() => irA("ficha")}
            onReintentar={historial.reintentar}
          />
        </div>
      ) : (
      <div className={paso}>
      <div className="vr-cuerpo">
        <aside className="vr-lado">
          <FotoVistaRapida producto={producto} fila={filaEnFoto} />
          <div>
            <div className="vr-pie-foto">
              <span className="vr-sw" style={{ background: filaEnFoto?.hex, width: 20, height: 20 }} />
              <span key={filaEnFoto?.nombre} className="vr-nom vr-texto-cambia">
                {filaEnFoto?.nombre}
              </span>
              <span className="vr-est">{vista !== null && vista !== fijado ? "vista previa" : "fijado"}</span>
            </div>
            <p className="vr-pista">Pasa el mouse por un color de la lista y la foto lo muestra. Un clic lo deja fijo.</p>
            {/* Con qué se combina el color de la foto (ADR-0316; Felipe 2026-10-10): sigue a la foto (vista previa al pasar, fijado al clic),
                en una caja de alto fijo para que la hoja no cambie de tamaño bajo el mouse (ADR-0185); la frase, tras «¿Por qué?». */}
            {fichaEnFoto && (
              <div className="vr-color-ficha">
                <FichaDelColor key={filaEnFoto?.clave} ficha={fichaEnFoto} forma="bloque" />
              </div>
            )}
          </div>
          {/* Lo que se escribió en «Descripción» al crear o editar la prenda. Sin descripción no se dibuja nada: el campo es opcional. */}
          {producto.descripcion && (
            <div className="vr-desc">
              <span className="vr-rotulo label-cayla">Descripción</span>
              <p>{producto.descripcion}</p>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          <MatrizUnidades
            matriz={matriz}
            sedeNombre={sede || "tu sede"}
            sedeCorta={sedeCorta}
            detalleOtrasSedes={detalleOtras}
            lectura={lectura}
            elegidas={elegidas}
            alternar={(ids) => setElegidas((previas) => alternarVariantes(soloLasQueExisten(previas, matriz), ids))}
            fijado={fijado}
            alFijar={setFijado}
            alVistaPrevia={setVista}
            alQuitar={() => setElegidas(new Set())}
          />
          {/* La ficha corta (Felipe 2026-10-09): material, patrón y marca —lo que el cliente pregunta— y cuánto se vendió en 30 días en todas
              las sedes —lo que ayuda a recomendarla—. Es de la prenda, no del color: no cambia con la foto. Lo que no está registrado se dice
              («Sin registrar»), porque es justo lo que falta completar en «Editar». */}
          <dl className="vr-ficha">
            {fichaCorta(producto).map((d) => (
              <div key={d.clave} className="vr-ficha-fila" data-ficha={d.clave}>
                <dt className="vr-rotulo label-cayla">{d.rotulo}</dt>
                <dd className={d.valor ? undefined : "vr-ficha-falta"}>{d.valor ?? "Sin registrar"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* El pie fijo (`pie-hoja-fijo`): los botones nunca quedan bajo el pliegue, sean 6 variantes o 60. */}
      <div className="pie-hoja-fijo vr-pie">
        {etiquetas.sinUnidades && (
          <p className="vr-motivo" key={etiquetas.cantidad === 0 ? "toda" : "elegidas"}>
            <Info aria-hidden />
            <span>
              {etiquetas.cantidad === 0
                ? `Sin unidades en ${sede || "tu sede"}: no hay nada que etiquetar aquí.`
                : `Lo elegido no tiene unidades en ${sede || "tu sede"}: no hay nada que etiquetar aquí.`}
            </span>
          </p>
        )}
        <div className="vr-botones">
          {puedeEditar && (
            <Link href={conDesde(`/productos/${producto.productoId}/editar`, pantalla)} className={BOTON}>
              <Pencil aria-hidden className="h-4 w-4" />
              Editar
            </Link>
          )}
          {/* Sin unidades NO bloquea el botón: se vuelve a leer FRESCO al tocarlo (EnlaceEtiquetas), porque una lectura vieja de 0 no debe impedir
              imprimir lo que acaba de entrar. Aquí solo se avisa antes y el botón se apaga un poco. */}
          <EnlaceEtiquetas
            href={hrefEtiquetas}
            unidades={async () => {
              const fresco = await leer([producto.productoId]);
              return fresco ? unidadesEnSede(fresco, elegidasIds.length === 0 ? idsTodos : elegidasIds) : null;
            }}
            que={etiquetas.que}
            varias={etiquetas.varias}
            sede={sede}
            data-sin-unidades={etiquetas.sinUnidades || undefined}
            className={(negado) => (negado ? "btn-cayla min-h-10 bg-rojo text-[12.5px] text-crema hover:bg-rojo-profundo" : BOTON)}
          >
            <Printer aria-hidden className="h-4 w-4" />
            <span key={etiquetas.texto + etiquetas.cantidad} className="vr-texto">
              {etiquetas.texto}
              {etiquetas.cantidad > 1 && <span className="vr-cuenta tabular-nums">{etiquetas.cantidad}</span>}
            </span>
          </EnlaceEtiquetas>
          {/* El rótulo del anaquel de este modelo (ADR-0366; Felipe 2026-10-09: «que se pueda imprimir desde el modal del producto»). Es del
              MODELO, no de las tallas elegidas, y no depende del stock: va siempre. «Volver» regresa a esta misma vista de Productos. */}
          <Link href={urlRotulos([producto.productoId], { productos: pantalla }) ?? "/rotulos"} className={BOTON}>
            <SignpostBig aria-hidden className="h-4 w-4" />
            Rótulo
          </Link>
          {/* ADR-0354: entre «Etiquetas» y «Ver en Existencias». No navega: la hoja da vuelta la página. */}
          <button type="button" onClick={() => irA("historial")} className={BOTON} data-ir-historial>
            <History aria-hidden className="h-4 w-4" />
            Historial
          </button>
          {hrefExistencias && (
            <Link href={hrefExistencias} className="btn-cayla btn-primario min-h-10 text-[12.5px]">
              <PackageOpen aria-hidden className="h-4 w-4" />
              Ver en Existencias
            </Link>
          )}
          {/* Quien edita el catálogo. Abre una ventana que pregunta a la base qué se puede borrar; con ventas, compras o traslados explica por
              qué no y ofrece desactivarla (el botón «Desactivar» del encabezado hace lo mismo sin pasar por aquí). */}
          {puedeEliminar && (
            <button type="button" onClick={onEliminar} className="btn-cayla btn-peligro vr-eliminar min-h-10 text-[12.5px]">
              <Trash2 aria-hidden className="h-4 w-4" />
              Eliminar
            </button>
          )}
        </div>
      </div>
      </div>
      )}
    </Modal>
  );
}
