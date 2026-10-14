import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList, FunnelX, SearchX } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDestinosOrden, getOrdenesPorEnviar, getResumenOrdenes, listarOrdenesCompra } from "@/lib/ordenes-compra";
import {
  ESTADO_ORDEN,
  POR_REPARTIR_LISTA,
  TODAS,
  conteoDeDestino,
  filtrosDeLista,
  fraseDestino,
  generadasDe,
  hrefLista,
  numeroOrdenCompra,
  paginaDeOrdenes,
  paramsDeLista,
  pildorasDeDestino,
  recienDe,
  textoDestino,
  vacioDeLista,
  type FiltrosLista,
  type ParamsLista,
} from "@/lib/ordenes-compra-reglas";
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
import { GastoDelViaje } from "@/components/ordenes-compra/GastoDelViaje";
import { TuFondoConRendir } from "@/components/fondos/TuFondoConRendir";
import { getResumenMiFondo } from "@/lib/fondos";
import { mostrarTuFondo } from "@/lib/fondos-reglas";
import { PaginacionCursor } from "@/components/Paginacion";
import { BuscadorOrdenes } from "@/components/ordenes-compra/BuscadorOrdenes";

// Órdenes de compra (ADR-0362, fase 1): lo que CAYLA le pide a cada proveedor, antes de que llegue la factura. Cada orden lleva un
// número que no se repite ni se libera (OC-000001), su proveedor, a qué tienda llega —o «por repartir», si llega a Lima y se
// reparte después— y sus líneas. Quien tiene el módulo ve las de todas las sedes (decisiones 34 y 37).
//
// Cabecera `EncabezadoPagina` (decisión 36): la sede y la fecha arriba dicen desde dónde se está comprando. Debajo, cifras que no
// cambian con los filtros, una por cada quien mira (actividad 3): lo pedido en total (el líder), lo que llega a la sede donde se
// trabaja (la encargada) y lo que está por repartir (quien reparte desde Lima). Después, en UNA tarjeta, el buscador, a dónde llega
// (arranca en la sede donde se trabaja, decisión 37) y el estado, y la tabla. Todo vive en la URL: el enlace se comparte, «atrás»
// vuelve al filtro anterior y la base filtra (`fn_ordenes_compra`), de a 50.
//
// Cada fila abre la orden en una ventana sobre la lista (ruta interceptada `@modal/(.)ordenes/ver/[id]`): la lista no se desmonta y al
// cerrar se vuelve donde se estaba. La «›» del final dice que se abre.
//
// «Tu fondo» (fase 6 · actividad 4) es una cifra más, solo para quien tiene un fondo: lo que le queda de la plata que CAYLA le entregó
// para comprar. No cambia con los filtros; baja sola al pagar desde «Mi fondo» o anotar un gasto del viaje (las dos hojas refrescan).
// Desde la actividad 5 lleva «Rendir» (o «Ver tu rendición»), que abre la hoja de la rendición (`TuFondoConRendir`).
//
// «Por enviar» (fase 3) es una píldora más, al final: las órdenes generadas que todavía tienen algo por enviar a una sede, en TODAS las
// sedes (la cifra cuenta todas, así que elegir una sede o un estado la apaga). La base no filtra por eso: `listarOrdenesCompra` cruza la lista
// con `fn_ordenes_compra_por_enviar`. Si esa función no responde (la web publicada antes que la migración), la píldora no sale.
//
// Las columnas las decide el ANCHO DE LA TABLA, no el de la ventana (container queries: `@container` en <Tabla>, como
// Proveedores). Con el menú abierto la tabla es ~370 px más angosta que la ventana, y una tabla que decidía por la ventana
// aplastaba al proveedor hasta dejarlo en cero. El proveedor es la única columna flexible y nunca se sacrifica:
//   · desde 64 rem de tabla, ocho: N.º (+ emisión) · Proveedor · Llega a · Entrega · Unidades · Total · Estado · ›
//   · desde 40 rem, cinco: a dónde llega y la entrega bajan bajo el proveedor, y las unidades bajo el total
//   · más angosta (celular, se usa en Gamarra): cada orden son tres bloques —el número con su estado al lado, el proveedor con
//     a dónde llega, y el total con las unidades—.
const PLANTILLA =
  "@min-[40rem]:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_6.5rem_1rem] @min-[64rem]:grid-cols-[7.5rem_minmax(0,1fr)_9.5rem_5.5rem_5rem_7.5rem_6.5rem_1rem]";
// Una celda que solo es columna propia en la tabla ancha.
const SOLO_ANCHA = "hidden @min-[64rem]:block";
// Lo que en una tabla menos ancha va en la segunda línea de otra celda.
const SEGUNDA_LINEA = "block @min-[64rem]:hidden text-xs text-taupe";
// Las columnas que solo existen con la tabla en columnas (desde 40 rem); en celular su dato va junto al número.
const CON_COLUMNAS = "hidden @min-[40rem]:block";
// Una cifra: a la derecha cuando hay columnas; apilada, a la izquierda como el resto.
const CIFRA = "min-w-0 whitespace-nowrap tabular-nums @min-[40rem]:text-right";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

export default async function OrdenesCompraPage({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const persona = await exigirModulo("ordenes_compra");
  const [params, destinosLeidos, resumen, porEnviar, fondo] = await Promise.all([
    searchParams,
    getDestinosOrden(),
    getResumenOrdenes(),
    getOrdenesPorEnviar(),
    getResumenMiFondo(),
  ]);
  const tuFondo = mostrarTuFondo(fondo) ? fondo : null;
  const destinos = destinosLeidos ?? [];
  // Una sede inactiva que todavía tiene órdenes también se puede elegir (sale en las píldoras).
  const idsElegibles = [...destinos.map((d) => d.id), ...(resumen ?? []).flatMap((r) => (r.destinoId ? [r.destinoId] : []))];
  const filtros = filtrosDeLista(params, { sedeActual: persona.ubicacionId, destinos: idsElegibles });
  const { filas: leidas, falla } = await listarOrdenesCompra(filtros, porEnviar);
  const { filas, cursorSiguiente } = paginaDeOrdenes(leidas);

  const nuevaOrden = (
    <BotonEnlace href="/compras/ordenes/nueva" peso="primario" data-guia="ordenes.nueva">
      + Nueva orden de compra
    </BotonEnlace>
  );
  const sinFiltros = filtros.destino === TODAS && !filtros.estado && !filtros.q && !filtros.antesDe && !filtros.porEnviar;
  // Ninguna orden en ninguna sede: la primera vez no hay nada que filtrar, solo invitar a crear la primera.
  const primeraVez = !falla && (resumen ? conteoDeDestino(resumen, TODAS, null) === 0 : sinFiltros && filas.length === 0);

  const nombreDe = (id: string) => destinos.find((d) => d.id === id)?.nombre ?? resumen?.find((r) => r.destinoId === id)?.destinoNombre ?? null;
  const miSede = destinos.find((d) => d.id === persona.ubicacionId) ?? null;
  const pildoras = pildorasDeDestino(destinos, resumen, filtros.estado);
  // Cuántas cifras hay arriba: las de las órdenes (2, o 3 con la sede donde se trabaja) y «Tu fondo».
  const nCifras = (resumen ? (miSede ? 3 : 2) : 0) + (tuFondo ? 1 : 0);
  // La orden que se acaba de guardar (Nueva o Editar vuelven aquí con `?recien=`): se marca para que se vea que quedó.
  const recien = recienDe(params);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Órdenes de compra"
        subtitulo="Lo que le pides a cada proveedor: qué, a cuánto y a qué tienda llega."
        acciones={
          // «+ Gasto del viaje» (fase 6 · actividad 3): lo que costó traer la compra o el viaje, a una o varias órdenes.
          <div className="flex flex-wrap items-center gap-3">
            <GastoDelViaje guia="ordenes.gasto-viaje" />
            {nuevaOrden}
          </div>
        }
      />

      {falla ? (
        <Aviso tono="error" titulo="No se pudieron leer las órdenes de compra">
          {falla}
        </Aviso>
      ) : primeraVez ? (
        <>
          {/* Sin órdenes todavía, el fondo igual se usa: un gasto del viaje no necesita orden. */}
          {tuFondo && (
            <div className="@container grid grid-cols-2 gap-3 @min-[40rem]:grid-cols-3">
              <TuFondoConRendir fondo={tuFondo} guia="ordenes.tu-fondo" className="col-span-2 @min-[40rem]:col-span-1" />
            </div>
          )}
          <div className="card-cayla">
            <Vacio icono={<ClipboardList />} titulo="Todavía no hay órdenes de compra" acciones={nuevaOrden}>
              Crea la primera con lo que le vas a pedir a un proveedor: aquí vas a ver su número, a qué tienda llega y cuánto suma.
            </Vacio>
          </div>
        </>
      ) : (
        <>
          {/* En fila desde 40 rem de ANCHO DISPONIBLE (no de ventana). Más angosto (celular, o el menú abierto en una ventana chica),
              en dos filas: el total arriba, a lo ancho, y las otras dos lado a lado; una debajo de otra empujaban la lista fuera de
              la primera pantalla. */}
          {(resumen || tuFondo) && (
            <div className="@container" data-guia="ordenes.cifras">
              <div className={`grid grid-cols-2 gap-3 ${COLUMNAS_CIFRAS[nCifras] ?? ""}`}>
                {resumen && (
                  <CifraGeneradas
                    etiqueta="Pedido a proveedores"
                    {...generadasDe(resumen, TODAS)}
                    donde={["en todas las sedes", "en todas las sedes"]}
                    className={nCifras === 3 ? "col-span-2 @min-[40rem]:col-span-1" : ""}
                  />
                )}
                {/* El nombre completo («Tienda Lima»): «Llega a Lima» a secas se confundía con lo que llega a Lima para repartir. */}
                {resumen && miSede && <CifraGeneradas etiqueta={`Llega a ${miSede.nombre}`} {...generadasDe(resumen, miSede.id)} />}
                {resumen && (
                  <CifraGeneradas
                    etiqueta="Por repartir"
                    {...generadasDe(resumen, POR_REPARTIR_LISTA)}
                    donde={["se reparte desde Lima", "se reparten desde Lima"]}
                  />
                )}
                {tuFondo && <TuFondoConRendir fondo={tuFondo} guia="ordenes.tu-fondo" className={resumen ? "" : "col-span-2"} />}
              </div>
            </div>
          )}

          {/* `overflow-y-hidden`: la entrada de las filas (sube 8 px) no le pone a la tarjeta una barra vertical de paso. */}
          <Tabla className="@container overflow-y-hidden">
            <div role="search" aria-label="Buscar y filtrar las órdenes de compra" className="space-y-3 px-5 py-4">
              <BuscadorOrdenes filtros={filtros} />
              {/* A dónde llega y el estado dejan menos órdenes en la MISMA lista: la píldora de filtro del sistema (ADR-0358). Cambiar
                  uno conserva el otro y la búsqueda, y vuelve a la primera página (`hrefLista`). */}
              <nav aria-label="Filtrar las órdenes" data-guia="ordenes.filtros" className="pildoras-desliza items-center gap-2 sm:flex-wrap">
                {pildoras.map((p) => (
                  <Link
                    key={p.valor}
                    href={hrefLista(filtros, { destino: p.valor })}
                    aria-current={filtros.destino === p.valor ? "page" : undefined}
                    className="pildora-cayla shrink-0"
                  >
                    {p.texto}
                    {p.conteo != null && <span className="pildora-cayla__n">{p.conteo.toLocaleString("es-PE")}</span>}
                  </Link>
                ))}
                <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-sand" />
                {(["generada", "anulada"] as const).map((e) => {
                  const puesto = filtros.estado === e;
                  const conteo = resumen ? conteoDeDestino(resumen, filtros.destino, e) : null;
                  return (
                    // Tocar el estado puesto lo quita: vuelven a verse las dos.
                    <Link
                      key={e}
                      href={hrefLista(filtros, { estado: puesto ? null : e })}
                      aria-current={puesto ? "page" : undefined}
                      className="pildora-cayla shrink-0"
                    >
                      {e === "generada" ? "Generadas" : "Anuladas"}
                      {conteo != null && <span className="pildora-cayla__n">{conteo.toLocaleString("es-PE")}</span>}
                    </Link>
                  );
                })}
                {/* «Por enviar»: tocarla pone la vista de todas las sedes con lo que falta enviar; tocarla de nuevo la quita. */}
                {porEnviar && (
                  <Link
                    href={hrefLista(filtros, { porEnviar: !filtros.porEnviar })}
                    aria-current={filtros.porEnviar ? "page" : undefined}
                    title="Órdenes con algo por enviar a una sede, de todas las sedes"
                    data-guia="ordenes.por-enviar"
                    className="pildora-cayla shrink-0"
                  >
                    Por enviar
                    <span className="pildora-cayla__n">{porEnviar.size.toLocaleString("es-PE")}</span>
                  </Link>
                )}
              </nav>
            </div>

            {/* `data-resultados`: se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
            <div data-resultados data-guia="ordenes.lista" className="divide-y divide-sand">
              {filas.length === 0 ? (
                <VacioFiltrado filtros={filtros} nombreDestino={nombreDe(filtros.destino)} nuevaOrden={nuevaOrden} />
              ) : (
                <>
                  {/* Los títulos, solo con la tabla en columnas (el `Encabezado` decide por la ventana; esta caja, por la tabla). */}
                  <div className="hidden @min-[40rem]:block">
                    <Encabezado
                      plantilla={PLANTILLA}
                      columnas={[
                        { titulo: "N.º" },
                        { titulo: "Proveedor" },
                        { titulo: "Llega a", clase: SOLO_ANCHA },
                        { titulo: "Entrega", subtitulo: "estimada", clase: SOLO_ANCHA },
                        { titulo: "Unidades", alinear: "der", clase: SOLO_ANCHA },
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
                    // En la vista «Por enviar», cuántas unidades le quedan por enviar a ESA orden.
                    const porEnviarDe = filtros.porEnviar ? (porEnviar?.get(f.id) ?? null) : null;
                    return (
                      <Link
                        key={f.id}
                        href={`/compras/ordenes/ver/${f.id}`}
                        style={{ ["--k" as string]: Math.min(i, 8) }}
                        data-recien={esRecien ? "" : undefined}
                        data-guia="ordenes.fila"
                        className={fila(PLANTILLA, "cmp-fila")}
                      >
                        <span className={celda()}>
                          <span className="flex items-center gap-2">
                            <span className="font-medium tabular-nums text-tinta">
                              <Resaltado texto={numeroOrdenCompra(f.numero)} busqueda={filtros.q} />
                            </span>
                            <span className="@min-[40rem]:hidden">
                              <Chip tono={estado.tono}>{estado.texto}</Chip>
                            </span>
                          </span>
                          {esRecien ? (
                            <span className="block text-xs font-medium text-verde">Recién guardada</span>
                          ) : (
                            <span className="block text-xs text-taupe">del {diaMes(f.fechaEmision)}</span>
                          )}
                        </span>
                        <span className={celda("izq", "text-tinta")} data-guia="ordenes.proveedor">
                          <Resaltado texto={f.proveedorNombre} busqueda={filtros.q} />
                          <span className={`${SEGUNDA_LINEA} truncate`}>
                            {fraseDestino(f.destinoNombre)}
                            {f.fechaEntregaEstimada ? ` · entrega ${diaMes(f.fechaEntregaEstimada)}` : ""}
                          </span>
                        </span>
                        <span className={celda("izq", `${SOLO_ANCHA} text-tinta/80`)}>{textoDestino(f.destinoNombre)}</span>
                        <span className={celda("izq", `${SOLO_ANCHA} tabular-nums text-tinta/80`)}>{diaMes(f.fechaEntregaEstimada)}</span>
                        <span className={`${CIFRA} ${SOLO_ANCHA} text-tinta/80`}>
                          {f.unidades.toLocaleString("es-PE")}
                          {porEnviarDe != null && <span className="block text-xs font-normal text-taupe">{porEnviarDe.toLocaleString("es-PE")} por enviar</span>}
                        </span>
                        {/* Una anulada no suma: su total va tachado. */}
                        <span className={`${CIFRA} cmp-total font-medium`}>
                          <span className={anulada ? "text-tinta/45 line-through" : "text-tinta"}>{soles(f.total)}</span>
                          <span className={`${SEGUNDA_LINEA} font-normal`}>
                            {porEnviarDe != null ? `${porEnviarDe.toLocaleString("es-PE")} por enviar` : plural(f.unidades, "unidad", "unidades")}
                          </span>
                        </span>
                        <span className={celda("izq", CON_COLUMNAS)}>
                          <Chip tono={estado.tono}>{estado.texto}</Chip>
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
            params={paramsDeLista(filtros)}
            pathname="/compras/ordenes"
            sustantivo={["orden", "órdenes"]}
          />
        </>
      )}
    </div>
  );
}

/** Las columnas de la fila de cifras según cuántas hay. Tres: la primera a lo ancho en lo angosto y en fila desde 40 rem. Cuatro (con
 *  «Tu fondo»): dos y dos en lo angosto, en fila recién desde 56 rem (en 40 rem, cuatro cifras de 150 px partían los montos). */
const COLUMNAS_CIFRAS: Record<number, string> = { 3: "@min-[40rem]:grid-cols-3", 4: "@min-[56rem]:grid-cols-4" };

/** Una cifra de arriba: el monto de las órdenes generadas (las anuladas no suman) y cuántas son. Informa: no filtra ni lleva.
 *  `donde`, en singular y plural, sigue a la cantidad («1 orden generada · se reparte desde Lima»). */
function CifraGeneradas({
  etiqueta,
  cantidad,
  monto,
  donde,
  className,
}: {
  etiqueta: string;
  cantidad: number;
  monto: number;
  donde?: [uno: string, varios: string];
  className?: string;
}) {
  return (
    <TarjetaCifra etiqueta={etiqueta} valor={soles(monto)} className={className}>
      {plural(cantidad, "orden generada", "órdenes generadas")}
      {donde ? ` · ${cantidad === 1 ? donde[0] : donde[1]}` : ""}
    </TarjetaCifra>
  );
}

/** La lista quedó vacía por los filtros o la búsqueda: dice qué se está mirando, deja quitar cada filtro y ofrece el camino. */
function VacioFiltrado({ filtros, nombreDestino, nuevaOrden }: { filtros: FiltrosLista; nombreDestino: string | null; nuevaOrden: ReactNode }) {
  const v = vacioDeLista(filtros, nombreDestino);
  return (
    <Vacio
      icono={filtros.q ? <SearchX /> : <FunnelX />}
      titulo={v.titulo}
      filtros={v.filtros}
      acciones={
        filtros.q ? (
          <BotonEnlace href={hrefLista(filtros, { q: "" })}>Borrar la búsqueda</BotonEnlace>
        ) : (
          filtros.porEnviar ? (
            <BotonEnlace href={hrefLista(filtros, { porEnviar: false })}>Ver todas las órdenes</BotonEnlace>
          ) : (
            <>
              {filtros.destino !== TODAS && <BotonEnlace href={hrefLista(filtros, { destino: TODAS })}>Ver todas las sedes</BotonEnlace>}
              {nuevaOrden}
            </>
          )
        )
      }
    >
      {v.frase}
    </Vacio>
  );
}
