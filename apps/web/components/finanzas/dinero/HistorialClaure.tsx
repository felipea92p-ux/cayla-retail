"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Paginas } from "@/components/ui/Paginas";
import { Pestanas } from "@/components/ui/Pestanas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { SeparadorDia } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { soles } from "@/lib/compras-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import {
  FILTROS_LIBRO,
  PERIODOS_LIBRO,
  TAMANOS_PAGINA_CLAURE,
  agruparPorDia,
  contarLibro,
  delPeriodo,
  etiquetaPeriodo,
  fechaLargaClaure,
  filtrarLibro,
  hayPeriodoSiguiente,
  moverPeriodo,
  paginarClaure,
  type FiltroLibro,
  type MovimientoLibro,
  type PeriodoLibro,
  type TamanoPaginaClaure,
} from "@/lib/cuenta-claure-vista-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE ▸ «Historial de movimientos» (rediseño Felipe 2026-10-31): cada cobro, devolución, gasto suyo y pago, con lo
// que se le debía después, por día, semana, mes o todo, de 30 o 40 en 40. Solo lee: no guarda nada. Se abre desde cada ficha (ya filtrada) o desde
// «Ver historial completo».

const conSigno = (n: number) => `${n < 0 ? "−" : "+"}${soles(Math.abs(n))}`;

export function HistorialClaure({ libro, hoy, filtroInicial, periodoInicial, onCerrar }: { libro: MovimientoLibro[]; hoy: string; filtroInicial: FiltroLibro; periodoInicial: PeriodoLibro; onCerrar: () => void }) {
  const [filtro, setFiltro] = useState<FiltroLibro>(filtroInicial);
  const [periodo, setPeriodo] = useState<PeriodoLibro>(periodoInicial);
  const [ref, setRef] = useState(hoy);
  const [tamano, setTamano] = useState<TamanoPaginaClaure>(30);
  const [pagina, setPagina] = useState(1);

  const delPer = delPeriodo(libro, periodo, ref);
  const filtradas = filtrarLibro(delPer, filtro);
  const pag = paginarClaure(filtradas, pagina, tamano);
  const dias = agruparPorDia(pag.visibles, filtradas);
  const mover = (paso: -1 | 1) => {
    setRef((r) => moverPeriodo(periodo, r, paso, hoy));
    setPagina(1);
  };

  return (
    <Modal
      titulo="Historial de movimientos"
      subtitulo={`${libro.length} ${libro.length === 1 ? "movimiento" : "movimientos"}. Cada uno con cuánto se le debía a Claudia después.`}
      arriba={<span className="cl-versalita">CLAURE</span>}
      onClose={onCerrar}
      conCerrar
      ancho="max-w-[68rem]" /* unificar-fijo: la ventana del historial es de diseño propio, con filtros, período, días y páginas (Felipe 2026-10-31) */
    >
      <div className="space-y-3" data-sin-cascada>
        <Pestanas
          etiquetaAccesible="Qué movimientos ver"
          activa={filtro}
          onCambio={(c) => {
            setFiltro(c as FiltroLibro);
            setPagina(1);
          }}
          idIndicador="claure-historial"
          items={FILTROS_LIBRO.map((f) => ({ clave: f.clave, etiqueta: f.texto, conteo: contarLibro(delPer, f.clave), tono: "neutro" as const, pide: "movimientos" }))}
        />

        <div className="cl-h-barra">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
            {PERIODOS_LIBRO.map((p) => (
              <button
                key={p.clave}
                type="button"
                className="pildora-cayla"
                aria-pressed={periodo === p.clave}
                onClick={() => {
                  setPeriodo(p.clave);
                  setRef(hoy);
                  setPagina(1);
                }}
              >
                {p.texto}
                <span className="pildora-cayla__n">{contarLibro(delPeriodo(filtrarLibro(libro, filtro), p.clave, p.clave === periodo ? ref : hoy), "todo")}</span>
              </button>
            ))}
          </div>
          <div className="cl-h-per">
            {periodo !== "todo" && (
              <button type="button" className="cl-h-flecha" onClick={() => mover(-1)} aria-label="Período anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            )}
            <b>{etiquetaPeriodo(periodo, ref)}</b>
            {periodo !== "todo" && (
              <button type="button" className="cl-h-flecha" onClick={() => mover(1)} disabled={!hayPeriodoSiguiente(periodo, ref, hoy)} aria-label="Período siguiente">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="cl-h-cab" aria-hidden>
          <span>Movimiento</span>
          <span>Efecto</span>
          <span>Debías después</span>
        </div>

        {dias.length === 0 ? (
          <Vacio tamano="chico" icono={<SearchX />}>
            No hay movimientos en este período. Prueba con otro, o con «Todo».
          </Vacio>
        ) : (
          dias.map((d) => (
            <section key={d.fecha} aria-label={fechaLargaClaure(d.fecha)}>
              <SeparadorDia hoy={d.fecha === hoy} total={`${d.total} ${d.total === 1 ? "movimiento" : "movimientos"} · neto ${conSigno(d.neto)}`}>
                {fechaLargaClaure(d.fecha)}
                {d.fecha === hoy ? " · hoy" : ""}
              </SeparadorDia>
              {d.movimientos.map((m) => (
                <div key={m.clave} className="cl-h-fila">
                  <div>
                    <b>{m.titulo}</b>
                    <small>{m.detalle}</small>
                  </div>
                  <span className={`cl-m ${m.efecto < 0 ? "" : "cl-pos"}`}>{conSigno(m.efecto)}</span>
                  <span className="cl-sd">debías {solesRedondo(m.saldo)}</span>
                </div>
              ))}
            </section>
          ))
        )}

        <div className="cl-h-pie">
          <span className="flex flex-wrap items-center gap-3 tabular-nums">
            {pag.desde}–{pag.hasta} de {pag.total}
            <SegmentoDeslizante
              etiqueta="Cuántos por página"
              valor={String(tamano)}
              onCambio={(c) => {
                setTamano(Number(c) as TamanoPaginaClaure);
                setPagina(1);
              }}
              opciones={TAMANOS_PAGINA_CLAURE.map((n) => ({ clave: String(n), etiqueta: String(n) }))}
            />
            por página
          </span>
          <Paginas pagina={pag.pagina} totalPaginas={pag.totalPaginas} onPagina={setPagina} />
        </div>
      </div>
    </Modal>
  );
}
