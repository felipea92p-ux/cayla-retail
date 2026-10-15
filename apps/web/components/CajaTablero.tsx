"use client";

// Las piezas de Caja como pantalla de trabajo (spike docs/maquetas/caja-tablero-spike-2026-09/, aprobado por Felipe el
// 2026-09-26). Las usa `CajaAbiertaPanel`. La lógica pura vive en `lib/caja-tablero-reglas.ts`; las lecturas, en
// `lib/caja-tablero.ts`.

import Link from "next/link";
import { Globito } from "@/components/ui/Globito";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowDownToLine,
  Bookmark,
  Check,
  CornerUpLeft,
  History,
  Lock,
  Plus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Encabezado, celda, fila, type Columna } from "@/components/ui/Tabla";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { claveLocal, guardar, leer } from "@/lib/almacen-local";
import {
  MODOS_CIERRES,
  TARJETAS_CAJA,
  cierresPorDia,
  cuadreDe,
  esModoCierres,
  modoCierresPredeterminado,
  resumenCuadres,
  sonLasPredeterminadas,
  tarjetasElegidas,
  type ClaveCuadre,
  type ModoCierres,
  type PiezaCajon,
  type TarjetaCaja,
  cobradoDelTurno,
  notaDeRedondeo,
} from "@/lib/caja-tablero-reglas";
import type { CierreCaja } from "@/lib/caja";
import type { ContextoTableroCaja } from "@/lib/caja-tablero";
import { TEXTO_MEDIO } from "@/lib/gastos-reglas";
import { diaLima } from "@/lib/fechas-lima";
import { Vacio } from "@/components/ui/Vacio";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { BarraApilada } from "@/components/ui/BarraApilada";

const soles = (n: number) => `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/\u00a0${Math.round(n).toLocaleString("es-PE")}`;

const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  tarjeta: "var(--color-metodo-tarjeta)",
  yape: "var(--color-metodo-yape)",
  transferencia: "var(--color-metodo-transferencia)",
  qr: "var(--color-metodo-qr)",
  otro: "var(--color-taupe)",
};

/* ------------------------------------------------------------------
   Cifras de arriba
   ------------------------------------------------------------------ */

/** «Efectivo en el cajón ahora»: el total lo dice la base (`fn_resumen_caja` → `fn_calcular_esperado_caja`, ADR-0186);
 *  aquí solo se muestran sus piezas. Sin total (la base no se lo da a esta cuenta) quedan las piezas y el porqué. */
export function TarjetaCajon({ esperado, piezas, indice }: { esperado: number | null; piezas: PiezaCajon[]; indice: number }) {
  const [enteros, centimos] = esperado === null ? [null, null] : soles(esperado).split(".");
  return (
    <div data-guia="caja.cajon" className="card-cayla anim-sube relative flex flex-col border-l-[3px] p-5" style={{ "--i": indice, borderLeftColor: "var(--color-metodo-efectivo)" } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-cayla text-[11px]" style={{ color: "var(--color-metodo-efectivo-tinta)" }}>
          Efectivo en el cajón ahora
        </p>
        <Lock size={16} aria-hidden className="text-tinta/50" />
      </div>
      {esperado === null ? (
        <p className="mt-3 text-sm text-taupe">El total lo ve quien cierra la caja. Estas son sus piezas:</p>
      ) : (
        <p className="font-display mt-2.5 text-[44px] leading-none text-tinta tabular-nums lining-nums">
          {enteros}
          <span className="text-[26px]">.{centimos}</span>
        </p>
      )}
      <p className="mt-3.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-tinta/65 tabular-nums">
        {piezas.map((p, i) => (
          <span key={p.etiqueta} className="whitespace-nowrap">
            {i > 0 && <span className="mr-2 text-tinta/40 dark:text-tinta/55">{p.signo}</span>}
            {p.etiqueta} <b className="font-semibold text-tinta">{soles(p.monto)}</b>
          </span>
        ))}
      </p>
      <p className="mt-auto hidden pt-3 text-xs text-tinta/50 sm:block">Tarjeta, Yape y transferencias no entran al cajón.</p>
    </div>
  );
}

/** «Cobrado en el turno»: lo que entró hoy por cada forma de pago, sin el adelanto de separaciones (se cobró antes). */
export function TarjetaCobrado({ porMetodo, redondeo = 0, indice }: { porMetodo: Partial<Record<string, number>>; redondeo?: number; indice: number }) {
  const c = cobradoDelTurno(porMetodo);
  const notaRedondeo = notaDeRedondeo(redondeo, soles);
  return (
    <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": indice } as CSSProperties}>
      <p className="label-cayla text-[11px] text-tinta/65">Cobrado en el turno</p>
      <p className="font-display mt-2.5 text-[32px] leading-none text-tinta tabular-nums lining-nums">{soles(c.total)}</p>
      {c.metodos.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" className="mt-2 px-0" icono={<Wallet />}>Sin ventas todavía.</Vacio>
      ) : (
        <>
          {/* La barra es `<BarraApilada>` (ADR-0358): un tramo por método, con su token de color; decorativa, la leyenda de abajo ya dice los montos. */}
          <BarraApilada
            decorativa
            className="mt-4"
            alto={8}
            total={c.total}
            segmentos={c.metodos.map((m) => ({ clave: m.clave, nombre: m.texto, valor: m.monto, color: COLOR_METODO[m.clave] }))}
          />
          <p className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-tinta/65 tabular-nums">
            {c.metodos.map((m) => (
              <span key={m.clave} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO[m.clave] }} />
                {m.texto} <b className="font-semibold text-tinta">{soles0(m.monto)}</b>
              </span>
            ))}
          </p>
        </>
      )}
      {c.anticipo > 0 && (
        <p className="mt-3 rounded-lg bg-hueso px-2.5 py-1.5 text-[11.5px] text-tinta/70">
          + {soles(c.anticipo)} de adelantos aplicados: se cobraron el día que se separó, no suman hoy.
        </p>
      )}
      {notaRedondeo && <p className="mt-3 rounded-lg bg-hueso px-2.5 py-1.5 text-[11.5px] text-tinta/70">{notaRedondeo}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------
   Accesos: botones para HACER
   ------------------------------------------------------------------ */

export type AccesosCaja = { vender: boolean; cambios: boolean; devoluciones: boolean; apartados: boolean };

type Acceso = { clave: string; icono: ReactNode; titulo: string; detalle: string; href?: string; onClick?: () => void; principal?: boolean; insignia?: string };

function tarjetaAcceso(a: Acceso) {
  const clase = `group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,transform] duration-200 [transition-timing-function:var(--ease-cayla)] hover:-translate-y-px ${
    a.principal ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel hover:border-taupe"
  }`;
  const contenido = (
    <>
      <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg ${a.principal ? "bg-crema/15" : "bg-hueso"}`}>{a.icono}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-tight">{a.titulo}</span>
        <span className={`mt-0.5 block text-[11.5px] leading-snug ${a.principal ? "text-crema/70" : "text-tinta/60"}`}>{a.detalle}</span>
        {a.insignia && (
          <Chip tono="ambar" className="mt-1.5">
            {a.insignia}
          </Chip>
        )}
      </span>
    </>
  );
  return a.href ? (
    <Link key={a.clave} href={a.href} className={clase}>
      {contenido}
    </Link>
  ) : (
    <button key={a.clave} type="button" onClick={a.onClick} className={clase}>
      {contenido}
    </button>
  );
}

/** Los botones de la computadora: todo lo que se hace alrededor de la caja, a un clic. Solo los módulos que la cuenta ve. */
export function AccesosCajaEscritorio({
  accesos,
  onGasto,
  onIngreso,
  apartadosPorCobrar,
}: {
  accesos: AccesosCaja;
  onGasto: (() => void) | null;
  onIngreso: () => void;
  apartadosPorCobrar: number;
}) {
  const lista: Acceso[] = [];
  if (accesos.vender) lista.push({ clave: "vender", icono: <ShoppingCart size={20} aria-hidden />, titulo: "Cobrar", detalle: "Abre el Punto de venta", href: "/vender", principal: true });
  if (onGasto) lista.push({ clave: "gasto", icono: <Receipt size={20} aria-hidden />, titulo: "Registrar gasto", detalle: "Sale del cajón y va a Finanzas", onClick: onGasto });
  lista.push({ clave: "ingreso", icono: <ArrowDownToLine size={20} aria-hidden />, titulo: "Registrar ingreso", detalle: "Sencillo, líder u otra sede", onClick: onIngreso });
  if (accesos.cambios || accesos.devoluciones)
    lista.push({ clave: "posventa", icono: <ArrowLeftRight size={20} aria-hidden />, titulo: "Cambio o devolución", detalle: "Si devuelves plata, sale de aquí", href: accesos.cambios ? "/cambios" : "/devoluciones" });
  if (accesos.apartados)
    lista.push({ clave: "apartados", icono: <Bookmark size={20} aria-hidden />, titulo: "Apartados", detalle: "Cobrar saldo o separar", href: "/vender/apartados", insignia: apartadosPorCobrar > 0 ? `${apartadosPorCobrar} por cobrar` : undefined });
  return (
    <div className="hidden sm:block">
      <p className="label-cayla mb-2 text-[11px] text-tinta/60">Hacer</p>
      <div className="grid grid-cols-2 gap-2.5 @[800px]:grid-cols-3 @[1100px]:grid-cols-5">{lista.map(tarjetaAcceso)}</div>
    </div>
  );
}

/** Los accesos del celular, con el formato de «Accesos» del Inicio (ícono sobre la palabra). Lo que ya está en la
 *  barra fija (Vender, Gasto, Ingreso, Cerrar) no se repite. */
export function AccesosCajaMovil({ accesos, apartadosPorCobrar }: { accesos: AccesosCaja; apartadosPorCobrar: number }) {
  const lista: { clave: string; icono: ReactNode; texto: string; href: string; n?: number }[] = [];
  if (accesos.apartados) lista.push({ clave: "apartados", icono: <Bookmark size={20} aria-hidden />, texto: "Apartados", href: "/vender/apartados", n: apartadosPorCobrar });
  if (accesos.cambios) lista.push({ clave: "cambios", icono: <ArrowLeftRight size={20} aria-hidden />, texto: "Cambios", href: "/cambios" });
  if (accesos.devoluciones) lista.push({ clave: "devoluciones", icono: <CornerUpLeft size={20} aria-hidden />, texto: "Devoluciones", href: "/devoluciones" });
  if (lista.length === 0) return null;
  return (
    <div className="sm:hidden">
      <p className="label-cayla mb-2 text-[11px] text-tinta/60">Accesos</p>
      <div className="grid grid-cols-3 gap-2">
        {lista.map((a) => (
          <Link key={a.clave} href={a.href} className="relative flex flex-col items-center gap-1.5 rounded-xl border border-sand bg-papel px-1 py-3.5 text-[12.5px] text-tinta">
            {a.n ? <Globito n={a.n} pide esquina etiqueta="por cobrar" className="absolute right-1.5 top-1.5" /> : null}
            {a.icono}
            {a.texto}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Barra fija del celular: el mismo patrón que el Inicio —una acción ancha y oscura + cuadrados—. NO es un menú (la
 *  navegación del celular es el cajón ☰, ADR-0206): solo acciones de ESTA pantalla. */
export function BarraCajaMovil({
  vender,
  onGasto,
  onIngreso,
  onCerrar,
}: {
  vender: boolean;
  onGasto: (() => void) | null;
  onIngreso: () => void;
  onCerrar: (() => void) | null;
}) {
  const cuadrado = "flex h-14 w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-sand bg-papel text-[10px] font-semibold text-tinta/80 active:scale-[0.97]";
  return (
    <div data-guia="caja.barra-movil" className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
      {vender && (
        <Link href="/vender" className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema">
          <ShoppingBag size={16} aria-hidden /> Vender
        </Link>
      )}
      {onGasto && (
        <button type="button" onClick={onGasto} className={cuadrado} aria-label="Registrar gasto">
          <Receipt size={16} aria-hidden />
          Gasto
        </button>
      )}
      <button type="button" onClick={onIngreso} className={`${cuadrado} ${vender ? "" : "flex-1"}`} aria-label="Registrar ingreso">
        <ArrowDownToLine size={16} aria-hidden />
        Ingreso
      </button>
      {onCerrar && (
        // ADR-0318: «Cerrar» es el único cuadrado en rojo de acento: lo que hay que hacer al terminar el turno.
        <button type="button" onClick={onCerrar} className={`${cuadrado} !border-rojo !bg-rojo !text-crema`} aria-label="Cerrar caja">
          <Lock size={16} aria-hidden />
          Cerrar
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Tarjetas elegibles: filtros para VER
   ------------------------------------------------------------------ */

const NOMBRE_TARJETA: Record<TarjetaCaja, string> = {
  pendientes: "Pendientes",
  apartados: "Apartados",
  gastos: "Gastos",
  posventa: "Cambios y devoluciones",
};

/** La elección se recuerda en ESTE aparato (como las píldoras de filtro del ERP), por sede. Se lee después de montar:
 *  el servidor no tiene `localStorage` y el primer render tiene que coincidir. */
function useTarjetasElegidas(ubicacionId: string, disponibles: readonly TarjetaCaja[]) {
  const clave = claveLocal(ubicacionId, "caja-tarjetas");
  const [elegidas, setElegidas] = useState<TarjetaCaja[]>(() => tarjetasElegidas(null, disponibles));
  useEffect(() => {
    const id = window.setTimeout(() => setElegidas(tarjetasElegidas(leer<unknown>(clave, null), disponibles)), 0);
    return () => window.clearTimeout(id);
    // `disponibles` llega del servidor en cada lectura: se compara por contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, disponibles.join(",")]);
  const cambiar = (nuevas: TarjetaCaja[]) => {
    setElegidas(nuevas);
    guardar(clave, nuevas);
  };
  return { elegidas, cambiar };
}

export function TarjetasElegibles({ contexto, ubicacionId }: { contexto: ContextoTableroCaja; ubicacionId: string }) {
  const { elegidas, cambiar } = useTarjetasElegidas(ubicacionId, contexto.disponibles);
  const cuenta: Record<TarjetaCaja, number> = {
    pendientes: contexto.pendientes.reduce((s, p) => s + p.cantidad, 0),
    apartados: contexto.apartados?.activos ?? 0,
    gastos: contexto.gastos?.lista.length ?? 0,
    posventa: contexto.posventa?.lista.length ?? 0,
  };
  // Una píldora apagada que tiene algo por atender se marca en ámbar: así una tarjeta apagada no se olvida.
  const pideAccion = (t: TarjetaCaja) => (t === "pendientes" && cuenta.pendientes > 0) || (t === "apartados" && contexto.pendientes.some((p) => p.clave === "apartados"));
  const alternar = (t: TarjetaCaja) => cambiar(TARJETAS_CAJA.filter((x) => (x === t ? !elegidas.includes(t) : elegidas.includes(x))));
  const predeterminadas = sonLasPredeterminadas(elegidas, contexto.disponibles);

  return (
    <div>
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [scrollbar-width:none]">
        <span className="label-cayla shrink-0 text-[11px] text-tinta/60">
          <span className="sm:hidden">Mostrar</span>
          <span className="hidden sm:inline">Tu caja muestra</span>
        </span>
        {contexto.disponibles.map((t) => {
          const on = elegidas.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => alternar(t)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
                on ? "border-tinta bg-tinta text-crema" : pideAccion(t) ? "border-ambar/50 bg-papel text-tinta" : "border-sand bg-papel text-tinta hover:border-taupe"
              }`}
            >
              {on ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
              {NOMBRE_TARJETA[t]}
              <span className={`text-[11px] ${on ? "text-crema/70" : pideAccion(t) ? "font-bold text-ambar" : "text-tinta/50"}`}>{cuenta[t]}</span>
            </button>
          );
        })}
        {predeterminadas ? (
          <span className="shrink-0 text-[11.5px] text-tinta/50">Predeterminado · se recuerda en este aparato</span>
        ) : (
          <button type="button" onClick={() => cambiar(tarjetasElegidas(null, contexto.disponibles))} className="shrink-0 text-[11.5px] text-taupe underline underline-offset-4 hover:text-tinta">
            Volver a lo predeterminado
          </button>
        )}
      </div>
      {elegidas.length > 0 ? (
        <div className="mt-3 grid gap-3 @[800px]:grid-cols-2 @[1100px]:grid-cols-3">
          {elegidas.map((t) => (
            <PanelElegido key={t} tarjeta={t} contexto={contexto} />
          ))}
        </div>
      ) : (
        <p className="nota-cayla mt-3">Elige qué quieres tener a mano: cada píldora agrega una tarjeta.</p>
      )}
    </div>
  );
}

function CabeceraPanel({ titulo, bajada, derecha }: { titulo: string; bajada: string; derecha?: ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-bold text-tinta">{titulo}</p>
        <p className="text-xs text-tinta/50">{bajada}</p>
      </div>
      {derecha}
    </div>
  );
}

const filaLista = "flex items-center justify-between gap-3 border-t border-sand py-2.5 text-[13px] first:border-t-0";

function SinLectura() {
  return <p className="py-3 text-xs text-tinta/50">No se pudo leer ahora. Vuelve a abrir Caja en un momento.</p>;
}

function PanelElegido({ tarjeta, contexto }: { tarjeta: TarjetaCaja; contexto: ContextoTableroCaja }) {
  if (tarjeta === "pendientes") {
    const total = contexto.pendientes.reduce((s, p) => s + p.cantidad, 0);
    return (
      <div className="card-cayla anim-sube p-5">
        <CabeceraPanel titulo="Pendientes del turno" bajada="Resuélvelos antes de cerrar" derecha={total > 0 ? <Chip tono="ambar">{total}</Chip> : <Chip tono="verde">Al día</Chip>} />
        {contexto.pendientes.length === 0 ? (
          <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Check />}>Nada pendiente en esta sede.</Vacio>
        ) : (
          <div>
            {contexto.pendientes.map((p) => (
              <div key={p.clave} className={filaLista}>
                <span className="inline-flex items-center gap-2">
                  <TriangleAlert size={14} aria-hidden className="shrink-0 text-ambar" />
                  <span>
                    <b className="font-semibold">{p.cantidad}</b> {p.texto}
                  </span>
                </span>
                {/* El enlace del sistema, no un botón: la fila no crece y se lee como una acción chica (ADR-0358, Felipe 2026-10-14). */}
                <Link href={p.href} className="btn-cayla btn-enlace shrink-0 text-[13px]" aria-label={`Ver ${p.cantidad} ${p.texto}`}>
                  Ver
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (tarjeta === "apartados") {
    const a = contexto.apartados;
    const tono: Record<string, TonoChip> = { devolver: "rojo", vencida: "rojo", porvencer: "ambar", vigente: "neutro", cerrada: "verde" };
    return (
      <div className="card-cayla anim-sube p-5">
        <CabeceraPanel
          titulo="Apartados de la tienda"
          bajada={a ? `Saldo por cobrar ${soles(a.porCobrar)}` : "Separaciones de esta sede"}
          derecha={
            <EnlaceVer href="/vender/apartados">Ver todos</EnlaceVer>
          }
        />
        {!a ? (
          <SinLectura />
        ) : a.lista.length === 0 ? (
          <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Bookmark />}>No hay separaciones abiertas.</Vacio>
        ) : (
          <div>
            {a.lista.slice(0, 4).map((x) => (
              <div key={x.id} className={filaLista}>
                <span className="min-w-0">
                  <span className="block truncate">{x.clienta}</span>
                  <span className="block text-[11.5px] text-tinta/50">
                    {x.prendas} · saldo {soles(x.saldo)}
                  </span>
                </span>
                <Chip tono={tono[x.estado] ?? "neutro"}>{x.estadoTexto}</Chip>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (tarjeta === "gastos") {
    const g = contexto.gastos;
    return (
      <div className="card-cayla anim-sube p-5">
        <CabeceraPanel
          titulo="Gastos del turno"
          bajada={
            !g
              ? "Lo que salió del cajón como gasto"
              : g.totalApp > 0
                ? `Del cajón ${soles(g.total)} · con Yape o Plin ${soles(g.totalApp)}`
                : `Salieron del cajón · ${soles(g.total)}`
          }
          derecha={
            <EnlaceVer href="/finanzas/gastos">Ver en Finanzas</EnlaceVer>
          }
        />
        {!g ? (
          <SinLectura />
        ) : g.lista.length === 0 ? (
          <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Receipt />}>Todavía no hay gastos en este turno.</Vacio>
        ) : (
          <div>
            {g.lista.map((x) => (
              <div key={x.id} className={filaLista}>
                <span className="min-w-0">
                  <span className="block truncate">{x.descripcion}</span>
                  <span className="block text-[11.5px] text-tinta/50">
                    {x.hora}
                    {x.medio && ` · con ${TEXTO_MEDIO[x.medio]}`} · {x.conComprobante ? "con comprobante" : "sin comprobante"}
                  </span>
                </span>
                <b className="whitespace-nowrap font-semibold text-rojo-profundo tabular-nums">−{soles(x.monto)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  const p = contexto.posventa;
  return (
    <div className="card-cayla anim-sube p-5">
      <CabeceraPanel
        titulo="Cambios y devoluciones"
        bajada={p ? `En este turno · efectivo devuelto ${soles(p.efectivoDevuelto)}` : "Lo que pasó por esta caja"}
        derecha={
          <EnlaceVer href="/cambios">Ver posventa</EnlaceVer>
        }
      />
      {!p ? (
        <SinLectura />
      ) : p.lista.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<ArrowLeftRight />}>Ningún cambio ni devolución en este turno.</Vacio>
      ) : (
        <div>
          {p.lista.slice(0, 4).map((x) => (
            <div key={x.id} className={filaLista}>
              <span className="min-w-0">
                <span className="block truncate">{x.texto}</span>
                <span className="block text-[11.5px] text-tinta/50">{x.hora}</span>
              </span>
              {x.efectivo === 0 ? (
                <Chip tono="apagado" tachado={false}>
                  Sin efectivo
                </Chip>
              ) : (
                <b className={`whitespace-nowrap font-semibold tabular-nums ${x.efectivo > 0 ? "text-verde" : "text-rojo-profundo"}`}>
                  {x.efectivo > 0 ? "+" : "−"}
                  {soles(Math.abs(x.efectivo))}
                </b>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Cierres anteriores: una tarjeta, cuatro vistas
   ------------------------------------------------------------------ */

const FORMATO_DIA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric" });
const FORMATO_HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });
const diaCorto = (iso: string) => FORMATO_DIA.format(new Date(iso)).replace(".", "");

const TONO_CUADRE: Record<ClaveCuadre, TonoChip> = { ok: "verde", poco: "ambar", mal: "rojo" };
const FONDO_CUADRE: Record<ClaveCuadre, string> = {
  ok: "border-verde/35 bg-verde/15",
  poco: "border-ambar/40 bg-ambar/15",
  mal: "border-rojo/45 bg-rojo/15",
};
const COLOR_CUADRE: Record<ClaveCuadre, string> = { ok: "var(--color-verde)", poco: "var(--color-ambar)", mal: "var(--color-rojo)" };

/** La vista elegida se recuerda en el aparato; sin elección, la predeterminada de quien mira. */
function useModoCierres(esLider: boolean) {
  const clave = `cayla:caja:vista-cierres:${esLider ? "lider" : "integrante"}`;
  const predeterminado = modoCierresPredeterminado(esLider);
  const [modo, setModo] = useState<ModoCierres>(predeterminado);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const g = leer<unknown>(clave, null);
      setModo(esModoCierres(g) ? g : predeterminado);
    }, 0);
    return () => window.clearTimeout(id);
  }, [clave, predeterminado]);
  const cambiar = (m: ModoCierres) => {
    setModo(m);
    guardar(clave, m);
  };
  return { modo, cambiar, predeterminado };
}

export function CierresAnteriores({ cierres, esLider, indice, onModo }: { cierres: CierreCaja[]; esLider: boolean; indice: number; onModo?: (m: ModoCierres) => void }) {
  const { modo, cambiar, predeterminado } = useModoCierres(esLider);
  useEffect(() => onModo?.(modo), [modo, onModo]);
  const info = MODOS_CIERRES.find((m) => m.clave === modo)!;
  // Los cierres llegan del más nuevo al más viejo.
  const recientes = cierres.slice(0, 14);

  return (
    <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": indice } as CSSProperties}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <p className="text-sm font-bold text-tinta">Cierres anteriores</p>
          <p className="text-xs text-tinta/50">{info.bajada}</p>
        </div>
        {/* Modo de vista (los mismos cierres de otra forma): el segmento del sistema, con la elegida en contorno de tinta
            (ADR-0358), no la pista hueso del spike. */}
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Ver los cierres como"
          valor={modo}
          onCambio={(c) => cambiar(c as ModoCierres)}
          opciones={MODOS_CIERRES.map((m) => ({
            clave: m.clave,
            etiqueta: (
              <>
                <span className="sm:hidden">{m.corta}</span>
                <span className="hidden sm:inline">{m.etiqueta}</span>
                {m.clave === predeterminado && <span aria-label="(predeterminada)" className="-ml-0.5 inline-block h-[5px] w-[5px] rounded-full bg-rojo align-middle" />}
              </>
            ),
          }))}
        />
      </div>

      <div key={modo} className="anim-sube">
        {recientes.length === 0 ? (
          <Vacio tamano="chico" icono={<Wallet />}>
            Todavía no hay cierres en esta sede.
          </Vacio>
        ) : modo === "ultimo" ? (
          <VistaUltimo cierres={recientes} />
        ) : modo === "semaforo" ? (
          <VistaSemaforo cierres={recientes} />
        ) : modo === "tabla" ? (
          <VistaTabla cierres={recientes.slice(0, 5)} />
        ) : (
          <VistaGrafico cierres={recientes} />
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <Link href="/caja/historial" className="label-cayla inline-flex items-center gap-1.5 text-[11px] text-rojo hover:text-rojo-profundo">
          <History size={12} aria-hidden /> Ver historial completo
        </Link>
        {modo === predeterminado ? (
          <span className="text-[11.5px] text-tinta/50">Vista predeterminada · se recuerda en este aparato</span>
        ) : (
          <button type="button" onClick={() => cambiar(predeterminado)} className="text-[11.5px] text-taupe underline underline-offset-4 hover:text-tinta">
            Volver a la predeterminada
          </button>
        )}
      </div>
    </div>
  );
}

function VistaUltimo({ cierres }: { cierres: CierreCaja[] }) {
  const u = cierres[0]!;
  const q = cuadreDe(u.diferencia);
  const r = resumenCuadres(cierres);
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${q.clave === "ok" ? "bg-verde/15 text-verde" : q.clave === "poco" ? "bg-ambar/15 text-ambar" : "bg-rojo/10 text-rojo-profundo"}`}>
          {q.clave === "ok" ? <Check size={20} aria-hidden /> : <TriangleAlert size={20} aria-hidden />}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-tinta">
            {diaCorto(u.cerradaEn)} · {FORMATO_HORA.format(new Date(u.cerradaEn))}
            {u.cerradaPorNombre ? ` · ${u.cerradaPorNombre}` : ""}
          </p>
          <p className="text-[12.5px] text-tinta/60 tabular-nums">
            Contó {soles(u.montoCierreReal)} · el sistema esperaba {soles(u.montoCierreSistema)}
            {u.montoFondo !== null ? ` · dejó ${soles(u.montoFondo)} para el siguiente turno` : ""}
          </p>
        </div>
        <span className="ml-auto hidden shrink-0 sm:block">
          <Chip tono={TONO_CUADRE[q.clave]}>{q.texto}</Chip>
        </span>
      </div>
      <p className="mt-3 text-xs text-tinta/60">
        Últimos {r.total} turnos: {r.cuadraron} de {r.total} cuadraron.
      </p>
    </div>
  );
}

function VistaSemaforo({ cierres }: { cierres: CierreCaja[] }) {
  const orden = [...cierres].reverse();
  const r = resumenCuadres(cierres);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 @[640px]:grid-cols-[repeat(14,minmax(0,1fr))]">
        {orden.map((c) => {
          const q = cuadreDe(c.diferencia);
          return (
            <div key={c.id} title={`${diaCorto(c.cerradaEn)} · ${c.cerradaPorNombre ?? "—"} · ${q.texto}`} className="text-center text-[10px] text-tinta/55">
              <span className={`mb-1 grid h-8 place-items-center rounded-md border text-[10px] font-bold text-tinta ${FONDO_CUADRE[q.clave]}`}>
                {q.clave === "ok" ? "" : `${q.diferencia > 0 ? "+" : "−"}${Math.abs(q.diferencia) >= 10 ? Math.round(Math.abs(q.diferencia)) : Math.abs(q.diferencia)}`}
              </span>
              {diaCorto(c.cerradaEn)}
            </div>
          );
        })}
      </div>
      <Leyenda />
      <p className="mt-2 text-xs text-tinta/60">
        <b className="font-semibold text-tinta">
          {r.cuadraron} de {r.total}
        </b>{" "}
        turnos cuadraron.
        {r.peor && ` El descuadre más grande: ${diaCorto(r.peor.cerradaEn)}, ${r.peor.diferencia < 0 ? "faltaron" : "sobraron"} ${soles(Math.abs(r.peor.diferencia))}${r.peor.quien ? ` (${r.peor.quien})` : ""}.`}
      </p>
    </div>
  );
}

const PLANTILLA_CIERRES = "sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_5.5rem_5.5rem_minmax(0,7.5rem)]";
const COLUMNAS_CIERRES: Columna[] = [
  { titulo: "Turno" },
  { titulo: "Cerró" },
  { titulo: "Esperado", alinear: "der" },
  { titulo: "Contó", alinear: "der" },
  { titulo: "Resultado" },
];

function VistaTabla({ cierres }: { cierres: CierreCaja[] }) {
  return (
    <>
      <div className="sm:hidden">
        {cierres.map((c) => {
          const q = cuadreDe(c.diferencia);
          return (
            <div key={c.id} className={filaLista}>
              <span className="min-w-0">
                <span className="block">
                  {diaCorto(c.cerradaEn)} · {c.cerradaPorNombre ?? "—"}
                </span>
                <span className="block text-[11.5px] text-tinta/50 tabular-nums">
                  Esperado {soles0(c.montoCierreSistema)} · contó {soles(c.montoCierreReal)}
                </span>
              </span>
              <Chip tono={TONO_CUADRE[q.clave]}>{q.texto}</Chip>
            </div>
          );
        })}
      </div>
      {/* La tabla del sistema (ADR-0358, ronda 7), sangrada hasta el borde de su tarjeta; en celular, la lista de arriba. */}
      <div className="-mx-5 hidden divide-y divide-sand border-y border-sand text-[12.5px] tabular-nums sm:block">
        <Encabezado columnas={COLUMNAS_CIERRES} plantilla={PLANTILLA_CIERRES} />
        {cierres.map((c) => {
          const q = cuadreDe(c.diferencia);
          return (
            <div key={c.id} className={fila(PLANTILLA_CIERRES, "sm:items-center")}>
              <span className={celda()}>
                {diaCorto(c.cerradaEn)} · {FORMATO_HORA.format(new Date(c.cerradaEn))}
              </span>
              <span className={celda()}>{c.cerradaPorNombre ?? "—"}</span>
              <span className={celda("der")}>{soles(c.montoCierreSistema)}</span>
              <span className={celda("der")}>{soles(c.montoCierreReal)}</span>
              <span className={celda()}>
                <Chip tono={TONO_CUADRE[q.clave]}>{q.texto}</Chip>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function VistaGrafico({ cierres }: { cierres: CierreCaja[] }) {
  const dias = cierresPorDia(
    cierres.flatMap((c) => {
      const dia = diaLima(c.cerradaEn);
      return dia ? [{ dia, montoCierreSistema: c.montoCierreSistema, diferencia: c.diferencia }] : [];
    }),
  );
  return (
    <div>
      {/* Las barras por tiempo del sistema (ronda 14 de /unificar): el esperado de cada día, con el punto de cómo cuadró encima. */}
      <BarrasTiempo
        alto={128}
        barras={dias.map((d) => ({
          clave: d.dia,
          valor: d.esperado,
          etiqueta: String(Number(d.dia.slice(8))),
          tip: `${diaCorto(`${d.dia}T17:00:00Z`)} · ${soles0(d.esperado)} · ${d.peor.texto}`,
          encima: <span aria-hidden className="block h-2 w-2 rounded-full" style={{ background: COLOR_CUADRE[d.peor.clave] }} />,
        }))}
        cifras="ninguna"
        etiqueta="El efectivo esperado de cada día, con cómo cuadró"
      />
      <Leyenda />
    </div>
  );
}

function Leyenda() {
  return (
    <p className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-tinta/60">
      {(["ok", "poco", "mal"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_CUADRE[k] }} />
          {k === "ok" ? "Cuadró" : k === "poco" ? "Hasta S/\u00a05" : "Más de S/\u00a05"}
        </span>
      ))}
    </p>
  );
}
