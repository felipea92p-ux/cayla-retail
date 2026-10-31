"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { SeparadorDia, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { PieDePaginas } from "@/components/finanzas/dinero/PieDePaginas";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import { nombreCorto, TEXTO_MOVIMIENTO, type MovimientoDinero } from "@/lib/cuentas-dinero-reglas";
import { paginar, type TamanoPagina } from "@/lib/dinero-estados-reglas";
import { agruparPorDia, delPeriodo, diaDe, etiquetaDePeriodo, haySiguiente, moverPeriodo, rangoDe, tocaALaCuenta, ultimoDiaConMovimientos, type Periodo } from "@/lib/dinero-historial-reglas";

// Cuentas y dinero ▸ Dónde está ▸ movimientos entre cuentas (rediseño Felipe 2026-10-31, maqueta docs/maquetas/finanzas-dinero-rediseno-2026-10/): «Últimos
// movimientos» (los 6 más recientes, en una tarjeta) y «Historial de movimientos» en una ventana: por día, semana, mes o todo, separado por día y de 30 o
// 40 por página. También por cuenta (desde el detalle de una cuenta). Lee los movimientos que la pantalla ya trae (los últimos 150): no pide nada nuevo.
// Un movimiento abre su detalle (donde se anula con motivo) con `onElegir`; sin él, solo se lee.

const OPCIONES_PERIODO = [
  { clave: "dia", etiqueta: "Día" },
  { clave: "semana", etiqueta: "Semana" },
  { clave: "mes", etiqueta: "Mes" },
  { clave: "todo", etiqueta: "Todo" },
];

/** Una fila de movimiento: día, qué fue, de dónde a dónde y cuánto (con signo si se mira una cuenta). */
function FilaDeMovimiento({ m, cuentaId, onElegir }: { m: MovimientoDinero; cuentaId?: string; onElegir?: (m: MovimientoDinero) => void }) {
  const entra = cuentaId ? m.destinoId === cuentaId : null;
  const contenido = (
    <>
      <span className="dp-versalita">{fechaCorta(m.fecha)}</span>
      <span className="min-w-0">
        <b className="block text-sm font-semibold text-tinta">{TEXTO_MOVIMIENTO[m.tipo]}</b>
        <small className="dp-tenue block truncate text-xs">
          {m.origenNombre ? nombreCorto(m.origenNombre) : "El dueño"} → {m.destinoNombre ? nombreCorto(m.destinoNombre) : "Sale del negocio"}
          {m.comision > 0 ? ` · comisión ${solesRedondo(m.comision)} → gasto` : ""}
          {m.estado === "anulado" ? ` · anulado: ${m.motivoAnulacion ?? ""}` : ""}
        </small>
      </span>
      <b className={`dp-m ${entra === null ? "" : entra ? "dp-ent" : "dp-sal"} ${m.estado === "anulado" ? "line-through opacity-60" : ""}`}>
        {entra === null ? "" : entra ? "+" : "−"}
        {solesRedondo(m.monto)}
      </b>
    </>
  );
  return onElegir ? (
    <button type="button" className="dp-mov-fila" onClick={() => onElegir(m)} data-guia="fin-dinero.movimiento">
      {contenido}
    </button>
  ) : (
    <div className="dp-mov-fila">{contenido}</div>
  );
}

/** La tarjeta «Últimos movimientos»: los 6 más recientes y la puerta al historial completo. */
export function UltimosMovimientos({ movimientos, hoy, onElegir }: { movimientos: MovimientoDinero[]; hoy: string; onElegir: (m: MovimientoDinero) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="card-cayla dp-ultimos" aria-label="Movimientos entre cuentas" data-guia="fin-dinero.movimientos">
      <header className="dp-dueno-cab">
        <div>
          <TituloSeccion>Últimos movimientos</TituloSeccion>
          <p className="dp-tenue">Depósitos, abonos de tarjeta, transferencias y retiros. No son ventas ni gastos: la plata cambia de lugar.</p>
        </div>
        {movimientos.length > 0 && (
          <button type="button" className="btn-cayla btn-sutil btn-chico" aria-haspopup="dialog" onClick={() => setAbierto(true)} data-guia="fin-dinero.historial">
            Ver historial completo
          </button>
        )}
      </header>
      {movimientos.length === 0 ? (
        <Vacio tamano="chico" icono={<ArrowLeftRight />}>
          Sin movimientos todavía. Un depósito se registra con «+ Registrar movimiento».
        </Vacio>
      ) : (
        <div className="dp-mov-lista">
          {movimientos.slice(0, 6).map((m) => (
            <FilaDeMovimiento key={m.id} m={m} onElegir={onElegir} />
          ))}
        </div>
      )}
      <p className="dp-cobros-pie dp-tenue">Solo se agregan filas; un error se anula con motivo.</p>
      {abierto && <HistorialModal movimientos={movimientos} hoy={hoy} titulo="Historial de movimientos" onElegir={onElegir} onCerrar={() => setAbierto(false)} />}
    </section>
  );
}

/** La ventana del historial: día, semana, mes o todo; separada por día; de 30 o 40 por página. Con `cuenta`, solo lo que toca esa cuenta. */
export function HistorialModal({
  movimientos,
  hoy,
  titulo,
  cuenta,
  onElegir,
  onCerrar,
}: {
  movimientos: MovimientoDinero[];
  hoy: string;
  titulo: string;
  cuenta?: { id: string; nombre: string };
  onElegir?: (m: MovimientoDinero) => void;
  onCerrar: () => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [ref, setRef] = useState(hoy);
  const [tamano, setTamano] = useState<TamanoPagina>(30);
  const [pagina, setPagina] = useState(1);

  const base = cuenta ? movimientos.filter((m) => tocaALaCuenta(m, cuenta.id)) : movimientos;
  const delPeriodoElegido = delPeriodo(base, periodo, ref);
  const pag = paginar(delPeriodoElegido, pagina, tamano);
  const dias = agruparPorDia(pag.visibles, cuenta?.id);
  const hayAtras = periodo !== "todo" && base.some((m) => diaDe(m) < rangoDe(periodo, ref).desde);
  const entro = cuenta ? delPeriodoElegido.filter((m) => m.destinoId === cuenta.id && m.estado === "vigente").reduce((a, m) => a + m.monto, 0) : 0;
  const salio = cuenta ? delPeriodoElegido.filter((m) => m.origenId === cuenta.id && m.estado === "vigente").reduce((a, m) => a + m.monto, 0) : 0;

  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setPagina(1);
    // En «día», si hoy no hubo nada, se abre en el último día que sí tuvo movimientos.
    if (p === "dia") setRef(ultimoDiaConMovimientos(base, ref) ?? ref);
  };
  const mover = (dir: -1 | 1) => {
    setRef(moverPeriodo(periodo, ref, dir, hoy));
    setPagina(1);
  };

  return (
    <Modal
      titulo={titulo}
      subtitulo={cuenta ? `Lo que entró y salió de ${cuenta.nombre}.` : "La plata cambia de lugar: no son ventas ni gastos. Se leen los últimos 150 movimientos."}
      onClose={onCerrar}
      conCerrar
      ancho="max-w-[56rem]" /* unificar-fijo: el historial es de diseño propio, con filtro de período, separador por día y páginas (Felipe 2026-10-31) */
    >
      <div className="space-y-4" data-sin-cascada>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentoDeslizante etiqueta="Período del historial" forma="modo" valor={periodo} onCambio={(c) => cambiarPeriodo(c as Periodo)} opciones={OPCIONES_PERIODO} />
          {periodo !== "todo" && (
            <div className="dp-periodo" role="group" aria-label="Cambiar de período">
              <button type="button" className="btn-cayla btn-sutil btn-chico" aria-label="Período anterior" onClick={() => mover(-1)} disabled={!hayAtras}>
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <b>{etiquetaDePeriodo(periodo, ref)}</b>
              <button type="button" className="btn-cayla btn-sutil btn-chico" aria-label="Período siguiente" onClick={() => mover(1)} disabled={!haySiguiente(periodo, ref, hoy)}>
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {cuenta && (
          <p className="dp-resumen-cuenta">
            <span>
              Entró <b className="dp-ent dp-num">+{solesRedondo(entro)}</b>
            </span>
            <span>
              Salió <b className="dp-sal dp-num">−{solesRedondo(salio)}</b>
            </span>
            <span className="dp-tenue">en {etiquetaDePeriodo(periodo, ref).toLowerCase()}</span>
          </p>
        )}
        {dias.length === 0 ? (
          <Vacio tamano="chico" icono={<ArrowLeftRight />}>
            Sin movimientos {periodo === "dia" ? "este día" : periodo === "semana" ? "esta semana" : periodo === "mes" ? "este mes" : "todavía"}.
          </Vacio>
        ) : (
          dias.map((d) => (
            <div key={d.dia}>
              <SeparadorDia hoy={d.dia === hoy} total={<span className="dp-num">{d.movs.length} {d.movs.length === 1 ? "movimiento" : "movimientos"} · {cuenta && d.total > 0 ? "+" : ""}{solesRedondo(d.total)}</span>}>
                {d.titulo}
              </SeparadorDia>
              <div className="dp-mov-lista">
                {d.movs.map((m) => (
                  <FilaDeMovimiento key={m.id} m={m} cuentaId={cuenta?.id} onElegir={onElegir} />
                ))}
              </div>
            </div>
          ))
        )}
        <PieDePaginas
          texto={`${pag.desde}–${pag.hasta} de ${pag.total} movimientos`}
          tamano={tamano}
          onTamano={(t) => {
            setTamano(t);
            setPagina(1);
          }}
          pagina={pag.pagina}
          totalPaginas={pag.totalPaginas}
          onPagina={setPagina}
        />
      </div>
    </Modal>
  );
}
