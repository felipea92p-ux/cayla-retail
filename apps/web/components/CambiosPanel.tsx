"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CambiosBuscador } from "@/components/CambiosBuscador";
import { CambiosVentas } from "@/components/CambiosVentas";
import { CambiosFlujo } from "@/components/CambiosFlujo";
import type { VarianteCatalogo } from "@/components/CambioReemplazo";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import type { TallaQueNoCalza } from "@/lib/cambios-reglas";

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
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [buscando, startTransition] = useTransition();
  const [flujo, setFlujo] = useState<{ venta: LineaVentaReciente[]; lineaId: string | null } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const tituloActividad = useRef<HTMLHeadingElement>(null);
  // "Sin comprobante" con una búsqueda puesta: primero se limpia la búsqueda y, recién
  // cuando la actividad vuelve a estar en pantalla, se la lleva a la vista.
  const irAActividad = useRef(false);
  const ahora = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!irAActividad.current || busqueda) return;
    irAActividad.current = false;
    mostrarActividad(tituloActividad.current);
  }, [busqueda]);

  // "/" enfoca la búsqueda desde cualquier parte de la pantalla (como en Linear o
  // GitHub). Solo fuera de un campo: dentro de uno, "/" es un carácter más.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "/" || flujo || e.defaultPrevented) return;
      const destino = e.target as HTMLElement | null;
      if (destino && (["INPUT", "SELECT", "TEXTAREA"].includes(destino.tagName) || destino.isContentEditable)) return;
      e.preventDefault();
      campoBusqueda.current?.focus();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [flujo]);

  function navegar(parametros: URLSearchParams | null) {
    startTransition(() => router.push(parametros ? `${pathname}?${parametros}` : pathname));
  }

  function buscar(texto: string, todas: boolean) {
    const parametros = new URLSearchParams({ q: texto });
    if (todas) parametros.set("todas", "1");
    navegar(parametros);
  }

  function iniciar(linea: LineaVentaReciente) {
    setFlujo({ venta: lineas.filter((l) => l.ventaId === linea.ventaId), lineaId: linea.ventaItemId });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        onCerrar={() => setFlujo(null)}
        onNuevo={() => {
          setFlujo(null);
          if (busqueda) navegar(null);
          requestAnimationFrame(() => campoBusqueda.current?.focus());
        }}
      />
    );
  }

  const ventasVisibles = ventasDelFiltro(lineas, filtro);
  const lineasVisibles = lineas.filter((l) => ventasVisibles.has(l.ventaId));
  const cuantas = (f: Filtro) => ventasDelFiltro(lineas, f).size;
  const comprasEncontradas = new Set(lineas.map((l) => l.ventaId)).size;

  return (
    <div className="space-y-12">
      <section aria-labelledby="iniciar-cambio" className="space-y-4">
        <h2 id="iniciar-cambio" className="text-[15px] font-semibold text-tinta">
          Iniciar un cambio
        </h2>
        <CambiosBuscador
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
            <Esqueleto />
          ) : (
            <div className="space-y-4 pt-2" aria-live="polite">
              {lineas.length === 0 ? (
                <SinResultados busqueda={busqueda} todasLasSedes={todasLasSedes} puedeVerTodas={puedeVerTodas} sede={sede} onBuscarEnTodas={() => buscar(busqueda, true)} />
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
              <h2 id="actividad-reciente" ref={tituloActividad} tabIndex={-1} className="scroll-mt-28 text-[15px] font-semibold text-tinta outline-none">
                Actividad reciente
              </h2>
              <p className="mt-0.5 text-sm text-tinta/70">Compras de los últimos 15 días en {sede}: las que todavía se pueden cambiar.</p>
            </div>
            <div role="group" aria-label="Filtrar la actividad" className="flex flex-wrap gap-1 rounded-lg bg-sand/40 p-1">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  aria-pressed={filtro === f.valor}
                  onClick={() => setFiltro(f.valor)}
                  className={`h-8 rounded-md px-3 text-sm transition-colors duration-200 ${
                    filtro === f.valor ? "bg-papel font-semibold text-tinta shadow-[0_1px_2px_rgba(26,26,24,0.08)]" : "text-tinta/75 hover:text-tinta"
                  }`}
                >
                  {f.texto} <span className="tabular-nums text-tinta/65">{cuantas(f.valor)}</span>
                </button>
              ))}
            </div>
          </div>

          {lineasVisibles.length > 0 ? (
            <CambiosVentas lineas={lineasVisibles} ahora={ahora} onIniciar={iniciar} />
          ) : (
            <Vacio
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

function mostrarActividad(titulo: HTMLHeadingElement | null) {
  titulo?.scrollIntoView({ behavior: "smooth", block: "start" });
  titulo?.focus({ preventScroll: true });
}

function Esqueleto() {
  return (
    <div className="space-y-3 pt-2" aria-label="Buscando" role="status">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.05]">
          <div className="h-3 w-48 rounded bg-sand/70" />
          <div className="mt-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-md bg-sand/60" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-sand/70" />
              <div className="h-3 w-24 rounded bg-sand/50" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Vacio({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="rounded-xl bg-papel/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <p className="mt-1 text-sm text-tinta/70">{detalle}</p>
    </div>
  );
}

function SinResultados({
  busqueda,
  todasLasSedes,
  puedeVerTodas,
  sede,
  onBuscarEnTodas,
}: {
  busqueda: string;
  todasLasSedes: boolean;
  puedeVerTodas: boolean;
  sede: string;
  onBuscarEnTodas: () => void;
}) {
  return (
    <div className="rounded-xl bg-papel/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tinta">
        No encontramos ventas con «{busqueda}»{todasLasSedes ? " en ninguna tienda" : ` en ${sede}`}.
      </p>
      <p className="mt-1 text-sm text-tinta/70">Prueba con el número de boleta, el DNI de la clienta, o escanea la etiqueta de la prenda.</p>
      {puedeVerTodas && !todasLasSedes && (
        <button
          type="button"
          onClick={onBuscarEnTodas}
          className="mt-4 inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-tinta ring-1 ring-tinta/20 transition-colors duration-200 hover:bg-tinta hover:text-crema"
        >
          Buscar en todas las tiendas
        </button>
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
