"use client";

// Las piezas de Caja como pantalla de trabajo (spike docs/maquetas/caja-tablero-spike-2026-09/, aprobado por Felipe el
// 2026-09-26). Las usa `CajaAbiertaPanel`. La lógica pura vive en `lib/caja-tablero-reglas.ts`; las lecturas, en
// `lib/caja-tablero.ts`.

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
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
} from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
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
} from "@/lib/caja-tablero-reglas";
import type { CierreCaja } from "@/lib/caja";
import type { ContextoTableroCaja } from "@/lib/caja-tablero";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--color-metodo-efectivo)",
  tarjeta: "var(--color-metodo-tarjeta)",
  yape: "var(--color-metodo-yape)",
  transferencia: "var(--color-metodo-transferencia)",
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
    <div className="card-cayla anim-sube relative flex flex-col border-l-[3px] p-5" style={{ "--i": indice, borderLeftColor: "var(--color-metodo-efectivo)" } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-cayla text-[11px]" style={{ color: "var(--color-metodo-efectivo-tinta)" }}>
          Efectivo en el cajón ahora
        </p>
        <Lock size={15} aria-hidden className="text-tinta/50" />
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
            {i > 0 && <span className="mr-2 text-tinta/40">{p.signo}</span>}
            {p.etiqueta} <b className="font-semibold text-tinta">{soles(p.monto)}</b>
          </span>
        ))}
      </p>
      <p className="mt-auto hidden pt-3 text-xs text-tinta/50 sm:block">Tarjeta, Yape y transferencias no entran al cajón.</p>
    </div>
  );
}

/** «Cobrado en el turno»: lo que entró hoy por cada forma de pago, sin el adelanto de separaciones (se cobró antes). */
export function TarjetaCobrado({ porMetodo, indice }: { porMetodo: Partial<Record<string, number>>; indice: number }) {
  const c = cobradoDelTurno(porMetodo);
  return (
    <div className="card-cayla anim-sube flex flex-col p-5" style={{ "--i": indice } as CSSProperties}>
      <p className="label-cayla text-[11px] text-tinta/65">Cobrado en el turno</p>
      <p className="font-display mt-2.5 text-[32px] leading-none text-tinta tabular-nums lining-nums">{soles(c.total)}</p>
      {c.metodos.length === 0 ? (
        <p className="mt-4 text-xs text-tinta/50">Sin ventas todavía.</p>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-hueso" aria-hidden>
            {c.metodos.map((m) => (
              <span key={m.clave} className="h-full transition-[width] duration-500 [transition-timing-function:var(--ease-cayla)]" style={{ width: `${(m.monto / c.total) * 100}%`, background: COLOR_METODO[m.clave] }} />
            ))}
          </div>
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
  onMovimiento,
  apartadosPorCobrar,
}: {
  accesos: AccesosCaja;
  onGasto: (() => void) | null;
  onMovimiento: () => void;
  apartadosPorCobrar: number;
}) {
  const lista: Acceso[] = [];
  if (accesos.vender) lista.push({ clave: "vender", icono: <ShoppingCart size={17} aria-hidden />, titulo: "Cobrar", detalle: "Abre el Punto de venta", href: "/vender", principal: true });
  if (onGasto) lista.push({ clave: "gasto", icono: <Receipt size={17} aria-hidden />, titulo: "Registrar gasto", detalle: "Sale del cajón y va a Finanzas", onClick: onGasto });
  lista.push({ clave: "movimiento", icono: <ArrowUpDown size={17} aria-hidden />, titulo: "Depósito o retiro", detalle: "Banco, líder o sencillo", onClick: onMovimiento });
  if (accesos.cambios || accesos.devoluciones)
    lista.push({ clave: "posventa", icono: <ArrowLeftRight size={17} aria-hidden />, titulo: "Cambio o devolución", detalle: "Si devuelves plata, sale de aquí", href: accesos.cambios ? "/cambios" : "/devoluciones" });
  if (accesos.apartados)
    lista.push({ clave: "apartados", icono: <Bookmark size={17} aria-hidden />, titulo: "Apartados", detalle: "Cobrar saldo o separar", href: "/vender/apartados", insignia: apartadosPorCobrar > 0 ? `${apartadosPorCobrar} por cobrar` : undefined });
  return (
    <div className="hidden sm:block">
      <p className="label-cayla mb-2 text-[11px] text-tinta/60">Hacer</p>
      <div className="grid grid-cols-2 gap-2.5 @[800px]:grid-cols-3 @[1100px]:grid-cols-5">{lista.map(tarjetaAcceso)}</div>
    </div>
  );
}

/** Los accesos del celular, con el formato de «Accesos» del Inicio (ícono sobre la palabra). Lo que ya está en la
 *  barra fija (Vender, Gasto, Mover, Cerrar) no se repite. */
export function AccesosCajaMovil({ accesos, apartadosPorCobrar }: { accesos: AccesosCaja; apartadosPorCobrar: number }) {
  const lista: { clave: string; icono: ReactNode; texto: string; href: string; n?: number }[] = [];
  if (accesos.apartados) lista.push({ clave: "apartados", icono: <Bookmark size={19} aria-hidden />, texto: "Apartados", href: "/vender/apartados", n: apartadosPorCobrar });
  if (accesos.cambios) lista.push({ clave: "cambios", icono: <ArrowLeftRight size={19} aria-hidden />, texto: "Cambios", href: "/cambios" });
  if (accesos.devoluciones) lista.push({ clave: "devoluciones", icono: <CornerUpLeft size={19} aria-hidden />, texto: "Devoluciones", href: "/devoluciones" });
  if (lista.length === 0) return null;
  return (
    <div className="sm:hidden">
      <p className="label-cayla mb-2 text-[11px] text-tinta/60">Accesos</p>
      <div className="grid grid-cols-3 gap-2">
        {lista.map((a) => (
          <Link key={a.clave} href={a.href} className="relative flex flex-col items-center gap-1.5 rounded-xl border border-sand bg-papel px-1 py-3.5 text-[12.5px] text-tinta">
            {a.n ? (
              <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ambar px-1 text-[10px] font-bold text-crema">{a.n}</span>
            ) : null}
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
  onMovimiento,
  onCerrar,
}: {
  vender: boolean;
  onGasto: (() => void) | null;
  onMovimiento: () => void;
  onCerrar: (() => void) | null;
}) {
  const cuadrado = "flex h-14 w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-sand bg-papel text-[10px] font-semibold text-tinta/80 active:scale-[0.97]";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
      {vender && (
        <Link href="/vender" className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema">
          <ShoppingBag size={18} aria-hidden /> Vender
        </Link>
      )}
      {onGasto && (
        <button type="button" onClick={onGasto} className={cuadrado} aria-label="Registrar gasto">
          <Receipt size={18} aria-hidden />
          Gasto
        </button>
      )}
      <button type="button" onClick={onMovimiento} className={`${cuadrado} ${vender ? "" : "flex-1"}`} aria-label="Depósito o retiro">
        <ArrowUpDown size={18} aria-hidden />
        Mover
      </button>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className={cuadrado} aria-label="Cerrar caja">
          <Lock size={18} aria-hidden />
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
              {on ? <Check size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
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

const enlaceVer = "label-cayla shrink-0 rounded-md px-2 py-1 text-[11px] text-taupe transition-colors hover:bg-sand/40 hover:text-tinta";
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
          <p className="py-3 text-xs text-tinta/50">Nada pendiente en esta sede.</p>
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
                <Link href={p.href} className="rounded-md border border-sand px-2.5 py-1 text-[11px] font-semibold hover:border-taupe">
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
            <Link href="/vender/apartados" className={enlaceVer}>
              Ver todos →
            </Link>
          }
        />
        {!a ? (
          <SinLectura />
        ) : a.lista.length === 0 ? (
          <p className="py-3 text-xs text-tinta/50">No hay separaciones abiertas.</p>
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
          bajada={g ? `Salieron del cajón · ${soles(g.total)}` : "Lo que salió del cajón como gasto"}
          derecha={
            <Link href="/finanzas/gastos" className={enlaceVer}>
              Ver en Finanzas →
            </Link>
          }
        />
        {!g ? (
          <SinLectura />
        ) : g.lista.length === 0 ? (
          <p className="py-3 text-xs text-tinta/50">Todavía no salió ningún gasto de este cajón.</p>
        ) : (
          <div>
            {g.lista.map((x) => (
              <div key={x.id} className={filaLista}>
                <span className="min-w-0">
                  <span className="block truncate">{x.descripcion}</span>
                  <span className="block text-[11.5px] text-tinta/50">
                    {x.hora} · {x.conComprobante ? "con comprobante" : "sin comprobante"}
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
          <Link href="/cambios" className={enlaceVer}>
            Ver posventa →
          </Link>
        }
      />
      {!p ? (
        <SinLectura />
      ) : p.lista.length === 0 ? (
        <p className="py-3 text-xs text-tinta/50">Ningún cambio ni devolución en este turno.</p>
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
const FORMATO_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
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
        <div role="group" aria-label="Ver los cierres como" className="inline-flex rounded-lg bg-hueso p-[3px]">
          {MODOS_CIERRES.map((m) => (
            <button
              key={m.clave}
              type="button"
              aria-pressed={modo === m.clave}
              onClick={() => cambiar(m.clave)}
              className={`rounded-md px-2 py-1 text-[11.5px] transition-colors sm:px-2.5 ${modo === m.clave ? "bg-papel text-tinta shadow-[0_0_0_1px_rgba(26,26,24,0.07)]" : "text-tinta/60 hover:text-tinta"}`}
            >
              <span className="sm:hidden">{m.corta}</span>
              <span className="hidden sm:inline">{m.etiqueta}</span>
              {m.clave === predeterminado && <span aria-label="(predeterminada)" className="ml-1 inline-block h-[5px] w-[5px] rounded-full bg-rojo align-middle" />}
            </button>
          ))}
        </div>
      </div>

      <div key={modo} className="anim-sube">
        {recientes.length === 0 ? (
          <p className="py-6 text-center text-xs text-tinta/50">Todavía no hay cierres en esta sede.</p>
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
          {q.clave === "ok" ? <Check size={18} aria-hidden /> : <TriangleAlert size={17} aria-hidden />}
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
      <table className="hidden w-full text-[12.5px] tabular-nums sm:table">
        <thead>
          <tr className="border-b border-sand text-left">
            {["Turno", "Cerró", "Esperado", "Contó", "Resultado"].map((h, i) => (
              <th key={h} className={`label-cayla px-2.5 py-2 text-[10px] text-tinta/60 ${i === 2 || i === 3 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cierres.map((c) => {
            const q = cuadreDe(c.diferencia);
            return (
              <tr key={c.id} className="border-b border-sand even:bg-hueso/45">
                <td className="px-2.5 py-2">
                  {diaCorto(c.cerradaEn)} · {FORMATO_HORA.format(new Date(c.cerradaEn))}
                </td>
                <td className="px-2.5 py-2">{c.cerradaPorNombre ?? "—"}</td>
                <td className="px-2.5 py-2 text-right">{soles(c.montoCierreSistema)}</td>
                <td className="px-2.5 py-2 text-right">{soles(c.montoCierreReal)}</td>
                <td className="px-2.5 py-2">
                  <Chip tono={TONO_CUADRE[q.clave]}>{q.texto}</Chip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function VistaGrafico({ cierres }: { cierres: CierreCaja[] }) {
  const dias = cierresPorDia(cierres.map((c) => ({ dia: FORMATO_ISO.format(new Date(c.cerradaEn)), montoCierreSistema: c.montoCierreSistema, diferencia: c.diferencia })));
  const max = Math.max(...dias.map((d) => d.esperado), 0.0001);
  return (
    <div>
      <div className="flex h-32 items-end gap-2 border-b border-sand">
        {dias.map((d) => (
          <div key={d.dia} title={`${diaCorto(`${d.dia}T17:00:00Z`)} · ${soles0(d.esperado)} · ${d.peor.texto}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR_CUADRE[d.peor.clave] }} />
            <span className="w-[70%] rounded-t bg-[var(--color-grafico-neutro)]" style={{ height: `${Math.max(2, (d.esperado / max) * 85)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-tinta/50">
        {dias.map((d) => (
          <span key={d.dia} className="flex-1 text-center">
            {Number(d.dia.slice(8))}
          </span>
        ))}
      </div>
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
          {k === "ok" ? "Cuadró" : k === "poco" ? "Hasta S/ 5" : "Más de S/ 5"}
        </span>
      ))}
    </p>
  );
}
