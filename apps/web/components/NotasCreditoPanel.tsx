"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Search, ShieldCheck, X } from "lucide-react";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, celda, fila as filaClases } from "@/components/ui/Tabla";
import { Resaltado } from "@/components/ui/Resaltado";
import { BotonReembolso } from "@/components/SaldoFavorAcciones";
import { NotaCreditoVistaRapida } from "@/components/NotaCreditoVistaRapida";
import { NotaCreditoDetalle } from "@/components/NotaCreditoDetalle";
import { RegistrarNotaCreditoModal } from "@/components/RegistrarNotaCreditoModal";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { useFlip } from "@/lib/useFlip";
import {
  ETIQUETA_BANDA,
  ETIQUETA_MOTIVO_NOTA,
  agruparTablero,
  armarFilas,
  chipEstado,
  cifrasTablero,
  destinoTexto,
  filtrarTablero,
  hace,
  type Banda,
  type FacturaParaNota,
  type FilaTablero,
  type FilaVista,
  type MovimientoFavor,
  type Pestana,
  type TramoUrgencia,
} from "@/lib/notas-credito-reglas";

/* ====================================================================
   Notas de crédito · el tablero (2026-09-19)
   Spike: docs/maquetas/notas-credito-spike-2026-09/ (pantallas 1, 1b, 4 y 5)

   La pantalla responde, en este orden, lo que quien mira necesita saber:
     1. ¿Cuánto me deben los proveedores y qué es urgente? → las cuatro cifras de arriba. La barra de
        «Por reclamar» no es adorno: ES el dato (tres tramos de antigüedad) y al tocarla filtra la lista.
     2. ¿Qué reclamo agarro primero? → la lista, agrupada por urgencia o por proveedor, con la nota más
        vieja arriba.
     3. ¿Qué hago con ésta? → la vista rápida, con una sola frase de «siguiente paso».

   Por qué TODO el tablero es cliente y no vive en la URL como /compras: los datos llegan en UNA
   llamada y son decenas de filas, no miles. Filtrar, agrupar y buscar sin ir al servidor es lo que
   permite que las filas se DESLICEN (FLIP) en vez de redibujarse, que es justo el gesto del spike. El
   paginado y los filtros en la URL siguen siendo la regla donde la lista la recorta Postgres.

   Movimiento: entrada escalonada (`anim-entra` con `--i`), cifras que cuentan una vez
   (`CifraQueCuenta`), barras que se llenan, pulgar que se desliza (`SegmentoDeslizante`), FLIP al
   filtrar o agrupar (`useFlip`), cajón y modales con lo del sistema (ADR-0136). Nada en bucle salvo el
   punto del reclamo más viejo, que es una señal, no un adorno.
   ==================================================================== */

// Dos plantillas, como en el spike: a partir de `sm` la fila es proveedor · antigüedad · monto · estado
// y una flecha; recién en `xl` caben la columna de Motivo y el botón de acción. Debajo de `sm` la fila
// se apila (lo hace `fila()` de Tabla) y los chips de estado y antigüedad bajan al bloque `sm:hidden`
// de la primera celda. El ancho útil manda: con el lateral abierto, seis columnas fijas dejaban el
// nombre del proveedor en 120 px y lo cortaban.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_7rem_1.5rem] xl:grid-cols-[minmax(0,1fr)_6rem_6.5rem_7.5rem_7rem_8.5rem]";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "por_reclamar", etiqueta: "Por reclamar" },
  { clave: "emitida", etiqueta: "Emitidas" },
  { clave: "aplicada", etiqueta: "Aplicadas" },
  { clave: "todas", etiqueta: "Todas" },
];

const COLOR_TRAMO: Record<TramoUrgencia, string> = { urgente: "bg-rojo", medio: "bg-ambar", reciente: "bg-tinta/25" };
const TONO_BANDA: Record<string, string> = { rojo: "nc-banda-rojo", ambar: "nc-banda-ambar", verde: "nc-banda-verde", neutro: "nc-banda-neutro" };

type Props = {
  filas: FilaTablero[];
  saldoPorProveedor: Record<string, number>;
  movimientos: MovimientoFavor[];
  proveedores: { id: string; nombre: string; saldoFavor: number; deuda: number }[];
  facturas: FacturaParaNota[];
  fallaFacturas: string | null;
  falla: string | null;
  hoy: string;
  /** Registrar un reembolso es de Por pagar (ADR-0161 P1, `fn_puede_pagar_compras`): sin ese módulo, no hay botón. */
  puedeReembolsar?: boolean;
};

export function NotasCreditoPanel({ filas: crudas, saldoPorProveedor, movimientos, proveedores, facturas, fallaFacturas, falla, hoy, puedeReembolsar = true }: Props) {
  const [vista, setVista] = useState<"notas" | "saldos">("notas");
  const [pestana, setPestana] = useState<Pestana>("por_reclamar");
  const [banda, setBanda] = useState<Banda | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState<"urgencia" | "proveedor">("urgencia");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState<{ compraId: string | null } | null>(null);
  const refBusqueda = useRef<HTMLInputElement>(null);

  const filas = useMemo(() => armarFilas(crudas, { hoy, saldoPorProveedor, movimientos }), [crudas, hoy, saldoPorProveedor, movimientos]);
  const cifras = useMemo(() => cifrasTablero(filas, { mes: hoy.slice(0, 7), saldoPorProveedor, movimientos }), [filas, hoy, saldoPorProveedor, movimientos]);
  const visibles = useMemo(() => filtrarTablero(filas, { pestana, banda, busqueda }), [filas, pestana, banda, busqueda]);
  const grupos = useMemo(() => agruparTablero(visibles, agrupar), [visibles, agrupar]);
  const orden = useMemo(() => grupos.flatMap((g) => g.filas.map((f) => f.id)), [grupos]);

  const conteos = useMemo(() => {
    const c: Record<Pestana, number> = { por_reclamar: 0, emitida: 0, aplicada: 0, todas: filas.length };
    for (const f of filas) c[f.estado] += 1;
    return c;
  }, [filas]);

  const conSaldo = useMemo(() => proveedores.filter((p) => p.saldoFavor > 0.004).sort((a, b) => b.saldoFavor - a.saldoFavor), [proveedores]);
  const refFlip = useFlip(`${pestana}|${banda ?? ""}|${agrupar}|${orden.join(",")}`);
  const abierta = seleccionada ? (filas.find((f) => f.id === seleccionada) ?? null) : null;
  const laDetalle = detalle ? (filas.find((f) => f.id === detalle) ?? null) : null;
  // El reclamo MÁS viejo, y solo si ya pasó el plazo: un rojo por pantalla, no uno por fila.
  const idUrgente = useMemo(() => {
    const cand = filas.filter((f) => f.estado === "por_reclamar" && f.tramo === "urgente").sort((a, b) => b.edadDias - a.edadDias)[0];
    return cand?.id ?? null;
  }, [filas]);

  const navegar = useCallback(
    (delta: 1 | -1) => {
      if (!seleccionada) return;
      const i = orden.indexOf(seleccionada);
      if (i < 0) return;
      const siguiente = orden[Math.min(orden.length - 1, Math.max(0, i + delta))];
      if (siguiente) setSeleccionada(siguiente);
    },
    [seleccionada, orden],
  );

  // Atajos: `/` busca, `j`/`k` recorren, Enter abre la vista rápida, `N` una nota nueva. Nada de esto
  // se dispara dentro de un campo, con Ctrl/⌘ ni con un modal abierto.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "Escape" && t === refBusqueda.current && busqueda) {
        setBusqueda("");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      if (e.key === "/" && !enCampo) {
        e.preventDefault();
        refBusqueda.current?.focus();
        return;
      }
      if ((e.key === "n" || e.key === "N") && !enCampo) {
        e.preventDefault();
        setRegistrar({ compraId: null });
        return;
      }
      if (enCampo || vista !== "notas") return;
      const dir = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (dir) {
        e.preventDefault();
        const filasDom = Array.from(document.querySelectorAll<HTMLElement>("[data-nc-fila]"));
        if (!filasDom.length) return;
        const actual = filasDom.findIndex((f) => f === document.activeElement || f.contains(document.activeElement));
        filasDom[Math.min(filasDom.length - 1, Math.max(0, actual < 0 ? (dir > 0 ? 0 : filasDom.length - 1) : actual + dir))]?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [busqueda, vista]);

  const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

  return (
    <div className="space-y-6">
      <div {...entra(0)} className="anim-entra flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Compras</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Notas de crédito de proveedor</h1>
          <p className="mt-1 max-w-[42rem] text-sm text-tinta/65">
            Lo que los proveedores le acreditan a CAYLA por faltantes, devoluciones o descuentos: qué falta reclamar, qué ya llegó y a dónde fue el dinero.
          </p>
        </div>
        <button type="button" onClick={() => setRegistrar({ compraId: null })} className="label-cayla boton-brillo inline-flex items-center gap-2 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
          + Registrar nota
          <kbd className="rounded border border-crema/35 px-1.5 text-[10px] text-crema/75">N</kbd>
        </button>
      </div>

      <div {...entra(1)}>
        <SegmentoDeslizante
          etiqueta="Secciones del módulo"
          valor={vista}
          onCambio={(v) => setVista(v as "notas" | "saldos")}
          opciones={[
            { clave: "notas", etiqueta: "Notas" },
            { clave: "saldos", etiqueta: cifras.saldoFavorTotal > 0 ? `Saldos a favor · ${soles(cifras.saldoFavorTotal)}` : "Saldos a favor" },
          ]}
        />
      </div>

      {falla && (
        <p className="card-cayla anim-entra border-dashed px-5 py-4 text-sm text-tinta/75" style={{ ["--i" as string]: 2 }}>
          {falla}
        </p>
      )}

      {vista === "notas" ? (
        <>
          {/* --- las cuatro cifras --------------------------------------------------- */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TarjetaCifra
              compacta
              acentoTrazo={cifras.porReclamar.cantidad > 0}
              punto={cifras.porReclamar.masVieja > 14 ? "rojo" : "ambar"}
              puntoPulsa={cifras.porReclamar.masVieja > 14}
              tono={cifras.porReclamar.cantidad > 0 ? "text-ambar-profundo" : undefined}
              etiqueta="Por reclamar"
              valor={<CifraQueCuenta valor={cifras.porReclamar.monto} formato="soles" alMontar />}
              className="anim-entra col-span-2 sm:col-span-1"
              style={{ ["--i" as string]: 2 }}
            >
              {cifras.porReclamar.cantidad > 0 ? `${cifras.porReclamar.cantidad === 1 ? "1 nota" : `${cifras.porReclamar.cantidad} notas`} · la más antigua ${hace(cifras.porReclamar.masVieja).toLowerCase()}` : "Nada por reclamar"}
              {cifras.porReclamar.cantidad > 0 && (
                <span className="nc-conc" data-elegido={banda && banda !== "emitidas" && banda !== "aplicadas" ? "" : undefined} role="group" aria-label="Notas por reclamar según su antigüedad">
                  {(["urgente", "medio", "reciente"] as TramoUrgencia[]).map((t, i) =>
                    cifras.porReclamar.tramos[t] > 0 ? (
                      <button
                        key={t}
                        type="button"
                        data-on={banda === t ? "" : undefined}
                        aria-label={`${ETIQUETA_BANDA[t]}: ${cifras.porReclamar.tramos[t]}`}
                        aria-pressed={banda === t}
                        title={ETIQUETA_BANDA[t]}
                        onClick={() => { setPestana("por_reclamar"); setBanda((b) => (b === t ? null : t)); }}
                        className={`anim-crece-x ${COLOR_TRAMO[t]}`}
                        style={{ flexGrow: cifras.porReclamar.tramos[t], ["--i" as string]: i + 2 } as CSSProperties}
                      />
                    ) : null,
                  )}
                </span>
              )}
            </TarjetaCifra>

            <TarjetaCifra compacta punto="neutro" etiqueta="Emitidas este mes" valor={<CifraQueCuenta valor={cifras.emitidasMes.monto} formato="soles" alMontar />} className="anim-entra" style={{ ["--i" as string]: 3 }}>
              {cifras.emitidasMes.cantidad > 0
                ? [`${cifras.emitidasMes.cantidad === 1 ? "1 nota" : `${cifras.emitidasMes.cantidad} notas`}`, `${soles(cifras.emitidasMes.bajaronDeuda)} bajaron deuda`, cifras.emitidasMes.devueltos > 0 ? `${soles(cifras.emitidasMes.devueltos)} devueltos` : "", `${soles(cifras.emitidasMes.aFavor)} a favor`]
                    .filter(Boolean)
                    .join(" · ")
                : "Ninguna nota registrada este mes"}
            </TarjetaCifra>

            <TarjetaCifra
              compacta
              viva
              punto="verde"
              tono="text-verde-profundo"
              etiqueta="Saldo a favor total"
              valor={<CifraQueCuenta valor={cifras.saldoFavorTotal} formato="soles" alMontar />}
              onClick={() => setVista("saldos")}
              className="anim-entra"
              style={{ ["--i" as string]: 4 }}
            >
              {conSaldo.length > 0 ? (
                <>
                  {conSaldo.length === 1 ? "1 proveedor te debe saldo" : `${conSaldo.length} proveedores te deben saldo`} <span className="cmp-flecha">→</span>
                  {/* Un tramo por proveedor: se ve de un vistazo si el saldo está repartido o concentrado. */}
                  <span aria-hidden className="nc-conc">
                    {conSaldo.map((p, i) => (
                      <span key={p.id} className={`anim-crece-x rounded-sm ${i % 2 ? "bg-verde-profundo" : "bg-verde"}`} style={{ flexGrow: p.saldoFavor, ["--i" as string]: i + 2 } as CSSProperties} />
                    ))}
                  </span>
                </>
              ) : (
                "Ningún proveedor te debe saldo"
              )}
            </TarjetaCifra>

            <TarjetaCifra compacta punto="neutro" etiqueta="Aplicado este mes" valor={<CifraQueCuenta valor={cifras.aplicadoMes.total} formato="soles" alMontar />} className="anim-entra" style={{ ["--i" as string]: 5 }}>
              {cifras.aplicadoMes.total > 0 ? [`${soles(cifras.aplicadoMes.bajoDeuda)} bajaron deuda`, cifras.aplicadoMes.devuelto > 0 ? `${soles(cifras.aplicadoMes.devuelto)} devueltos` : ""].filter(Boolean).join(" · ") : "Todavía nada este mes"}
            </TarjetaCifra>
          </div>

          {/* --- buscador, pestañas y agrupación ------------------------------------- */}
          <div className="anim-entra flex flex-wrap items-center gap-x-5 gap-y-3" style={{ ["--i" as string]: 6 }}>
            <label className="group relative flex min-w-[15rem] flex-1 items-center gap-2.5 border-b border-tinta/25 px-0.5 py-1.5 focus-within:border-rojo">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-tinta/45" />
              <input
                ref={refBusqueda}
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Proveedor, comprobante o número de nota"
                aria-label="Buscar por proveedor, comprobante o número de nota"
                autoComplete="off"
                className="h-6 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45 [&::-webkit-search-cancel-button]:hidden"
              />
              {busqueda ? (
                <button type="button" onClick={() => { setBusqueda(""); refBusqueda.current?.focus(); }} aria-label="Borrar búsqueda" className="rounded-full p-0.5 text-tinta/55 transition-colors hover:text-rojo">
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="rounded border border-tinta/15 px-1.5 text-[10.5px] font-semibold text-tinta/55">/</kbd>
              )}
            </label>
            <SegmentoDeslizante
              etiqueta="Estado de la nota"
              valor={pestana}
              onCambio={(v) => { setPestana(v as Pestana); setBanda(null); }}
              opciones={PESTANAS.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, conteo: conteos[p.clave] }))}
            />
            <SegmentoDeslizante
              etiqueta="Cómo agrupar"
              valor={agrupar}
              onCambio={(v) => setAgrupar(v as "urgencia" | "proveedor")}
              opciones={[
                { clave: "urgencia", etiqueta: "Por urgencia" },
                { clave: "proveedor", etiqueta: "Por proveedor" },
              ]}
            />
          </div>

          {banda && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="anim-entra inline-flex items-center gap-2 rounded-full border border-tinta/25 py-1 pl-3 pr-1.5 text-[12.5px] text-tinta">
                {ETIQUETA_BANDA[banda]}
                <button type="button" onClick={() => setBanda(null)} aria-label="Quitar filtro de antigüedad" className="grid h-[18px] w-[18px] place-items-center rounded-full text-tinta/55 transition-colors hover:bg-tinta hover:text-crema">
                  <X aria-hidden className="h-2.5 w-2.5" />
                </button>
              </span>
            </div>
          )}

          <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3.5 text-[12.5px] text-tinta/65">
            {visibles.length > 0 && (
              <>
                <span>
                  <b className="font-semibold tabular-nums text-tinta">{visibles.length}</b> {pestana === "por_reclamar" ? (visibles.length === 1 ? "nota por reclamar" : "notas por reclamar") : visibles.length === 1 ? "nota" : "notas"}
                </span>
                <span>
                  <b className="font-semibold tabular-nums text-tinta">{soles(Math.round(visibles.reduce((a, f) => a + f.monto, 0) * 100) / 100)}</b> {pestana === "por_reclamar" ? "esperados en total" : "en total"}
                </span>
                {pestana === "por_reclamar" && (
                  <span>
                    la más antigua, <b className="font-semibold text-tinta">{hace(visibles.reduce((m, f) => Math.max(m, f.edadDias), 0)).toLowerCase()}</b>
                  </span>
                )}
              </>
            )}
          </p>

          {/* --- la lista ------------------------------------------------------------ */}
          {visibles.length === 0 ? (
            <Vacia busqueda={busqueda} pestana={pestana} banda={banda} onLimpiar={() => { setBusqueda(""); setBanda(null); }} />
          ) : (
            <Tabla className="anim-entra" style={{ ["--i" as string]: 7 }}>
              <Encabezado
                plantilla={PLANTILLA}
                columnas={[{ titulo: "Proveedor · comprobante" }, { titulo: "Motivo", desdeXl: true }, { titulo: "Antigüedad" }, { titulo: "Monto", alinear: "der" }, { titulo: "Estado" }, { titulo: "" }]}
              />
              <div className="relative divide-y divide-tinta/10">
                {grupos.map((g) => (
                  <div key={g.clave} data-flip={g.clave} ref={refFlip(g.clave)}>
                    <p className={`nc-banda ${TONO_BANDA[g.tono]}`}>
                      <span className="label-cayla text-[11px]">{g.titulo}</span>
                      <span className="whitespace-nowrap tabular-nums">{g.total}</span>
                    </p>
                    <div className="divide-y divide-tinta/10">
                      {g.filas.map((f, i) => (
                        <FilaNota key={f.id} f={f} indice={i} busqueda={busqueda} urgente={f.id === idUrgente} refFlip={refFlip} onAbrir={() => setSeleccionada(f.id)} onRegistrar={() => setRegistrar({ compraId: f.compraId })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Tabla>
          )}

          <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-tinta/55">
            {[["/", "buscar"], ["j k", "moverse"], ["Enter", "vista rápida"], ["N", "nota nueva"], ["Esc", "cerrar"]].map(([k, t]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <kbd className="rounded border border-tinta/15 px-1.5 text-[10.5px] font-semibold text-tinta/55">{k}</kbd> {t}
              </span>
            ))}
          </p>
        </>
      ) : (
        <SaldosAFavorTablero proveedores={proveedores} movimientos={movimientos} total={cifras.saldoFavorTotal} puedeReembolsar={puedeReembolsar} />
      )}

      {abierta && (
        <NotaCreditoVistaRapida
          nota={abierta}
          posicion={{ indice: Math.max(0, orden.indexOf(abierta.id)), total: orden.length }}
          onCerrar={() => setSeleccionada(null)}
          onNavegar={navegar}
          onRegistrar={(compraId) => { setSeleccionada(null); setRegistrar({ compraId }); }}
          onDetalle={(id) => { setSeleccionada(null); setDetalle(id); }}
        />
      )}
      {laDetalle && (
        <NotaCreditoDetalle
          nota={laDetalle}
          movimientos={movimientos.filter((m) => m.proveedorId === laDetalle.proveedorId)}
          onCerrar={() => setDetalle(null)}
          onRegistrar={(compraId) => { setDetalle(null); setRegistrar({ compraId }); }}
        />
      )}
      {registrar && <RegistrarNotaCreditoModal facturas={facturas} fallaFacturas={fallaFacturas} filas={filas} compraIdInicial={registrar.compraId} hoy={hoy} onCerrar={() => setRegistrar(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FilaNota({
  f,
  indice,
  busqueda,
  urgente,
  refFlip,
  onAbrir,
  onRegistrar,
}: {
  f: FilaVista;
  indice: number;
  busqueda: string;
  urgente: boolean;
  refFlip: (id: string) => (el: HTMLElement | null) => void;
  onAbrir: () => void;
  onRegistrar: () => void;
}) {
  const chip = chipEstado(f);
  const tonoEdad = f.tramo === "urgente" ? "rojo" : f.tramo === "medio" ? "ambar" : "neutro";
  return (
    <div
      data-nc-fila
      data-flip={f.id}
      ref={refFlip(f.id)}
      role="button"
      tabIndex={0}
      aria-label={`${f.proveedorNombre}, ${f.documento}, ${soles(f.monto)}, ${chip.texto}`}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      style={{ ["--k" as string]: Math.min(indice, 8) }}
      className={filaClases(PLANTILLA, "cmp-fila cursor-pointer")}
    >
      <span className={celda()}>
        <span className="block truncate text-sm text-tinta">
          <Resaltado texto={f.proveedorNombre} busqueda={busqueda} />
        </span>
        {/* Documento y detalle en la MISMA línea: el documento cortado a «F001-00…» no le sirve a nadie,
            y en esta columna el ancho lo decide el lateral, no la tabla. */}
        <span className="block truncate text-xs text-tinta/55">
          <span className="tabular-nums text-tinta/70">
            <Resaltado texto={f.documento} busqueda={busqueda} />
          </span>
          {" · "}
          {f.clase === "pendiente" ? `${f.unidadesCerradas.toLocaleString("es-PE")} ${f.unidadesCerradas === 1 ? "unidad cerrada" : "unidades cerradas"} sin llegar` : <>{<Resaltado texto={f.serieNumero ?? ""} busqueda={busqueda} />}{f.nota ? ` · ${f.nota}` : ""}</>}
        </span>
        {/* En celular las columnas de motivo/estado no existen: sus chips bajan acá. */}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          <Chip tono={chip.tono}>{chip.texto}</Chip>
          {f.clase === "pendiente" && <Chip tono={tonoEdad}>{hace(f.edadDias)}</Chip>}
        </span>
      </span>
      <span className={celda("izq", "hidden xl:block")}>{f.motivo && <Chip tono="neutro">{ETIQUETA_MOTIVO_NOTA[f.motivo] ?? f.motivo}</Chip>}</span>
      <span className={celda("izq", "hidden overflow-visible whitespace-normal sm:block")}>
        {f.clase === "pendiente" ? (
          <>
            <Chip tono={tonoEdad} vivo={urgente}>
              {hace(f.edadDias)}
            </Chip>
            <span className="mt-0.5 block text-xs text-tinta/55">cerrado el {diaMes(f.cerradoEn?.slice(0, 10) ?? f.fecha)}</span>
          </>
        ) : (
          <>
            <span className="block text-sm tabular-nums text-tinta">{diaMes(f.fecha)}</span>
            <span className="block text-xs text-tinta/55">{f.estado === "aplicada" ? (f.devuelto ? "devuelta" : "aplicada del todo") : "registrada"}</span>
          </>
        )}
      </span>
      <span className={celda("der")}>
        <span className="font-display block text-[18px] tabular-nums text-tinta">{soles(f.monto)}</span>
        <span className={`block text-xs ${f.estado === "emitida" || f.devuelto ? "text-verde-profundo" : "text-tinta/55"}`}>{destinoTexto(f)}</span>
        {f.clase === "nota" && f.monto > 0 && (
          <span aria-hidden className="ml-auto mt-1 block h-[3px] w-[5.5rem] overflow-hidden rounded-full bg-sand">
            <i className="anim-crece-x block h-full origin-left rounded-full bg-verde" style={{ width: `${Math.min(100, (f.aplicado / f.monto) * 100)}%` }} />
          </span>
        )}
      </span>
      <span className={celda("izq", "hidden overflow-visible whitespace-normal sm:block")}>
        <Chip tono={chip.tono}>{chip.texto}</Chip>
      </span>
      <span className={celda("der", "hidden items-center justify-end gap-2 sm:flex")}>
        {f.clase === "pendiente" && !f.bloqueada && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRegistrar(); }}
            className="label-cayla hidden rounded-md border border-tinta/25 px-3 py-1.5 text-[10.5px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo xl:inline-block"
          >
            Registrar nota
          </button>
        )}
        <ChevronRight aria-hidden className="cmp-flecha-fila h-4 w-4 shrink-0 text-tinta/40" />
      </span>
    </div>
  );
}

function Vacia({ busqueda, pestana, banda, onLimpiar }: { busqueda: string; pestana: Pestana; banda: Banda | null; onLimpiar: () => void }) {
  if (busqueda.trim()) {
    return (
      <div className="card-cayla anim-revelar px-5 py-11 text-center">
        <p className="font-display text-[19px] italic text-tinta/65">Ninguna nota coincide con «{busqueda.trim()}»</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-tinta/55">Se busca por proveedor, comprobante de origen o número de nota.</p>
        <button type="button" onClick={onLimpiar} className="mt-2.5 text-[13px] text-rojo hover:underline">
          Limpiar la búsqueda
        </button>
      </div>
    );
  }
  if (banda) {
    return (
      <div className="card-cayla anim-revelar px-5 py-11 text-center">
        <p className="font-display text-[19px] italic text-tinta/65">Ninguna nota pendiente en ese tramo</p>
        <button type="button" onClick={onLimpiar} className="mt-2.5 text-[13px] text-rojo hover:underline">
          Ver todas las que faltan
        </button>
      </div>
    );
  }
  if (pestana === "por_reclamar") {
    // El trazo que se dibuja: es lo que se ve al registrar la última nota que faltaba.
    return (
      <div className="card-cayla anim-revelar px-5 py-11 text-center">
        <svg aria-hidden viewBox="0 0 64 64" className="mx-auto mb-2.5 h-[54px] w-[54px] fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle pathLength={1} cx="32" cy="32" r="29" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
          <path pathLength={1} d="M19 33l9 9 17-20" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 12 }} />
        </svg>
        <p className="font-display text-[19px] italic text-tinta/65">Nada por reclamar</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-tinta/55">
          Todo lo que se cerró por faltante ya tiene su nota de crédito. Cuando cierres un faltante al recibir, aparecerá acá por sí solo.
        </p>
      </div>
    );
  }
  return (
    <div className="card-cayla anim-revelar px-5 py-11 text-center">
      <p className="font-display text-[19px] italic text-tinta/65">No hay notas en esta pestaña</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-tinta/55">Aparecen cuando el proveedor emite una y la registras.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña «Saldos a favor»
// ---------------------------------------------------------------------------

/**
 * Lo mismo que muestra la ficha de un proveedor, pero TRANSVERSAL: a quién le sobra plata a favor de
 * CAYLA, de qué notas viene y qué se puede hacer con ella. La regla de Felipe manda y se dice en
 * pantalla: el saldo se SUGIERE al pagar, nunca se descuenta solo.
 */
function SaldosAFavorTablero({ proveedores, movimientos, total, puedeReembolsar }: { proveedores: { id: string; nombre: string; saldoFavor: number; deuda: number }[]; movimientos: MovimientoFavor[]; total: number; puedeReembolsar: boolean }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const con = proveedores.filter((p) => p.saldoFavor > 0.004).sort((a, b) => b.saldoFavor - a.saldoFavor);
  const sin = proveedores.filter((p) => p.saldoFavor <= 0.004);

  if (con.length === 0) {
    return (
      <div className="card-cayla anim-entra px-5 py-11 text-center" style={{ ["--i" as string]: 2 }}>
        <svg aria-hidden viewBox="0 0 64 64" className="mx-auto mb-2.5 h-[54px] w-[54px] fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle pathLength={1} cx="32" cy="32" r="29" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
          <path pathLength={1} d="M19 33l9 9 17-20" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 12 }} />
        </svg>
        <p className="font-display text-[19px] italic text-tinta/65">Ningún proveedor te debe saldo</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-tinta/55">
          Cuando una nota de crédito supere lo que le debes a un proveedor (por ejemplo, en una factura al contado), lo que sobre aparecerá acá.
        </p>
      </div>
    );
  }

  const cubreTodo = Math.round(con.reduce((a, p) => a + Math.min(p.saldoFavor, p.deuda), 0) * 100) / 100;

  return (
    <div className="space-y-3">
      <section className="card-cayla anim-entra px-5 py-4" style={{ ["--i" as string]: 2 }}>
        <p className="label-cayla flex items-center gap-2 text-[11px] text-tinta/65">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-verde" />A tu favor con proveedores
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <span className="font-display text-[40px] leading-[1.1] tabular-nums text-verde-profundo">
            <CifraQueCuenta valor={total} formato="soles" alMontar />
          </span>
          <span className="text-sm text-tinta/65">
            {con.length === 1 ? "1 proveedor te debe saldo" : `${con.length} proveedores te deben saldo`}
            {cubreTodo > 0 ? ` · si lo usaras todo, dejarías de transferir hasta ${soles(cubreTodo)}` : ""}
          </span>
        </p>
        <p className="mt-3 flex items-start gap-2.5 border-t border-tinta/10 pt-3 text-[13px] text-tinta/65">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-verde-profundo" />
          <span>
            <b className="font-semibold text-tinta">Se sugiere, no se descuenta solo.</b> El saldo a favor se te ofrece en «Pagar juntos» y lo decide quien paga. También puedes pedir que el proveedor te devuelva el dinero.
          </span>
        </p>
      </section>

      {con.map((p, i) => {
        const libro = movimientos.filter((m) => m.proveedorId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
        const cubre = Math.min(p.saldoFavor, p.deuda);
        const abierto = abiertos.has(p.id);
        return (
          <section key={p.id} className="card-cayla anim-entra overflow-hidden" style={{ ["--i" as string]: 3 + i }} aria-label={`Saldo a favor de ${p.nombre}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
              <div className="min-w-0 flex-1 basis-[18rem]">
                <Link href={`/compras/proveedores/${p.id}#saldo-a-favor`} className="text-[15px] text-tinta hover:text-rojo hover:underline">
                  {p.nombre}
                </Link>
                <p className="text-xs text-tinta/65">
                  {p.deuda > 0 ? `Le debes ${soles(p.deuda)} · con tu saldo solo transferirías ${soles(Math.max(0, Math.round((p.deuda - cubre) * 100) / 100))}` : "Sin deuda pendiente: queda a tu favor para su próxima compra, o pide el reembolso."}
                </p>
                {p.deuda > 0 && (
                  <div aria-hidden className="mt-2 h-[5px] max-w-[21rem] overflow-hidden rounded-full bg-sand">
                    <div className="anim-crece-x h-full origin-left rounded-full bg-verde" style={{ width: `${Math.min(100, Math.round((cubre / p.deuda) * 100))}%` }} />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-display text-[26px] tabular-nums text-verde-profundo">{soles(p.saldoFavor)}</span>
                <div className="flex flex-wrap gap-2">
                  {p.deuda > 0 && (
                    <Link href={`/compras/por-pagar?prov=${p.id}&marcar=1`} className="label-cayla rounded-md border border-tinta/25 px-3 py-2 text-[10.5px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo">
                      Usar en un pago →
                    </Link>
                  )}
                  {/* La misma pieza que la ficha del proveedor: una sola forma de registrar un reembolso. */}
                  {puedeReembolsar && <BotonReembolso proveedorId={p.id} proveedorNombre={p.nombre} saldoFavor={p.saldoFavor} />}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAbiertos((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
              aria-expanded={abierto}
              className="label-cayla flex w-full items-center gap-2 border-t border-tinta/10 px-5 py-2.5 text-[11px] text-tinta/65 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
            >
              De qué viene · {libro.length} {libro.length === 1 ? "movimiento" : "movimientos"}
              <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-300 ease-cayla ${abierto ? "rotate-180" : ""}`} />
            </button>
            <div className="nc-colapsa" data-abierto={abierto ? "true" : "false"}>
              <div>
                <div className="border-t border-tinta/10 px-5 pb-4 pt-1">
                  {libro.length === 0 ? (
                    <p className="py-2 text-[13px] text-tinta/55">El libro de este proveedor no tiene movimientos todavía.</p>
                  ) : (
                    libro.map((m) => (
                      <div key={m.id} className="grid grid-cols-[4.4rem_1.6rem_1fr_auto] items-baseline gap-x-3 border-b border-tinta/10 py-2.5 text-[13px] last:border-b-0">
                        <span className="tabular-nums text-tinta/55">{diaMes(m.fecha)}</span>
                        <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-[13px] leading-none ${m.tipo === "nota_credito" ? "bg-verde/15 text-verde-profundo" : "bg-tinta/[0.04] text-tinta/65"}`}>
                          {m.tipo === "nota_credito" ? "+" : "−"}
                        </span>
                        <span className="min-w-0 text-tinta">
                          {m.tipo === "nota_credito" ? `Nota ${m.notaSerieNumero ?? ""}${m.documento ? ` · sobre ${m.documento}` : ""}` : m.tipo === "aplicacion" ? "Usado en un pago" : `Reembolso · ${ETIQUETA_METODO[m.metodo ?? ""] ?? m.metodo ?? ""}`}
                          <span className="block text-xs text-tinta/55">{[m.documento, m.referencia, m.nota].filter(Boolean).join(" · ") || "sin referencia"}</span>
                        </span>
                        <span className={`whitespace-nowrap font-semibold tabular-nums ${m.tipo === "nota_credito" ? "text-verde-profundo" : "text-tinta/75"}`}>
                          {m.tipo === "nota_credito" ? "+" : "−"} {soles(m.monto)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {sin.length > 0 && <p className="px-1 text-[13px] text-tinta/55">Sin saldo a favor: {sin.map((p) => p.nombre).join(" · ")}</p>}
    </div>
  );
}
