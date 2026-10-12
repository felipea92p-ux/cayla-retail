"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, Clock, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Vacio } from "@/components/ui/Vacio";
import { Volver } from "@/components/ui/Volver";
import { ANCHO_DETALLE_CIERRE, DetalleCierreContenido, bajadaDelCierre, tituloDelCierre, useDatosDetalleCierre } from "@/components/CierreCajaDetalle";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorMes, bloqueFecha, duracionTurno, estadoCierre, filtrarCierres, resumirCierres, type EstadoCierre, type FiltroCierres } from "@/lib/historial-cierres-reglas";

function money(n: number) {
  return (n >= 0 ? "S/ " : "-S/ ") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Lo que dice el sello de cada ticket. */
function textoSello(estado: EstadoCierre, diferencia: number) {
  if (estado === "cuadro") return "Cuadró";
  return `${estado === "falto" ? "Faltó" : "Sobró"} ${money(Math.abs(diferencia))}`;
}

const veces = (n: number) => (n === 1 ? "vez" : "veces");

/**
 * «Historial de cierres» desde la cabecera de Caja: los últimos cierres de esta sede como tickets de caja, cada uno con
 * su sello (CUADRÓ · FALTÓ · SOBRÓ), y arriba los tres sellos contados (Felipe 2026-10-12, maqueta E «Los tickets», elegida
 * entre cinco). El ticket no lleva quién cerró: eso está en el detalle. Tocar un ticket abre el detalle de ese cierre EN LA
 * MISMA HOJA (Felipe 2026-10-10, opción «A ampliada»): la hoja crece de ancho para dejar los movimientos a la derecha y
 * arriba lleva «← Historial de cierres» para volver. La lista queda montada (escondida) mientras se mira un cierre, así que
 * al volver el filtro y el lugar del desplazamiento siguen donde estaban. La lógica (resumen, filtro, agrupado, estado) vive
 * en `lib/historial-cierres-reglas.ts`; el papel y el sello, en `app/estilos/historial-tickets.css`.
 */
export function HistorialCierresModal({ cierres, ubicacionNombre, onClose }: { cierres: CierreCaja[]; ubicacionNombre: string; onClose: () => void }) {
  const [filtro, setFiltro] = useState<FiltroCierres>("todos");
  const { abierto, abrir, cerrar, detalle, cargando, error } = useDatosDetalleCierre();
  const lista = useRef<HTMLDivElement>(null);
  const desplazamiento = useRef({ hoja: 0, lista: 0 });
  const resumen = useMemo(() => resumirCierres(cierres), [cierres]);
  const grupos = useMemo(() => agruparPorMes(filtrarCierres(cierres, filtro)), [cierres, filtro]);

  // La hoja es la que se desplaza (`role="dialog"`); la lista de cierres tiene además su propio desplazamiento.
  const hoja = () => lista.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
  const listaScroll = () => lista.current?.querySelector<HTMLElement>("[data-lista-cierres]") ?? null;

  function verCierre(c: CierreCaja) {
    desplazamiento.current = { hoja: hoja()?.scrollTop ?? 0, lista: listaScroll()?.scrollTop ?? 0 };
    abrir(c);
    // El detalle empieza arriba y el foco pasa a la hoja: el ticket que se tocó queda escondido.
    requestAnimationFrame(() => {
      hoja()?.scrollTo({ top: 0 });
      hoja()?.focus({ preventScroll: true });
    });
  }

  function volver() {
    const id = abierto?.id;
    cerrar();
    requestAnimationFrame(() => {
      hoja()?.scrollTo({ top: desplazamiento.current.hoja });
      listaScroll()?.scrollTo({ top: desplazamiento.current.lista });
      lista.current?.querySelector<HTMLElement>(`[data-cierre-id="${id}"]`)?.focus({ preventScroll: true });
    });
  }

  const filtros: { valor: FiltroCierres; texto: string }[] = [
    { valor: "todos", texto: "Todos" },
    { valor: "falto", texto: `Faltó · ${resumen.faltaron.veces}` },
    { valor: "sobro", texto: `Sobró · ${resumen.sobraron.veces}` },
  ];

  return (
    <Modal
      conCerrar
      titulo={abierto ? tituloDelCierre(abierto) : "Historial de cierres"}
      subtitulo={abierto ? bajadaDelCierre(abierto) : `${ubicacionNombre} · ${cierres.length === 0 ? "sin cierres todavía" : `últimos ${cierres.length}`}`}
      onClose={onClose}
      // La hoja crece (o se encoge) al pasar de la lista al detalle con el mismo ritmo de las demás: `ease-cayla`, sin rebote.
      ancho={`${abierto ? ANCHO_DETALLE_CIERRE : "max-w-xl"} transition-[max-width] duration-300 ease-cayla motion-reduce:transition-none`}
      arriba={
        abierto ? (
          <div className="mb-3 flex items-center gap-2.5 pr-10">
            <Volver onClick={volver} a="Historial de cierres" />
            <button type="button" tabIndex={-1} aria-hidden onClick={volver} className="label-cayla text-[11px] text-taupe transition-colors hover:text-tinta">
              Historial de cierres
            </button>
          </div>
        ) : undefined
      }
    >
      <div ref={lista} hidden={abierto !== null}>
        {cierres.length === 0 ? (
          <Vacio tamano="chico" icono={<Wallet />} className="py-8">
            Todavía no hay cierres en esta sede. Aparecerán aquí cuando se cierre la primera caja.
          </Vacio>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <CuentaSello estado="cuadro" texto="Cuadró" veces={resumen.cuadraron} />
              <CuentaSello estado="falto" texto="Faltó" veces={resumen.faltaron.veces} monto={resumen.faltaron.monto} />
              <CuentaSello estado="sobro" texto="Sobró" veces={resumen.sobraron.veces} monto={resumen.sobraron.monto} />
            </div>

            <div role="group" aria-label="Filtrar cierres" className="mt-4 flex flex-wrap gap-2">
              {filtros.map((f) => (
                <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)} className="pildora-cayla">
                  {f.texto}
                </button>
              ))}
            </div>

            <div data-lista-cierres className="scroll-cayla -mx-1 mt-2 max-h-[52vh] overflow-y-auto px-1 pb-1">
              {grupos.length === 0 && (
                <Vacio tamano="chico" icono={<CircleCheck />} className="py-8">
                  {filtro === "falto" ? "En ningún cierre faltó plata." : "En ningún cierre sobró plata."}
                </Vacio>
              )}
              {grupos.map((g) => (
                <section key={g.clave} aria-label={g.etiqueta}>
                  <h3 className="label-cayla sticky top-0 z-10 bg-[var(--fondo-hoja)] pb-2 pt-3 text-[10px] text-tinta/60">{g.etiqueta}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {g.cierres.map((c) => (
                      <li key={c.id}>
                        <Ticket cierre={c} onVer={() => verCierre(c)} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-3 pt-3">
          <p className="text-xs text-tinta/60">Toca un ticket para ver su detalle</p>
          <Link href="/caja/historial" className="label-cayla text-[11px] text-rojo hover:text-rojo-profundo">
            Ver todas las sedes →
          </Link>
        </div>
      </div>
      {abierto && <DetalleCierreContenido cierre={abierto} detalle={detalle} cargando={cargando} error={error} />}
    </Modal>
  );
}

/** Uno de los tres sellos contados de arriba: el sello, cuántas veces y, si no cuadró, cuánto en total. */
function CuentaSello({ estado, texto, veces: n, monto }: { estado: EstadoCierre; texto: string; veces: number; monto?: number }) {
  return (
    <div className="ht-cuenta" data-estado-cierre={estado}>
      <span className="ht-sello">{texto}</span>
      <span className="font-display text-[28px] leading-none text-tinta tabular-nums">{n}</span>
      <span className="text-[11.5px] text-tinta/60">
        {veces(n)}
        {monto !== undefined && n > 0 && <span className="tabular-nums"> · {money(monto)}</span>}
      </span>
    </div>
  );
}

/** Un cierre como el ticket de caja: fecha y horario, lo que debía haber y lo que se contó, cuánto duró el turno y su sello. */
function Ticket({ cierre: c, onVer }: { cierre: CierreCaja; onVer: () => void }) {
  const estado = estadoCierre(c.diferencia);
  const { dia, diaSemana } = bloqueFecha(c.cerradaEn);
  const sello = textoSello(estado, c.diferencia);
  const duracion = duracionTurno(c.abiertaEn, c.cerradaEn);
  return (
    <button
      type="button"
      data-cierre-id={c.id}
      data-estado-cierre={estado}
      onClick={onVer}
      className="ht-ticket"
      aria-label={`Ver el detalle del cierre del ${dia} (${diaSemana}): ${sello}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[22px] leading-none">{dia}</span>
          <span className="label-cayla text-[10px] text-tinta/60">{diaSemana}</span>
        </span>
        <span className="text-[11px] text-tinta/60 tabular-nums">
          {hora(c.abiertaEn)} – {hora(c.cerradaEn)}
        </span>
      </span>
      <span className="ht-corte" aria-hidden />
      <span className="ht-linea text-tinta/70">
        <span>Debía haber</span>
        <span className="font-semibold text-tinta tabular-nums">{money(c.montoCierreSistema)}</span>
      </span>
      <span className="ht-linea text-tinta/70">
        <span>Se contó</span>
        <span className="font-semibold text-tinta tabular-nums">{money(c.montoCierreReal)}</span>
      </span>
      <span className="ht-corte" aria-hidden />
      <span className="flex min-h-[28px] items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-tinta/60">
          {duracion && (
            <>
              <Clock className="h-3.5 w-3.5 flex-none" aria-hidden />
              <span className="truncate tabular-nums">{duracion}</span>
            </>
          )}
        </span>
        <span className="ht-sello">{sello}</span>
      </span>
    </button>
  );
}
