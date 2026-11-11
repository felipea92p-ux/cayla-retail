"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Tag, Truck } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import {
  conMiles,
  filtrosPuestos,
  type CifrasDelResumen,
  type EstadoDelResumen,
  type FiltroDelConteo,
  type OpcionDelFiltro,
  type OrdenDelConteo,
  type TipoDeModelo,
} from "@/lib/recepcion-modelos-reglas";

// El buscador y, a su lado, UN botón «Filtros» (ADR-0645, Felipe 2026-11-11: «el buscador está muy largo y los filtros son muchos, que todo se condense en un botón
// y se muestre solo cuando se quiera»). Adentro vive todo lo que antes estaba repartido por la pantalla: los estados del resumen de la derecha, Re stock y Producto
// nuevo de las tarjetas de arriba, el proveedor, la marca y el orden. Elegir cierra el panel, y lo puesto queda dicho en una línea con su ✕.

const ESTADOS: readonly { clave: EstadoDelResumen; texto: string; soloConAviso?: boolean }[] = [
  { clave: "por-contar", texto: "Por contar" },
  { clave: "diferencia", texto: "Con diferencia", soloConAviso: true },
  { clave: "cuadran", texto: "Cuadran", soloConAviso: true },
  { clave: "despues", texto: "Tallas para después" },
  { clave: "llevar", texto: "Por llevar al stock" },
];
const TIPOS: readonly { clave: TipoDeModelo; texto: string; puesto: string }[] = [
  { clave: "restock", texto: "Re stock", puesto: "Solo re stock" },
  { clave: "nuevo", texto: "Producto nuevo", puesto: "Solo producto nuevo" },
];

export function FiltrosDelEnvio({
  filtro,
  orden,
  cifras,
  sinAviso,
  proveedores,
  marcas,
  filtrarProveedor,
  filtrarMarca,
  conOrden,
  onFiltro,
  onOrden,
  onElegirPrimero,
}: {
  filtro: FiltroDelConteo;
  orden: OrdenDelConteo;
  /** Las de TODO el envío: el número de cada píldora no cambia con lo que ya está filtrado. */
  cifras: CifrasDelResumen;
  sinAviso: boolean;
  proveedores: readonly OpcionDelFiltro[];
  marcas: readonly OpcionDelFiltro[];
  /** ¿El envío trae más de un proveedor (o marca)? Si no, ese filtro no se dibuja. */
  filtrarProveedor: boolean;
  filtrarMarca: boolean;
  /** Con una sola cosa en la lista no hay nada que ordenar. */
  conOrden: boolean;
  onFiltro: (f: FiltroDelConteo) => void;
  onOrden: (o: OrdenDelConteo) => void;
  /** Enter en el buscador: a contar lo primero que se encontró. */
  onElegirPrimero: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const puestos = filtrosPuestos(filtro);
  const estados = ESTADOS.filter((e) => !(e.soloConAviso && sinAviso));
  // Sin aviso todavía no se sabe qué es cada cosa; y sin modelos anotados no hay tipo que filtrar.
  const conTipos = !sinAviso && cifras.tipos.restock.modelos + cifras.tipos.nuevo.modelos > 0;
  const volver = " · tócala otra vez para volver al orden de la compra";
  /** Eligió: el panel se cierra y lo puesto queda dicho abajo. */
  const elegir = (f: FiltroDelConteo) => {
    onFiltro(f);
    setAbierto(false);
  };
  const alBuscar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !filtro.texto.trim()) return;
    e.preventDefault();
    onElegirPrimero();
  };
  return (
    <>
      <div className="rc-buscar">
        <Buscador
          atajo
          valor={filtro.texto}
          onCambio={(texto) => onFiltro({ ...filtro, texto })}
          onKeyDown={alBuscar}
          etiqueta="Buscar modelo, proveedor o marca"
          placeholder="Buscar un modelo…" // sugerir-fijo: dice dónde busca, no depende de nada elegido antes
          guia="recepcion.buscar"
        />
        {/* Un ancla por estado (como Historial de ventas): la guía abre con una y cierra con la otra, y cerrar nunca vuelve a abrir. */}
        <span data-guia={abierto ? "recepcion.filtros-cerrar" : "recepcion.filtros"} className="inline-flex shrink-0">
          <BotonFiltros abierto={abierto} activos={puestos} onClick={() => setAbierto((a) => !a)} />
        </span>
      </div>
      {abierto && (
        // Flota sobre la lista en vez de empujarla: las categorías no se mueven al abrir ni al cerrar, y con la ventana baja no se quedan sin lugar.
        <div className="rc-filtros-flota">
          <PanelPildoras filas guia="recepcion.filtros-panel">
            <FilaPildoras titulo="Estado">
              <div className="rc-filtro-fila" data-guia="recepcion.estados">
                {estados.map((e) => (
                  <button key={e.clave} type="button" className="pildora-cayla" aria-pressed={filtro.estado === e.clave} onClick={() => elegir({ ...filtro, estado: filtro.estado === e.clave ? null : e.clave })}>
                    {e.texto}
                    <span className="pildora-cayla__n">{conMiles(cifras.estados[e.clave])}</span>
                  </button>
                ))}
              </div>
            </FilaPildoras>
            {conTipos && (
              <FilaPildoras titulo="Tipo">
                <div className="rc-filtro-fila" data-guia="recepcion.tipos">
                  {TIPOS.map((t) => (
                    <button key={t.clave} type="button" className="pildora-cayla" aria-pressed={filtro.tipo === t.clave} onClick={() => elegir({ ...filtro, tipo: filtro.tipo === t.clave ? null : t.clave })}>
                      {t.texto}
                      <span className="pildora-cayla__n">{conMiles(cifras.tipos[t.clave].modelos)}</span>
                    </button>
                  ))}
                </div>
              </FilaPildoras>
            )}
            {(filtrarProveedor || filtrarMarca) && (
              <FilaPildoras titulo="De quién">
                {filtrarProveedor && (
                  <DesplegablePildora
                    icono={Truck}
                    etiqueta="Proveedor"
                    encoger
                    valor={filtro.proveedorId ?? TODOS}
                    onValor={(v) => elegir({ ...filtro, proveedorId: v === TODOS ? null : v })}
                    opciones={[{ valor: TODOS, texto: "Todos" }, ...proveedores.map((o) => ({ valor: o.valor, texto: o.etiqueta }))]}
                  />
                )}
                {filtrarMarca && (
                  <DesplegablePildora
                    icono={Tag}
                    etiqueta="Marca"
                    encoger
                    valor={filtro.marcaId ?? TODOS}
                    onValor={(v) => elegir({ ...filtro, marcaId: v === TODOS ? null : v })}
                    opciones={[{ valor: TODOS, texto: "Todas" }, ...marcas.map((o) => ({ valor: o.valor, texto: o.etiqueta }))]}
                  />
                )}
              </FilaPildoras>
            )}
            {conOrden && (
              <FilaPildoras titulo="Orden">
                <div data-guia="recepcion.orden">
                  {/* Tocar la flecha que ya está puesta vuelve al orden de la compra. */}
                  <SegmentoDeslizante
                    forma="modo"
                    etiqueta="Ordenar por cantidad"
                    valor={orden ?? ""}
                    onCambio={(o) => onOrden(o === orden ? null : (o as OrdenDelConteo))}
                    opciones={[
                      { clave: "asc", icono: <ArrowUp aria-hidden />, etiqueta: "De menos a más", ayuda: `De menos a más${orden === "asc" ? volver : ""}` },
                      { clave: "desc", icono: <ArrowDown aria-hidden />, etiqueta: "De más a menos", ayuda: `De más a menos${orden === "desc" ? volver : ""}` },
                    ]}
                  />
                </div>
              </FilaPildoras>
            )}
          </PanelPildoras>
        </div>
      )}
      {puestos > 0 && !abierto && (
        <div className="rc-puestos">
          <span className="rc-puestos-titulo">Viendo solo:</span>
          {filtro.estado && (
            <FiltroPuesto etiqueta="Quitar el filtro de estado" onQuitar={() => onFiltro({ ...filtro, estado: null })}>
              {ESTADOS.find((e) => e.clave === filtro.estado)?.texto}
            </FiltroPuesto>
          )}
          {filtro.tipo && (
            <FiltroPuesto etiqueta="Quitar el filtro de tipo" onQuitar={() => onFiltro({ ...filtro, tipo: null })}>
              {TIPOS.find((t) => t.clave === filtro.tipo)?.puesto}
            </FiltroPuesto>
          )}
          {filtro.proveedorId && (
            <FiltroPuesto etiqueta="Quitar el filtro de proveedor" onQuitar={() => onFiltro({ ...filtro, proveedorId: null })}>
              {proveedores.find((o) => o.valor === filtro.proveedorId)?.etiqueta ?? "Un proveedor"}
            </FiltroPuesto>
          )}
          {filtro.marcaId && (
            <FiltroPuesto etiqueta="Quitar el filtro de marca" onQuitar={() => onFiltro({ ...filtro, marcaId: null })}>
              {marcas.find((o) => o.valor === filtro.marcaId)?.etiqueta ?? "Una marca"}
            </FiltroPuesto>
          )}
          {puestos > 1 && <BotonLimpiar onClick={() => onFiltro({ ...filtro, proveedorId: null, marcaId: null, tipo: null, estado: null })}>Limpiar filtros</BotonLimpiar>}
        </div>
      )}
    </>
  );
}
