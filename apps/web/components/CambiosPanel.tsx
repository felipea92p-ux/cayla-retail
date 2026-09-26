"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BuscadorVentas, useAtajoBusqueda } from "@/components/BuscadorVentas";
import { CambiosVentas } from "@/components/CambiosVentas";
import { CambiosFlujo } from "@/components/CambiosFlujo";
import {
  EsqueletoBusqueda,
  EstadoVacio,
  FiltrosActividad,
  SinResultadosVentas,
  mostrarActividad,
} from "@/components/ComprasAgrupadas";
import type { VarianteCatalogo } from "@/components/CambioReemplazo";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { estadoPrendaVendida, type TallaQueNoCalza } from "@/lib/cambios-reglas";

type Filtro = "todas" | "con_cambio" | "sin_comprobante";

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "con_cambio", texto: "Con cambio" },
  { valor: "sin_comprobante", texto: "Sin comprobante" },
];

/** Qué compras deja ver cada filtro — se filtra la COMPRA entera, no prendas sueltas:
 *  la prenda cambiada se entiende mejor al lado de las que se llevó con ella. Solo
 *  estados que existen: un cambio se completa en el acto (no hay "pendientes") y R-38
 *  no pide autorización de líder. */
function ventasDelFiltro(lineas: LineaVentaReciente[], filtro: Filtro): Set<string> {
  const ventas = new Set<string>();
  for (const l of lineas) {
    if (filtro === "todas" || (filtro === "con_cambio" && l.cambiosHechos.length > 0) || (filtro === "sin_comprobante" && !l.comprobante)) {
      ventas.add(l.ventaId);
    }
  }
  return ventas;
}

/**
 * Cambios, rehecha el 2026-09-18 en dos bloques que ya no se mezclan:
 *   A. "Iniciar un cambio" — buscar o escanear; los resultados aparecen ahí mismo.
 *   B. "Actividad reciente" — las compras de los últimos 15 días (las que todavía se
 *      pueden cambiar), con filtros.
 * Al iniciar un cambio, los dos bloques se van y queda el flujo guiado
 * (`CambiosFlujo`): una sola cosa a la vez.
 *
 * `abrirItemId` (`?item=`): llegar desde Devoluciones con «Cambiar por otra prenda» abre el
 * flujo ya sobre esa prenda (R-37: primero se intenta un cambio).
 */
export function CambiosPanel({
  lineas,
  busqueda,
  todasLasSedes,
  puedeVerTodas,
  sede,
  ubicacionId,
  colaboradora,
  cajaAbierta,
  catalogo,
  tallasQueNoCalzan,
  abrirItemId,
}: {
  lineas: LineaVentaReciente[];
  busqueda: string;
  todasLasSedes: boolean;
  puedeVerTodas: boolean;
  sede: string;
  ubicacionId: string;
  colaboradora: string;
  cajaAbierta: boolean;
  catalogo: VarianteCatalogo[];
  tallasQueNoCalzan: TallaQueNoCalza[];
  abrirItemId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ahora = useMemo(() => new Date(), []);
  const [buscando, startTransition] = useTransition();
  const [flujo, setFlujo] = useState<{ venta: LineaVentaReciente[]; lineaId: string | null } | null>(() => {
    const l = abrirItemId ? lineas.find((x) => x.ventaItemId === abrirItemId) : undefined;
    if (!l) return null;
    // Una prenda que ya no se puede cambiar (fuera de plazo, ya devuelta…) abre el flujo en
    // el paso de elegir prenda, donde cada una dice por qué sí o por qué no.
    return { venta: lineas.filter((x) => x.ventaId === l.ventaId), lineaId: estadoPrendaVendida(l, ahora).cambiable ? l.ventaItemId : null };
  });
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const tituloActividad = useRef<HTMLHeadingElement>(null);
  // "Sin comprobante" con una búsqueda puesta: primero se limpia la búsqueda y, recién
  // cuando la actividad vuelve a estar en pantalla, se la lleva a la vista.
  const irAActividad = useRef(false);

  useEffect(() => {
    if (!irAActividad.current || busqueda) return;
    irAActividad.current = false;
    mostrarActividad(tituloActividad.current);
  }, [busqueda]);

  useAtajoBusqueda(campoBusqueda, !flujo);

  function navegar(parametros: URLSearchParams | null) {
    startTransition(() => router.push(parametros ? `${pathname}?${parametros}` : pathname));
  }

  function buscar(texto: string, todas: boolean) {
    const parametros = new URLSearchParams({ q: texto });
    if (todas) parametros.set("todas", "1");
    navegar(parametros);
  }

  /** `preseleccionar=false` desde la tarjeta-resumen de Actividad reciente: entra a la
   *  venta sin ninguna prenda marcada — se elige recién en el paso "Prenda". Desde una
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
      <CambiosFlujo
        venta={flujo.venta}
        lineaInicialId={flujo.lineaId}
        ubicacionId={ubicacionId}
        sede={sede}
        colaboradora={colaboradora}
        cajaAbierta={cajaAbierta}
        catalogo={catalogo}
        ahora={ahora}
        onCerrar={cerrarFlujo}
        onNuevo={() => {
          setFlujo(null);
          if (busqueda || abrirItemId) navegar(null);
          requestAnimationFrame(() => campoBusqueda.current?.focus());
        }}
      />
    );
  }

  const ventasVisibles = ventasDelFiltro(lineas, filtro);
  const lineasVisibles = lineas.filter((l) => ventasVisibles.has(l.ventaId));
  const comprasEncontradas = new Set(lineas.map((l) => l.ventaId)).size;

  return (
    <div className="space-y-12">
      <section aria-labelledby="iniciar-cambio" className="space-y-4">
        <h2 id="iniciar-cambio" className="text-[15px] font-semibold text-tinta">
          Iniciar un cambio
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
                  <CambiosVentas lineas={lineas} ahora={ahora} onIniciar={iniciar} />
                </>
              )}
            </div>
          ))}
      </section>

      {!busqueda && (
        <section aria-labelledby="actividad-reciente" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="actividad-reciente" ref={tituloActividad} tabIndex={-1} className="font-display scroll-mt-28 text-[30px] leading-none text-tinta outline-none">
                Actividad reciente
              </h2>
              <p className="mt-0.5 text-sm text-tinta/70">Compras de los últimos 15 días en {sede}: las que todavía se pueden cambiar.</p>
            </div>
            <FiltrosActividad
              valor={filtro}
              onCambio={setFiltro}
              opciones={FILTROS.map((f) => ({ ...f, cuantas: ventasDelFiltro(lineas, f.valor).size }))}
            />
          </div>

          {lineasVisibles.length > 0 ? (
            <CambiosVentas lineas={lineasVisibles} ahora={ahora} resumen onIniciar={iniciar} />
          ) : (
            <EstadoVacio
              titulo={
                filtro === "todas"
                  ? `No hay ventas de los últimos 15 días en ${sede}.`
                  : filtro === "con_cambio"
                    ? "Ninguna compra reciente tiene un cambio todavía."
                    : "Todas las compras recientes tienen boleta o factura."
              }
              detalle={
                filtro === "sin_comprobante"
                  ? "Si la clienta no trae la boleta, escanea la prenda o busca su nombre arriba."
                  : "Si la compra es más antigua, búscala por su boleta."
              }
            />
          )}

          {tallasQueNoCalzan.length > 0 && <TallasQueNoCalzan tallas={tallasQueNoCalzan} />}
        </section>
      )}
    </div>
  );
}

/** Para el Taller, no para el mostrador: por eso va al final y solo la ve un líder. */
function TallasQueNoCalzan({ tallas }: { tallas: TallaQueNoCalza[] }) {
  return (
    <section className="space-y-3 pt-6" aria-labelledby="tallas-que-no-calzan">
      <div>
        <h2 id="tallas-que-no-calzan" className="text-[15px] font-semibold text-tinta">
          Tallas que no calzan · últimos 90 días
        </h2>
        <p className="mt-0.5 text-sm text-tinta/70">
          Prendas que se cambian seguido a otra talla, en todas las sedes. Si una va casi siempre a la talla de arriba, la horma puede estar calzando chica.
        </p>
      </div>
      <ul className="rounded-xl bg-papel ring-1 ring-tinta/[0.07]">
        {tallas.map((t) => (
          <li key={`${t.referencia}|${t.de}|${t.a}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span className="text-tinta">
              {t.referencia} <span className="text-tinta/70">de {t.de} a {t.a}</span>
            </span>
            <span className="shrink-0 tabular-nums text-tinta/70">
              {t.prendas} prenda{t.prendas === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
