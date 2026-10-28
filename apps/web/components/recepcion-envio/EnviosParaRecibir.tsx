"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ESTADO_ENVIO } from "@/lib/ordenes-compra-reglas";
import { TEXTO_LA_RECIBE_OTRA, type EnvioPorAbrir, type OrdenDirecta } from "@/lib/recepcion-envio-reglas";
import { esEnvioSinAviso } from "@/lib/recepcion-conteo-reglas";
import { coincideConBusqueda, ordenarFilasPorRecibir, textoBuscableDeEnvio, textoBuscableDeOrden } from "@/lib/recepcion-envio-busqueda";
import { contarFiltros, fechaDeEnvioParaTabla, filtrarFilas, proveedoresDeLaLista, SIN_FILTROS, type FiltrosEnvios } from "@/lib/recepcion-envio-filtros";
import { hoyLima } from "@/lib/fechas-lima";
import { paginar } from "@/lib/paginacion";
import { FiltrosDeEnvios } from "./FiltrosDeEnvios";
import { RecibirSinGuia } from "./RecibirSinGuia";
import { DetalleEnvioPorRecibir } from "./DetalleEnvioPorRecibir";

// La tarjeta de la puerta de Recibir (ADR-0362, fase 4): arriba del formulario «Sin Aviso», lo que viene de una orden de compra para ESTA sede,
// en una tabla (número, fecha de envío, estado, proveedor, guía, prendas y la acción) con un buscador y filtros (estado, proveedor, fechas) para
// hallar uno entre muchos, del que salió hace más tiempo al más nuevo dentro de cada grupo. Cada envío en camino (o
// ya abierto por alguien) con «Recibir», y cada orden «directo» que llegó sin guía con «Llegó esta orden» (decisión 48). Quien hizo la orden no
// la recibe (decisión 17): en vez del botón, lo dice. Solo sale si hay algo; si la lectura falló, no sale y la puerta recibe igual (lo decide
// la página).

// «Enviado» es la primera columna y sale desde @3xl, y la guía tiene la suya desde @5xl (el ancho de la TARJETA, no de la ventana: con el
// menú abierto la tarjeta es más angosta). Antes, la fecha de envío se lee bajo el número del envío y la guía bajo el proveedor, sin quitarle
// espacio al proveedor.
const PLANTILLA =
  "sm:grid-cols-[7rem_6rem_minmax(0,1fr)_5rem_11rem] @3xl:grid-cols-[5.5rem_7rem_6rem_minmax(0,1fr)_5rem_11rem] @5xl:grid-cols-[5.5rem_7.5rem_6.5rem_minmax(0,1fr)_8rem_5.5rem_13rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Enviado", ayuda: "El día en que salió el envío", clase: "hidden @3xl:block" },
  { titulo: "Envío" },
  { titulo: "Estado" },
  { titulo: "Proveedor" },
  { titulo: "Guía", clase: "hidden @5xl:block" },
  { titulo: "Prendas", alinear: "der" },
  { titulo: "", alinear: "der" },
];

/** Cuántos envíos se pintan por página: lo demás se pasa con la paginación. */
const POR_PAGINA = 10;

const prendas = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;

export function EnviosParaRecibir({
  envios,
  ordenes,
  sede,
  porCategoria = false,
  proveedoresSinAviso = {},
  accionTitulo,
}: {
  envios: EnvioPorAbrir[];
  ordenes: OrdenDirecta[];
  sede: string;
  /** ADR-0393: con la base al día, el envío se cuenta por categoría (la fase 4 lo contaba talla por talla). */
  porCategoria?: boolean;
  /** ADR-0393: de quién es cada envío sin aviso abierto (por id): su proveedor o «proveedor por confirmar». */
  proveedoresSinAviso?: Readonly<Record<string, string | null>>;
  /** A la derecha del título: «Sin Aviso», lo que llegó y no está en la lista. */
  accionTitulo?: ReactNode;
}) {
  const [buscar, setBuscar] = useState("");
  const [filtros, setFiltros] = useState<FiltrosEnvios>(SIN_FILTROS);
  // La tabla pinta UNA página de 10; buscar o filtrar vuelve a la primera (ajuste durante el render, como Comprobantes) y `paginar` acota
  // si la lista se achicó.
  const [pagina, setPagina] = useState(1);
  const firma = [buscar, filtros.estados.join(","), filtros.proveedor ?? "", filtros.desde, filtros.hasta].join("\u0000");
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    setPagina(1);
  }
  const tarjetaRef = useRef<HTMLElement>(null);
  if (envios.length === 0 && ordenes.length === 0) return null;
  const hoy = hoyLima();
  const proveedorSinAviso = (envioId: string) => proveedoresSinAviso[envioId] ?? null;
  // Primero el orden (grupo y, dentro del grupo, del envío más antiguo al más nuevo), después los filtros y al final lo escrito en el buscador.
  const todas = ordenarFilasPorRecibir(envios, ordenes);
  const filas = filtrarFilas(todas, filtros, proveedorSinAviso).filter((f) =>
    coincideConBusqueda(f.tipo === "envio" ? textoBuscableDeEnvio(f.envio, proveedorSinAviso(f.envio.id)) : textoBuscableDeOrden(f.orden), buscar),
  );
  const total = envios.length + ordenes.length;
  const coinciden = filas.length;
  const paginaActual = paginar(filas, pagina, POR_PAGINA);
  function irAPagina(n: number) {
    setPagina(n);
    // El paginador está al pie: al cambiar de página, la tabla empieza a leerse desde arriba.
    const tarjeta = tarjetaRef.current;
    if (tarjeta && tarjeta.getBoundingClientRect().top < 0) tarjeta.scrollIntoView({ block: "start" });
  }
  const hayFiltros = contarFiltros(filtros) > 0;
  const limpiar = () => {
    setBuscar("");
    setFiltros(SIN_FILTROS);
  };
  return (
    <section ref={tarjetaRef} data-guia="recibir.envios-oc" className="space-y-3" aria-labelledby="recibir-envios-oc">
      {/* Dos columnas en la misma fila: a la izquierda, el título con su leyenda; a la derecha, la pregunta con su botón. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <TituloSeccion id="recibir-envios-oc">{porCategoria ? "Envíos por recibir en esta sede" : "Envíos de órdenes de compra para esta sede"}</TituloSeccion>
          <p className="text-[13.5px] text-taupe">{porCategoria ? <>Se cuentan por categoría y entran al almacén de {sede}.</> : <>Se cuentan talla por talla y entran al almacén de {sede}.</>}</p>
        </div>
        {accionTitulo}
      </div>
      <FiltrosDeEnvios
        busqueda={buscar}
        onBusqueda={setBuscar}
        filtros={filtros}
        onFiltros={setFiltros}
        proveedores={proveedoresDeLaLista(todas, proveedorSinAviso)}
        hoy={hoy}
        conteo={buscar.trim() || hayFiltros ? (coinciden === 1 ? "1 coincide" : `${coinciden} de ${total} coinciden`) : undefined}
      />
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
        {paginaActual.filas.map((f) => {
          if (f.tipo === "orden") {
            const o = f.orden;
            return (
          <div key={o.ordenId} className={fila(PLANTILLA, "sm:items-center")}>
            {/* Una orden sin guía todavía no salió: no hay fecha de envío que decir. */}
            <span className={celda("izq", "hidden text-sm text-taupe @3xl:block")} title="Todavía no tiene envío">
              —
            </span>
            <span className={celda("izq", "text-sm font-semibold tabular-nums text-tinta")}>{o.numero}</span>
            <span className={celda("izq", "overflow-visible")}>
              <Chip tono="neutro">Sin guía</Chip>
            </span>
            <span className={celda("izq", "text-sm text-tinta")} title={o.proveedor ?? undefined}>
              {o.proveedor ?? "—"}
            </span>
            <span className={celda("izq", "hidden text-sm text-taupe @5xl:block")}>—</span>
            <span className={celda("der", "text-sm text-tinta")}>{prendas(o.unidadesPorEnviar)}</span>
            <span className={celda("der", "overflow-visible whitespace-normal sm:flex sm:justify-end")}>
              {o.creadaPorMi ? <span className="whitespace-normal text-right text-[12.5px] leading-snug text-taupe">{TEXTO_LA_RECIBE_OTRA}</span> : <RecibirSinGuia orden={o} sede={sede} />}
            </span>
          </div>
            );
          }
          const e = f.envio;
          const salio = fechaDeEnvioParaTabla(e.despachadoEn, hoy);
          const sinAviso = porCategoria && esEnvioSinAviso(e);
          const proveedor = sinAviso ? (proveedoresSinAviso[e.id] ?? "Por confirmar") : e.proveedores.length > 0 ? e.proveedores.join(", ") : "—";
          return (
            // Toda la fila lleva a su envío (Felipe 2026-10-13, /formidable): la prueba ciega buscaba el botón de SU envío entre cinco
            // «Recibir». El enlace de fondo no se enfoca ni se lee (el botón ya lo dice); el clic en el texto cae en él.
            <div key={e.id} className={`${fila(PLANTILLA, "group relative sm:items-center")}`}>
              {!e.creadoPorMi && (
                <Link href={`/recibir/envio/${e.id}`} aria-hidden tabIndex={-1} className="absolute inset-0 transition-colors duration-200 group-hover:bg-tinta/[0.03]" />
              )}
              <span className={celda("izq", "pointer-events-none relative hidden text-sm tabular-nums text-tinta @3xl:block")} title={salio ? `Enviado el ${salio.completa}` : "Sin fecha de envío"}>
                {salio ? (
                  <>
                    {salio.dia}
                    {salio.hora && <small className="block text-xs text-taupe">{salio.hora}</small>}
                  </>
                ) : (
                  <span className="text-taupe">—</span>
                )}
              </span>
              <span className={celda("izq", "pointer-events-none relative text-sm font-semibold tabular-nums text-tinta")}>
                {e.numero}
                {/* Con la tarjeta angosta, la fecha de envío se lee bajo el número; con la ancha, tiene su columna (la primera). */}
                {salio && (
                  <small className="block text-xs font-normal text-taupe @3xl:hidden" title={`Enviado el ${salio.completa}`}>
                    <span className="sm:hidden">Enviado </span>
                    {salio.dia}
                    {salio.hora && ` · ${salio.hora}`}
                  </small>
                )}
              </span>
              <span className={celda("izq", "pointer-events-none relative overflow-visible")}>
                <Chip tono={ESTADO_ENVIO[e.estado].tono}>{ESTADO_ENVIO[e.estado].texto}</Chip>
              </span>
              <span className={celda("izq", "pointer-events-none relative text-sm text-tinta")} title={proveedor}>
                {proveedor}
                {sinAviso && <small className="block truncate text-xs text-taupe">Llegó sin aviso: se sigue contando</small>}
                {e.numeroGuia && <small className="block truncate text-xs text-taupe @5xl:hidden">guía {e.numeroGuia}</small>}
              </span>
              <span className={celda("izq", "pointer-events-none relative hidden text-sm tabular-nums text-taupe @5xl:block")}>{e.numeroGuia ?? "—"}</span>
              <span className={celda("der", "pointer-events-none relative text-sm text-tinta")}>{sinAviso ? "—" : prendas(e.unidades)}</span>
              <span className={celda("der", "relative overflow-visible whitespace-normal sm:flex sm:justify-end")}>
                {e.creadoPorMi ? (
                  <span className="whitespace-normal text-right text-[12.5px] leading-snug text-taupe">{TEXTO_LA_RECIBE_OTRA}</span>
                ) : (
                  e.estado === "abierto" ? (
                    <BotonEnlace href={`/recibir/envio/${e.id}`} peso="fantasma" aria-label={`Seguir recibiendo ${e.numero}`}>
                      Seguir recibiendo
                    </BotonEnlace>
                  ) : (
                    // En camino: «Detalle» abre la hoja con lo que trae y, ahí, «Empezar a recibir» (salta a contar).
                    <DetalleEnvioPorRecibir envio={e} sede={sede} />
                  )
                )}
              </span>
            </div>
          );
        })}
        {coinciden === 0 && (
          <Vacio tamano="chico" alinear="izquierda" icono={<SearchX />} accion={{ texto: hayFiltros ? "Limpiar todo" : "Borrar la búsqueda", onClick: limpiar }}>
            {buscar.trim() ? <>Ningún envío coincide con «{buscar}»{hayFiltros ? " y los filtros puestos" : ""}.</> : "Ningún envío cumple los filtros puestos."}
          </Vacio>
        )}
        {paginaActual.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span>
              Mostrando {paginaActual.desde}–{paginaActual.hasta} de {coinciden}
            </span>
            <PaginacionLocal pagina={paginaActual.pagina} totalPaginas={paginaActual.totalPaginas} onPagina={irAPagina} />
          </div>
        )}
      </Tabla>
    </section>
  );
}
