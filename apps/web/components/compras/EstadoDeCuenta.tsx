"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronDown, HandCoins, ShoppingBag, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { RangoRendimiento } from "@/components/rendimiento/RangoRendimiento";
import { AnularMovimientoFondo } from "@/components/fondos/AccionesFondos";
import { DIAS_ABIERTOS, LINEAS_PARA_PLEGAR, diasDeCuenta, totalesDeCuenta, type DiaDeCuenta, type LineaDeCuenta } from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaCorto } from "@/lib/orden-pagina-reglas";
import { PRESETS, presetDeTramo, tramoCorto, type Tramo } from "@/lib/rendimiento-vista-reglas";

// El estado de cuenta de una persona (ADR-0704, act. 2026-11-26 d): lo que le diste entra con «+» y lo que compró sale con «−», día por día.
// Se mira por FECHAS, con el mismo control de período de Gestión ▸ Rendimiento (Hoy · 7 días · Este mes · Rango y su calendario): la URL manda.
// Pensado para crecer: cada día lleva su subtotal y, pasadas las 12 líneas, solo los dos días más nuevos van abiertos y aparece «Pendiente».

const ICONO: Record<LineaDeCuenta["clase"], LucideIcon> = { compra: ShoppingBag, entrega: ArrowDownLeft, devolucion: ArrowUpRight, pago_deuda: HandCoins };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function EstadoDeCuenta({ lineas, tramo, hoy }: { lineas: LineaDeCuenta[]; tramo: Tramo; hoy: string }) {
  const [soloPendiente, setSoloPendiente] = useState(false);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const pendientes = lineas.filter((l) => l.pendiente !== null);
  const larga = lineas.length > LINEAS_PARA_PLEGAR;
  const filtrando = soloPendiente && pendientes.length > 0;
  const dias = diasDeCuenta(filtrando ? pendientes : lineas);
  const total = totalesDeCuenta(lineas);
  // Filtrando lo pendiente no se pliega nada: lo que se pidió ver, se ve.
  const plegar = larga && !filtrando;
  const alternar = (dia: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(dia)) n.delete(dia);
      else n.add(dia);
      return n;
    });

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-2">
          {larga && pendientes.length > 0 && (
            <>
              <button type="button" className="pildora-cayla" aria-pressed={!filtrando} onClick={() => setSoloPendiente(false)}>
                Todo
                <span className="pildora-cayla__n">{lineas.length}</span>
              </button>
              <button type="button" className="pildora-cayla" aria-pressed={filtrando} onClick={() => setSoloPendiente(true)}>
                Pendiente
                <span className="pildora-cayla__n">{pendientes.length}</span>
              </button>
            </>
          )}
        </div>
        <Periodo tramo={tramo} hoy={hoy} />
      </div>

      {lineas.length > 0 && (
        <p className="flex flex-wrap items-baseline justify-end gap-x-4 px-1 text-detalle text-secundario">
          <span className="mr-auto">{tramoCorto(tramo)}</span>
          {total.entro > 0.005 && <span className="whitespace-nowrap tabular-nums text-verde">+ {soles(total.entro)}</span>}
          {total.salio > 0.005 && <span className="whitespace-nowrap tabular-nums text-tinta">− {soles(total.salio)}</span>}
        </p>
      )}

      <div className="card-cayla p-0" data-guia="comprador.compras">
        {dias.length === 0 && <p className="px-6 py-10 text-center text-sm text-secundario">Sin movimientos en estas fechas.</p>}
        {dias.map((d, i) => {
          const plegable = plegar && i >= DIAS_ABIERTOS;
          const abierto = !plegable || abiertos.has(d.dia);
          const borde = i > 0 ? "border-t border-sand" : "";
          return (
            <section key={d.dia} className={borde}>
              {plegable ? (
                <h3>
                  <button type="button" aria-expanded={abierto} onClick={() => alternar(d.dia)} className="flex w-full items-center gap-4 px-5 py-4 text-left sm:px-6 vd-pasa">
                    <CabeceraDia d={d} />
                    <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-tenue transition-transform duration-300 ${abierto ? "rotate-180" : ""}`} />
                  </button>
                </h3>
              ) : (
                <h3 className="flex items-baseline gap-4 px-5 pb-2 pt-4 sm:px-6">
                  <CabeceraDia d={d} />
                </h3>
              )}
              {abierto && (
                <ul className="pb-2">
                  {d.lineas.map((l) => (
                    <Linea key={l.id} l={l} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function CabeceraDia({ d }: { d: DiaDeCuenta }) {
  return (
    <>
      <span className="mr-auto text-xs font-semibold uppercase tracking-[0.1em] text-secundario">{diaCorto(d.dia)}</span>
      <span className="flex flex-wrap items-baseline justify-end gap-x-4 text-detalle font-normal text-secundario">
        {d.compras > 0 && <span className="hidden sm:inline">{plural(d.compras, "compra", "compras")}</span>}
        {d.entro > 0.005 && <span className="whitespace-nowrap tabular-nums text-verde">+ {soles(d.entro)}</span>}
        {d.salio > 0.005 && <span className="whitespace-nowrap tabular-nums text-tinta">− {soles(d.salio)}</span>}
      </span>
    </>
  );
}

function Linea({ l }: { l: LineaDeCuenta }) {
  const Icono = ICONO[l.clase];
  const entra = l.signo === "+";
  const extra = l.anulada ? (
    <Chip tono="apagado" tachado={false}>
      Anulada
    </Chip>
  ) : l.pendiente ? (
    <Chip tono="ambar">{l.pendiente}</Chip>
  ) : l.movimiento?.puedeAnular ? (
    <AnularMovimientoFondo movimiento={l.movimiento} />
  ) : null;
  return (
    <li className="flex items-center gap-4 px-5 py-3 sm:px-6">
      <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${l.anulada ? "border border-dashed border-taupe/40 text-taupe" : entra ? "bg-verde/10 text-verde" : "vd-gota-chica text-tinta"}`}>
        <Icono className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${l.anulada ? "text-secundario line-through" : "text-tinta"}`}>{l.titulo}</span>
        {l.detalle && <span className="block text-detalle text-secundario">{l.detalle}</span>}
        {extra && <span className="mt-2 block sm:hidden">{extra}</span>}
      </span>
      {extra && <span className="hidden shrink-0 sm:block">{extra}</span>}
      <span className={`shrink-0 text-right font-display text-lg leading-tight tabular-nums sm:w-36 ${l.anulada ? "text-secundario line-through" : entra ? "text-verde" : "text-tinta"}`}>
        {l.signo && `${l.signo} `}
        {soles(l.monto)}
      </span>
    </li>
  );
}

/** El control de período, el mismo de Rendimiento: lo elegido va a la URL y la página vuelve a armar las líneas. */
function Periodo({ tramo, hoy }: { tramo: Tramo; hoy: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const control = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const preset = presetDeTramo(tramo, hoy);
  useEffect(() => {
    boton.current = control.current?.querySelector<HTMLElement>('[data-guia="comprador.rango"]') ?? null;
  });
  const ir = (consulta: string) => router.push(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
  return (
    <div ref={control} data-guia="comprador.periodo">
      <SegmentoDeslizante
        forma="modo"
        etiqueta="Período"
        valor={preset ?? "rango"}
        opciones={[
          ...PRESETS.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta })),
          {
            clave: "rango",
            etiqueta: preset === null ? <span className="tabular-nums">{tramoCorto(tramo)}</span> : "Rango",
            icono: <CalendarDays aria-hidden className="h-4 w-4" />,
            ayuda: "Elige un rango de fechas (hasta 30 días)",
            guia: "comprador.rango",
          },
        ]}
        onCambio={(c) => (c === "rango" ? setAbierto(true) : ir(c === "mes" ? "" : `vista=${c}`))}
      />
      {abierto && (
        <RangoRendimiento
          actual={preset === null ? tramo : null}
          hoy={hoy}
          control={control}
          volverA={boton}
          onAplicar={(t) => {
            setAbierto(false);
            ir(`desde=${t.desde}&hasta=${t.hasta}`);
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  );
}
