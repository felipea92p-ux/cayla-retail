"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BuscadorVentas, useAtajoBusqueda } from "@/components/BuscadorVentas";
import { DevolucionesVentas } from "@/components/DevolucionesVentas";
import { DevolucionesFlujo } from "@/components/DevolucionesFlujo";
import { DevolucionesPendientes } from "@/components/DevolucionesPendientes";
import { AnularVentaForm } from "@/components/AnularVentaForm";
import { EsqueletoBusqueda, EstadoVacio, FiltrosActividad, SinResultadosVentas, mostrarActividad } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import type { DevolucionPendiente } from "@/lib/devoluciones";
import { estadoPrendaDevolucion } from "@/lib/devoluciones-reglas";

type Filtro = "todas" | "con_devolucion" | "sin_comprobante";

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "con_devolucion", texto: "Con devolución" },
  { valor: "sin_comprobante", texto: "Sin comprobante" },
];

/** Qué compras deja ver cada filtro — se filtra la COMPRA entera, no prendas sueltas. La
 *  devolución sí tiene un estado «pendiente» (un cambio se completa en el acto), pero ese
 *  ya tiene su propio bloque arriba, «Por aprobar»: no hace falta repetirlo como filtro. */
function ventasDelFiltro(lineas: LineaVentaReciente[], filtro: Filtro): Set<string> {
  const ventas = new Set<string>();
  for (const l of lineas) {
    if (filtro === "todas" || (filtro === "con_devolucion" && l.devolucionesHechas.length > 0) || (filtro === "sin_comprobante" && !l.comprobante)) {
      ventas.add(l.ventaId);
    }
  }
  return ventas;
}

/**
 * Devoluciones, rehecha el 2026-09-18 con el mismo modelo que Cambios (ADR-0125):
 *   A. «Iniciar una devolución» — buscar o escanear; los resultados aparecen ahí mismo.
 *   B. «Por aprobar» — lo que registraron las colaboradoras y un líder todavía no resolvió.
 *   C. «Actividad reciente» — las compras de los últimos 15 días, con filtros.
 * Al iniciar una devolución, los bloques se van y queda el flujo guiado (`DevolucionesFlujo`).
 *
 * `abrirItemId` (`?item=`): llegar desde Cambios con «Pasar a devolución» abre el flujo con
 * esa prenda ya marcada.
 */
export function DevolucionesPanel({
  lineas,
  pendientes,
  busqueda,
  todasLasSedes,
  puedeVerTodas,
  esLider,
  sede,
  ubicacionId,
  colaboradora,
  cajaAbierta,
  abrirItemId,
}: {
  lineas: LineaVentaReciente[];
  pendientes: DevolucionPendiente[];
  busqueda: string;
  todasLasSedes: boolean;
  puedeVerTodas: boolean;
  esLider: boolean;
  sede: string;
  ubicacionId: string;
  colaboradora: string;
  cajaAbierta: boolean;
  abrirItemId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ahora = useMemo(() => new Date(), []);
  const [buscando, startTransition] = useTransition();
  const [flujo, setFlujo] = useState<{ venta: LineaVentaReciente[]; lineaId: string | null } | null>(() => {
    const l = abrirItemId ? lineas.find((x) => x.ventaItemId === abrirItemId) : undefined;
    if (!l) return null;
    // Una prenda que ya no se puede devolver (anulada, ya devuelta…) abre el flujo sin nada
    // marcado: en el paso de las prendas cada una dice por qué sí o por qué no.
    return { venta: lineas.filter((x) => x.ventaId === l.ventaId), lineaId: estadoPrendaDevolucion(l, ahora).devolvible ? l.ventaItemId : null };
  });
  const [anulando, setAnulando] = useState<LineaVentaReciente | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const tituloActividad = useRef<HTMLHeadingElement>(null);
  const tituloPorAprobar = useRef<HTMLHeadingElement>(null);
  // Saltos que esperan a que la pantalla de fondo vuelva a estar en pantalla (el flujo o la
  // búsqueda se van primero, y recién ahí hay a dónde llevar la vista).
  const irAActividad = useRef(false);
  const irAAprobar = useRef(false);

  useEffect(() => {
    if (!irAActividad.current || busqueda) return;
    irAActividad.current = false;
    mostrarActividad(tituloActividad.current);
  }, [busqueda]);

  useEffect(() => {
    if (flujo || !irAAprobar.current) return;
    irAAprobar.current = false;
    mostrarActividad(tituloPorAprobar.current);
  }, [flujo]);

  useAtajoBusqueda(campoBusqueda, !flujo && !anulando);

  function navegar(parametros: URLSearchParams | null) {
    startTransition(() => router.push(parametros ? `${pathname}?${parametros}` : pathname));
  }

  function buscar(texto: string, todas: boolean) {
    const parametros = new URLSearchParams({ q: texto });
    if (todas) parametros.set("todas", "1");
    navegar(parametros);
  }

  /** `preseleccionar=false` desde la tarjeta-resumen de Actividad reciente: entra a la
   *  venta sin ninguna prenda marcada — se elige recién en el paso "Prendas". Desde una
   *  fila puntual de la búsqueda sigue entrando con esa prenda ya marcada. */
  function iniciar(linea: LineaVentaReciente, preseleccionar: boolean) {
    setFlujo({ venta: lineas.filter((l) => l.ventaId === linea.ventaId), lineaId: preseleccionar ? linea.ventaItemId : null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Con `?item=` en la URL la lista de fondo es solo esa compra: al salir se vuelve a la
   *  pantalla de siempre, no a una actividad de una sola compra. */
  function cerrarFlujo() {
    setFlujo(null);
    if (abrirItemId) navegar(null);
  }

  function sinComprobante() {
    setFiltro("sin_comprobante");
    if (busqueda) {
      irAActividad.current = true;
      navegar(null);
    } else {
      mostrarActividad(tituloActividad.current);
    }
  }

  if (flujo) {
    return (
      <DevolucionesFlujo
        venta={flujo.venta}
        lineaInicialId={flujo.lineaId}
        ubicacionId={ubicacionId}
        sede={sede}
        colaboradora={colaboradora}
        esLider={esLider}
        ahora={ahora}
        onCerrar={cerrarFlujo}
        onNuevo={() => {
          setFlujo(null);
          if (busqueda || abrirItemId) navegar(null);
          requestAnimationFrame(() => campoBusqueda.current?.focus());
        }}
        onIrAAprobar={() => {
          irAAprobar.current = true;
          cerrarFlujo();
        }}
      />
    );
  }

  const ventasVisibles = ventasDelFiltro(lineas, filtro);
  const lineasVisibles = lineas.filter((l) => ventasVisibles.has(l.ventaId));
  const comprasEncontradas = new Set(lineas.map((l) => l.ventaId)).size;

  const lista = (ls: LineaVentaReciente[], resumen = false) => (
    <DevolucionesVentas lineas={ls} ahora={ahora} esLider={esLider} resumen={resumen} onIniciar={iniciar} onAnular={setAnulando} />
  );

  return (
    <div className="space-y-12">
      <section aria-labelledby="iniciar-devolucion" className="space-y-4">
        <h2 id="iniciar-devolucion" className="text-[15px] font-semibold text-tinta">
          Iniciar una devolución
        </h2>
        <BuscadorVentas
          key={`${busqueda}|${todasLasSedes}`}
          valorInicial={busqueda}
          todasInicial={todasLasSedes}
          puedeVerTodas={puedeVerTodas}
          sede={sede}
          buscando={buscando}
          campoRef={campoBusqueda}
          onBuscar={buscar}
          onLimpiar={() => navegar(null)}
          onSinComprobante={sinComprobante}
        />

        {busqueda &&
          (buscando ? (
            <EsqueletoBusqueda />
          ) : (
            <div className="space-y-4 pt-2" aria-live="polite">
              {lineas.length === 0 ? (
                <SinResultadosVentas
                  busqueda={busqueda}
                  todasLasSedes={todasLasSedes}
                  puedeVerTodas={puedeVerTodas}
                  sede={sede}
                  onBuscarEnTodas={() => buscar(busqueda, true)}
                />
              ) : (
                <>
                  <p className="text-sm text-tinta/70">
                    {comprasEncontradas} {comprasEncontradas === 1 ? "compra" : "compras"} para «{busqueda}»
                    {todasLasSedes ? " en todas las tiendas" : ` en ${sede}`}
                  </p>
                  {lista(lineas)}
                </>
              )}
            </div>
          ))}
      </section>

      {!busqueda && (
        <>
          <DevolucionesPendientes
            pendientes={pendientes}
            esLider={esLider}
            cajaAbierta={cajaAbierta}
            ahora={ahora}
            refTitulo={tituloPorAprobar}
            ubicacionId={ubicacionId}
            sede={sede}
          />

          <section aria-labelledby="actividad-reciente" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="actividad-reciente" ref={tituloActividad} tabIndex={-1} className="font-display scroll-mt-28 text-[30px] leading-none text-tinta outline-none">
                  Actividad reciente
                </h2>
                <p className="mt-0.5 text-sm text-tinta/70">Compras de los últimos 15 días en {sede}: el plazo para cambiar o devolver.</p>
              </div>
              <FiltrosActividad
                valor={filtro}
                onCambio={setFiltro}
                opciones={FILTROS.map((f) => ({ ...f, cuantas: ventasDelFiltro(lineas, f.valor).size }))}
              />
            </div>

            {lineasVisibles.length > 0 ? (
              lista(lineasVisibles, true)
            ) : (
              <EstadoVacio
                titulo={
                  filtro === "todas"
                    ? `No hay ventas de los últimos 15 días en ${sede}.`
                    : filtro === "con_devolucion"
                      ? "Ninguna compra reciente tiene una devolución todavía."
                      : "Todas las compras recientes tienen boleta o factura."
                }
                detalle={
                  filtro === "sin_comprobante"
                    ? "Si la clienta no trae la boleta, escanea la prenda o busca su nombre arriba."
                    : "Si la compra es más antigua, búscala por su boleta: una devolución fuera de plazo la decide un líder."
                }
              />
            )}
          </section>
        </>
      )}

      {anulando && <AnularVentaForm linea={anulando} onClose={() => setAnulando(null)} />}
    </div>
  );
}
