"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, History, PackageOpen, PauseCircle, Pencil, PlayCircle, Printer, Trash2, X, FunnelX } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { EliminarProductoModal } from "@/components/EliminarProductoModal";
import { CambiarEstadoProductosHoja } from "@/components/CambiarEstadoProductosHoja";
import { MiniaturaPrenda, SwatchesColor } from "@/components/ProductoPiezas";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { describirRotacion } from "@/lib/reorden-reglas";
import type { ProductoListado } from "@/lib/catalogo-v2";
import {
  alertaDeStock,
  lineasDeStock,
  hrefEnExistencias,
  EXPLICACION_STOCK_TOTAL,
  MENSAJE_SIN_RESULTADOS,
  SIN_EXISTENCIAS,
  type ExistenciasProducto,
  type LineasStock,
} from "@/lib/productos-stock";
import {
  coloresDe,
  margenDe,
  ordenarVariantes,
  rangoSoles,
  tallasDe,
  textoMargen,
  tieneCosto,
  UMBRAL_MARGEN_BAJO,
  type ColorDisponible,
  type MargenProducto,
  variantesQueSeVenden,
} from "@/lib/productos-vista";
import { margenPorcentaje } from "@/lib/alta-producto";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { usePantallaActual } from "@/lib/usePantallaActual";
import { conDesde } from "@/lib/vuelta-productos";
import { unidadesEnSede } from "@/lib/stock-en-sede-reglas";
import { useStockEnSede, type StockDeModelo } from "@/components/useStockEnSede";
import { EnlaceEtiquetas } from "@/components/EnlaceEtiquetas";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";

/**
 * Productos ▸ Tabla (ADR-0254, rediseño 2026-09-28 sobre `docs/maquetas/productos-administrar-2026-09/`).
 *
 * La planilla del catálogo: una fila por modelo con su foto, colores, tallas, precio, costo, MARGEN, stock y estado; un
 * clic abre sus variantes. La ven todos los que ven Productos (el rol decide: ADR-0161); lo que escribe se esconde a
 * quien no puede (Editar, Ajustar, Eliminar, Descontinuar/Reactivar), y el costo y el margen a quien no ve el dinero.
 *
 * RESPONSIVE por el ancho de la TABLA (`@container`), no de la ventana: con el menú lateral abierto, una ventana de
 * 1.280 px deja ~1.000 para la tabla. Debajo de `@3xl` (768 px) cada prenda es una tarjeta apilada (celular, tablet
 * vertical); desde ahí, filas, y las columnas menos urgentes entran de a una: colores y costo en `@4xl`, tallas y
 * marca/proveedor en `@6xl` (1.152 px). Lo que no cabe no se pierde: baja a la línea de la prenda o a la ficha.
 *
 * Misma fuente que la Grilla (`ProductoListado[]`, ya filtrada y paginada por `fn_productos_listado`) y las mismas piezas
 * (`ProductoPiezas`, `productos-vista`): las dos vistas no pueden decir cosas distintas de la misma prenda.
 *
 * Descontinuar/Reactivar en bloque pasa por `cambiar_estado_productos` (20260928235000): todo o nada, y al reactivar
 * revisa marca y proveedor como «Editar». Si la migración todavía no está en la base, cae al `update` directo de antes.
 */

type Fila = {
  p: ProductoListado;
  colores: ColorDisponible[];
  tallas: string[];
  precio: string;
  costo: string | null;
  margen: MargenProducto | null;
  alerta: ReturnType<typeof alertaDeStock>;
  /** Lo de la sede elegida (ADR-0270): «7 aquí» y aparte el resto. `null` si no se pudo leer o si no hay nada en la red. */
  lineas: LineasStock | null;
  rotacion: string | null;
  descontinuado: boolean;
};

type Permisos = {
  puedeEditar: boolean;
  puedeEliminar: boolean;
  veDinero: boolean;
};

export function ProductosTabla({
  productos,
  existencias,
  ubicacionId,
  sede,
  puedeEditar,
  veExistencias,
  puedeEliminar,
  veDinero,
  mensajeVacio = MENSAJE_SIN_RESULTADOS,
  hrefLimpiar,
}: {
  productos: ProductoListado[];
  /** Lo de la sede elegida por producto (ADR-0270). `null`: no se pudo leer, y la columna dice el total como antes. */
  existencias: Map<string, ExistenciasProducto> | null;
  ubicacionId: string;
  /** El nombre de la sede de `ubicacionId`: el stock de la ficha y las etiquetas son de ella, no de la red. */
  sede: string;
  /** Editar la ficha y descontinuar/reactivar (`editarCatalogo`). */
  puedeEditar: boolean;
  /** ¿Ve el módulo Existencias? Ahí se ajusta el stock (ADR-0270, decisión 9): el Catálogo solo enlaza. */
  veExistencias: boolean;
  /** Quien edita el catálogo (`fn_puede_editar_catalogo`, ADR-0252 act. 2026-10-03). La ventana pregunta a la base antes de ofrecerlo. */
  puedeEliminar: boolean;
  /** Costo y margen (`verDineroCompras`). Sin él, `fn_productos_listado` ya manda el costo vacío: aquí solo se esconden las columnas. */
  veDinero: boolean;
  mensajeVacio?: string;
  /** «Limpiar filtros» dentro del vacío (Felipe 2026-10-08: deshacerlo ahí mismo). */
  hrefLimpiar?: string;
}) {
  const pantalla = usePantallaActual();
  const filas = useMemo<Fila[]>(
    () =>
      productos.map((p) => ({
        p,
        colores: coloresDe(p.variantes),
        tallas: tallasDe(p.variantes),
        precio: rangoSoles(variantesQueSeVenden(p.variantes).map((v) => v.precio)) ?? "—",
        costo: rangoSoles(variantesQueSeVenden(p.variantes).map((v) => (tieneCosto(v.costo) ? v.costo : null))),
        margen: margenDe(variantesQueSeVenden(p.variantes)),
        alerta: alertaDeStock(p),
        lineas: existencias && alertaDeStock(p) !== "sin_stock" ? lineasDeStock(existencias.get(p.productoId) ?? SIN_EXISTENCIAS) : null,
        rotacion: describirRotacion(p.demandaDiaria),
        descontinuado: p.estado !== "activo",
      })),
    [productos, existencias],
  );

  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [eliminando, setEliminando] = useState<ProductoListado | null>(null);
  const [cambiando, setCambiando] = useState<"activo" | "descontinuado" | null>(null);
  const stockSede = useStockEnSede(ubicacionId);

  // Otra página u otros filtros = otras prendas: lo marcado de antes ya no está a la vista y no debe viajar escondido.
  // Se ajusta durante el render (no en un efecto, que pintaría una vez de más con la selección vieja).
  const claveLista = productos.map((p) => p.productoId).join(",");
  const [claveVista, setClaveVista] = useState(claveLista);
  if (claveVista !== claveLista) {
    setClaveVista(claveLista);
    setMarcados(new Set());
    setAbiertos(new Set());
  }

  const permisos: Permisos = { puedeEditar, puedeEliminar, veDinero };
  const conMargen = veDinero;

  function alternar(conjunto: Set<string>, id: string): Set<string> {
    const n = new Set(conjunto);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }
  const abrir = (id: string) => setAbiertos((a) => alternar(a, id));
  const marcar = (id: string) => setMarcados((m) => alternar(m, id));
  const todos = productos.length > 0 && productos.every((p) => marcados.has(p.productoId));
  const algunos = marcados.size > 0 && !todos;
  const marcarTodos = () => setMarcados(todos ? new Set() : new Set(productos.map((p) => p.productoId)));

  // La fila entera abre la ficha, salvo que el clic sea de un control de adentro o venga de un modal (portal: sube por
  // los ancestros de React aunque viva fuera de la fila, ADR-0128).
  function alClicFila(e: MouseEvent<HTMLElement>, id: string) {
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest("button, a, input, label, [role='radio']")) return;
    abrir(id);
  }

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

  const acciones = (f: Fila): AccionesFila => ({
    editar: puedeEditar ? conDesde(`/productos/${f.p.productoId}/editar`, pantalla) : null,
    historial: conDesde(`/productos/${f.p.productoId}/historial`, pantalla),
    etiquetas: urlEtiquetasDePrecio({ producto: f.p.productoId }, pantalla),
    etiquetasDe: (varianteId) => urlEtiquetasDePrecio({ variantes: [varianteId] }, pantalla),
    existencias: veExistencias ? hrefEnExistencias(f.p.variantes) : null,
    // Se cuenta FRESCO al pedir imprimir: la ficha pudo quedar vieja (una venta, un traslado que acaba de llegar).
    unidades: async (varianteIds) => {
      const stock = await stockSede.leer([f.p.productoId]);
      return stock ? unidadesEnSede(stock, varianteIds ?? f.p.variantes.map((v) => v.varianteId)) : null;
    },
    sede,
    eliminar: puedeEliminar ? () => setEliminando(f.p) : null,
  });

  const seleccion = productos.filter((p) => marcados.has(p.productoId));

  return (
    <div className="@container">
      <div className="card-cayla overflow-hidden">
        {/* Marcar la página y la regla del margen: arriba de las dos formas (filas o tarjetas). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-sand px-4 py-3 @3xl:px-5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-tinta/75">
            <CasillaMarca marcada={todos} parcial={algunos} onCambiar={marcarTodos} etiqueta="Marcar todas las de esta página" />
            {marcados.size > 0 ? (
              <span>
                <span className="font-semibold text-tinta">{marcados.size}</span> {marcados.size === 1 ? "marcada" : "marcadas"}
              </span>
            ) : (
              "Marcar esta página"
            )}
          </label>
          {conMargen && (
            <p className="flex items-center gap-4 text-[11.5px] text-tinta/60">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-verde" />
                margen sano
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-ambar" />
                bajo {UMBRAL_MARGEN_BAJO} %
              </span>
            </p>
          )}
        </div>

        {/* ── Angosta: una tarjeta por prenda ── */}
        <ul className="divide-y divide-sand @3xl:hidden">
          {filas.map((f) => (
            <TarjetaFila
              key={f.p.productoId}
              fila={f}
              abierta={abiertos.has(f.p.productoId)}
              marcada={marcados.has(f.p.productoId)}
              onMarcar={() => marcar(f.p.productoId)}
              onClic={(e) => alClicFila(e, f.p.productoId)}
              conMargen={conMargen}
              ficha={<FichaVariantes fila={f} permisos={permisos} acciones={acciones(f)} stock={stockSede.de(f.p.productoId)} leer={stockSede.leer} />}
            />
          ))}
        </ul>

        {/* ── Ancha: filas ── */}
        <table className="hidden w-full text-sm @3xl:table">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="w-10 py-2.5 pl-5" aria-label="Marcar" />
              <Th>Prenda</Th>
              <Th className="hidden @6xl:table-cell">Marca · proveedor</Th>
              <Th className="hidden @4xl:table-cell">Colores</Th>
              <Th className="hidden @6xl:table-cell">Tallas</Th>
              <Th className="text-right">Precio</Th>
              {conMargen && <Th className="hidden text-right @4xl:table-cell">Costo</Th>}
              {conMargen && <Th className="text-right">Margen</Th>}
              <Th className="text-right" title={EXPLICACION_STOCK_TOTAL}>
                {existencias ? "Stock aquí" : "Stock"}
              </Th>
              <Th className="pr-5">Estado</Th>
            </tr>
          </thead>
          {filas.map((f) => (
            <FilaAncha
              key={f.p.productoId}
              fila={f}
              abierta={abiertos.has(f.p.productoId)}
              marcada={marcados.has(f.p.productoId)}
              onMarcar={() => marcar(f.p.productoId)}
              onAbrir={() => abrir(f.p.productoId)}
              onClic={(e) => alClicFila(e, f.p.productoId)}
              conMargen={conMargen}
              acciones={acciones(f)}
              ficha={<FichaVariantes fila={f} permisos={permisos} acciones={acciones(f)} stock={stockSede.de(f.p.productoId)} leer={stockSede.leer} />}
            />
          ))}
        </table>
      </div>

      <BarraMarcadas
        seleccion={seleccion}
        puedeEditar={puedeEditar}
        sede={sede}
        unidades={async (varianteIds) => {
          const stock = await stockSede.leer(seleccion.map((p) => p.productoId));
          return stock ? unidadesEnSede(stock, varianteIds) : null;
        }}
        onDescontinuar={() => setCambiando("descontinuado")}
        onReactivar={() => setCambiando("activo")}
        onLimpiar={() => setMarcados(new Set())}
      />

      {/* Los modales viven aquí, fuera de las filas: una fila clicable no debe recibir los clics de adentro (ADR-0128). */}
      {eliminando && (
        <EliminarProductoModal
          producto={{ productoId: eliminando.productoId, referencia: eliminando.referencia, estado: eliminando.estado, numVariantes: eliminando.variantes.length }}
          onClose={() => setEliminando(null)}
        />
      )}
      {cambiando && (
        <CambiarEstadoProductosHoja
          estado={cambiando}
          productos={seleccion}
          onClose={() => setCambiando(null)}
          onHecho={() => {
            setCambiando(null);
            setMarcados(new Set());
          }}
        />
      )}
    </div>
  );
}

function Th({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <th title={title} className={`label-cayla whitespace-nowrap px-3 py-2.5 text-[10.5px] font-semibold text-tinta/60 ${className}`}>
      {children}
    </th>
  );
}

/** Casilla nativa (teclado y lector de pantalla gratis) en tinta: el rojo queda para lo urgente. */
function CasillaMarca({ marcada, parcial = false, onCambiar, etiqueta }: { marcada: boolean; parcial?: boolean; onCambiar: () => void; etiqueta: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = parcial;
  }, [parcial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={marcada}
      onChange={onCambiar}
      aria-label={etiqueta}
      className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-tinta"
    />
  );
}

/** El color que se está mirando: el que tiene el mouse encima, si no el fijado, si no el primero (como la Grilla). */
function useColorActivo(colores: ColorDisponible[]) {
  const [fijo, setFijo] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const nombre = hover ?? fijo ?? colores[0]?.nombre ?? null;
  return { nombre, color: colores.find((c) => c.nombre === nombre) ?? null, setFijo, setHover };
}

function EstadoChip({ fila }: { fila: Fila }) {
  if (fila.descontinuado) {
    return (
      <Chip tono="apagado" tachado={false}>
        Descontinuado
      </Chip>
    );
  }
  if (fila.p.reponerDeProveedor) return <Chip tono="ambar">Pedir</Chip>;
  return <Chip tono="verde">Activo</Chip>;
}

/** Stock total y, debajo, a qué ritmo se vende. «Sin stock» no es rojo (máximo dos rojos por pantalla, ADR-0151). */
function Stock({ fila, alinear = "right" }: { fila: Fila; alinear?: "right" | "left" }) {
  const { alerta, p, rotacion, lineas } = fila;
  const tono = alerta === "bajo" ? "text-ambar" : alerta === "sin_stock" ? "text-tinta/45" : "text-tinta";
  // ADR-0270: lo de la sede elegida arriba, y debajo lo que está en otra sede, en el Taller o en camino.
  const resto = lineas ? [lineas.detalle, ...lineas.avisos].filter(Boolean).join(" · ") : "";
  return (
    <span className={`block ${alinear === "right" ? "text-right" : ""}`} title={resto || EXPLICACION_STOCK_TOTAL}>
      <span className={`block text-[14px] tabular-nums ${tono}`}>
        {lineas ? lineas.principal : p.stockTotal.toLocaleString("es-PE")}
        {alerta === "bajo" && <span className="ml-1 text-[11px]">· bajo</span>}
      </span>
      {resto && <span className="block max-w-[14rem] truncate text-[11px] text-tinta/55">{resto}</span>}
      <span className="block whitespace-nowrap text-[11px] text-tinta/55" title="Ritmo de venta de los últimos 30 días, en todas las sedes">
        {rotacion ?? "sin ventas"}
      </span>
    </span>
  );
}

function Margen({ margen }: { margen: MargenProducto | null }) {
  if (!margen) return <span className="text-tinta/45">—</span>;
  const ancho = Math.max(0, Math.min(100, margen.min));
  return (
    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap" title={margen.bajo ? `Alguna talla deja menos de ${UMBRAL_MARGEN_BAJO} %` : undefined}>
      <span className={`tabular-nums ${margen.bajo ? "text-ambar" : "text-tinta"}`}>{textoMargen(margen)}</span>
      <span aria-hidden className="h-1 w-11 overflow-hidden rounded-full bg-hueso">
        <span className={`block h-full rounded-full ${margen.bajo ? "bg-ambar" : "bg-verde"}`} style={{ width: `${ancho}%` }} />
      </span>
    </span>
  );
}

type AccionesFila = {
  editar: string | null;
  historial: string;
  etiquetas: string;
  /** Las etiquetas de UNA sola variante (talla + color), para el ícono que flota sobre su tarjeta. */
  etiquetasDe: (varianteId: string) => string;
  /** «Ver en Existencias»: ahí se ajusta el stock (ADR-0270, decisión 9). Null si no ve ese módulo. */
  existencias: string | null;
  /** Unidades de esas variantes (sin lista: todo el modelo) en la sede, leídas en el momento; `null` si la base no
   *  respondió. Con 0 no se abre Etiquetas: sale el aviso y el botón queda en rojo. */
  unidades: (varianteIds?: string[]) => Promise<number | null>;
  sede: string;
  eliminar: (() => void) | null;
};

/* ─────────────────────────── Ancha ─────────────────────────── */

function FilaAncha({
  fila,
  abierta,
  marcada,
  onMarcar,
  onAbrir,
  onClic,
  conMargen,
  acciones,
  ficha,
}: {
  fila: Fila;
  abierta: boolean;
  marcada: boolean;
  onMarcar: () => void;
  onAbrir: () => void;
  onClic: (e: MouseEvent<HTMLElement>) => void;
  conMargen: boolean;
  acciones: AccionesFila;
  ficha: ReactNode;
}) {
  const { p, colores, tallas } = fila;
  const activo = useColorActivo(colores);
  const columnas = 7 + (conMargen ? 2 : 0);
  return (
    // Un <tbody> por prenda: la fila y su ficha van juntas, y el hover pinta las dos.
    <tbody className="group/fila border-b border-sand last:border-b-0">
      <tr
        onClick={onClic}
        className={`cursor-pointer transition-colors duration-200 hover:bg-hueso/45 ${marcada ? "bg-hueso/70 shadow-[inset_3px_0_0_var(--color-tinta)]" : ""} ${
          abierta ? "bg-hueso/45" : ""
        }`}
      >
        <td className="py-3 pl-5 align-middle">
          <CasillaMarca marcada={marcada} onCambiar={onMarcar} etiqueta={`Marcar ${p.referencia}`} />
        </td>
        <td className="py-3 pl-1 pr-3 align-middle">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onAbrir}
              aria-expanded={abierta}
              aria-label={`${abierta ? "Cerrar" : "Ver"} las variantes de ${p.referencia}`}
              className="-ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-tinta/45 transition-colors hover:bg-hueso hover:text-tinta"
            >
              <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
            </button>
            <MiniaturaPrenda color={activo.color} referencia={p.referencia} className={`h-[50px] w-10 ${fila.descontinuado ? "opacity-60" : ""}`} {...categoriaDe(p)} />
            <div className={`min-w-0 ${fila.descontinuado ? "opacity-70" : ""}`}>
              <p className="font-display truncate text-[17px] leading-tight text-tinta" title={p.referencia}>
                {p.referencia}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-tinta/55">
                <span className="font-mono tracking-wide">{p.codigo ?? "sin código"}</span> · {p.categoria ?? "sin categoría"}
              </p>
              {/* Sin columnas de marca ni tallas (tabla < @6xl), bajan aquí. */}
              <p className="truncate text-[11px] text-tinta/55 @6xl:hidden">
                {p.marca ?? "sin marca"}
                {tallas.length > 0 && <span className="text-tinta/45"> · {tallas.join(" ")}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="hidden px-3 py-3 align-middle @6xl:table-cell">
          {/* Lo que falta sale como chip ámbar (ADR-0283): un producto puede crearse sin marca y/o sin proveedor. */}
          <span className="block max-w-[11rem] truncate text-[12.5px] text-tinta/80">{p.marca ?? <Chip tono="ambar" versalitas={false}>Sin marca</Chip>}</span>
          <span className="block max-w-[11rem] truncate text-[11px] text-tinta/55">{p.proveedor ?? <Chip tono="ambar" versalitas={false}>Sin proveedor</Chip>}</span>
        </td>
        <td className="hidden px-3 py-3 align-middle @4xl:table-cell">
          <SwatchesColor colores={colores} activo={activo.nombre} onHover={activo.setHover} onFijar={activo.setFijo} tamano="h-3.5 w-3.5" max={4} />
        </td>
        <td className="hidden px-3 py-3 align-middle @6xl:table-cell">
          <Tallas tallas={tallas} />
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-tinta">{fila.precio}</td>
        {conMargen && (
          <td className="hidden whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-tinta/65 @4xl:table-cell">
            {fila.costo ?? <span className="text-[12px] text-tinta/45">sin costo</span>}
          </td>
        )}
        {conMargen && (
          <td className="px-3 py-3 text-right align-middle">
            <Margen margen={fila.margen} />
          </td>
        )}
        <td className="px-3 py-3 align-middle">
          <Stock fila={fila} />
        </td>
        <td className="relative py-3 pl-3 pr-5 align-middle">
          <EstadoChip fila={fila} />
          <AccionesFlotantes acciones={acciones} referencia={p.referencia} />
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={columnas} className="bg-hueso/40 p-0">
            {ficha}
          </td>
        </tr>
      )}
    </tbody>
  );
}

function Tallas({ tallas }: { tallas: string[] }) {
  if (tallas.length === 0) return <span className="text-tinta/45">—</span>;
  const visibles = tallas.slice(0, 5);
  return (
    <span className="flex items-center gap-1">
      {visibles.map((t) => (
        <span key={t} className="grid h-5 min-w-[22px] place-items-center rounded bg-hueso px-1 font-mono text-[10.5px] text-tinta/75">
          {t}
        </span>
      ))}
      {tallas.length > visibles.length && <span className="text-[11px] text-tinta/55">+{tallas.length - visibles.length}</span>}
    </span>
  );
}

/** Editar, Ajustar, Etiquetas e Historial al pasar el mouse (o al llegar con Tab), flotando sobre el estado: no se
 *  comen una columna. En una pantalla táctil no hay hover: las mismas acciones están en la ficha de la prenda. */
function AccionesFlotantes({ acciones, referencia }: { acciones: AccionesFila; referencia: string }) {
  const boton = "grid h-8 w-8 place-items-center rounded-md text-tinta/60 transition-colors hover:bg-hueso hover:text-tinta";
  const botonNegado = "grid h-8 w-8 place-items-center rounded-md bg-rojo text-crema transition-colors hover:bg-rojo-profundo";
  return (
    <div
      className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 translate-x-1.5 gap-0.5 rounded-lg border border-sand bg-papel p-0.5 opacity-0 shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--color-sombra)_35%,transparent)] transition-[opacity,transform] duration-200 ease-cayla group-hover/fila:pointer-events-auto group-hover/fila:translate-x-0 group-hover/fila:opacity-100 group-focus-within/fila:pointer-events-auto group-focus-within/fila:translate-x-0 group-focus-within/fila:opacity-100 [@media(hover:none)]:hidden"
    >
      {acciones.editar && (
        <Link href={acciones.editar} className={boton} aria-label={`Editar ${referencia}`} title="Editar">
          <Pencil aria-hidden className="h-4 w-4" />
        </Link>
      )}
      {acciones.existencias && (
        <Link href={acciones.existencias} className={boton} aria-label={`Ver ${referencia} en Existencias`} title="Ver en Existencias">
          <PackageOpen aria-hidden className="h-4 w-4" />
        </Link>
      )}
      <EnlaceEtiquetas
        href={acciones.etiquetas}
        unidades={() => acciones.unidades()}
        que={referencia}
        sede={acciones.sede}
        className={(negado) => (negado ? botonNegado : boton)}
        aria-label={`Etiquetas de precio de ${referencia}`}
        title="Etiquetas de precio"
      >
        <Printer aria-hidden className="h-4 w-4" />
      </EnlaceEtiquetas>
      <Link href={acciones.historial} className={boton} aria-label={`Historial de ${referencia}`} title="Historial">
        <History aria-hidden className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Lo que flota sobre la tarjeta de UNA variante al pasar el mouse: imprimir la etiqueta de esa talla y color, sin tener
 *  que imprimir las del modelo entero. Mismo gesto que `AccionesFlotantes` (que actúa sobre el modelo). Sin hover
 *  (celular) no aparece: ahí queda «Etiquetas» del modelo en la ficha. Flota sobre el precio, no sobre el stock: el stock
 *  es justo lo que se quiere ver antes de imprimir. */
function AccionesDeVariante({ href, unidades, descripcion, sede }: { href: string; unidades: () => Promise<number | null>; descripcion: string; sede: string }) {
  return (
    <div className="pointer-events-none absolute right-[5.25rem] top-1/2 flex -translate-y-1/2 translate-x-1.5 rounded-lg border border-sand bg-papel p-0.5 opacity-0 shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--color-sombra)_35%,transparent)] transition-[opacity,transform] duration-200 ease-cayla group-hover/variante:pointer-events-auto group-hover/variante:translate-x-0 group-hover/variante:opacity-100 group-focus-within/variante:pointer-events-auto group-focus-within/variante:translate-x-0 group-focus-within/variante:opacity-100 [@media(hover:none)]:hidden">
      <EnlaceEtiquetas
        href={href}
        unidades={unidades}
        que={descripcion}
        sede={sede}
        className={(negado) =>
          `grid h-8 w-8 place-items-center rounded-md transition-colors duration-200 ease-cayla ${
            negado ? "bg-rojo text-crema hover:bg-rojo-profundo" : "text-tinta/60 hover:bg-hueso hover:text-tinta"
          }`
        }
        aria-label={`Etiqueta de precio de ${descripcion}`}
        title="Imprimir la etiqueta de esta variante"
      >
        <Printer aria-hidden className="h-4 w-4" />
      </EnlaceEtiquetas>
    </div>
  );
}

/* ─────────────────────────── Angosta ─────────────────────────── */

function TarjetaFila({
  fila,
  abierta,
  marcada,
  onMarcar,
  onClic,
  conMargen,
  ficha,
}: {
  fila: Fila;
  abierta: boolean;
  marcada: boolean;
  onMarcar: () => void;
  onClic: (e: MouseEvent<HTMLElement>) => void;
  conMargen: boolean;
  ficha: ReactNode;
}) {
  const { p, colores, tallas } = fila;
  const activo = useColorActivo(colores);
  return (
    <li className={marcada ? "bg-hueso/70 shadow-[inset_3px_0_0_var(--color-tinta)]" : abierta ? "bg-hueso/40" : ""}>
      <div onClick={onClic} className="flex cursor-pointer gap-3 px-4 py-3.5">
        <div className="pt-1">
          <CasillaMarca marcada={marcada} onCambiar={onMarcar} etiqueta={`Marcar ${p.referencia}`} />
        </div>
        <MiniaturaPrenda color={activo.color} referencia={p.referencia} className={`h-[62px] w-[50px] ${fila.descontinuado ? "opacity-60" : ""}`} {...categoriaDe(p)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display min-w-0 truncate text-[17px] leading-tight text-tinta">{p.referencia}</p>
            <p className="shrink-0 text-[14px] tabular-nums text-tinta">{fila.precio}</p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-tinta/55">
            <span className="font-mono tracking-wide">{p.codigo ?? "sin código"}</span> · {p.categoria ?? "sin categoría"} · {p.marca ?? "sin marca"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <SwatchesColor colores={colores} activo={activo.nombre} onHover={activo.setHover} onFijar={activo.setFijo} tamano="h-4 w-4" max={5} />
            {tallas.length > 0 && <span className="text-[11.5px] text-tinta/65">{tallas.join(" · ")}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
            <EstadoChip fila={fila} />
            <span className={`tabular-nums ${fila.alerta === "bajo" ? "text-ambar" : "text-tinta/70"}`} title={EXPLICACION_STOCK_TOTAL}>
              {fila.lineas ? fila.lineas.principal : `Stock ${p.stockTotal.toLocaleString("es-PE")}`}
              {fila.alerta === "bajo" && " · bajo"}
            </span>
            {fila.lineas && (fila.lineas.detalle || fila.lineas.avisos.length > 0) && (
              <span className="text-tinta/55">{[fila.lineas.detalle, ...fila.lineas.avisos].filter(Boolean).join(" · ")}</span>
            )}
            {conMargen && fila.margen && (
              <span className={`tabular-nums ${fila.margen.bajo ? "text-ambar" : "text-tinta/70"}`}>Margen {textoMargen(fila.margen)}</span>
            )}
          </div>
        </div>
        <ChevronRight aria-hidden className={`mt-1 h-4 w-4 shrink-0 text-tinta/40 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
      </div>
      {abierta && ficha}
    </li>
  );
}

/* ─────────────────────────── Ficha de variantes ─────────────────────────── */

function FichaVariantes({
  fila,
  permisos,
  acciones,
  stock,
  leer,
}: {
  fila: Fila;
  permisos: Permisos;
  acciones: AccionesFila;
  stock: StockDeModelo;
  leer: (productoIds: string[]) => Promise<unknown>;
}) {
  const { p } = fila;
  const boton = "btn-cayla btn-secundario min-h-10 text-[12.5px]";
  // Al abrir, y otra vez cada vez que la página se refresca (un ajuste, una venta en otra caja): `p` es otro objeto.
  useEffect(() => {
    void leer([p.productoId]);
  }, [p, leer]);

  // Costo y margen ya están en la fila del modelo. En cada variante solo se repiten si NO son iguales en todas (la fila
  // dice «S/60–S/70» y hay que saber cuál es cuál): el costo de una talla que ya entró por Compras es su promedio
  // ponderado, y dos tallas compradas a distinto precio terminan con costos distintos.
  const costoPorVariante = permisos.veDinero && new Set(p.variantes.map((v) => (tieneCosto(v.costo) ? v.costo : null))).size > 1;
  const totalSede = stock && stock !== "error" ? unidadesEnSede(stock, p.variantes.map((v) => v.varianteId)) : null;

  return (
    <div className="anim-revelar px-4 pb-5 pt-3 @3xl:pl-[5.75rem] @3xl:pr-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label-cayla text-[10.5px] text-tinta/60">
          {variantesQueSeVenden(p.variantes).length} {variantesQueSeVenden(p.variantes).length === 1 ? "variante" : "variantes"}
          {fila.colores.length > 0 && ` · ${fila.colores.length} ${fila.colores.length === 1 ? "color" : "colores"}`}
          {fila.tallas.length > 0 && ` · ${fila.tallas.length} ${fila.tallas.length === 1 ? "talla" : "tallas"}`}
        </p>
        <p className="text-[12px] text-tinta/60">
          <span className="@6xl:hidden">
            {p.marca ?? "sin marca"} · {p.proveedor ?? "sin proveedor"} ·{" "}
          </span>
          {/* El total de la fila es de toda la red; el de cada variante, de esta sede: se dice cuál es cuál. */}
          Stock en {acciones.sede || "tu sede"}
          {totalSede !== null && <span className="tabular-nums text-tinta">: {totalSede.toLocaleString("es-PE")}</span>}
        </p>
      </div>
      <ul className="grid gap-2 @xl:grid-cols-2 @5xl:grid-cols-3">
        {ordenarVariantes(variantesQueSeVenden(p.variantes)).map((v) => {
          const m = costoPorVariante && tieneCosto(v.costo) ? margenPorcentaje(v.precio, v.costo) : null;
          const descripcion = [v.talla, v.color].filter(Boolean).join(" ") || (v.codigo ?? "esta variante");
          return (
            <li
              key={v.varianteId}
              className={`group/variante relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 rounded-xl border border-sand bg-papel py-2.5 pl-3 pr-2 ${v.activo ? "" : "opacity-50"}`}
            >
              <span aria-hidden className="row-span-2 h-6 w-6 rounded-md ring-1 ring-inset ring-tinta/10" style={{ background: v.colorHex ?? "var(--color-sand)" }} />
              <span className="min-w-0 truncate text-[13px] text-tinta">
                <span className="mr-1.5 font-mono font-medium">{v.talla ?? "—"}</span>
                {v.color ?? "Sin color"}
                {!v.activo && <span className="ml-1.5 text-[11px] text-tinta/55">(inactiva)</span>}
              </span>
              <span className="text-right text-[13px] tabular-nums text-tinta">S/{v.precio.toFixed(2)}</span>
              <StockDeVariante stock={stock} varianteId={v.varianteId} />
              <span className="min-w-0 truncate font-mono text-[10.5px] text-tinta/55" title={v.codigosBarras.join(", ")}>
                {v.codigo ?? v.sku ?? "—"}
                {v.codigosBarras.length > 0 && ` · ${v.codigosBarras.join(", ")}`}
              </span>
              <span className="whitespace-nowrap text-right text-[11px] tabular-nums text-tinta/55">
                {!costoPorVariante ? null : tieneCosto(v.costo) ? (
                  <>
                    costo S/{v.costo.toFixed(2)}
                    {m !== null && <span className={m < UMBRAL_MARGEN_BAJO ? "text-ambar" : ""}> · {Math.round(m)} %</span>}
                  </>
                ) : (
                  "sin costo"
                )}
              </span>
              <AccionesDeVariante
                href={acciones.etiquetasDe(v.varianteId)}
                unidades={() => acciones.unidades([v.varianteId])}
                descripcion={descripcion}
                sede={acciones.sede}
              />
            </li>
          );
        })}
      </ul>
      {/* Todas las acciones de la prenda: en una pantalla táctil (sin hover) este es el único lugar donde están. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {acciones.editar && (
          <Link href={acciones.editar} className={boton}>
            <Pencil aria-hidden className="h-4 w-4" />
            Editar
          </Link>
        )}
        {acciones.existencias && (
          <Link href={acciones.existencias} className={boton}>
            <PackageOpen aria-hidden className="h-4 w-4" />
            Ver en Existencias
          </Link>
        )}
        <EnlaceEtiquetas
          href={acciones.etiquetas}
          unidades={() => acciones.unidades()}
          que={p.referencia}
          sede={acciones.sede}
          className={(negado) => (negado ? "btn-cayla min-h-10 bg-rojo text-[12.5px] text-crema hover:bg-rojo-profundo" : boton)}
        >
          <Printer aria-hidden className="h-4 w-4" />
          Etiquetas
        </EnlaceEtiquetas>
        <Link href={acciones.historial} className={boton}>
          <History aria-hidden className="h-4 w-4" />
          Historial
        </Link>
        {acciones.eliminar && (
          <button type="button" onClick={acciones.eliminar} className="btn-cayla btn-peligro min-h-10 text-[12.5px]">
            <Trash2 aria-hidden className="h-4 w-4" />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

/** El stock de UNA variante en la sede, grande: es lo único de la tarjeta que cambia de una talla a otra. Con 0 se
 *  apaga (no es rojo: máximo dos rojos por pantalla, ADR-0151); mientras se lee, un guion, nunca un 0 que no es cierto. */
function StockDeVariante({ stock, varianteId }: { stock: StockDeModelo; varianteId: string }) {
  const n = stock && stock !== "error" ? (stock.get(varianteId) ?? 0) : null;
  return (
    <span
      className="row-span-2 flex w-[4.5rem] flex-col items-end justify-center self-stretch border-l border-sand pl-3"
      title={stock === "error" ? "No se pudo leer el stock de la tienda" : undefined}
    >
      <span className={`font-display text-[24px] leading-none tabular-nums ${n === null ? "text-tinta/25" : n === 0 ? "text-tinta/35" : "text-tinta"}`}>
        {n === null ? "—" : n.toLocaleString("es-PE")}
      </span>
      <span className="mt-1 text-[10.5px] leading-none text-tinta/55">
        {n === null ? (stock === "error" ? "sin dato" : "stock") : n === 0 ? "sin stock" : n === 1 ? "unidad" : "unidades"}
      </span>
    </span>
  );
}

/* ─────────────────────────── Lo marcado ─────────────────────────── */

/** Sube desde abajo cuando hay algo marcado. En el celular ocupa el ancho y los botones van en columnas iguales (con
 *  su palabra: un ícono solo no le dice nada a quien lo ve por primera vez). */
function BarraMarcadas({
  seleccion,
  puedeEditar,
  sede,
  unidades,
  onDescontinuar,
  onReactivar,
  onLimpiar,
}: {
  seleccion: ProductoListado[];
  puedeEditar: boolean;
  sede: string;
  /** Unidades en la sede de esas variantes, leídas en el momento (`null` si la base no respondió). */
  unidades: (varianteIds: string[]) => Promise<number | null>;
  onDescontinuar: () => void;
  onReactivar: () => void;
  onLimpiar: () => void;
}) {
  const pantalla = usePantallaActual();
  const n = seleccion.length;
  const variantes = seleccion.flatMap((p) => p.variantes.filter((v) => v.activo).map((v) => v.varianteId));
  const hayActivas = seleccion.some((p) => p.estado === "activo");
  const hayDescontinuadas = seleccion.some((p) => p.estado !== "activo");
  const forma =
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-3 text-[11.5px] text-crema transition-colors disabled:opacity-40 sm:flex-none sm:flex-row sm:gap-2 sm:text-[13px]";
  const boton = `${forma} hover:bg-crema/10`;
  return (
    <div
      role="toolbar"
      aria-label="Acciones sobre las prendas marcadas"
      aria-hidden={n === 0}
      className={`fixed inset-x-3 bottom-3 z-40 flex items-center gap-1 rounded-2xl bg-tinta p-1.5 text-crema shadow-[0_24px_48px_-16px_color-mix(in_srgb,var(--color-sombra)_50%,transparent)] transition-[opacity,transform] duration-300 ease-cayla sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:pl-4 ${
        n > 0 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <span className="flex shrink-0 items-baseline gap-1.5 px-2 sm:mr-2 sm:px-0">
        <span className="font-display text-xl tabular-nums">{n}</span>
        <span className="hidden text-[12px] text-crema/70 sm:inline">{n === 1 ? "marcada" : "marcadas"}</span>
      </span>
      {puedeEditar && (
        <>
          <button type="button" onClick={onDescontinuar} disabled={!hayActivas} className={boton} tabIndex={n > 0 ? 0 : -1}>
            <PauseCircle aria-hidden className="h-4 w-4" />
            Descontinuar
          </button>
          <button type="button" onClick={onReactivar} disabled={!hayDescontinuadas} className={boton} tabIndex={n > 0 ? 0 : -1}>
            <PlayCircle aria-hidden className="h-4 w-4" />
            Reactivar
          </button>
        </>
      )}
      <EnlaceEtiquetas
        // La clave cambia con lo marcado: el rojo de «esas no tienen stock» no debe quedarse pegado a otra selección.
        key={variantes.join(",")}
        href={variantes.length > 0 ? urlEtiquetasDePrecio({ variantes }, pantalla) : "#"}
        unidades={() => unidades(variantes)}
        que={n === 1 ? (seleccion[0]?.referencia ?? "La prenda marcada") : `Las ${n} prendas marcadas`}
        varias={n > 1}
        sede={sede}
        aria-disabled={variantes.length === 0}
        tabIndex={n > 0 ? 0 : -1}
        className={(negado) =>
          `${negado ? `${forma} bg-rojo hover:bg-rojo-profundo` : boton} ${variantes.length === 0 ? "pointer-events-none opacity-40" : ""}`
        }
      >
        <Printer aria-hidden className="h-4 w-4" />
        Etiquetas
      </EnlaceEtiquetas>
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-crema/20 sm:block" />
      <button
        type="button"
        onClick={onLimpiar}
        aria-label="Quitar la marca"
        tabIndex={n > 0 ? 0 : -1}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-crema/60 dark:text-crema/75 transition-colors hover:bg-crema/10 hover:text-crema"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
