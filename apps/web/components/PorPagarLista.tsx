"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote, ChevronRight } from "lucide-react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Tabla } from "@/components/ui/Tabla";
import { BotonPagar } from "@/components/CompraDetallePanel";
import { ChipNotaPendiente } from "@/components/ChipNotaPendiente";
import { PagoJuntosModal, type DatosPagoProveedor, type ResultadoPago } from "@/components/PagoJuntosModal";
import { coincideConEco, usePorPagar } from "@/components/PorPagarContexto";
import { PorPagarVistaRapida } from "@/components/PorPagarVistaRapida";
import { soles, type CompraResumen, type PagoCompra } from "@/lib/compras-reglas";
import type { NotaPendiente, TotalesTramosPorPagar } from "@/lib/compras-indicadores";
import { diaMes } from "@/lib/fechas-lima";
import { detalleSeleccion, etiquetaVence, partirCoincidencia, plazoConsumido, TITULO_TRAMO, tramoDe, type ClaveTramo } from "@/lib/por-pagar-reglas";
import { useContar } from "@/lib/useContar";
import { useFlip } from "@/lib/useFlip";

// Lista de Por pagar (maqueta 02 y celular de la 11). UNA tabla partida en tramos de urgencia
// —Vencidas, Vencen esta semana, Más adelante— o, si se prefiere, agrupada por proveedor (para
// preparar la transferencia del día: todo lo que se le debe a uno, junto).
//
// Selección para pagar juntos (D3): se marcan comprobantes del MISMO proveedor. Al tocar la
// casilla de otro proveedor la selección empieza de nuevo con esa fila (mismo patrón que
// Recibir mercadería: «una guía cubre facturas de un solo proveedor»), y las filas ajenas se
// atenúan mientras haya una selección. Ahora además se AVISA por qué empezó de nuevo.
//
// Los subtotales de cada tramo son los REALES (`por_pagar_tramos`, sobre toda la deuda que
// cumple los filtros) y no la suma de las 50 filas de la página: el «en esta página» que había
// antes obligaba a sumar de cabeza.
//
// Por pagar responde (2026-09-19, spike `docs/maquetas/por-pagar-spike-2026-09/`, mismo modelo que ADR-0128):
//  · Cambiar entre «Por urgencia» y «Por proveedor», o filtrar por un tramo, DESLIZA las filas a su lugar (`useFlip`).
//  · Apuntar a un tramo, una semana de caja o un proveedor arriba enciende aquí sus filas (`eco`); un clic las filtra.
//  · La fila es una vista rápida (cajón), no un salto al detalle: la lista, el orden y lo marcado quedan intactos.
//  · Cada fila lleva su plazo consumido y, si hubo pagos, cuánto va pagado: la proporción se ve sin leer.
//  · La casilla dibuja su tilde. La barra de «Pagar juntos» sube, cuenta su total y ofrece «＋ agregar» lo demás del proveedor.
//  · Al pagar, la pantalla REACCIONA: la fila pagada por completo muestra su sello, se pliega y las demás se deslizan;
//    la que queda con saldo se enciende en verde y su cifra cuenta hasta el valor nuevo. Recién entonces se pide
//    el dato fresco al servidor (`router.refresh()`): antes de eso la lista sigue mostrando lo de antes, sin saltos.

// La tabla decide su forma por el ancho de SU PROPIO contenedor (`@container`), no por el de la ventana: con el menú
// lateral abierto o en un panel angosto, «1024 px de ventana» son ~530 px de tabla, y con las seis columnas fijas el
// nombre del proveedor quedaba en «Textil…». Tres formas:
//   · < 40rem  → tarjeta (como en celular): proveedor y comprobante a la izquierda, saldo y «Pagar» a la derecha.
//   · ≥ 40rem  → tabla de 5 columnas: [casilla] Proveedor · comprobante · Vence · Saldo · Pagar. «Pagado» baja bajo el saldo.
//   · ≥ 56rem  → tabla de 6 columnas: la de las maquetas, con «Pagado» y su barra en columna propia.
const PLANTILLA = "@[40rem]:grid-cols-[1.875rem_1fr_9.5rem_8.25rem_6.5rem] @[56rem]:grid-cols-[1.875rem_1fr_11rem_9.5rem_8.25rem_6.5rem]";

const ESTILO_BANDA = {
  vencidas: "bg-rojo/[0.05] text-rojo",
  semana: "bg-ambar/[0.08] text-ambar-profundo",
  despues: "bg-tinta/[0.03] text-tinta/65",
} as const;

/** Cuánto se ve el sello «Pagada» antes de que la fila se pliegue. */
const MS_SELLO = 900;
/** Lo que dura el pliegue de la fila (Web Animations sobre la altura). */
const MS_PLIEGUE = 380;
const EASE_CAYLA = "cubic-bezier(0.32, 0.72, 0.24, 1)";

type Bloque = { clave: string; titulo: string; tono: ClaveTramo; cantidad: number; saldo: number; parcial: boolean; filas: CompraResumen[]; proveedorId?: string };

function contar(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "comprobante" : "comprobantes"}`;
}

const reducido = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function PorPagarLista({
  compras,
  totales,
  hayMasPaginas,
  datosProveedores,
  notas,
  pagos = {},
  seleccionInicial = [],
  indice = 0,
  misTiendas,
}: {
  compras: CompraResumen[];
  totales: TotalesTramosPorPagar;
  hayMasPaginas: boolean;
  datosProveedores: Record<string, DatosPagoProveedor>;
  /** Por id de comprobante: el faltante cerrado que todavía espera su nota de crédito (solo líder; vacío si ninguno). */
  notas: Record<string, NotaPendiente>;
  /** Por id de comprobante: sus pagos, del más reciente al más antiguo (solo de los que ya recibieron alguno). El cajón los muestra. */
  pagos?: Record<string, PagoCompra[]>;
  /** Comprobantes que llegan ya marcados («Pagar con este saldo»). */
  seleccionInicial?: string[];
  /** Posición de la lista en la entrada escalonada de la pantalla. */
  indice?: number;
  /** ADR-0184 (F4-F5): solo para un comprador de tienda — sus tiendas, para pagar con la que corresponda. */
  misTiendas?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const { agrupar, eco, filtroLocal, quitarFiltro } = usePorPagar();
  const [, empezar] = useTransition();
  const [seleccion, setSeleccion] = useState<string[]>(seleccionInicial);
  const [pagando, setPagando] = useState(false);
  const [vistaId, setVistaId] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const ahora = useMemo(() => new Date(), []);

  // La entrada escalonada es solo la de la pantalla al llegar: pasado un momento, lo que aparezca (un filtro que
  // muestra filas, una vista que se arma) entra con el gesto corto, no re-anima toda la tabla.
  const [llegando, setLlegando] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLlegando(false), 1600);
    return () => clearTimeout(t);
  }, []);

  // El filtro por tramo/semana es local (ver `PorPagarContexto`): deja solo las filas de la página que le corresponden.
  const visibles = useMemo(() => (filtroLocal ? compras.filter((c) => filtroLocal.coincide(c)) : compras), [compras, filtroLocal]);

  const seleccionadas = compras.filter((c) => seleccion.includes(c.id));
  const proveedorActivo = seleccionadas[0]?.proveedorId ?? null;
  const totalSeleccion = Math.round(seleccionadas.reduce((a, c) => a + c.saldo, 0) * 100) / 100;

  // La barra de «Pagar juntos» se queda montada y sube/baja; mientras baja sigue mostrando la última selección.
  // (Estado derivado durante el render, el patrón que recomienda React: no se lee una ref al pintar.)
  const [ultimaSeleccion, setUltimaSeleccion] = useState<CompraResumen[]>([]);
  if (seleccionadas.length > 0 && (seleccionadas.length !== ultimaSeleccion.length || seleccionadas.some((c, i) => c !== ultimaSeleccion[i]))) {
    setUltimaSeleccion(seleccionadas);
  }
  const enBarra = seleccionadas.length > 0 ? seleccionadas : ultimaSeleccion;
  const totalBarra = seleccionadas.length > 0 ? totalSeleccion : Math.round(enBarra.reduce((a, c) => a + c.saldo, 0) * 100) / 100;

  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisarEnBarra = useCallback((texto: string) => {
    setAviso(texto);
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => setAviso(null), 3600);
  }, []);
  useEffect(() => () => { if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current); }, []);

  function alternar(c: CompraResumen) {
    const previas = compras.filter((x) => seleccion.includes(x.id));
    if (previas.length === 0 || previas[0].proveedorId !== c.proveedorId) {
      setSeleccion([c.id]);
      // Un pago va a un solo proveedor: si había otro marcado, la selección empieza de nuevo y se dice por qué.
      if (previas.length > 0) avisarEnBarra(`Empezó de nuevo con ${c.proveedorNombre}: un pago va a un solo proveedor.`);
    } else {
      setSeleccion((s) => (s.includes(c.id) ? s.filter((id) => id !== c.id) : [...s, c.id]));
    }
  }

  const bloques = useMemo<Bloque[]>(() => {
    if (agrupar === "proveedor") {
      const porProveedor = new Map<string, CompraResumen[]>();
      for (const c of visibles) porProveedor.set(c.proveedorId, [...(porProveedor.get(c.proveedorId) ?? []), c]);
      return [...porProveedor.entries()].map(([id, filas]) => {
        const urgente = filas.map((f) => tramoDe(f, ahora));
        return {
          clave: id,
          titulo: filas[0].proveedorNombre,
          tono: urgente.includes("vencidas") ? "vencidas" : urgente.includes("semana") ? "semana" : "despues",
          cantidad: filas.length,
          saldo: filas.reduce((a, f) => a + f.saldo, 0),
          // Sin el total real por proveedor: si hay más páginas, lo dicho es «lo de esta página».
          parcial: hayMasPaginas,
          filas,
          proveedorId: id,
        };
      });
    }
    const orden: ClaveTramo[] = ["vencidas", "semana", "despues"];
    return orden
      .map((k) => {
        const filas = visibles.filter((c) => tramoDe(c, ahora) === k);
        // Con un filtro local los totales reales de la base ya no describen lo que se ve: se suma lo visible y se dice.
        const real = !filtroLocal && totales[k].comprobantes > 0;
        return {
          clave: k,
          titulo: TITULO_TRAMO[k],
          tono: k,
          cantidad: real ? totales[k].comprobantes : filas.length,
          saldo: real ? totales[k].saldo : filas.reduce((a, f) => a + f.saldo, 0),
          parcial: !!filtroLocal && hayMasPaginas,
          filas,
        };
      })
      .filter((b) => b.filas.length > 0);
  }, [agrupar, visibles, totales, hayMasPaginas, ahora, filtroLocal]);

  // El orden en que se ve la lista, de arriba abajo: es el que recorren ↑ ↓ en la vista rápida.
  const ordenVisual = useMemo(() => bloques.flatMap((b) => b.filas), [bloques]);

  // FLIP: las filas y las bandas que ya estaban se deslizan a su nuevo lugar cuando cambia la vista o el filtro.
  const claveFlip = `${agrupar}|${filtroLocal?.clave ?? ""}|${bloques.map((b) => `${b.clave}:${b.filas.map((f) => f.id).join(",")}`).join(";")}`;
  const refFlip = useFlip(claveFlip);
  const elementos = useRef(new Map<string, HTMLElement>());
  const refDe = (id: string) => (el: HTMLElement | null) => {
    refFlip(id)(el);
    if (el) elementos.current.set(id, el);
    else elementos.current.delete(id);
  };

  // --- Vista rápida
  const vista = vistaId ? (compras.find((c) => c.id === vistaId) ?? null) : null;
  // Si lo que se estaba mirando ya no está (se pagó por completo y la lista se actualizó), el cajón se va.
  if (vistaId && !vista) setVistaId(null);
  const indiceVista = vista ? ordenVisual.findIndex((c) => c.id === vista.id) : -1;
  const navegarVista = useCallback(
    (delta: 1 | -1) => {
      const siguiente = ordenVisual[indiceVista + delta];
      if (!siguiente) return;
      setVistaId(siguiente.id);
      elementos.current.get(siguiente.id)?.scrollIntoView({ block: "nearest", behavior: reducido() ? "auto" : "smooth" });
    },
    [ordenVisual, indiceVista],
  );

  // --- Después de pagar: sello → pliegue → dato fresco
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true; // StrictMode monta, desmonta y vuelve a montar: sin esto quedaría en false para siempre
    return () => { montado.current = false; };
  }, []);
  // Cuando llega el dato fresco (las `compras` cambian) las filas selladas ya no existen: se limpian.
  const [comprasVistas, setComprasVistas] = useState(compras);
  if (comprasVistas !== compras) {
    setComprasVistas(compras);
    setSaliendo([]);
  }

  const alPagar = useCallback(
    ({ pagadas }: ResultadoPago) => {
      setPagando(false);
      setVistaId(null); // si el pago salió del cajón, el cajón se va con él
      setSeleccion([]);
      const pedirDato = () => empezar(() => router.refresh());
      if (pagadas.length === 0) return pedirDato();
      setSaliendo(pagadas);
      setTimeout(async () => {
        if (!montado.current) return;
        const filasDom = pagadas.map((id) => elementos.current.get(id)).filter((e): e is HTMLElement => !!e);
        if (!reducido()) {
          // `finished` no se resuelve si la pestaña está oculta (sin fotogramas no hay animación que termine): sin un tope, quien
          // paga y cambia de pestaña dejaba la fila a medio plegar y el dato fresco sin pedir. El tope es el pliegue + un respiro.
          await Promise.race([
            new Promise<void>((listo) => setTimeout(listo, MS_PLIEGUE + 350)),
            Promise.all(
            filasDom.map((el) => {
              const cs = getComputedStyle(el);
              el.style.overflow = "hidden";
              return el.animate(
                [
                  { height: `${el.offsetHeight}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth },
                  { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px" },
                ],
                { duration: MS_PLIEGUE, easing: EASE_CAYLA, fill: "forwards" },
              ).finished;
            }),
            ),
          ]);
        }
        if (montado.current) pedirDato();
      }, reducido() ? 0 : MS_SELLO);
    },
    [router],
  );

  // Esc deja la selección en blanco (si no hay un modal o el cajón encima, que ya usan Esc para cerrarse).
  useEffect(() => {
    if (seleccion.length === 0 || pagando || vistaId) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setSeleccion([]);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [seleccion.length, pagando, vistaId]);

  const hayEco = eco !== null;
  let posicionFila = 0;
  const otrosDeVista = vista ? compras.filter((c) => c.proveedorId === vista.proveedorId && c.id !== vista.id) : [];

  return (
    <div className={seleccion.length > 0 ? "pb-28 sm:pb-24" : ""}>
      {/* La línea de resumen del spike: cuántos comprobantes y cuánto suman lo que se ve. Con un filtro por clic lleva además su chip
          (para quitarlo) y dice «de cuántos». La cifra cuenta hasta su valor nuevo al filtrar. */}
      <div className="anim-entra mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12.5px] text-tinta/65" style={{ ["--i" as string]: Math.max(0, indice - 1) }}>
        {filtroLocal && (
          <span className="label-cayla anim-entrada inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] py-1 pl-2.5 pr-1.5 text-[10px] text-tinta/75">
            {filtroLocal.etiqueta}
            <button type="button" onClick={quitarFiltro} aria-label={`Quitar filtro ${filtroLocal.etiqueta}`} className="grid h-4 w-4 place-items-center rounded-full text-sm leading-none transition-colors hover:bg-tinta hover:text-crema">
              ×
            </button>
          </span>
        )}
        <span className="tabular-nums" aria-live="polite">
          {filtroLocal ? (
            <>
              Mostrando <b className="font-semibold text-tinta">{visibles.length}</b> de {compras.length}
              {hayMasPaginas ? " en esta página" : ""}
            </>
          ) : (
            <>
              <b className="font-semibold text-tinta">{visibles.length}</b> {visibles.length === 1 ? "comprobante con saldo" : "comprobantes con saldo"}
            </>
          )}
        </span>
        <span className="tabular-nums">
          <b className="font-semibold text-tinta">
            <CifraQueCuenta valor={Math.round(visibles.reduce((a, c) => a + c.saldo, 0) * 100) / 100} formato="soles" alMontar={llegando} />
          </b>{" "}
          {filtroLocal ? "en pantalla" : `por pagar${hayMasPaginas ? " en esta página" : ""}`}
        </span>
      </div>

      <Tabla className={`@container anim-entra ${hayEco ? "[&_[data-fila]:not([data-eco])]:opacity-50" : ""}`} style={{ ["--i" as string]: indice }}>
        <div className={`hidden gap-x-4 px-5 py-2 @[40rem]:grid ${PLANTILLA}`} role="row">
          {[
            { t: "", c: "" },
            { t: "Proveedor · Comprobante", c: "" },
            { t: "Vence", c: "" },
            { t: "Pagado", c: "hidden text-right @[56rem]:block" },
            { t: "Saldo", c: "text-right" },
            { t: "", c: "" },
          ].map((h, i) => (
            <span key={i} role="columnheader" className={`label-cayla text-[11px] text-tinta/55 ${h.c}`}>
              {h.t}
            </span>
          ))}
        </div>
        {bloques.length === 0 && (
          <div className="anim-revelar px-5 py-10 text-center">
            <p className="font-display text-[19px] italic text-tinta/65">Ninguno de los comprobantes de esta página coincide.</p>
            <button type="button" onClick={quitarFiltro} className="mt-2 text-sm text-rojo hover:underline">
              Quitar el filtro
            </button>
          </div>
        )}
        {bloques.map((b) => (
          <Fragment key={b.clave}>
            {/* El id es el destino de la tarjeta «Vence esta semana»; `scroll-mt-24` compensa la cabecera fija. */}
            <div
              id={agrupar === "urgencia" ? `tramo-${b.clave}` : undefined}
              ref={refDe(`b:${b.clave}`)}
              role="row"
              className={`group scroll-mt-24 flex items-center justify-between gap-4 px-5 py-2 ${ESTILO_BANDA[b.tono]}`}
            >
              <p className="label-cayla flex flex-wrap items-center gap-x-2.5 text-[11px]">
                {b.proveedorId && (
                  <span aria-hidden className="font-display grid h-[26px] w-[26px] place-items-center rounded-full bg-sand text-[13px] normal-case tracking-normal text-tinta">
                    {b.titulo.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </span>
                )}
                <span>{b.titulo}</span>
                <span className="opacity-70">· {contar(b.cantidad)}</span>
              </p>
              <p className="flex shrink-0 items-center gap-3.5 text-sm tabular-nums">
                {b.proveedorId && (
                  <button
                    type="button"
                    onClick={() => setSeleccion(b.filas.map((f) => f.id))}
                    className="label-cayla text-[11px] text-tinta opacity-0 transition-[opacity,color] duration-200 hover:text-rojo focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                  >
                    Marcar todo
                  </button>
                )}
                <span>
                  <CifraQueCuenta valor={b.saldo} formato="soles" alMontar={llegando} />
                  {b.parcial && <span className="ml-1 text-xs opacity-70">en esta página</span>}
                </span>
              </p>
            </div>
            {b.filas.map((c) => {
              const i = posicionFila++;
              return (
                <FilaPorPagar
                  key={c.id}
                  c={c}
                  refFila={refDe(c.id)}
                  marcada={seleccion.includes(c.id)}
                  atenuada={proveedorActivo !== null && c.proveedorId !== proveedorActivo}
                  eco={coincideConEco(eco, c, ahora)}
                  foco={vistaId === c.id}
                  sellada={saliendo.includes(c.id)}
                  onAlternar={() => alternar(c)}
                  onAbrir={() => setVistaId(c.id)}
                  ahora={ahora}
                  saldoFavor={datosProveedores[c.proveedorId]?.saldoFavor ?? 0}
                  datos={datosProveedores[c.proveedorId]}
                  onPagado={alPagar}
                  notaPendiente={notas[c.id]}
                  busqueda={q}
                  entrada={llegando ? { indice: Math.min(i, 14) + indice + 1 } : null}
                  posicion={i}
                  misTiendas={misTiendas}
                />
              );
            })}
          </Fragment>
        ))}
      </Tabla>

      <BarraFija
        visible={seleccionadas.length > 0}
        resumen={
          enBarra.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5">
              <span key={enBarra.length} className="anim-pop grid h-[26px] w-[26px] place-items-center rounded-full bg-tinta text-xs font-semibold tabular-nums text-crema">
                {enBarra.length}
              </span>
              <span className="text-sm text-tinta/75">
                {contar(enBarra.length)} · <b className="font-semibold text-tinta">{enBarra[0].proveedorNombre}</b>
              </span>
              <span className="font-display text-2xl leading-none tabular-nums text-tinta">
                <CifraQueCuenta valor={totalBarra} formato="soles" />
              </span>
              <MezclaSeleccion filas={enBarra} ahora={ahora} />
              <SugerenciasDelProveedor
                proveedorId={enBarra[0].proveedorId}
                compras={compras}
                seleccion={seleccion}
                ahora={ahora}
                onAgregar={(id) => setSeleccion((s) => [...s, id])}
              />
              {aviso && (
                <span key={aviso} role="status" className="anim-revelar basis-full text-xs text-ambar-profundo">
                  {aviso}
                </span>
              )}
            </span>
          )
        }
        acciones={
          <>
            <button type="button" onClick={() => setSeleccion([])} className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo">
              Limpiar
            </button>
            <Boton type="button" peso="primario" onClick={() => setPagando(true)}>
              <span className="flex items-center gap-2">
                <Banknote aria-hidden className="h-3.5 w-3.5" /> Pagar juntos
              </span>
            </Boton>
          </>
        }
      />

      {pagando && seleccionadas.length > 0 && (
        <PagoJuntosModal
          proveedorId={seleccionadas[0].proveedorId}
          proveedorNombre={seleccionadas[0].proveedorNombre}
          comprobantes={seleccionadas}
          datos={datosProveedores[seleccionadas[0].proveedorId]}
          onClose={() => setPagando(false)}
          onPagado={alPagar}
          misTiendas={misTiendas}
        />
      )}

      {vista && (
        <PorPagarVistaRapida
          compra={vista}
          otros={otrosDeVista}
          datos={datosProveedores[vista.proveedorId]}
          nota={notas[vista.id]}
          pagos={vista.pagado > 0 ? pagos[vista.id] : []}
          posicion={{ indice: Math.max(0, indiceVista), total: ordenVisual.length }}
          ahora={ahora}
          onCerrar={() => setVistaId(null)}
          onNavegar={navegarVista}
          onPagado={alPagar}
          misTiendas={misTiendas}
        />
      )}
    </div>
  );
}

/** Cuánto de lo marcado está vencido / vence esta semana / más adelante: la barrita se reacomoda al marcar o desmarcar. */
function MezclaSeleccion({ filas, ahora }: { filas: CompraResumen[]; ahora: Date }) {
  const suma: Record<ClaveTramo, number> = { vencidas: 0, semana: 0, despues: 0 };
  for (const f of filas) suma[tramoDe(f, ahora)] += f.saldo;
  const COLOR: Record<ClaveTramo, string> = { vencidas: "bg-rojo", semana: "bg-ambar", despues: "bg-tinta/25" };
  return (
    <span className="flex min-w-[9.5rem] max-w-[14.5rem] flex-1 flex-col gap-[5px]">
      <span aria-hidden className="flex h-[5px] gap-0.5">
        {(["vencidas", "semana", "despues"] as const).map((k) => (
          <i key={k} className={`block h-full min-w-0 basis-0 rounded-sm transition-[flex-grow] duration-500 ease-cayla ${COLOR[k]}`} style={{ flexGrow: suma[k] }} />
        ))}
      </span>
      <small className="text-xs leading-tight text-tinta/65">{detalleSeleccion(filas, soles, ahora)}</small>
    </span>
  );
}

/** «＋ F001-000482 · S/ 3,923.60»: lo demás que se le debe al mismo proveedor, a un clic, en vez de marcar fila por fila. */
function SugerenciasDelProveedor({ proveedorId, compras, seleccion, ahora, onAgregar }: { proveedorId: string; compras: CompraResumen[]; seleccion: string[]; ahora: Date; onAgregar: (id: string) => void }) {
  const otros = compras
    .filter((c) => c.proveedorId === proveedorId && !seleccion.includes(c.id))
    .sort((a, b) => (a.fechaVencimiento ?? "9999").localeCompare(b.fechaVencimiento ?? "9999"))
    .slice(0, 3);
  if (otros.length === 0) return null;
  return (
    // En celular las sugerencias van en UNA fila que se desliza (partidas en tres líneas cada una se leían mal).
    <span className="flex max-w-full items-center gap-1.5 overflow-x-auto [scrollbar-width:none] max-sm:basis-full sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
      {otros.map((o, i) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onAgregar(o.id)}
          title={o.fechaVencimiento ? etiquetaVence(o.fechaVencimiento, ahora) : "Sin fecha de vencimiento"}
          className="anim-revelar shrink-0 whitespace-nowrap rounded-full border border-dashed border-tinta/25 px-2.5 py-[3px] text-xs tabular-nums text-tinta/75 transition-colors duration-200 hover:border-solid hover:border-rojo hover:text-rojo"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          ＋ {o.documento} · {soles(o.saldo)}
        </button>
      ))}
    </span>
  );
}

function Resaltar({ texto, q }: { texto: string; q: string }): ReactNode {
  const partes = partirCoincidencia(texto, q);
  if (!partes) return texto;
  return (
    <>
      {partes[0]}
      <mark className="anim-revelar rounded-[3px] bg-rojo/[0.14] px-px text-inherit">{partes[1]}</mark>
      {partes[2]}
    </>
  );
}

function FilaPorPagar({
  c,
  refFila,
  marcada,
  atenuada,
  eco,
  foco,
  sellada,
  onAlternar,
  onAbrir,
  ahora,
  saldoFavor,
  datos,
  onPagado,
  notaPendiente,
  busqueda,
  entrada,
  posicion,
  misTiendas,
}: {
  c: CompraResumen;
  refFila: (el: HTMLElement | null) => void;
  marcada: boolean;
  atenuada: boolean;
  /** Algo de arriba (un tramo, una semana de caja, un proveedor) está apuntando a esta fila. */
  eco: boolean;
  /** Es la que se está mirando en la vista rápida. */
  foco: boolean;
  /** Se acaba de pagar por completo: muestra su sello antes de plegarse. */
  sellada: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
  ahora: Date;
  saldoFavor: number;
  /** Dónde se le paga a este proveedor (banco, cuenta, Yape): el modal de pago lo muestra, copiable. */
  datos?: DatosPagoProveedor;
  /** El modal de pago de la fila avisa aquí al cerrarse con un pago registrado; la lista hace reaccionar la pantalla. */
  onPagado: (r: ResultadoPago) => void;
  notaPendiente?: NotaPendiente;
  busqueda: string;
  /** Entrada escalonada de la pantalla; `null` cuando la fila aparece después (un filtro que la muestra). */
  entrada: { indice: number } | null;
  posicion: number;
  /** ADR-0184 (F4-F5): solo para un comprador de tienda — sus tiendas, para pagar con la que corresponda. */
  misTiendas?: { id: string; nombre: string }[];
}) {
  // Cómo entra esta fila se decide UNA vez, al montarse: con la pantalla (escalonada) o, si aparece después (un filtro que la muestra), con
  // el gesto corto SIN retener el estado final. Si la clase cambiara al terminar la entrada, la animación se repetiría en toda la tabla y,
  // al retener `opacity: 1`, pisaría la atenuación de las filas de otros proveedores y el eco al apuntar una barra.
  const [alEntrar] = useState(() => (entrada ? { clase: "anim-entra", i: entrada.indice } : { clase: "anim-revelar [animation-fill-mode:backwards]", i: null }));
  const tramo = tramoDe(c, ahora);
  const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta";
  const vence = c.fechaVencimiento ? etiquetaVence(c.fechaVencimiento, ahora) : "Sin fecha";
  const plazo = plazoConsumido(c, ahora);
  const colorPlazo = tramo === "vencidas" ? "bg-rojo" : tramo === "semana" ? "bg-ambar" : "bg-tinta/45";
  const pctPagado = c.total > 0 ? Math.min(1, c.pagado / c.total) : 0;

  // La cifra que cambió cuenta hasta su valor nuevo, y la fila que recibió un pago (sin saldarse) se enciende en verde.
  const saldoMostrado = useContar(c.saldo, 900);
  const saldoAnterior = useRef(c.saldo);
  const [destello, setDestello] = useState(false);
  useEffect(() => {
    if (c.saldo < saldoAnterior.current - 0.005) {
      setDestello(true);
      const t = setTimeout(() => setDestello(false), 2500);
      saldoAnterior.current = c.saldo;
      return () => clearTimeout(t);
    }
    saldoAnterior.current = c.saldo;
  }, [c.saldo]);

  return (
    // La fila entera abre la vista rápida; la casilla, el botón y los enlaces quedan por encima (`z-10`) y no la
    // disparan. Así no hay un <button> dentro de un <a>, que el navegador no permite. En celular es una tarjeta
    // (flex); desde `sm`, una fila de la tabla. Teclado: Enter abre, Espacio marca, ↑ ↓ mueven el foco entre filas.
    <div
      ref={refFila}
      data-fila
      data-eco={eco ? "" : undefined}
      role="row"
      tabIndex={sellada ? -1 : 0}
      onClick={(e) => {
        if (sellada || (e.target as HTMLElement).closest("a,button,input,label")) return;
        onAbrir();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || sellada) return;
        if (e.key === "Enter") { e.preventDefault(); onAbrir(); }
        if (e.key === " ") { e.preventDefault(); onAlternar(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const filas = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-fila]") ?? []);
          filas[filas.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
        }
      }}
      className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-[background-color,opacity] duration-200 outline-none before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded-full before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.04] hover:before:scale-y-100 focus-visible:bg-tinta/[0.04] focus-visible:before:scale-y-100 @[40rem]:grid @[40rem]:items-center @[40rem]:gap-x-4 @[40rem]:px-5 ${PLANTILLA} ${
        marcada ? "bg-rojo/[0.045] before:scale-y-100" : ""
      } ${eco || foco ? "bg-tinta/[0.04] before:scale-y-100" : ""} ${atenuada ? "opacity-40" : ""} ${destello ? "anim-destello-ok" : ""} ${
        sellada ? "pointer-events-none bg-verde/10 before:scale-y-100 before:bg-verde" : ""
      } ${alEntrar.clase}`}
      style={alEntrar.i != null ? { ["--i" as string]: alEntrar.i } : undefined}
    >
      {sellada && (
        <span aria-hidden className="anim-revelar absolute right-5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 rounded-lg bg-papel/95 px-3 py-1.5 text-verde-profundo">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} d="M20 6 9 17l-5-5" className="trazo-linea anim-tilde" />
          </svg>
          <span className="label-cayla text-[11px]">Pagada</span>
        </span>
      )}
      <span className={`relative z-10 pt-0.5 @[40rem]:pt-0 ${sellada ? "opacity-55" : ""}`}>
        <Casilla marcada={marcada} onAlternar={onAlternar} etiqueta={`Elegir ${c.documento} de ${c.proveedorNombre} para pagar`} />
      </span>
      <div className={`min-w-0 flex-1 @[40rem]:flex-none ${sellada ? "opacity-55" : ""}`}>
        <span className="block truncate text-sm text-tinta">
          <Resaltar texto={c.proveedorNombre} q={busqueda} />{" "}
          <Link href={`/compras/factura/${c.id}`} className="relative z-10 ml-1 text-xs tabular-nums text-tinta/65 underline-offset-4 transition-colors hover:text-rojo hover:underline">
            <Resaltar texto={c.documento} q={busqueda} />
          </Link>
        </span>
        <span className="block text-xs text-tinta/55">Emitida {diaMes(c.fechaEmision)}</span>
        <span className={`mt-1 block text-xs @[40rem]:hidden ${colorVence}`}>{vence}</span>
        {/* Lo que el proveedor todavía debe acreditar por un faltante cerrado: parte de este saldo que no
            hay que pagar. Va bajo el proveedor (la columna con sitio). Es su propio enlace al comprobante,
            por encima (`z-10`) para que el tooltip con la explicación funcione sin quitarle el clic: el detalle
            es donde se registra la nota. */}
        {notaPendiente && (
          <Link href={`/compras/factura/${c.id}`} className="relative z-10 mt-1.5 block">
            <ChipNotaPendiente nota={notaPendiente} saldo={c.saldo} conAyuda />
          </Link>
        )}
      </div>
      <div className={`hidden @[40rem]:block ${sellada ? "opacity-55" : ""}`}>
        <span className={`block text-sm ${colorVence}`}>{vence}</span>
        {c.fechaVencimiento && <span className="block text-xs tabular-nums text-tinta/55">{diaMes(c.fechaVencimiento)}</span>}
        {/* Plazo consumido (emisión → vencimiento): «vence en 14 días» no dice si era un plazo de 15 o de 60. */}
        {plazo && (
          <span className="mt-[5px] block h-[3px] w-[5.5rem] overflow-hidden rounded-full bg-sand" title={`${plazo.usados} de ${plazo.total} días de plazo consumidos`}>
            <span className={`anim-crece-x block h-full rounded-full ${colorPlazo}`} style={{ width: `${Math.round(plazo.fraccion * 100)}%`, ["--i" as string]: posicion }} />
          </span>
        )}
      </div>
      <div className={`hidden text-right tabular-nums @[56rem]:block ${sellada ? "opacity-55" : ""}`}>
        <span className={`block text-sm ${c.pagado > 0 ? "text-tinta" : "text-tinta/55"}`}>{c.pagado > 0 ? soles(c.pagado) : "Sin pagos"}</span>
        <span className="block text-xs text-tinta/55">de {soles(c.total)}</span>
        {c.pagado > 0 && (
          <span className="ml-auto mt-[5px] block h-[3px] w-[5.5rem] overflow-hidden rounded-full bg-sand" title={`${Math.round(pctPagado * 100)} % pagado`}>
            <span className="anim-crece-x block h-full rounded-full bg-verde transition-[width] duration-700 ease-cayla" style={{ width: `${Math.round(pctPagado * 100)}%`, ["--i" as string]: posicion }} />
          </span>
        )}
      </div>
      <div className={`shrink-0 text-right ${sellada ? "opacity-55" : ""}`}>
        <span className="font-display block text-[18px] tabular-nums text-tinta">{soles(saldoMostrado)}</span>
        {/* Donde la columna «Pagado» no cabe (< 56rem), lo pagado se dice aquí, bajo el saldo. */}
        {c.pagado > 0 && <span className="block text-xs tabular-nums text-verde-profundo @[56rem]:hidden">pagado {soles(c.pagado)}</span>}
        <span className="relative z-10 mt-1.5 inline-block @[40rem]:hidden">
          <BotonPagar compra={c} compacto saldoFavor={saldoFavor} datos={datos} onPagado={onPagado} misTiendas={misTiendas} />
        </span>
      </div>
      <div className={`relative z-10 hidden items-center justify-end gap-2 text-right @[40rem]:flex ${sellada ? "opacity-55" : ""}`}>
        <BotonPagar compra={c} compacto saldoFavor={saldoFavor} datos={datos} onPagado={onPagado} misTiendas={misTiendas} />
        {/* La flecha aparece al pasar el mouse: dice «esta fila se abre», sin ocupar sitio en reposo. */}
        <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 -translate-x-1.5 text-tinta/45 opacity-0 transition-[opacity,transform] duration-200 ease-cayla group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
    </div>
  );
}

// Casilla de 17 px como la de las maquetas: la marcada en tinta con el check en crema, y el tilde se DIBUJA al marcar
// (`pathLength="1"` en el trazo). Un input nativo (invisible) sostiene el foco, el teclado y el lector de pantalla.
function Casilla({ marcada, onAlternar, etiqueta }: { marcada: boolean; onAlternar: () => void; etiqueta: string }) {
  return (
    <label className="inline-flex cursor-pointer">
      <input type="checkbox" checked={marcada} onChange={onAlternar} aria-label={etiqueta} className="peer sr-only" />
      <span
        aria-hidden
        className={`grid h-[17px] w-[17px] place-items-center rounded-[4px] border-[1.5px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rojo/60 ${
          marcada ? "border-tinta bg-tinta text-crema" : "border-tinta/45 bg-papel hover:border-rojo"
        }`}
      >
        {marcada && (
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} d="M20 6 9 17l-5-5" className="trazo-linea anim-tilde" />
          </svg>
        )}
      </span>
    </label>
  );
}
