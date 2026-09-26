"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { CampoFecha } from "@/components/ui/CampoFecha";
import {
  CATEGORIAS,
  DIAS_POR_DEFECTO,
  FILTROS_SUBUBICACION,
  FILTROS_TIPO,
  PERIODOS_RAPIDOS,
  PROCESOS_POR_CATEGORIA,
  categoriaDeProceso,
  etiquetaProceso,
  filtroDePalabra,
  type PeriodoMovimientos,
  type ResumenTienda,
  type TokenSububicacion,
} from "@/lib/movimientos-reglas";

// Filtros de Movimientos. Viven en la URL (?q=…&cat=…&proc=…&sub=…&rango=…), igual que en
// Compras: la página es un Server Component que filtra en Postgres, el enlace se puede
// compartir («mirá lo que pasó con esta blusa»), y "atrás" vuelve al filtro anterior.
// Cambiar un filtro borra el cursor de paginado.
//
// Las cifras de las píldoras son OPERACIONES (lo que se guardó de una sola vez, ADR-0234): lo mismo que se ve al tocar
// cada una, porque la lista también agrupa por operación. Un traslado que llega cuenta en «Entradas» y en «Traslados».
//
// El buscador entiende el nombre de un proceso (ADR-0234): «venta», «traslado», «ajuste»… no buscan prendas —ninguna se
// llama así—, así que se vuelven el filtro de ese tipo y el campo se vacía. «Traslado 24» sigue siendo una búsqueda.
//
// Orden (rediseño 2026-09-22, elegido por Felipe en la demo de
// docs/maquetas/movimientos-rediseno-2026-09/): dos filas, como la guía oficial.
//   1. Búsqueda (prendas Y procesos: «Traslado 24», «Boleta B001-000184») + período.
//   2. Tipo, con cuántos movimientos hay de cada uno; a la derecha, la sububicación en un
//      control segmentado chico (piso / almacén / cuarentena).
//   Debajo, solo si hay un tipo elegido: sus procesos («Ajustes» → Conteo · Merma · …).
// Antes el proceso era un select nativo de 19 opciones escondido en «Más filtros»: los
// procesos ya pertenecen a un tipo, y la pantalla usa esa jerarquía en vez de aplanarla.
// No hay filtro por persona: la autoría sigue guardada, pero esta pantalla es para leer
// qué cambió en el stock, no a quién culpar.
//
// En celular cada fila de píldoras se desliza de lado en vez de partirse en tres líneas.
//
// El recorte por defecto (30 días) NO está en la URL: el botón «30 días» aparece apretado
// y las fechas de «Personalizado» muestran la que rige, así nadie se pregunta por qué no
// ve la venta de hace dos meses.
type Sububicacion = { id: string; tipo: string | null; nombre: string };

// Una fila de píldoras: en celular se desliza (sin partirse), desde sm se envuelve.
const FILA_DESLIZA =
  "-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0";

function Pastilla({
  activa,
  onClick,
  cuenta,
  sutil = false,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  cuenta?: number;
  /** La píldora de proceso: más chica y, activa, en hueso — no compite con el tipo en tinta. */
  sutil?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={
        sutil
          ? `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo ${
              activa ? "border-taupe bg-hueso text-tinta" : "border-sand text-taupe hover:bg-sand/40 hover:text-tinta"
            }`
          : "pildora-cayla shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo"
      }
    >
      {children}
      {cuenta !== undefined && (
        <span className={`text-[11px] font-medium tabular-nums ${activa ? "text-crema/70" : "text-taupe/80"}`}>{cuenta.toLocaleString("es-PE")}</span>
      )}
    </button>
  );
}

export function FiltrosMovimientos({
  sububicaciones,
  sub,
  periodo,
  desde,
  hasta,
  resumen,
}: {
  /** Las de la ubicación que se mira. Si no tiene ninguna de las tres que se filtran (el Taller), el control no se muestra. */
  sububicaciones: Sububicacion[];
  /** Cuál quedó apretada (ya resuelta por la página: sirve también para un enlace viejo con uuid). */
  sub: TokenSububicacion | null;
  periodo: PeriodoMovimientos;
  /** Las fechas que rigen, para los campos de «Personalizado» (con un período rápido, el desde que aplicó la página). */
  desde: string;
  hasta: string;
  /** Las cifras con los demás filtros puestos (no el tipo ni el proceso): la de cada píldora de tipo y de proceso. Null si la
   *  base no las pudo dar: las píldoras van sin cifra. */
  resumen: ResumenTienda | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const primera = useRef(true);
  const entrada = useRef<HTMLInputElement>(null);

  const proc = params.get("proc") || null;
  // Un enlace con solo `?proc=conteo` (el de Conteo) aprieta igual «Ajustes»: el tipo se deduce.
  const cat = CATEGORIAS.find((c) => c === params.get("cat")) ?? categoriaDeProceso(proc);
  // «Personalizado» se abre con un toque aunque todavía no haya fechas en la URL.
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const enPersonalizado = periodo === "personalizado" || periodo === "todo";
  const mostrarFechas = enPersonalizado || personalizadoAbierto;

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    p.delete("mov");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // La búsqueda se manda sola al dejar de tipear (350 ms): sin botón, pero
  // sin una consulta por tecla. Si lo escrito es el nombre de un proceso, se vuelve su filtro.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      const filtro = filtroDePalabra(busqueda);
      if (filtro) {
        setBusqueda("");
        aplicar({ q: "", cat: filtro.cat ?? "", proc: filtro.proc ?? "" });
        return;
      }
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const subDisponibles = FILTROS_SUBUBICACION.filter((f) => sububicaciones.some((s) => s.tipo === f.tipo));
  const hayFiltros = !!(params.get("q") || cat || sub || proc || periodo !== String(DIAS_POR_DEFECTO));
  // Los procesos que se ofrecen bajo el tipo elegido: los que tuvieron algo en el período (en su orden), y el elegido
  // aunque esté en cero. Sin cifras (la base no respondió), todos los del tipo.
  const procesosDelTipo = cat
    ? PROCESOS_POR_CATEGORIA[cat].filter((p) => !resumen || p === proc || resumen[cat].procesos.some((x) => x.proceso === p && x.operaciones > 0))
    : [];
  // Un proceso que vive en dos tipos (cambio) llegado sin `?cat=`: no hay fila de procesos que
  // lo muestre, así que se dice en la línea de «Filtrando».
  const procesoSuelto = proc && !(cat && PROCESOS_POR_CATEGORIA[cat].includes(proc));

  function elegirPeriodo(dias: (typeof PERIODOS_RAPIDOS)[number]) {
    setPersonalizadoAbierto(false);
    aplicar({ rango: dias === DIAS_POR_DEFECTO ? "" : String(dias), desde: "", hasta: "" });
  }

  const activos = [
    params.get("q") && `«${params.get("q")}»`,
    cat && FILTROS_TIPO.find((f) => f.valor === cat)?.etiqueta,
    proc && etiquetaProceso(proc),
    sub && FILTROS_SUBUBICACION.find((f) => f.token === sub)?.etiqueta,
  ].filter(Boolean);

  return (
    <div className="card-cayla space-y-3 p-3.5 sm:p-4">
      {/* Fila 1: búsqueda + período. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* El botón de limpiar va AL LADO del campo, no dentro de un <label>: al desaparecer la X el
            foco se perdía; ahora vuelve al campo (mismo criterio que Traslados). */}
        <div className="caja-cayla relative flex h-10 min-w-0 flex-[1_1_16rem] items-center">
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
          <input
            ref={entrada}
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Prenda, código, barras o referencia…"
            aria-label="Buscar por prenda, código, código de barras o referencia (por ejemplo Traslado 24)"
            autoComplete="off"
            className="h-full w-full rounded-lg bg-transparent pl-9 pr-9 text-base text-tinta outline-none placeholder:text-taupe sm:text-sm"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                entrada.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-taupe hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
            >
              <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
            </button>
          )}
        </div>
        <div role="group" aria-label="Período" className={`${FILA_DESLIZA} w-full sm:w-auto`}>
          {PERIODOS_RAPIDOS.map((dias) => (
            <Pastilla key={dias} activa={!mostrarFechas && periodo === String(dias)} onClick={() => elegirPeriodo(dias)}>
              {dias} días
            </Pastilla>
          ))}
          <Pastilla activa={mostrarFechas} onClick={() => setPersonalizadoAbierto(true)}>
            Personalizado
          </Pastilla>
        </div>
      </div>

      {mostrarFechas && (
        <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-hueso/70 px-4 py-2.5">
          {/* Con un período rápido vigente, «Desde» muestra la fecha que rige aunque no esté en la URL: el
              control dice la verdad. Tocarlo la vuelve explícita. */}
          <div className="w-40 sm:w-44">
            <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : desde} onValor={(v) => aplicar({ desde: v, rango: "" })} />
          </div>
          <div className="w-40 sm:w-44">
            <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : hasta} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
          </div>
          <button
            type="button"
            onClick={() => aplicar({ rango: "todo", desde: "", hasta: "" })}
            aria-pressed={periodo === "todo"}
            className={`btn-cayla btn-enlace mb-2 text-[12.5px] ${periodo === "todo" ? "font-semibold" : ""}`}
          >
            Todo el historial
          </button>
        </div>
      )}

      {/* Fila 2: tipo (con su cifra) y, a la derecha, la sububicación. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div role="group" aria-label="Tipo" className={`${FILA_DESLIZA} min-w-0 sm:flex-1`}>
          <Pastilla activa={cat === null} onClick={() => aplicar({ cat: "", proc: "" })} cuenta={resumen?.todos.operaciones}>
            Todos
          </Pastilla>
          {FILTROS_TIPO.map((f) => (
            <Pastilla key={f.valor} activa={cat === f.valor} onClick={() => aplicar({ cat: f.valor, proc: "" })} cuenta={resumen?.[f.valor].operaciones}>
              {f.etiqueta}
            </Pastilla>
          ))}
        </div>

        {subDisponibles.length > 0 && (
          // «Zona»: dónde está la prenda dentro de la tienda. Con rótulo: «Todo · Piso · Almacén · Cuarentena» solos no
          // dicen qué se está eligiendo.
          <div className="flex max-w-full shrink-0 items-center gap-2">
            <span className="label-cayla text-[10px] font-bold text-taupe" aria-hidden>
              Zona
            </span>
          <div role="group" aria-label="Zona de la tienda" className="inline-flex max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-lg bg-hueso p-[3px]">
            {[{ token: null as TokenSububicacion | null, etiqueta: "Todas" }, ...subDisponibles].map((f) => {
              const activa = sub === f.token;
              return (
                <button
                  key={f.token ?? "todo"}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => aplicar({ sub: f.token ?? "" })}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo ${
                    activa ? "bg-papel text-tinta shadow-[inset_0_0_0_1px_var(--color-sand)]" : "text-taupe hover:text-tinta"
                  }`}
                >
                  {f.etiqueta}
                </button>
              );
            })}
          </div>
          </div>
        )}
      </div>

      {/* Los procesos del tipo elegido, justo debajo: la jerarquía se lee sola. */}
      {cat && (
        <div role="group" aria-label={`Proceso dentro de ${FILTROS_TIPO.find((f) => f.valor === cat)?.etiqueta ?? cat}`} className="anim-revelar flex items-center gap-2 border-l-2 border-sand pl-3">
          <span aria-hidden className="label-cayla shrink-0 text-[10px] font-bold text-taupe">
            Proceso
          </span>
          <div className={`${FILA_DESLIZA} min-w-0 flex-1`}>
            <Pastilla sutil activa={proc === null} onClick={() => aplicar({ proc: "" })}>
              Todos
            </Pastilla>
            {procesosDelTipo.map((p) => (
              <Pastilla key={p} sutil activa={proc === p} onClick={() => aplicar({ cat, proc: p })}>
                {etiquetaProceso(p)}
              </Pastilla>
            ))}
          </div>
        </div>
      )}

      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">
          {(activos.length > 0 || procesoSuelto) && <span>Filtrando: {activos.join(" · ")}</span>}
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setPersonalizadoAbierto(false);
              router.push(pathname);
            }}
            className="btn-cayla btn-enlace text-xs"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
