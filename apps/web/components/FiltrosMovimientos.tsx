"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { CampoSelectNativo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import {
  CATEGORIAS,
  DIAS_POR_DEFECTO,
  FILTROS_SUBUBICACION,
  FILTROS_TIPO,
  PERIODOS_RAPIDOS,
  PROCESOS_FILTRO,
  type PeriodoMovimientos,
  type TokenSububicacion,
} from "@/lib/movimientos-reglas";

// Filtros de Movimientos. Viven en la URL (?q=…&cat=…&sub=…&rango=…), igual que en
// Compras: la página es un Server Component que filtra en Postgres, el enlace se puede
// compartir («mirá lo que pasó con esta blusa»), y "atrás" vuelve al filtro anterior.
// Cambiar un filtro borra el cursor de paginado.
//
// A la vista, lo que se usa todos los días: la búsqueda (prendas Y procesos: «Traslado
// 24», «Boleta B001-000184»), el tipo, la sububicación y el período. Lo demás —el
// proceso específico— está en «Más filtros». No hay filtro por persona: la autoría sigue
// guardada, pero esta pantalla es para leer qué cambió en el stock, no a quién culpar.
//
// El recorte por defecto (30 días) NO está en la URL: el botón «30 días» aparece apretado
// y las fechas de «Personalizado» muestran la que rige, así nadie se pregunta por qué no
// ve la venta de hace dos meses.
type Sububicacion = { id: string; tipo: string | null; nombre: string };

const PASTILLA = "label-cayla inline-flex items-center rounded-full border px-3 py-1 text-[10px] transition-colors";
const PASTILLA_ACTIVA = "border-tinta bg-tinta text-crema";
const PASTILLA_INACTIVA = "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo";

function Pastilla({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${PASTILLA} ${activa ? PASTILLA_ACTIVA : PASTILLA_INACTIVA}`}>
      {children}
    </button>
  );
}

function Grupo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="label-cayla mr-0.5 text-[10px] text-tinta/50">
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

export function FiltrosMovimientos({
  sububicaciones,
  sub,
  periodo,
  desde,
  hasta,
}: {
  /** Las de la ubicación que se mira. Si no tiene ninguna de las tres que se filtran (el Taller), el control no se muestra. */
  sububicaciones: Sububicacion[];
  /** Cuál quedó apretada (ya resuelta por la página: sirve también para un enlace viejo con uuid). */
  sub: TokenSububicacion | null;
  periodo: PeriodoMovimientos;
  /** Las fechas que rigen, para los campos de «Personalizado» (con un período rápido, el desde que aplicó la página). */
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const primera = useRef(true);
  const entrada = useRef<HTMLInputElement>(null);

  const cat = CATEGORIAS.find((c) => c === params.get("cat")) ?? null;
  const proc = params.get("proc") ?? "";
  const [masAbierto, setMasAbierto] = useState(!!proc);
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
  // sin una consulta por tecla.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const subDisponibles = FILTROS_SUBUBICACION.filter((f) => sububicaciones.some((s) => s.tipo === f.tipo));
  const masActivos = proc ? 1 : 0;
  const hayFiltros = !!(params.get("q") || cat || sub || proc || periodo !== String(DIAS_POR_DEFECTO));

  function elegirPeriodo(dias: (typeof PERIODOS_RAPIDOS)[number]) {
    setPersonalizadoAbierto(false);
    aplicar({ rango: dias === DIAS_POR_DEFECTO ? "" : String(dias), desde: "", hasta: "" });
  }

  return (
    <div className="card-cayla space-y-3 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* El botón de limpiar va AL LADO del campo, no dentro de un <label>: al desaparecer la X el
            foco se perdía; ahora vuelve al campo (mismo criterio que Traslados). */}
        <div className="relative flex h-10 min-w-[16rem] flex-1 items-center">
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-tinta/50" />
          <input
            ref={entrada}
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Prenda, código, barras o referencia…"
            aria-label="Buscar por prenda, código, código de barras o referencia (por ejemplo Traslado 24)"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-tinta/20 bg-transparent pl-9 pr-9 text-sm text-tinta outline-none placeholder:text-tinta/50 focus:border-rojo"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                entrada.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-tinta/60 hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
            >
              <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMasAbierto((v) => !v)}
          aria-expanded={masAbierto}
          aria-controls="movimientos-mas-filtros"
          className={`label-cayla inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-[11px] transition-colors ${
            masAbierto || masActivos > 0 ? "border-tinta/30 bg-tinta/[0.04] text-tinta" : "border-tinta/20 text-tinta/70 hover:border-tinta/35 hover:text-tinta"
          }`}
        >
          <SlidersHorizontal aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
          Más filtros{masActivos > 0 ? ` · ${masActivos}` : ""}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Grupo etiqueta="Tipo">
          <Pastilla activa={cat === null} onClick={() => aplicar({ cat: "" })}>
            Todos
          </Pastilla>
          {FILTROS_TIPO.map((f) => (
            <Pastilla key={f.valor} activa={cat === f.valor} onClick={() => aplicar({ cat: f.valor })}>
              {f.etiqueta}
            </Pastilla>
          ))}
        </Grupo>

        {subDisponibles.length > 0 && (
          <Grupo etiqueta="Sububicación">
            <Pastilla activa={sub === null} onClick={() => aplicar({ sub: "" })}>
              Todas
            </Pastilla>
            {subDisponibles.map((f) => (
              <Pastilla key={f.token} activa={sub === f.token} onClick={() => aplicar({ sub: f.token })}>
                {f.etiqueta}
              </Pastilla>
            ))}
          </Grupo>
        )}

        <Grupo etiqueta="Período">
          {PERIODOS_RAPIDOS.map((dias) => (
            <Pastilla key={dias} activa={!mostrarFechas && periodo === String(dias)} onClick={() => elegirPeriodo(dias)}>
              {dias} días
            </Pastilla>
          ))}
          <Pastilla activa={mostrarFechas} onClick={() => setPersonalizadoAbierto(true)}>
            Personalizado
          </Pastilla>
        </Grupo>

        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setPersonalizadoAbierto(false);
              const ubicacion = params.get("ubicacion");
              router.push(ubicacion ? `${pathname}?ubicacion=${ubicacion}` : pathname);
            }}
            className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {mostrarFechas && (
        <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-sand/50 px-4 py-2.5">
          {/* Con un período rápido vigente, «Desde» muestra la fecha que rige aunque no esté en la URL: el
              control dice la verdad. Tocarlo la vuelve explícita. */}
          <div className="w-44">
            <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : desde} onValor={(v) => aplicar({ desde: v, rango: "" })} />
          </div>
          <div className="w-44">
            <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : hasta} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
          </div>
          <button
            type="button"
            onClick={() => aplicar({ rango: "todo", desde: "", hasta: "" })}
            aria-pressed={periodo === "todo"}
            className={`label-cayla pb-2 text-[11px] underline-offset-2 hover:text-rojo hover:underline ${periodo === "todo" ? "text-tinta" : "text-tinta/65"}`}
          >
            Todo el historial
          </button>
        </div>
      )}

      {masAbierto && (
        <div id="movimientos-mas-filtros" className="anim-revelar flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-sand/50 px-4 py-2.5">
          <div className="w-60">
            <CampoSelectNativo etiqueta="Proceso" value={proc} onChange={(e) => aplicar({ proc: e.target.value })}>
              <option value="">Todos</option>
              {PROCESOS_FILTRO.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </option>
              ))}
            </CampoSelectNativo>
          </div>
          {masActivos > 0 && (
            <button type="button" onClick={() => aplicar({ proc: "" })} className="label-cayla pb-2 text-[11px] text-tinta/65 underline-offset-2 hover:text-rojo hover:underline">
              Quitar este filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}
