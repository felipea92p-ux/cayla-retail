"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Banknote, PackageSearch, ScanLine, Search } from "lucide-react";
import { BuscadorVentas, useAtajoBusqueda } from "@/components/BuscadorVentas";
import { DevolucionesVentas } from "@/components/DevolucionesVentas";
import { DevolucionesFlujo } from "@/components/DevolucionesFlujo";
import { DevolucionesPendientes } from "@/components/DevolucionesPendientes";
import { DevolucionesResueltas } from "@/components/DevolucionesResueltas";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { AnularVentaForm } from "@/components/AnularVentaForm";
import { EsqueletoBusqueda, EstadoVacio, SinResultadosVentas, mostrarActividad } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import type { DevolucionPendiente, DevolucionResuelta } from "@/lib/devoluciones";
import { estadoPrendaDevolucion } from "@/lib/devoluciones-reglas";

type Filtro = "todas" | "con_devolucion" | "sin_comprobante";

/** Las pestañas de la parte baja (spike 2026-09-26, ADR-0232): lo que se puede devolver, lo que espera a
 *  un líder y lo que ya se resolvió. */
type Vista = "compras" | "pendientes" | "resueltas";

/** Qué pantallas vecinas ve esta cuenta (ADR-0161): un acceso nunca lleva a «Sin acceso». `cuarentena`
 *  es cuántas prendas esperan en cuarentena en la sede, o null si la cuenta no ve Inventario. */
export type AccesosDevoluciones = { cambios: boolean; caja: boolean; comprobantes: boolean; cuarentena: number | null };

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
 *   B. Tres pestañas (2026-09-26, ADR-0232): «Compras» (los últimos 15 días, con filtros), «Por aprobar»
 *      (lo que un líder todavía no resolvió; la cifra de la cabecera abre esta) y «Resueltas».
 *   Encima, avisos que llevan a las pantallas vecinas: cuarentena (Inventario) y caja cerrada (Caja).
 *   En el celular, «Escanear prenda» y la lupa quedan fijos abajo (acción de la pantalla, ADR-0206).
 * Al iniciar una devolución, los bloques se van y queda el flujo guiado (`DevolucionesFlujo`).
 *
 * `abrirItemId` (`?item=`): llegar desde Cambios con «Pasar a devolución» abre el flujo con
 * esa prenda ya marcada.
 */
export function DevolucionesPanel({
  lineas,
  pendientes,
  resueltas,
  busqueda,
  todasLasSedes,
  puedeVerTodas,
  esLider,
  sede,
  ubicacionId,
  colaboradora,
  cajaAbierta,
  abrirItemId,
  accesos,
}: {
  lineas: LineaVentaReciente[];
  pendientes: DevolucionPendiente[];
  resueltas: DevolucionResuelta[];
  busqueda: string;
  todasLasSedes: boolean;
  puedeVerTodas: boolean;
  esLider: boolean;
  sede: string;
  ubicacionId: string;
  colaboradora: string;
  cajaAbierta: boolean;
  abrirItemId?: string;
  accesos: AccesosDevoluciones;
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
  const [vista, setVista] = useState<Vista>("compras");
  const [viendoVenta, setViendoVenta] = useState<LineaVentaReciente | null>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const escanear = useRef<(() => void) | null>(null);
  const zonaBusqueda = useRef<HTMLElement>(null);
  const tituloActividad = useRef<HTMLHeadingElement>(null);
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
    setVista("pendientes");
    mostrarActividad(tituloActividad.current);
  }, [flujo]);

  // La cifra «Por aprobar» de la cabecera (server component) es un enlace a `#por-aprobar`: abre esa
  // pestaña. Se escucha el clic y no `hashchange`, porque un segundo toque con el mismo hash no
  // dispararía nada; y al llegar con el hash ya puesto, se abre al montar.
  useEffect(() => {
    function abrirPorAprobar() {
      setVista("pendientes");
      requestAnimationFrame(() => mostrarActividad(tituloActividad.current));
    }
    if (window.location.hash === "#por-aprobar") abrirPorAprobar();
    function alClic(e: MouseEvent) {
      if (!(e.target as HTMLElement | null)?.closest('a[href="#por-aprobar"]')) return;
      e.preventDefault();
      abrirPorAprobar();
    }
    document.addEventListener("click", alClic);
    return () => document.removeEventListener("click", alClic);
  }, []);

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
    setVista("compras");
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
    <DevolucionesVentas
      lineas={ls}
      ahora={ahora}
      esLider={esLider}
      resumen={resumen}
      onIniciar={iniciar}
      onAnular={setAnulando}
      onVerVenta={setViendoVenta}
      veCambios={accesos.cambios}
    />
  );

  /** Lleva la vista al buscador del celular: la barra fija está abajo y el campo, arriba. */
  function subirAlBuscador() {
    zonaBusqueda.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const TITULOS: Record<Vista, { titulo: string; bajada: string }> = {
    compras: { titulo: "Actividad reciente", bajada: `Compras de los últimos 15 días en ${sede}: el plazo para cambiar o devolver.` },
    pendientes: {
      titulo: "Por aprobar",
      bajada: esLider ? "Revisa cada una: al aprobarla se mueve el stock y se emite la nota de crédito." : "Esperan que un líder las apruebe: hasta entonces el stock no cambia.",
    },
    resueltas: { titulo: "Resueltas", bajada: "Las aprobadas y rechazadas de los últimos 15 días: su nota de crédito y adónde fue cada prenda." },
  };
  const PESTANAS: { valor: Vista; texto: string; cuantas: number; alerta?: boolean }[] = [
    { valor: "compras", texto: "Compras", cuantas: new Set(lineas.map((l) => l.ventaId)).size },
    { valor: "pendientes", texto: "Por aprobar", cuantas: pendientes.length, alerta: pendientes.length > 0 },
    { valor: "resueltas", texto: "Resueltas", cuantas: resueltas.length },
  ];

  return (
    // En el celular, aire al pie para que la barra fija no tape la última tarjeta.
    <div className="space-y-10 pb-24 sm:pb-0">
      <AvisosDevoluciones accesos={accesos} cajaAbierta={cajaAbierta} esLider={esLider} />

      <section ref={zonaBusqueda} aria-labelledby="iniciar-devolucion" className="scroll-mt-24 space-y-4">
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
          escanearRef={escanear}
          escanearEnBarraMovil
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
        <section aria-labelledby="por-aprobar" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {/* `id="por-aprobar"`: el ancla de la cifra de la cabecera cae aquí, sea cual sea la pestaña. */}
              <h2 id="por-aprobar" ref={tituloActividad} tabIndex={-1} className="font-display scroll-mt-28 text-[30px] leading-none text-tinta outline-none">
                {TITULOS[vista].titulo}
              </h2>
              <p className="mt-0.5 text-sm text-tinta/70">{TITULOS[vista].bajada}</p>
            </div>
            <div role="tablist" aria-label="Qué ver" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-tinta/5 p-1 [scrollbar-width:none]">
              {PESTANAS.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  role="tab"
                  aria-selected={vista === p.valor}
                  onClick={() => setVista(p.valor)}
                  className={`h-9 shrink-0 rounded-full px-3 text-sm sm:px-4 transition-colors duration-200 ${
                    vista === p.valor ? "bg-papel font-semibold text-tinta shadow-[0_1px_2px_rgba(26,26,24,0.08)]" : "text-tinta/75 hover:text-tinta"
                  }`}
                >
                  {p.texto} <span className={`tabular-nums ${p.alerta ? "font-semibold text-ambar-profundo" : "text-tinta/65"}`}>{p.cuantas}</span>
                </button>
              ))}
            </div>
          </div>

          {vista === "compras" && (
            <>
              {/* Filtros de la pestaña con la píldora de filtro del sistema, no con la forma de las pestañas:
                  dos filas iguales no decían cuál manda. */}
              <div role="group" aria-label="Filtrar las compras" className="-mt-1 flex flex-wrap gap-2">
                {FILTROS.map((f) => (
                  <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)} className="pildora-cayla">
                    {f.texto} <span className="tabular-nums opacity-75">{ventasDelFiltro(lineas, f.valor).size}</span>
                  </button>
                ))}
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
            </>
          )}
          {vista === "pendientes" && (
            <DevolucionesPendientes pendientes={pendientes} esLider={esLider} cajaAbierta={cajaAbierta} ahora={ahora} ubicacionId={ubicacionId} sede={sede} />
          )}
          {vista === "resueltas" && <DevolucionesResueltas resueltas={resueltas} ahora={ahora} veComprobantes={accesos.comprobantes} />}
        </section>
      )}

      {/* Celular: la prenda en la mano es la entrada más rápida, al alcance del pulgar (spike 2026-09-26). */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          onClick={() => {
            subirAlBuscador();
            escanear.current?.();
          }}
          className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema active:scale-[0.98]"
        >
          <ScanLine size={18} aria-hidden />
          Escanear prenda
        </button>
        <button
          type="button"
          onClick={() => {
            subirAlBuscador();
            campoBusqueda.current?.focus({ preventScroll: true });
          }}
          aria-label="Buscar la venta"
          className="flex h-14 w-[58px] shrink-0 items-center justify-center rounded-2xl border border-sand bg-papel text-tinta active:scale-[0.97]"
        >
          <Search size={20} aria-hidden />
        </button>
      </div>

      {viendoVenta && (
        <DetalleVentaModal ventaId={viendoVenta.ventaId} vendedor={viendoVenta.vendedorNombre} ubicacionNombre={viendoVenta.sedeVenta ?? sede} onClose={() => setViendoVenta(null)} />
      )}
      {anulando && <AnularVentaForm linea={anulando} onClose={() => setAnulando(null)} />}
    </div>
  );
}

/** Avisos que llevan a las pantallas vecinas (spike 2026-09-26, ADR-0232). Solo salen si hay algo que
 *  decir y la cuenta ve el módulo al que llevan (ADR-0161). El de caja lo ven los dos roles con su
 *  propio texto: el líder decide el reembolso al aprobar; la colaboradora es quien le avisa a la clienta
 *  antes de registrar. Pizarra y ámbar, nunca rojo: ninguno es urgente. */
function AvisosDevoluciones({ accesos, cajaAbierta, esLider }: { accesos: AccesosDevoluciones; cajaAbierta: boolean; esLider: boolean }) {
  const cuarentena = accesos.cuarentena ?? 0;
  const cajaCerrada = !cajaAbierta;
  if (cuarentena === 0 && !cajaCerrada) return null;
  const fila = "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-papel px-4 py-3 text-sm ring-1 ring-tinta/[0.07]";
  return (
    <div className="space-y-2">
      {cuarentena > 0 && (
        <p className={fila}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ambar/10 text-ambar-profundo">
            <PackageSearch className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] text-tinta/80 sm:basis-auto">
            <b className="font-semibold text-tinta">
              {cuarentena} {cuarentena === 1 ? "prenda espera" : "prendas esperan"} en cuarentena
            </b>
            <span className="hidden sm:inline">: decide si vuelven al piso, van al Taller o se dan de baja.</span>
          </span>
          <Link href="/inventario?danados=1" className="btn-cayla btn-enlace gap-1 text-[13px] max-sm:ml-11">
            Revisar en Inventario <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      )}
      {cajaCerrada && (
        <p className={fila}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pizarra/10 text-pizarra">
            <Banknote className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] text-tinta/80 sm:basis-auto">
            <b className="font-semibold text-tinta">La caja está cerrada.</b>{" "}
            {esLider
              ? "Puedes aprobar sin reembolso; para devolver en efectivo, abre la caja primero."
              : "Si la clienta quiere su dinero en efectivo, abre la caja antes de registrar: sin ella no se le puede reembolsar."}
          </span>
          {accesos.caja && (
            <Link href="/caja" className="btn-cayla btn-enlace gap-1 text-[13px] max-sm:ml-11">
              Abrir caja <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
