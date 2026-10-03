"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { TONOS } from "@/components/MuestraEtiqueta";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { EtiquetasDeLaMatriz, ordenarEtiquetas, type EtiquetaMatriz } from "./EtiquetasDeLaMatriz";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Desplegable } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { limpiarCantidad, nivelMargen } from "@/lib/alta-producto";
import { fondoDeMuestra } from "@/lib/colores-familias";
import { limpiarPrecio } from "@/lib/tabla-alta-reglas";
import { margenDeFila, textosCostoFijo, type CampoBloque, type FilaFicha } from "@/lib/variantes-ficha-reglas";
import { armarMatriz, etiquetaCambiada, totalesMatriz } from "@/lib/matriz-ficha-reglas";
import type { MotivoAjuste } from "@/lib/ajuste-reglas";
import type { ContextoFicha } from "./piezas";
import type { StockFicha } from "./useStockFicha";

// La matriz color × talla de Editar producto, con el diseño de «Unidades de hoy» de Nuevo producto (`MatrizCantidades`, Felipe
// 2026-10-02 noche): la misma tabla con cabecera, franja y punto del color, filas alternadas, la caja − N + por celda (que también
// se escribe) y la fila «Total» fija abajo. Quien cargó la prenda en el alta reconoce la tabla al volver a editarla.
//
// Lo que Editar tiene y el alta no, sigue aquí: las pestañas «Unidades de hoy · Precios · Costos · Etiquetas» (el costo solo si la
// cuenta lo ve; con el margen de cada talla debajo), «Cambiar en bloque» en Precios y Costos (`bloque`), la variante nueva marcada
// en ámbar punteado, el color que se toca para verlo en el panel, y la talla que faltó en un conteo (su «+» abre el ajuste de
// siempre, ADR-0291).
//
// Desde el 2026-10-03 (ADR-0313, act.) TODO se hace desde esta tabla: «Más de cada variante» desapareció. Cada color tiene un
// lápiz (corregirlo) y un tacho (quitarlo), la cabecera de una talla la corrige, y la pestaña «Etiquetas» pone o quita una
// etiqueta en una talla o en todas, con las etiquetas dibujadas como en Atributos DEBAJO de la tabla.

/** Lo que ofrecen los dos botones de un color: corregirlo (lápiz; `null` si la base no sabe corregir) y quitarlo (tacho). */
export type BotonesDeColor = {
  corregir: { titulo: string; motivo: string | null; onClick: () => void } | null;
  quitar: { titulo: string; onClick: () => void };
};
//
// NADA de esta tabla se guarda solo: ni el stock ni el precio. Todo espera a «Revisar y guardar» (ADR-0257; el stock desde el
// 2026-10-02 noche, ADR-0313) y lo que cambió se ve en ámbar hasta guardarlo.

export type VistaMatriz = "unidades" | CampoBloque | "etiquetas";

const BOTON_PASO =
  "grid h-6 w-5 shrink-0 place-items-center rounded-[5px] text-taupe/70 transition-colors hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25";

/** El borrador sin esa celda: al salir de ella vuelve a mostrar su número. */
function sinClave(b: Record<string, string>, clave: string): Record<string, string> {
  const salida = { ...b };
  delete salida[clave];
  return salida;
}

const texto = (n: string) => {
  const v = Number(n);
  if (!(v > 0)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

export function MatrizStockFicha({
  ctx,
  filas,
  stock,
  vista,
  onVista,
  bloque,
  colorActivo,
  onElegirColor,
  onVerColor,
  onCambioFila,
  onAbrirModal,
  etiquetas,
  avisoEtiquetas,
  onEtiqueta,
  botonesDeColor,
  onCorregirTalla,
  deshabilitado,
}: {
  ctx: ContextoFicha;
  filas: FilaFicha[];
  stock: StockFicha;
  /** Qué se escribe en las celdas: unidades de hoy, precio o costo. */
  vista: VistaMatriz;
  onVista: (v: VistaMatriz) => void;
  /** «Cambiar en bloque», que va bajo las pestañas en Precios y Costos. */
  bloque?: ReactNode;
  colorActivo: string | null;
  onElegirColor: (c: string | null) => void;
  /** Al pasar el mouse por un color, el panel lo muestra (sin elegirlo). `undefined` = vuelve al elegido. */
  onVerColor: (c: string | null | undefined) => void;
  onCambioFila: (clave: string, cambio: Partial<Pick<FilaFicha, CampoBloque>>) => void;
  /** Una talla que faltó en un conteo cerrado: el «+» abre el ajuste de siempre, que pregunta si es esa (ADR-0291). */
  onAbrirModal: (color: string | null) => void;
  /** Las etiquetas que esta cuenta puede poner (sin las de descuento si no es líder). */
  etiquetas: readonly EtiquetaMatriz[];
  avisoEtiquetas?: string;
  /** Pone o quita una etiqueta en esas variantes; sin `claves`, en todas las activas. */
  onEtiqueta: (etiquetaId: string, poner: boolean, claves?: string[]) => void;
  /** El lápiz y el tacho de cada color. */
  botonesDeColor: (color: string | null) => BotonesDeColor;
  /** Corregir una talla desde su cabecera; `null` = no se ofrece (la base todavía no sabe, o no hay permiso). */
  onCorregirTalla: ((talla: string | null) => void) | null;
  deshabilitado: boolean;
}) {
  const n = ctx.nombres;
  const m = armarMatriz(filas, n);
  const numero = (f: FilaFicha) => (f.id && f.guardada ? stock.numero(f.id) : stock.numeroNueva(f.clave));
  const totales = totalesMatriz(m, numero);
  const [tocadas, setTocadas] = useState<ReadonlySet<string>>(new Set());
  // Lo que se está escribiendo en una celda de unidades (puede quedar vacío un instante); al salir, la celda vuelve a su número.
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const relojes = useRef(new Map<string, number>());
  // La etiqueta que se está poniendo o quitando en la pestaña «Etiquetas». Si ya no se ofrece, la primera.
  const [etiquetaPedida, setEtiquetaPedida] = useState<string | null>(null);
  const etiquetaElegida = etiquetas.some((e) => e.valor === etiquetaPedida) ? etiquetaPedida : (ordenarEtiquetas(etiquetas)[0]?.valor ?? null);
  const textoEtiqueta = (id: string) => etiquetas.find((e) => e.valor === id)?.texto ?? null;
  // La celda que lleva la etiqueta se pinta con el tono de su grupo (el mismo de su dibujo): se reconoce de un vistazo.
  const estiloElegida = estiloConocido(etiquetas.find((e) => e.valor === etiquetaElegida)?.estilo ?? "neutral");
  const acentoElegida = TONOS[estiloElegida].acento;
  // Al abrir «Etiquetas», la tabla y las tarjetas de abajo quedan a la vista (Felipe: «que se pueda apreciar bien»).
  const raiz = useRef<HTMLDivElement>(null);
  function cambiarVista(v: VistaMatriz) {
    onVista(v);
    if (v !== "etiquetas" || vista === "etiquetas") return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => raiz.current?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" }), 40);
  }

  useEffect(() => {
    const r = relojes.current;
    return () => r.forEach((t) => window.clearTimeout(t));
  }, []);

  function destellar(claves: string[]) {
    setTocadas((a) => new Set([...a, ...claves]));
    for (const c of claves) {
      window.clearTimeout(relojes.current.get(c));
      relojes.current.set(
        c,
        window.setTimeout(() => setTocadas((a) => new Set([...a].filter((x) => x !== c))), 480)
      );
    }
  }

  function paso(f: FilaFicha, p: 1 | -1) {
    if (f.id && f.guardada) {
      const r = stock.paso(f.id, p);
      if (r.abrirModal) return onAbrirModal(f.guardada.colorCodigo);
    } else stock.pasoNueva(f.clave, p);
    destellar([f.clave]);
  }

  function escribir(f: FilaFicha, valor: string) {
    const limpio = limpiarCantidad(valor);
    setBorrador((b) => ({ ...b, [f.clave]: limpio }));
    if (limpio === "") return;
    const objetivo = Number(limpio);
    if (f.id && f.guardada) {
      const r = stock.fijar(f.id, objetivo);
      if (r.abrirModal) {
        setBorrador((b) => sinClave(b, f.clave));
        return onAbrirModal(f.guardada.colorCodigo);
      }
      if (r.rechazado) avisar.error("Esa talla tiene unidades apartadas para clientes: no puede quedar en menos.");
    } else stock.fijarNueva(f.clave, objetivo);
  }

  const donde = stock.lugar === "piso" ? "en el piso de venta" : stock.lugar === "almacen" ? "en el almacén" : "en esta sede";
  const enUnidades = vista === "unidades";
  const enEtiquetas = vista === "etiquetas";
  const conColumnaTotal = enUnidades && m.tallas.length > 1;
  const conFilaTotal = enUnidades && m.colores.length > 1;
  const pestanas: [VistaMatriz, string][] = [
    ["unidades", "Unidades de hoy"],
    ["precio", "Precios"],
    ...(ctx.veCosto ? ([["costo", "Costos"]] as [VistaMatriz, string][]) : []),
    ["etiquetas", "Etiquetas"],
  ];
  const nombreElegida = etiquetaElegida ? textoEtiqueta(etiquetaElegida) : null;

  if (m.colores.length === 0) return <p className="text-sm text-taupe">Esta prenda no tiene variantes activas. Agrega un color.</p>;

  return (
    <div className="scroll-mt-20 space-y-2" ref={raiz}>
      <div role="group" aria-label="Qué se escribe en la tabla" className="flex w-full rounded-[9px] border border-sand bg-crema p-[3px] @lg:inline-flex @lg:w-auto">
        {pestanas.map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => cambiarVista(v)}
            className={`flex-auto whitespace-nowrap rounded-[7px] px-1.5 py-1.5 text-[12.5px] font-medium transition-colors @lg:flex-none @lg:px-3 ${
              vista === v ? "bg-papel text-tinta ring-1 ring-sand" : "text-tinta/60 hover:text-tinta"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Las bajadas apiladas en la misma celda de grid: la más larga fija el alto, y cambiar de pestaña no mueve la tabla (ADR-0185). */}
      <div className="grid text-[12.5px] text-taupe">
        <p className={`col-start-1 row-start-1 ${enUnidades ? "" : "invisible"}`} aria-hidden={!enUnidades}>
          Lo que hay hoy {donde}. Toca − / + o escribe el número: se guarda con «Revisar y guardar». <span className="text-tinta/45">—</span> = no existe.
        </p>
        <p className={`col-start-1 row-start-1 ${vista === "precio" ? "" : "invisible"}`} aria-hidden={vista !== "precio"}>
          Escribe el precio de cada talla, o cambia varias de una vez aquí abajo. Lo que cambió se ve en ámbar hasta guardarlo.
        </p>
        <p className={`col-start-1 row-start-1 ${vista === "costo" ? "" : "invisible"}`} aria-hidden={vista !== "costo"}>
          Escribe el costo de cada talla; debajo, el margen.{" "}
          {filas.some((f) => f.activo && f.costoFijo) ? `${textosCostoFijo(ctx.costoSinComprobar).nota} Se ve sin caja.` : ""}
        </p>
        <p className={`col-start-1 row-start-1 ${enEtiquetas ? "" : "invisible"}`} aria-hidden={!enEtiquetas}>
          Elige una etiqueta abajo y toca cada talla para ponérsela o quitársela (✓ = la lleva), o ponla en todas. Se guarda con «Revisar y guardar».
        </p>
      </div>

      {/* Oculto en «Unidades de hoy», pero montado: un monto escrito y no aplicado no se pierde al cambiar de pestaña. */}
      {bloque && <div hidden={enUnidades || enEtiquetas}>{bloque}</div>}

      <div className="max-h-[520px] overflow-auto overscroll-x-contain rounded-xl border border-sand bg-papel">
        <table className="w-full border-separate border-spacing-0 text-[13px]" id="matriz-variantes">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta @lg:pl-3.5">
                Color
              </th>
              {m.tallas.map((t) => (
                <th key={t ?? "sin-talla"} scope="col" className="sticky top-0 z-[2] whitespace-nowrap bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta @lg:px-1.5">
                  {onCorregirTalla ? (
                    <button
                      type="button"
                      disabled={deshabilitado}
                      title={`Corregir la talla ${n.talla(t) || "Única"}, si se registró mal`}
                      onClick={() => onCorregirTalla(t)}
                      className="group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-papel disabled:pointer-events-none"
                    >
                      {n.talla(t) || "Única"}
                      <Pencil aria-hidden className="h-2.5 w-2.5 text-tinta/30 transition-colors group-hover:text-tinta/70" />
                    </button>
                  ) : (
                    n.talla(t) || "Única"
                  )}
                </th>
              ))}
              {conColumnaTotal && (
                <th scope="col" className="sticky top-0 z-[2] whitespace-nowrap border-l border-sand bg-hueso px-2 py-2 text-center text-xs font-semibold text-taupe @lg:px-3">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {m.colores.map((c, i) => {
              const delColor = filas.filter((f) => f.activo && f.colorCodigo === c);
              const esNuevo = delColor.every((f) => !f.guardada);
              const color = ctx.colores.find((x) => x.codigo === c);
              const nombreColor = n.color(c);
              // La franja y la zebra de la tabla del alta (maqueta B de docs/maquetas/matriz-color-identificacion-2026-10/): no se
              // pierde la fila de vista al mirar de lejos, y el anillo interior hace legible incluso un blanco o un crema.
              const conZebra = i % 2 === 1;
              const franja = color ? (fondoDeMuestra(color.hex, color.familiaColor, color.tipo) ?? "var(--color-sand)") : "var(--color-sand)";
              const fondoFila = conZebra ? "bg-hueso/40" : "bg-papel";
              return (
                <tr key={c ?? "sin-color"} id={`matriz-color-${c ?? "sin-color"}`} className={esNuevo ? "taller-fila-nueva" : undefined}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-[1] relative border-r border-t border-sand py-1.5 pl-3.5 pr-2 text-left text-[12.5px] font-semibold text-tinta @lg:whitespace-nowrap @lg:py-2 @lg:pl-4 @lg:pr-2.5 @lg:text-[13.5px] ${fondoFila}`}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_rgba(26,26,24,0.18)]" style={{ background: franja }} />
                    <span className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      aria-pressed={c === colorActivo}
                      title={`Ver ${nombreColor} en el panel`}
                      onClick={() => onElegirColor(c)}
                      onMouseEnter={() => onVerColor(c)}
                      onMouseLeave={() => onVerColor(undefined)}
                      className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-hueso aria-pressed:bg-hueso"
                    >
                      {color ? <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} /> : <Punto hex={null} />}
                      {nombreColor}
                      {esNuevo && <span className="ml-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ambar-profundo">nueva</span>}
                    </button>
                    {botonesColor(botonesDeColor(c), nombreColor)}
                    </span>
                  </th>
                  {m.tallas.map((t) => {
                    const f = m.celda(c, t);
                    if (!f) {
                      return (
                        <td key={t ?? "x"} className={`border-t border-sand p-0 ${fondoFila}`}>
                          <span title="Esta combinación no existe" className={`flex h-12 min-w-11 items-center justify-center @lg:h-[52px] @lg:min-w-[54px] ${RAYADO_FUERA}`}>
                            —
                          </span>
                        </td>
                      );
                    }
                    const etiqueta = `${nombreColor} en ${n.talla(t) || "Única"}`;
                    return (
                      <td key={f.clave} className={`border-t border-sand p-0 ${fondoFila}`}>
                        <span
                          className={`flex h-12 items-center justify-center px-0.5 @lg:h-[52px] ${vista === "costo" && ctx.veCosto ? "flex-col gap-px" : ""} ${
                            enUnidades ? "min-w-[88px] @lg:min-w-[98px]" : "min-w-[66px] @lg:min-w-[76px]"
                          }`}
                        >
                          {enUnidades ? celdaUnidades(f, etiqueta) : enEtiquetas ? celdaEtiqueta(f, etiqueta) : celdaDinero(f, etiqueta, vista)}
                        </span>
                      </td>
                    );
                  })}
                  {conColumnaTotal && (
                    <td className={`border-l border-t border-sand px-2 text-center tabular-nums text-taupe @lg:px-3 ${fondoFila}`}>
                      {stock.cargando ? "…" : totales.porColor.get(c) || ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {conFilaTotal && (
            <tfoot>
              <tr>
                <th scope="row" className="sticky bottom-0 left-0 z-[2] border-r border-t border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta @lg:pl-3.5">
                  Total
                </th>
                {m.tallas.map((t) => (
                  <td key={t ?? "sin-talla"} className="sticky bottom-0 z-[1] border-t border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">
                    {stock.cargando ? "…" : totales.porTalla.get(t) || ""}
                  </td>
                ))}
                {conColumnaTotal && (
                  <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso px-2 py-2 text-center font-semibold tabular-nums text-tinta @lg:px-3">
                    {stock.cargando ? "…" : totales.total}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {enEtiquetas && (
        <EtiquetasDeLaMatriz
          etiquetas={etiquetas}
          filas={filas}
          elegida={etiquetaElegida}
          onElegir={setEtiquetaPedida}
          onEnTodas={(poner) => etiquetaElegida && onEtiqueta(etiquetaElegida, poner)}
          avisoEtiquetas={avisoEtiquetas}
          deshabilitado={deshabilitado}
        />
      )}
    </div>
  );

  /** El lápiz (corregir el color, si se registró mal) y el tacho (quitarlo) de una fila. Un lápiz bloqueado (ya se vendió y
   *  no eres líder) no se apaga en silencio: al tocarlo dice por qué (un `title` no llega al celular). */
  function botonesColor(b: BotonesDeColor, nombreColor: string) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        {b.corregir && (
          <button
            type="button"
            aria-label={b.corregir.titulo}
            title={b.corregir.motivo ?? b.corregir.titulo}
            aria-disabled={!!b.corregir.motivo || undefined}
            disabled={deshabilitado}
            onClick={() => (b.corregir!.motivo ? avisar.error(b.corregir!.motivo) : b.corregir!.onClick())}
            className="grid h-8 w-8 place-items-center rounded-lg border border-tinta/15 bg-papel text-tinta/60 transition-colors duration-200 ease-cayla hover:border-tinta/45 hover:text-tinta disabled:opacity-40 aria-disabled:opacity-45"
          >
            <Pencil aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={b.quitar.titulo}
          title={b.quitar.titulo}
          disabled={deshabilitado}
          onClick={b.quitar.onClick}
          data-color={nombreColor}
          className="grid h-8 w-8 place-items-center rounded-lg border border-rojo-profundo/25 bg-papel text-rojo-profundo transition-colors duration-200 ease-cayla hover:border-rojo-profundo hover:bg-rojo-profundo/[0.07] disabled:opacity-40"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  /** La caja − N + de la celda: el stock de HOY en el lugar que se ajusta, más lo tocado (en ámbar hasta guardarlo). */
  function celdaUnidades(f: FilaFicha, etiqueta: string) {
    const guardada = !!(f.id && f.guardada);
    const u = numero(f);
    // Mientras llega el stock de la base, «…»: un 0 de relleno se lee como «no hay nada» (Felipe, 2026-10-02).
    const esperando = guardada && stock.cargando;
    if (guardada && !stock.puedeAjustar) {
      return (
        <span className="px-2 text-sm tabular-nums text-tinta" title="Tu rol ve el stock; para ajustarlo hace falta el módulo «Ajustar stock»">
          {esperando ? "…" : u}
        </span>
      );
    }
    const antes = guardada ? stock.numeroGuardado(f.id!) : 0;
    const cambiada = guardada ? u !== antes : u > 0;
    const puedeBajar = guardada ? !esperando && stock.puedeBajar(f.id!) : u > 0;
    const valor = borrador[f.clave] ?? (esperando ? "" : String(u));
    return (
      <span
        className="matriz-paso inline-flex items-center gap-0.5 rounded-[7px] border bg-hueso pl-0.5 pr-0.5 focus-within:border-taupe focus-within:bg-papel"
        data-tocada={tocadas.has(f.clave) || undefined}
        data-cambiada={cambiada || undefined}
        data-nueva={!guardada || undefined}
        title={cambiada ? (guardada ? `Antes ${antes} · se guarda con «Revisar y guardar»` : "Entra como stock inicial al guardar") : undefined}
      >
        <button type="button" tabIndex={-1} disabled={deshabilitado || !puedeBajar} aria-label={`Restar a ${etiqueta}`} onClick={() => paso(f, -1)} className={BOTON_PASO}>
          <Minus aria-hidden strokeWidth={2.25} className="h-3 w-3" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          aria-label={`Cuántas hay de ${etiqueta}`}
          placeholder={esperando ? "…" : "0"} // sugerir-fijo: una cantidad vacía es cero, sea cual sea la prenda
          value={valor}
          disabled={deshabilitado || esperando}
          onChange={(e) => escribir(f, e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setBorrador((b) => sinClave(b, f.clave))}
          className={`w-8 border-0 bg-transparent py-1.5 text-center text-sm tabular-nums outline-none placeholder:text-tinta/25 @lg:w-9 ${
            cambiada ? "font-semibold text-ambar-profundo" : "text-tinta"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={deshabilitado || esperando}
          aria-label={`Sumar a ${etiqueta}`}
          onClick={() => paso(f, 1)}
          className={BOTON_PASO}
        >
          <Plus aria-hidden strokeWidth={2.25} className="h-3 w-3" />
        </button>
      </span>
    );
  }

  /** ✓ si la variante lleva la etiqueta elegida; tocarla se la pone o se la quita (en ámbar si cambió contra lo guardado). */
  function celdaEtiqueta(f: FilaFicha, etiqueta: string) {
    if (!etiquetaElegida) return <span className="text-tinta/30">—</span>;
    const lleva = f.etiquetaIds.includes(etiquetaElegida);
    const cambiada = etiquetaCambiada(f, etiquetaElegida);
    const todas = f.etiquetaIds.map(textoEtiqueta).filter(Boolean).join(", ");
    return (
      <button
        type="button"
        aria-pressed={lleva}
        aria-label={`${nombreElegida} en ${etiqueta}`}
        title={`${etiqueta}: ${todas ? `lleva ${todas}` : "sin etiquetas"}${cambiada ? " · se guarda con «Revisar y guardar»" : ""}`}
        disabled={deshabilitado}
        onClick={() => onEtiqueta(etiquetaElegida, !lleva, [f.clave])}
        data-cambiada={cambiada || undefined}
        style={lleva ? { backgroundColor: acentoElegida, borderColor: acentoElegida } : undefined}
        className={`grid h-8 w-8 place-items-center rounded-[7px] border text-[13px] font-semibold transition-[background-color,border-color,transform] duration-200 ease-cayla active:scale-95 disabled:opacity-40 motion-reduce:transition-none ${
          lleva ? "text-crema hover:opacity-90" : "border-sand bg-hueso text-transparent hover:border-taupe"
        } ${cambiada ? "ring-2 ring-ambar ring-offset-1 ring-offset-papel" : ""} ${f.guardada ? "" : "outline-[1.5px] outline-dashed outline-offset-2 outline-ambar"}`}
      >
        ✓
      </button>
    );
  }

  /** El margen bajo el costo (en Costos): en rojo profundo si se pierde, en ámbar si es bajo. */
  function margenBajo(f: FilaFicha) {
    const margen = margenDeFila(f);
    const nivel = nivelMargen(margen);
    return (
      <span
        className={`text-[10.5px] leading-none tabular-nums ${nivel === "negativo" ? "text-rojo-profundo" : nivel === "bajo" ? "text-ambar-profundo" : "text-taupe"}`}
        title={nivel === "negativo" ? "Con este precio se pierde dinero en cada venta" : nivel === "bajo" ? "Menos de 30 %: un descuento de campaña ya se come la ganancia" : "Margen"}
      >
        {margen === null ? "—" : `${margen.toFixed(0)} %`}
      </span>
    );
  }

  /** La caja de precio o de costo de la celda (en ámbar si cambió). Un costo que viene de Compras se ve, no se corrige. */
  function celdaDinero(f: FilaFicha, etiqueta: string, campo: CampoBloque) {
    const valor = campo === "precio" ? f.precio : f.costo;
    const antes = f.guardada ? (campo === "precio" ? f.guardada.precio : f.guardada.costo) : null;
    const cambiado = antes !== null && Number(antes) !== Number(valor);
    if (campo === "costo" && f.costoFijo) {
      return (
        <>
          <span className="px-1 text-[13px] tabular-nums text-tinta/60" title={textosCostoFijo(ctx.costoSinComprobar).celda}>
            {texto(valor)}
          </span>
          {margenBajo(f)}
        </>
      );
    }
    return (
      <>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        id={`producto-variante-${f.clave}-${campo}`}
        aria-label={`${campo === "precio" ? "Precio" : "Costo"} de ${etiqueta}`}
        value={valor}
        disabled={deshabilitado}
        title={cambiado ? `Antes S/ ${texto(antes!)} · se guarda con «Revisar y guardar»` : undefined}
        onChange={(e) => onCambioFila(f.clave, { [campo]: limpiarPrecio(e.target.value) })}
        onFocus={(e) => e.currentTarget.select()}
        className={`w-[58px] rounded-[7px] border border-transparent bg-hueso px-0.5 py-1.5 text-center text-[13px] tabular-nums outline-none focus:border-taupe focus:bg-papel @lg:w-[66px] ${
          cambiado ? "font-semibold text-ambar-profundo" : "text-tinta"
        } ${f.guardada ? "" : "outline-[1.5px] outline-dashed outline-ambar"}`}
      />
      {campo === "costo" && margenBajo(f)}
      </>
    );
  }
}

/** «Registrar los ajustes de stock de esta visita como [Conteo físico]» — el motivo, el lugar y quién, UNA vez por visita. */
export function MotivoDeLaVisita({ stock, deshabilitado }: { stock: StockFicha; deshabilitado: boolean }) {
  if (!stock.puedeAjustar) {
    return <p className="mt-2.5 text-[12px] text-taupe">Tu rol ve el stock de cada talla; para ajustarlo hace falta el módulo «Ajustar stock».</p>;
  }
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-taupe">
        <span>Registrar los ajustes de stock de esta visita como</span>
        <Desplegable<MotivoAjuste>
          forma="cajaBaja"
          className="w-auto min-w-[9.5rem]"
          etiquetaAccesible="Motivo de los ajustes de stock"
          valor={stock.motivo}
          onValor={stock.cambiarMotivo}
          opciones={stock.motivos}
          deshabilitado={deshabilitado}
        />
        {stock.separaPisoAlmacen && (
          <>
            <span>en</span>
            <Desplegable<"almacen" | "piso">
              forma="cajaBaja"
              className="w-auto min-w-[10rem]"
              etiquetaAccesible="Dónde se ajusta el stock"
              valor={stock.ubicado}
              onValor={stock.cambiarUbicado}
              opciones={[
                { valor: "almacen", texto: "el almacén" },
                { valor: "piso", texto: "el piso de venta" },
              ]}
              deshabilitado={deshabilitado || stock.hayPendientes}
            />
          </>
        )}
      </div>
      <div id="ficha-stock-responsable" className="max-w-sm">
        <ComboResponsable control={stock.responsable} compacto deshabilitado={deshabilitado} />
      </div>
    </div>
  );
}
