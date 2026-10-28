"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Anillo } from "@/components/ui/Anillo";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Linea } from "@/components/ui/Linea";
import { useCountUp } from "@/lib/useCountUp";
import { Wallet } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import {
  curvaAcumulada,
  horaTexto,
  horasComparadas,
  mejorYPeorHora,
  metodosComparados,
  valorEn,
  veredicto,
  type HoraComparada,
  type PagoDelDia,
} from "@/lib/caja-comparativa-reglas";

// Caja compara hoy contra ayer (ADR-0319; maqueta `docs/maquetas/caja-comparativa-2026-10/`, diseño A). Solo dibuja: toda la
// cuenta vive en `lib/caja-comparativa-reglas.ts`. `ahoraMin` (minuto del día en Lima) lo renueva el panel cada minuto, y con
// él se recalcula TODO: el titular, el anillo, el punto del gráfico y la hora en curso. Movimiento (ADR-0136): cada efecto
// responde a algo (cifras que cuentan al cambiar, línea que se revela al abrir, barras que crecen); nada en bucle.

const soles = (n: number) => "S/\u00a0" + Math.round(n).toLocaleString("es-PE");
const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  yape: "var(--color-metodo-yape)",
  tarjeta: "var(--color-metodo-tarjeta)",
  plin: "var(--color-metodo-plin)",
  transferencia: "var(--color-metodo-transferencia)",
};
const NOMBRE_METODO: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", tarjeta: "Tarjeta", plin: "Plin", transferencia: "Transferencia" };

type Props = { hoy: readonly PagoDelDia[]; ayer: readonly PagoDelDia[]; ahoraMin: number; horaCierreMin: number | null };

function Cuenta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  return <>{formato(useCountUp(valor))}</>;
}

/** El titular: lo primero que se lee. Contra el día COMPLETO de ayer (sin metas diarias, Felipe 2026-10-02). */
export function VeredictoCaja({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const v = useMemo(() => veredicto(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const pct = Math.min(100, v.pctDelDiaDeAyer);
  // Una sola idea, en soles y hablándole a quien vende: cuánto falta para igualar ayer y cómo va a esta hora. Sin dos porcentajes
  // distintos (el del día y el de la hora) que se lean como una contradicción.
  const difHora = v.hoy - v.ayerAEstaHora;
  return (
    <section data-guia="caja.veredicto" className="cmp-heroe anim-sube" style={{ "--i": 0 } as CSSProperties} aria-label="Cómo vas contra ayer">
      <div className="min-w-0">
        <p className="cmp-sobre">Hoy contra ayer · a las {horaTexto(ahoraMin)}</p>
        <h2 className="cmp-frase">
          {v.ayerDia === 0 ? (
            <>Ayer no hubo ventas con las que compararte</>
          ) : v.superado ? (
            <>
              Ya <em>superaste</em> lo que vendiste ayer
            </>
          ) : (
            <>
              Te faltan <em><Cuenta valor={v.falta} formato={soles} /></em> para igualar ayer
            </>
          )}
        </h2>
        {v.ayerDia > 0 && (
          <p className="cmp-det">
            Ayer vendiste <b>{soles(v.ayerDia)}</b> en todo el día.
            {v.superado ? (
              <> Hoy ya llevas <b>{soles(v.hoy - v.ayerDia)}</b> más.</>
            ) : v.ayerAEstaHora > 0 ? (
              <>
                {" "}A esta hora ya llevabas <b>{soles(v.ayerAEstaHora)}</b>: hoy vas{" "}
                <b>{Math.abs(Math.round(difHora)) === 0 ? "igual" : `${soles(Math.abs(difHora))} ${difHora > 0 ? "por encima" : "por debajo"}`}</b>.
              </>
            ) : null}
          </p>
        )}
        <p className="cmp-chips">
          <span>Vendido hoy <b><Cuenta valor={v.hoy} formato={soles} /></b></span>
          <span>Ventas <b>{v.ticketsHoy}</b></span>
          <span>Venta promedio <b>{soles(v.ticketPromedio)}</b></span>
        </p>
      </div>
      {/* El anillo del sistema (ronda 13), grande y sobre la tinta del titular: se cierra al llegar y pasa a verde al alcanzar a ayer. */}
      <div className="cmp-anillo">
        <Anillo pct={pct} tamano="grande" sobreTinta etiqueta={`Llevas ${soles(v.hoy)} de los ${soles(v.ayerDia)} de ayer`}>
          <b className="cmp-anillo-monto"><Cuenta valor={v.hoy} formato={soles} /></b>
          <span className="cmp-anillo-de">de {soles(v.ayerDia)}<br />de ayer</span>
        </Anillo>
      </div>
    </section>
  );
}

/** Clientes y ticket: qué mueve la diferencia. */
export function ClientesYTicket({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const v = useMemo(() => veredicto(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const tpAyer = v.ticketsAyerAEstaHora > 0 ? v.ayerAEstaHora / v.ticketsAyerAEstaHora : 0;
  return (
    <div data-guia="caja.ventas-hechas" className="card-cayla anim-sube p-5" style={{ "--i": 2 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Ventas hechas</p>
      <p className="text-xs text-tinta/50">Hoy, comparado con ayer a esta misma hora</p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="label-cayla text-[10.5px] text-tinta/50">Número de ventas</p>
          <p className="font-display text-[34px] leading-tight tabular-nums text-tinta"><Cuenta valor={v.ticketsHoy} formato={(n) => String(Math.round(n))} /></p>
          <Delta a={v.ticketsHoy} b={v.ticketsAyerAEstaHora} />
          <p className="mt-1 text-[12.5px] text-tinta/65">ayer a esta hora: {v.ticketsAyerAEstaHora}</p>
        </div>
        <div>
          <p className="label-cayla text-[10.5px] text-tinta/50">Cuánto vale cada venta</p>
          <p className="font-display text-[34px] leading-tight tabular-nums text-tinta"><Cuenta valor={v.ticketPromedio} formato={soles} /></p>
          <Delta a={v.ticketPromedio} b={tpAyer} />
          <p className="mt-1 text-[12.5px] text-tinta/65">ayer a esta hora: {soles(tpAyer)}</p>
        </div>
      </div>
    </div>
  );
}

/** ▲ verde si sube, ▼ ámbar si baja. «Aún no llegas» no es «vas mal»: por eso ámbar y no rojo. */
function Delta({ a, b }: { a: number; b: number }) {
  if (!b) return null;
  const p = ((a - b) / b) * 100;
  const r = Math.round(Math.abs(p));
  if (r < 1) return <span className="cmp-delta cmp-delta-eq">= igual</span>;
  return <span className={`cmp-delta ${p > 0 ? "cmp-delta-sube" : "cmp-delta-baja"}`}>{p > 0 ? "▲" : "▼"} {r} %</span>;
}

/** Venta acumulada del día: hoy (hasta ahora) contra ayer (día completo), con un cursor que lee cada minuto. Es la línea del sistema
 *  (ronda 14 de /unificar): lo de hoy en tinta con su área, ayer en taupe punteado; si vas arriba o abajo lo dicen el titular y el globito. */
export function GraficoAcumulado({ hoy, ayer, ahoraMin, horaCierreMin }: Props) {
  const curva = useMemo(() => curvaAcumulada(hoy, ayer, ahoraMin, horaCierreMin), [hoy, ayer, ahoraMin, horaCierreMin]);
  const lineaHoy = useMemo(() => curva.hoy.map((p) => ({ x: p.minuto, y: p.monto })), [curva]);
  const lineaAyer = useMemo(() => curva.ayer.map((p) => ({ x: p.minuto, y: p.monto })), [curva]);
  const max = Math.max(4000, Math.ceil(Math.max(...curva.hoy.map((p) => p.monto), ...curva.ayer.map((p) => p.monto), 1) / 2000) * 2000);
  const ultimo = curva.hoy[curva.hoy.length - 1]!;
  const horas: number[] = [];
  for (let m = curva.desdeMin; m <= curva.hastaMin; m += 120) horas.push(m);

  return (
    <div data-guia="caja.acumulada" className="card-cayla anim-sube p-5" style={{ "--i": 4 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Venta acumulada del día</p>
      <p className="text-xs text-tinta/50">Pasa el mouse por la línea: cada hora te dice cuánto ganas o pierdes</p>
      <Linea
        className="mt-2"
        serie={lineaHoy}
        referencia={lineaAyer}
        desde={curva.desdeMin}
        hasta={curva.hastaMin}
        maxY={max}
        marcasX={horas.map((m) => ({ x: m, texto: `${m / 60}h` }))}
        ahora={{ x: ahoraMin, texto: `ahora ${horaTexto(ahoraMin)}` }}
        cifra={soles(ultimo.monto)}
        continuo
        guiaHasta={ahoraMin}
        leer={(m) => {
          const cH = valorEn(curva.hoy, m);
          const cA = valorEn(curva.ayer, m);
          return (
            <>
              <span className="block opacity-65 dark:opacity-85">hasta las {horaTexto(m)}</span>
              <span className="block">Hoy <b>{soles(cH)}</b></span>
              <span className="block">Ayer <b>{soles(cA)}</b></span>
              <b className={`block ${cH >= cA ? "cmp-tip-sube" : "cmp-tip-baja"}`}>{cH >= cA ? "▲ +" : "▼ −"}{soles(Math.abs(cH - cA))}</b>
            </>
          );
        }}
        alto={240}
        etiqueta="Venta acumulada por hora, hoy contra ayer"
      />
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta/65">
        <span><i className="cmp-leyenda" style={{ borderColor: "var(--color-tinta)" }} />Hoy, hasta ahora</span>
        <span><i className="cmp-leyenda cmp-leyenda-raya" style={{ borderColor: "var(--color-taupe)" }} />Ayer, día completo</span>
      </p>
    </div>
  );
}

/** Cómo te pagaron: la barra es hoy; la marca es lo que vendió ayer en TODO el día con ese medio. */
export function ComoTePagaron({ hoy, ayer }: Pick<Props, "hoy" | "ayer">) {
  const filas = useMemo(() => metodosComparados(hoy, ayer), [hoy, ayer]);
  const mx = Math.max(1, ...filas.map((f) => Math.max(f.hoy, f.ayerDia))) * 1.08;
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDentro(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div data-guia="caja.como-pagaron" className="card-cayla anim-sube p-5" style={{ "--i": 5 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Cómo te pagaron</p>
      <p className="text-xs text-tinta/50">Lo que cobraste hoy por cada medio, y lo que cobraste ayer en todo el día</p>
      {filas.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" className="mt-2 px-0" icono={<Wallet />}>Sin ventas todavía.</Vacio>
      ) : (
        <div className="mt-2">
          {filas.map((f, i) => (
            <div key={f.metodo} className="cmp-metodo">
              <span className="inline-flex items-center gap-1.5 text-[13px]"><i className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO[f.metodo] ?? "var(--color-taupe)" }} />{NOMBRE_METODO[f.metodo] ?? f.metodo}</span>
              <span className="cmp-carril">
                <span className="cmp-carril-barra" style={{ width: dentro ? `${(f.hoy / mx) * 100}%` : 0, background: COLOR_METODO[f.metodo] ?? "var(--color-taupe)", transitionDelay: `${i * 70}ms` }} />
                <span className="cmp-carril-marca" style={{ left: `${(f.ayerDia / mx) * 100}%` }} title="Dónde terminó ayer este medio" />
              </span>
              <span className="text-right text-[13px] tabular-nums"><b>{soles(f.hoy)}</b><br /><span className="text-[11.5px] text-tinta/60">ayer {soles(f.ayerDia)}</span></span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-tinta/65">La barra de color es hoy. La marca negra es dónde terminó ayer ese medio.</p>
    </div>
  );
}

/** Dónde ganas y dónde pierdes: cada hora de hoy menos la misma hora de ayer. La hora en curso va rayada y se compara por minutos. */
export function DondeGanasYPierdes({ hoy, ayer, ahoraMin }: Omit<Props, "horaCierreMin">) {
  const filas = useMemo(() => horasComparadas(hoy, ayer, ahoraMin), [hoy, ayer, ahoraMin]);
  const { mejor, peor } = mejorYPeorHora(filas);
  const rotulo = (f: HoraComparada) => (f.enCurso ? `${f.hora}:00–${horaTexto(ahoraMin)}` : `${f.hora}–${f.hora + 1}h`);
  return (
    <div data-guia="caja.donde-ganas" className="card-cayla anim-sube p-5" style={{ "--i": 6 } as CSSProperties}>
      <p className="text-sm font-bold text-tinta">Dónde ganas y dónde pierdes</p>
      <p className="text-xs text-tinta/65">Cada barra es una hora: lo que vendiste hoy en ella, menos lo que vendiste ayer en esa misma hora</p>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs font-semibold"><span className="text-verde-profundo">▲ Hacia arriba: vendiste más que ayer</span><span className="text-ambar">▼ Hacia abajo: vendiste menos que ayer</span></p>
      {/* Las barras por tiempo del sistema (ronda 14): hacia arriba en verde lo que vendiste de más, hacia abajo en ámbar lo de menos. */}
      <BarrasTiempo
        className="mt-4"
        alto={150}
        cifras="todas"
        barras={filas.map((f) => ({
          clave: String(f.hora),
          valor: f.diferencia,
          etiqueta: rotulo(f),
          fuerte: f.enCurso,
          tono: f.diferencia >= 0 ? "verde" : "ambar",
          rayada: f.enCurso,
          cifra: f.diferencia >= 0 ? `+${Math.round(f.diferencia)}` : `−${Math.round(-f.diferencia)}`,
          tip: `${rotulo(f)}${f.enCurso ? " (en curso)" : ""} · hoy ${soles(f.hoy)} · ayer ${soles(f.ayer)}`,
        }))}
        etiqueta="Dónde ganas y dónde pierdes: cada hora de hoy menos la misma hora de ayer"
      />
      <p className="mt-3 text-xs text-tinta/65"><b>La barra rayada es la hora que aún no termina:</b> se compara solo hasta los mismos minutos de ayer.</p>
      <p className="mt-3 rounded-xl bg-hueso px-3.5 py-3 text-[13.5px] text-tinta">
        {mejor ? <>Tu mejor hora fue la de las <b>{mejor.hora}:00</b> (+{soles(mejor.diferencia)}). </> : <>Todavía no superas a ayer en ninguna hora. </>}
        {peor ? <>La más floja, las <b>{peor.hora}:00</b> (−{soles(-peor.diferencia)}).</> : <>No has cedido terreno en ninguna hora.</>}
      </p>
    </div>
  );
}

/** El tramo de comparativa de la pantalla de Caja: titular, referencia, clientes y ticket, gráfico, medios de pago y horas. */
export function ComparativaCaja({
  hoy,
  ayer,
  ahoraMin,
  horaCierreMin,
  cajon,
  movimientos,
  reparto = null,
}: Props & { cajon: React.ReactNode; movimientos: React.ReactNode; /** De quién es lo vendido (ADR-0532), solo en Lima. */ reparto?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <VeredictoCaja hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
      {reparto}
      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-2">
        {cajon}
        <ClientesYTicket hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
      </div>
      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <GraficoAcumulado hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} horaCierreMin={horaCierreMin} />
        <ComoTePagaron hoy={hoy} ayer={ayer} />
      </div>
      <div className="grid grid-cols-1 gap-3 @[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <DondeGanasYPierdes hoy={hoy} ayer={ayer} ahoraMin={ahoraMin} />
        {movimientos}
      </div>
    </div>
  );
}
