import Link from "next/link";
import type { ReactNode } from "react";
import { FunnelX, SearchX, Spool } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getCifrasOrdenesInsumo, listarOrdenesInsumo } from "@/lib/ordenes-insumo";
import {
  ESTADO_ORDEN,
  RUTA_ORDENES_INSUMO,
  cantidadConUnidad,
  filtrosDeListaInsumo,
  hrefListaInsumo,
  numeroOrdenInsumo,
  paginaDeOrdenes,
  paramsDeListaInsumo,
  recienDeInsumo,
  textoCantidades,
  vacioDeListaInsumo,
  type CifrasOrdenesInsumo,
  type FiltrosListaInsumo,
  type ParamsListaInsumo,
} from "@/lib/ordenes-insumo-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { Resaltado } from "@/components/ui/Resaltado";
import { BotonEnlace } from "@/components/ui/campos";
import { PaginacionCursor } from "@/components/Paginacion";
import { BuscadorOrdenesInsumo } from "@/components/ordenes-insumo/BuscadorOrdenesInsumo";

// Órdenes de insumos del Taller (ADR-0362, fase 7 · actividad 2): lo que el Taller le pide a cada proveedor de tela y avíos, antes de su
// factura. La gemela de Órdenes de compra (fase 1, aprobada por Felipe), con lo que es del Taller: su propio número (OI-000001), el taller
// como destino y, en vez de unidades, las cantidades POR UNIDAD de cada insumo («12.5 metros · 4 conos»: sumar metros con conos no dice
// nada). Quien tiene el módulo ve las órdenes con sus precios (decisión 47).
//
// Cabecera `EncabezadoPagina` con «Nueva orden» a la derecha. Debajo, cifras que no cambian con los filtros (cuánto suman las generadas y
// cuántas esperan su entrega esta semana). Después, en UNA tarjeta, el buscador (número, proveedor o insumo), el estado y la tabla. Todo
// vive en la URL: el enlace se comparte, «atrás» vuelve al filtro anterior y la base filtra (`fn_ordenes_insumo`), de a 50. Cada fila
// abre la orden en una ventana sobre la lista (ruta interceptada `@modal/(.)ver/[id]`).
//
// Las columnas las decide el ANCHO DE LA TABLA (container queries, como la fase 1); el proveedor es la columna flexible:
//   · desde 60 rem de tabla (una pantalla de 1440 con el menú abierto): N.º (+ emisión) · Proveedor · Entrega · Lo pedido (cantidades por
//     unidad, que pueden ocupar dos renglones, y las líneas) · Total · Estado · ›
//   · desde 40 rem: N.º · Proveedor (con la entrega y lo pedido debajo: ahí hay lugar) · Total (con las líneas debajo) · Estado · ›
//   · más angosta (celular): el número con su estado al lado, el proveedor con la entrega y lo pedido, y el total con las líneas.
const PLANTILLA =
  "@min-[40rem]:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_6.5rem_1rem] @min-[60rem]:grid-cols-[7.5rem_minmax(0,1fr)_5.5rem_minmax(0,0.85fr)_7.5rem_6.5rem_1rem]";
const SOLO_ANCHA = "hidden @min-[60rem]:block";
const SEGUNDA_LINEA = "block @min-[60rem]:hidden text-xs text-taupe";
const CON_COLUMNAS = "hidden @min-[40rem]:block";
const CIFRA = "min-w-0 whitespace-nowrap tabular-nums @min-[40rem]:text-right";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

export default async function OrdenesInsumoPage({ searchParams }: { searchParams: Promise<ParamsListaInsumo> }) {
  const persona = await exigirModulo("ordenes_insumos");
  const params = await searchParams;
  const filtros = filtrosDeListaInsumo(params);
  const [{ filas: leidas, falla }, cifras] = await Promise.all([listarOrdenesInsumo(filtros), getCifrasOrdenesInsumo()]);
  const { filas, cursorSiguiente } = paginaDeOrdenes(leidas);

  const nuevaOrden = (
    <BotonEnlace href={`${RUTA_ORDENES_INSUMO}/nueva`} peso="primario" data-guia="oi-lista.nueva">
      + Nueva orden de insumos
    </BotonEnlace>
  );
  const sinFiltros = !filtros.estado && !filtros.q && !filtros.antesDe;
  // Ninguna orden, sin filtros: la primera vez no hay nada que filtrar, solo invitar a crear la primera.
  const primeraVez = !falla && sinFiltros && filas.length === 0;
  // La orden que se acaba de guardar (Nueva o Editar vuelven aquí con `?recien=`): se marca para que se vea que quedó.
  const recien = recienDeInsumo(params);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Órdenes de insumos"
        subtitulo="Lo que le pides a cada proveedor del Taller: qué insumo, cuánto y a cuánto."
        acciones={nuevaOrden}
      />

      {falla ? (
        <Aviso tono="error" titulo="No se pudieron leer las órdenes de insumos">
          {falla}
        </Aviso>
      ) : primeraVez ? (
        <div className="card-cayla">
          <Vacio icono={<Spool />} titulo="Todavía no hay órdenes de insumos" acciones={nuevaOrden}>
            Crea la primera con lo que le vas a pedir a un proveedor del Taller: aquí vas a ver su número, cuánto pediste de cada insumo y
            cuánto suma.
          </Vacio>
        </div>
      ) : (
        <>
          <Cifras cifras={cifras} />

          {/* `overflow-y-hidden`: la entrada de las filas (sube 8 px) no le pone a la tarjeta una barra vertical de paso. */}
          <Tabla className="@container overflow-y-hidden">
            <div role="search" aria-label="Buscar y filtrar las órdenes de insumos" className="space-y-3 px-5 py-4">
              <BuscadorOrdenesInsumo filtros={filtros} />
              {/* El estado deja menos órdenes en la MISMA lista: la píldora de filtro del sistema (ADR-0358). Tocar el puesto lo quita. */}
              <nav aria-label="Filtrar las órdenes" data-guia="oi-lista.filtros" className="pildoras-desliza items-center gap-2 sm:flex-wrap">
                {(["generada", "anulada"] as const).map((e) => {
                  const puesto = filtros.estado === e;
                  return (
                    <Link
                      key={e}
                      href={hrefListaInsumo(filtros, { estado: puesto ? null : e })}
                      aria-current={puesto ? "page" : undefined}
                      className="pildora-cayla shrink-0"
                    >
                      {e === "generada" ? "Generadas" : "Anuladas"}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* `data-resultados`: se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
            <div data-resultados data-guia="oi-lista.lista" className="divide-y divide-sand">
              {filas.length === 0 ? (
                <VacioFiltrado filtros={filtros} nuevaOrden={nuevaOrden} />
              ) : (
                <>
                  <div className="hidden @min-[40rem]:block">
                    <Encabezado
                      plantilla={PLANTILLA}
                      columnas={[
                        { titulo: "N.º" },
                        { titulo: "Proveedor" },
                        { titulo: "Entrega", subtitulo: "estimada", clase: SOLO_ANCHA },
                        { titulo: "Lo pedido", clase: SOLO_ANCHA },
                        { titulo: "Total", alinear: "der" },
                        { titulo: "Estado" },
                        { titulo: "" },
                      ]}
                    />
                  </div>
                  {filas.map((f, i) => {
                    const estado = ESTADO_ORDEN[f.estado];
                    const anulada = f.estado === "anulada";
                    const esRecien = f.id === recien;
                    const lineas = plural(f.lineas, "línea", "líneas");
                    return (
                      <Link
                        key={f.id}
                        href={`${RUTA_ORDENES_INSUMO}/ver/${f.id}`}
                        style={{ ["--k" as string]: Math.min(i, 8) }}
                        data-recien={esRecien ? "" : undefined}
                        data-guia="oi-lista.fila"
                        className={fila(PLANTILLA, "cmp-fila")}
                      >
                        <span className={celda()}>
                          <span className="flex items-center gap-2">
                            <span className="font-medium tabular-nums text-tinta">
                              <Resaltado texto={numeroOrdenInsumo(f.numero)} busqueda={filtros.q} />
                            </span>
                            <span className="@min-[40rem]:hidden">
                              <Chip tono={estado.tono}>{estado.texto}</Chip>
                            </span>
                            {/* Lo que no llegó (fase 7 parte 2, actividad 4): el proveedor nos debe. */}
                            {f.nosDebe && (
                              <span className="@min-[40rem]:hidden">
                                <Chip tono="ambar">Nos debe</Chip>
                              </span>
                            )}
                          </span>
                          {esRecien ? (
                            <span className="block text-xs font-medium text-verde">Recién guardada</span>
                          ) : (
                            <span className="block text-xs text-taupe">del {diaMes(f.fechaEmision)}</span>
                          )}
                        </span>
                        <span className={celda("izq", "text-tinta")} data-guia="oi-lista.proveedor">
                          <Resaltado texto={f.proveedorNombre} busqueda={filtros.q} />
                          {/* En el celular, lo pedido baja entero (puede ocupar dos renglones); con columnas, en un renglón con «…». */}
                          <span className={`${SEGUNDA_LINEA} whitespace-normal tabular-nums @min-[40rem]:truncate`} title={textoCantidades(f.cantidades)}>
                            {f.fechaEntregaEstimada ? `entrega ${diaMes(f.fechaEntregaEstimada)} · ` : ""}
                            {textoCantidades(f.cantidades)}
                          </span>
                        </span>
                        <span className={celda("izq", `${SOLO_ANCHA} tabular-nums text-tinta/80`)}>{diaMes(f.fechaEntregaEstimada)}</span>
                        {/* Lo pedido, por unidad: puede ocupar dos renglones, pero «2 docenas» nunca se parte entre uno y otro. */}
                        <span className={`${SOLO_ANCHA} min-w-0 text-tinta/80`}>
                          <span className="block tabular-nums">
                            {f.cantidades.length === 0
                              ? "—"
                              : f.cantidades.map((c, k) => (
                                  <span key={c.unidad}>
                                    {k > 0 && " · "}
                                    <span className="whitespace-nowrap">{cantidadConUnidad(c.cantidad, c.unidad)}</span>
                                  </span>
                                ))}
                          </span>
                          <span className="block text-xs text-taupe">{lineas}</span>
                        </span>
                        {/* Una anulada no suma: su total va tachado. */}
                        <span className={`${CIFRA} cmp-total font-medium`}>
                          <span className={anulada ? "text-tinta/45 line-through" : "text-tinta"}>{soles(f.total)}</span>
                          <span className={`${SEGUNDA_LINEA} font-normal`}>{lineas}</span>
                          {f.nosDebe && <span data-guia="oi-lista.nos-debe" className="block text-xs font-normal text-ambar">nos debe {soles(f.nosDebe.monto)}</span>}
                        </span>
                        <span className={celda("izq", `${CON_COLUMNAS} space-y-1`)}>
                          <Chip tono={estado.tono}>{estado.texto}</Chip>
                          {f.nosDebe && (
                            <span className="block">
                              <Chip tono="ambar">Nos debe</Chip>
                            </span>
                          )}
                        </span>
                        <span aria-hidden className={`cmp-flecha-fila text-right text-base leading-none ${CON_COLUMNAS}`}>
                          ›
                        </span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          </Tabla>

          <PaginacionCursor
            mostradas={filas.length}
            cursorSiguiente={cursorSiguiente}
            hayCursor={filtros.antesDe !== null}
            params={paramsDeListaInsumo(filtros)}
            pathname={RUTA_ORDENES_INSUMO}
            sustantivo={["orden", "órdenes"]}
          />
        </>
      )}
    </div>
  );
}

/** Las cifras de arriba: no cambian con los filtros. Informan: no filtran ni llevan. Si no se pudieron leer, no se inventan. */
function Cifras({ cifras }: { cifras: CifrasOrdenesInsumo | null }) {
  return (
    <div className="@container" data-guia="oi-lista.cifras">
      <div className="grid grid-cols-2 gap-3">
        {cifras ? (
          <TarjetaCifra etiqueta="Pedido a proveedores" valor={soles(cifras.monto)}>
            {plural(cifras.generadas, "orden generada", "órdenes generadas")}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra etiqueta="Pedido a proveedores" valor={null} noSePudoLeer>
            No se pudo sumar ahora.
          </TarjetaCifra>
        )}
        {cifras ? (
          <TarjetaCifra etiqueta="Entrega en los próximos 7 días" valor={cifras.entregaEnLaSemana.toLocaleString("es-PE")}>
            {cifras.proximaEntrega
              ? `${cifras.entregaEnLaSemana === 1 ? "orden generada" : "órdenes generadas"} · la más cercana, el ${diaMes(cifras.proximaEntrega)}`
              : "ninguna orden generada espera su entrega estos días"}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra etiqueta="Entrega en los próximos 7 días" valor={null} noSePudoLeer>
            No se pudo contar ahora.
          </TarjetaCifra>
        )}
      </div>
    </div>
  );
}

/** La lista quedó vacía por el estado o la búsqueda: dice qué se está mirando, deja quitar el filtro y ofrece el camino. */
function VacioFiltrado({ filtros, nuevaOrden }: { filtros: FiltrosListaInsumo; nuevaOrden: ReactNode }) {
  const v = vacioDeListaInsumo(filtros);
  return (
    <Vacio
      icono={filtros.q ? <SearchX /> : <FunnelX />}
      titulo={v.titulo}
      filtros={v.filtros}
      acciones={
        filtros.q ? (
          <BotonEnlace href={hrefListaInsumo(filtros, { q: "" })}>Borrar la búsqueda</BotonEnlace>
        ) : filtros.estado ? (
          <>
            <BotonEnlace href={hrefListaInsumo(filtros, { estado: null })}>Ver todas las órdenes</BotonEnlace>
            {nuevaOrden}
          </>
        ) : (
          <BotonEnlace href={RUTA_ORDENES_INSUMO}>Ver las más nuevas</BotonEnlace>
        )
      }
    >
      {v.frase}
    </Vacio>
  );
}
