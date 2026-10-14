"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarX, CircleCheck, Clock } from "lucide-react";
import { leerCierresDelMes } from "@/app/actions/caja";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { Vacio } from "@/components/ui/Vacio";
import { Volver } from "@/components/ui/Volver";
import { ANCHO_DETALLE_CIERRE, DetalleCierreContenido, bajadaDelCierre, tituloDelCierre, useDatosDetalleCierre } from "@/components/CierreCajaDetalle";
import { GraficoCierresDelMes } from "@/components/GraficoCierresDelMes";
import type { CierreCaja } from "@/lib/caja";
import { NOMBRES_MES, esMismoMes, type Mes } from "@/lib/facturacion-reglas";
import { bloqueFecha, diaDeLima, duracionTurno, estadoCierre, filtrarCierres, mesDeLima, resumirCierres, type EstadoCierre, type FiltroCierres } from "@/lib/historial-cierres-reglas";
import { EnlaceVer } from "@/components/ui/EnlaceVer";

const claveMes = ({ anio, mes }: Mes) => `${anio}-${mes}`;

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
 * «Historial de cierres» desde la cabecera de Caja: los cierres de esta sede EN UN MES como tickets de caja, cada uno con
 * su sello (CUADRÓ · FALTÓ · SOBRÓ), y arriba los tres sellos contados (Felipe 2026-10-12, maqueta E «Los tickets», elegida
 * entre cinco). Abre siempre en el mes actual; arriba a la derecha se elige otro mes o el año anterior (`SelectorMes`), y
 * sobre los sellos va «Cómo cerró cada día», una barra por cierre con lo que se contó (`GraficoCierresDelMes`, maqueta 1,
 * Felipe el mismo día). El ticket no lleva quién cerró: eso está en el detalle. Tocar un ticket o una barra abre el detalle de ese cierre EN LA
 * MISMA HOJA (Felipe 2026-10-10, opción «A ampliada»): la hoja crece de ancho para dejar los movimientos a la derecha y
 * arriba lleva «← Historial de cierres» para volver. La lista queda montada (escondida) mientras se mira un cierre, así que
 * al volver el filtro y el lugar del desplazamiento siguen donde estaban. La lógica (resumen, filtro, agrupado, estado) vive
 * en `lib/historial-cierres-reglas.ts`; el papel y el sello, en `app/estilos/historial-tickets.css`.
 */
export function HistorialCierresModal({
  cierres: recientes,
  ubicacionId,
  ubicacionNombre,
  onClose,
}: {
  /** Los cierres recientes que la pantalla ya tiene: dibujan el mes actual al instante mientras llega el mes completo. */
  cierres: CierreCaja[];
  ubicacionId: string;
  ubicacionNombre: string;
  onClose: () => void;
}) {
  // Hoy, en Lima: se fija al abrir el modal (el mes actual y el día marcado con «HOY» en el gráfico).
  const [hoy] = useState(() => diaDeLima(new Date().toISOString()));
  const actual: Mes = useMemo(() => ({ anio: hoy.anio, mes: hoy.mes }), [hoy]);
  const [mes, setMes] = useState<Mes>(actual);
  const [porMes, setPorMes] = useState<Record<string, CierreCaja[]>>(() => ({
    [claveMes(actual)]: recientes.filter((c) => c.ubicacionId === ubicacionId && esMismoMes(mesDeLima(c.cerradaEn), actual)),
  }));
  const [leidos, setLeidos] = useState<Set<string>>(() => new Set());
  const [errorMes, setErrorMes] = useState(false);
  const [reintento, setReintento] = useState(0);
  const [filtro, setFiltro] = useState<FiltroCierres>("todos");
  const { abierto, abrir, cerrar, detalle, cargando, error } = useDatosDetalleCierre();
  const lista = useRef<HTMLDivElement>(null);
  const desplazamiento = useRef({ hoja: 0, lista: 0 });

  const clave = claveMes(mes);
  const cierres = useMemo(() => porMes[clave] ?? [], [porMes, clave]);
  const yaLeido = leidos.has(clave);
  const resumen = useMemo(() => resumirCierres(cierres), [cierres]);
  const visibles = useMemo(() => filtrarCierres(cierres, filtro), [cierres, filtro]);
  const nombre = NOMBRES_MES[mes.mes - 1].toLowerCase();

  // Cada mes se lee una vez (el actual también: los recientes pueden no traerlo entero) y queda guardado mientras el
  // modal esté abierto, así que ir y volver entre meses no vuelve a pedir nada.
  useEffect(() => {
    if (leidos.has(clave)) return;
    let vigente = true;
    leerCierresDelMes(ubicacionId, mes.anio, mes.mes)
      .then((filas) => {
        if (!vigente) return;
        setPorMes((p) => ({ ...p, [clave]: filas }));
        setLeidos((l) => new Set(l).add(clave));
        setErrorMes(false);
      })
      .catch(() => {
        if (vigente) setErrorMes(true);
      });
    return () => {
      vigente = false;
    };
  }, [clave, leidos, mes, ubicacionId, reintento]);

  function cambiarMes(m: Mes) {
    setMes(m);
    setFiltro("todos");
    setErrorMes(false);
    listaScroll()?.scrollTo({ top: 0 });
  }

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
      subtitulo={
        abierto
          ? bajadaDelCierre(abierto)
          : `${ubicacionNombre} · ${errorMes ? `${nombre} de ${mes.anio}` : !yaLeido && cierres.length === 0 ? "leyendo…" : cierres.length === 0 ? `sin cierres en ${nombre}` : `${cierres.length} ${cierres.length === 1 ? "cierre" : "cierres"} en ${nombre}`}`
      }
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
        ) : (
          // El mes, a la altura del título y a la izquierda de la ✕ (el Modal no tiene otro lugar para un control ahí).
          <div className="pointer-events-none relative z-[1] -mb-10 flex justify-end pr-9 max-[480px]:mb-2 max-[480px]:justify-start max-[480px]:pr-0">
            <div className="pointer-events-auto" data-guia="caja.historial-mes">
              <SelectorMes valor={mes} actual={actual} onCambiar={cambiarMes} />
            </div>
          </div>
        )
      }
    >
      <div ref={lista} hidden={abierto !== null}>
        {errorMes ? (
          <Aviso tono="error" titulo={`No se pudieron leer los cierres de ${nombre}`} className="mt-3" accion={<button type="button" className="btn-cayla btn-enlace" onClick={() => setReintento((r) => r + 1)}>Reintentar</button>}>
            Revisa la conexión y vuelve a intentarlo.
          </Aviso>
        ) : cierres.length === 0 ? (
          yaLeido && (
            <Vacio
              tamano="chico"
              icono={<CalendarX />}
              className="py-8"
              accion={esMismoMes(mes, actual) ? undefined : { texto: `Ir a ${NOMBRES_MES[actual.mes - 1].toLowerCase()}`, onClick: () => cambiarMes(actual) }}
            >
              {esMismoMes(mes, actual) ? `Todavía no hay cierres en ${nombre}. Aparecerán aquí cuando se cierre la caja.` : `En ${nombre} de ${mes.anio} no hubo cierres en esta sede.`}
            </Vacio>
          )
        ) : (
          <>
            <div data-guia="caja.historial-grafico">
              <GraficoCierresDelMes cierres={cierres} mes={mes} hoy={hoy} onVer={verCierre} />
            </div>

            <div data-guia="caja.historial-cifras" className="mt-2.5 grid grid-cols-3 gap-2">
              <CuentaSello estado="cuadro" texto="Cuadró" veces={resumen.cuadraron} />
              <CuentaSello estado="falto" texto="Faltó" veces={resumen.faltaron.veces} monto={resumen.faltaron.monto} />
              <CuentaSello estado="sobro" texto="Sobró" veces={resumen.sobraron.veces} monto={resumen.sobraron.monto} />
            </div>

            <div role="group" aria-label="Filtrar cierres" data-guia="caja.historial-filtro" className="mt-4 flex flex-wrap gap-2">
              {filtros.map((f) => (
                <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)} data-guia={f.valor === "falto" ? "caja.historial-falto" : undefined} className="pildora-cayla">
                  {f.texto}
                </button>
              ))}
            </div>

            <div data-lista-cierres data-guia="caja.historial-lista" className="scroll-cayla -mx-1 mt-3 max-h-[44vh] overflow-y-auto px-1 pb-1">
              {visibles.length === 0 ? (
                <Vacio tamano="chico" icono={<CircleCheck />} className="py-8">
                  {filtro === "falto" ? `En ningún cierre de ${nombre} faltó plata.` : `En ningún cierre de ${nombre} sobró plata.`}
                </Vacio>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visibles.map((c) => (
                    <li key={c.id}>
                      <Ticket cierre={c} onVer={() => verCierre(c)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        <div data-guia="caja.historial-pie" className="flex items-center justify-between gap-3 pt-3">
          <p className="text-xs text-tinta/60">{cierres.length > 0 ? "Toca un ticket o una barra para ver su detalle" : ""}</p>
          <EnlaceVer href="/caja/historial">Ver todas las sedes</EnlaceVer>
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
      <span className="font-display text-[24px] leading-none text-tinta tabular-nums">{n}</span>
      <span className="text-left text-[11px] leading-tight text-tinta/60">
        {veces(n)}
        {monto !== undefined && n > 0 && <span className="block tabular-nums">{money(monto)}</span>}
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
