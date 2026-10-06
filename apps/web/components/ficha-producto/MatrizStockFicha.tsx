"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { TONOS } from "@/components/MuestraEtiqueta";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { EtiquetasDeLaMatriz, ordenarEtiquetas, type EtiquetaMatriz } from "./EtiquetasDeLaMatriz";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { RAYADO_FUERA } from "@/components/alta-producto/MatrizVariantes";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoTexto, Desplegable } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avisar } from "@/components/ui/Avisos";
import { limpiarCantidad, nivelMargen } from "@/lib/alta-producto";
import { fondoDeMuestra } from "@/lib/colores-familias";
import { limpiarPrecio } from "@/lib/tabla-alta-reglas";
import { margenDeFila, textosCostoFijo, type CampoBloque, type FilaFicha } from "@/lib/variantes-ficha-reglas";
import { armarMatriz, etiquetaCambiada, rangoDePrecios, totalesMatriz, type Hueco } from "@/lib/matriz-ficha-reglas";
import { AYUDA_ENCONTRE_PRENDAS, notaSuficiente, type MotivoAjuste } from "@/lib/ajuste-reglas";
import { ConMarca } from "./TiraFicha";
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
// etiqueta en una talla o en todas, con las etiquetas dibujadas como en Atributos DEBAJO de la tabla. Cada talla tiene también su
// lápiz y su tacho en la cabecera (quitarla de todos los colores, `quitarTalla`). Una celda «—» (esa
// combinación no se vende) se toca para agregarla (`comoLlenarHueco`): era lo único que la tabla no podía hacer.

/** Lo que ofrecen los dos botones de un color: corregirlo (lápiz; `null` si la base no sabe corregir) y quitarlo (tacho). */
export type BotonesDeColor = {
  corregir: { titulo: string; motivo: string | null; onClick: () => void } | null;
  quitar: { titulo: string; onClick: () => void };
};
//
// NADA de esta tabla se guarda solo: ni el stock ni el precio. Todo espera a «Revisar y guardar» (ADR-0257; el stock desde el
// 2026-10-02 noche, ADR-0313) y lo que cambió se ve en ámbar hasta guardarlo.

export type VistaMatriz = "unidades" | CampoBloque | "etiquetas";

/** El mínimo de cada talla: lo que pide la caja − N + (la más ancha de las cuatro pestañas). Igual en todas: no se corre nada. */
const ANCHO_CELDA_PX = 80;
/** La columna de la derecha (Total, Precio, Costo, Llevan). */
const ANCHO_RESUMEN_PX = 60;
/** La columna Color nunca baja de lo que pide un nombre corto con su lápiz y su tacho (la tabla se desliza antes de apretarla). */
const ANCHO_COLOR_MIN_PX = 168;
/** Qué parte de la tabla es la columna Color: un tercio con pocas tallas, menos con muchas (no se come la pantalla). Depende SOLO de
 *  cuántas tallas hay, nunca de los colores ni de sus nombres: agregar un color no la mueve. (`clamp()` en un `<col>` no lo respeta
 *  el navegador: se probó, y la columna quedaba igual que las tallas.) */
function anchoColor(tallas: number): string {
  return tallas <= 3 ? "36%" : tallas <= 5 ? "30%" : "24%";
}
const TITULO_RESUMEN: Record<VistaMatriz, string> = { unidades: "Total", precio: "Precio", costo: "Costo", etiquetas: "Llevan" };

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
  onQuitarTalla,
  huecos,
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
  /** El tacho de la cabecera de una talla: deja de venderse en todos los colores (`quitarTalla`); se deshace hasta guardar. */
  onQuitarTalla: (talla: string | null) => void;
  /** La celda «—» (esa combinación no se vende): qué pasaría al tocarla y cómo se agrega (`comoLlenarHueco`). */
  huecos: { como: (color: string | null, talla: string | null) => Hueco; onLlenar: (color: string | null, talla: string | null) => void };
  deshabilitado: boolean;
}) {
  const n = ctx.nombres;
  const m = armarMatriz(filas, n);
  const numero = (f: FilaFicha) => (f.id && f.guardada ? stock.numero(f.id) : stock.numeroNueva(f.clave));
  const totales = totalesMatriz(m, numero);
  const [tocadas, setTocadas] = useState<ReadonlySet<string>>(new Set());
  // Lo que se está escribiendo en una celda de unidades (puede quedar vacío un instante); al salir, la celda vuelve a su número.
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  // Celdas cuyo número escrito quedó bajo lo apartado. Se avisa al SALIR de la celda, no con cada tecla: al escribir «10» sobre una
  // talla con 2 apartadas, la tecla «1» no es un error (revisión del 2026-10-03).
  const bajoApartado = useRef(new Set<string>());
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
    bajoApartado.current.delete(f.clave);
    if (limpio === "") return;
    const objetivo = Number(limpio);
    if (f.id && f.guardada) {
      const r = stock.fijar(f.id, objetivo);
      if (r.abrirModal) {
        setBorrador((b) => sinClave(b, f.clave));
        return onAbrirModal(f.guardada.colorCodigo);
      }
      if (r.rechazado) bajoApartado.current.add(f.clave);
    } else stock.fijarNueva(f.clave, objetivo);
  }

  /** Al salir de la celda vuelve a su número; si lo escrito quedó bajo lo apartado, recién ahí se dice por qué no se tomó. */
  function salirDeCelda(f: FilaFicha) {
    if (bajoApartado.current.delete(f.clave)) avisar.error("Esa talla tiene unidades apartadas para clientes: no puede quedar en menos.");
    setBorrador((b) => sinClave(b, f.clave));
  }

  const donde = stock.lugar === "piso" ? "en el piso de venta" : stock.lugar === "almacen" ? "en el almacén" : "en esta sede";
  const enUnidades = vista === "unidades";
  const enEtiquetas = vista === "etiquetas";
  // La columna de la derecha está en TODAS las pestañas (Felipe 2026-10-03: «debe estar todo en el mismo lugar»): si apareciera solo
  // en «Unidades de hoy», cambiar de pestaña correría las tallas. Cada pestaña pone ahí lo suyo (`resumenDeFila`).
  const conColumnaTotal = m.tallas.length > 1;
  const conFilaTotal = enUnidades && m.colores.length > 1;
  const pestanas: [VistaMatriz, string][] = [
    ["unidades", "Unidades de hoy"],
    ["precio", "Precios"],
    ...(ctx.veCosto ? ([["costo", "Costos"]] as [VistaMatriz, string][]) : []),
    ["etiquetas", "Etiquetas"],
  ];
  const nombreElegida = etiquetaElegida ? textoEtiqueta(etiquetaElegida) : null;
  // Todos los costos vienen de compras: en «Costos» no hay nada que escribir, ni de a una ni en bloque.
  const activas = filas.filter((f) => f.activo);
  const costosTodosFijos = activas.length > 0 && activas.every((f) => f.costoFijo);

  /** Lo que dice la columna de la derecha en la fila de un color, según la pestaña. */
  function resumenDeFila(c: string | null, delColor: readonly FilaFicha[]): string {
    if (enUnidades) return stock.cargando ? "…" : String(totales.porColor.get(c) || "");
    if (enEtiquetas) {
      if (!etiquetaElegida) return "";
      return `${delColor.filter((f) => f.etiquetaIds.includes(etiquetaElegida)).length}/${delColor.length}`;
    }
    const montos = delColor.map((f) => Number(vista === "precio" ? f.precio : f.costo)).filter((x) => x > 0);
    return montos.length > 0 ? rangoDePrecios(montos) : "—";
  }

  if (m.colores.length === 0) return <p className="text-sm text-taupe">Esta prenda no tiene variantes activas. Agrega un color.</p>;

  return (
    <div className="scroll-mt-20 space-y-2" ref={raiz}>
      {/* La misma tabla con otro dato a la vista: el segmento de modo del sistema (ADR-0358). Angosto, ocupa todo el ancho. */}
      <SegmentoDeslizante
        forma="modo"
        etiqueta="Qué se escribe en la tabla"
        valor={vista}
        onCambio={(v) => cambiarVista(v as VistaMatriz)}
        opciones={pestanas.map(([v, t]) => ({ clave: v, etiqueta: t }))}
        className="w-full @lg:w-auto [&>button]:flex-auto [&>button]:justify-center [&>button]:px-1.5 @lg:[&>button]:flex-none @lg:[&>button]:px-3"
      />

      {/* Las bajadas apiladas en la misma celda de grid: la más larga fija el alto, y cambiar de pestaña no mueve la tabla (ADR-0185). */}
      <div className="grid text-[12.5px] text-taupe">
        <p className={`col-start-1 row-start-1 ${enUnidades ? "" : "invisible"}`} aria-hidden={!enUnidades}>
          Lo que hay hoy {donde}.{stock.puedeAjustar ? " Toca − / + o escribe el número: se guarda con «Revisar y guardar»." : ""}{" "}
          <span className="text-tinta/45">—</span> = no existe: tócala para agregarla.
        </p>
        <p className={`col-start-1 row-start-1 ${vista === "precio" ? "" : "invisible"}`} aria-hidden={vista !== "precio"}>
          Escribe el precio de cada talla, o cambia varias de una vez aquí abajo. Lo que cambió se ve en ámbar hasta guardarlo.
        </p>
        <p className={`col-start-1 row-start-1 ${vista === "costo" ? "" : "invisible"}`} aria-hidden={vista !== "costo"}>
          {costosTodosFijos ? "El costo de cada talla, con su margen debajo. " : "Escribe el costo de cada talla; debajo, el margen. "}
          {filas.some((f) => f.activo && f.costoFijo) ? `${textosCostoFijo(ctx.costoSinComprobar).nota} Se ve sin caja.` : ""}
        </p>
        <p className={`col-start-1 row-start-1 ${enEtiquetas ? "" : "invisible"}`} aria-hidden={!enEtiquetas}>
          Elige una etiqueta abajo y toca cada talla para ponérsela o quitársela (✓ = la lleva), o ponla en todas. Se guarda con «Revisar y guardar».
        </p>
      </div>

      {stock.fallaLectura && (
        <p role="alert" className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ambar-profundo">
          No se pudo leer el stock de esta sede: las tallas siguen en «…».
          <button type="button" onClick={stock.recargar} className="btn-cayla btn-enlace text-[12.5px]">
            Reintentar
          </button>
        </p>
      )}

      {/* Oculto en «Unidades de hoy», pero montado: un monto escrito y no aplicado no se pierde al cambiar de pestaña. */}
      {bloque && <div hidden={enUnidades || enEtiquetas || (vista === "costo" && costosTodosFijos)}>{bloque}</div>}

      <div className="max-h-[520px] overflow-auto overscroll-x-contain rounded-xl border border-sand bg-papel">
        {/* Columnas de ancho FIJO (table-fixed + colgroup): agregar un color de nombre largo («Gris perla · nueva») o cambiar de
            pestaña no corre las tallas. El color tiene su ancho y su nombre se corta con «…»; las tallas se reparten lo que queda,
            y en una pantalla angosta la tabla no se aprieta: se desliza de lado (el mínimo de abajo), con el color fijo a la izquierda. */}
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-[13px]"
          style={{ minWidth: ANCHO_COLOR_MIN_PX + m.tallas.length * ANCHO_CELDA_PX + (conColumnaTotal ? ANCHO_RESUMEN_PX : 0) }}
          id="matriz-variantes"
        >
          {/* Desde `@lg` el color es una parte fija de la tabla (`anchoColor`). En una tarjeta angosta (celular) las tallas miden
              su mínimo y el color se queda con el resto, que el `minWidth` de la tabla garantiza ≥ 168 px: con un 36 % fijo, a 375 px
              y una sola talla la columna medía 110 px y el lápiz y el tacho dejaban el nombre en una letra (revisión 2026-10-03). */}
          <colgroup>
            <col className="@lg:w-(--ancho-color)" style={{ "--ancho-color": anchoColor(m.tallas.length) } as CSSProperties} />
            {m.tallas.map((t) => (
              <col key={t ?? "sin-talla"} className="w-20 @lg:w-auto" />
            ))}
            {conColumnaTotal && <col style={{ width: `${ANCHO_RESUMEN_PX}px` }} />}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-[3] whitespace-nowrap border-r border-sand bg-hueso py-2 pl-2 pr-2 text-left text-xs font-semibold text-tinta @lg:pl-3.5">
                Color
              </th>
              {m.tallas.map((t) => {
                const nombreTalla = n.talla(t) || "Única";
                // Todas sus variantes son nuevas: se marca «nueva» como un color recién agregado, y quitarla no deja nada pendiente.
                const tallaNueva = filas.filter((f) => f.activo && f.tallaId === t).every((f) => !f.guardada);
                const quitarTitulo = tallaNueva
                  ? `Quitar la talla ${nombreTalla} (recién agregada)`
                  : `Quitar la talla ${nombreTalla}: deja de venderse en todos los colores al guardar`;
                return (
                  <th key={t ?? "sin-talla"} scope="col" className="sticky top-0 z-[2] bg-hueso px-1 py-1.5 text-center text-xs font-semibold tabular-nums text-tinta @lg:px-1.5">
                    {/* El nombre (con su lápiz, si se puede corregir) y el tacho, como la fila de un color. En una columna angosta el tacho
                        baja a una segunda línea en vez de empujar la tabla. */}
                    <span className="inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                      <span className="inline-flex flex-col items-center leading-tight">
                        {onCorregirTalla ? (
                          <button
                            type="button"
                            disabled={deshabilitado}
                            title={`Corregir la talla ${nombreTalla}, si se registró mal`}
                            onClick={() => onCorregirTalla(t)}
                            className="group inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors hover:bg-papel disabled:pointer-events-none"
                          >
                            {nombreTalla}
                            <Pencil aria-hidden className="h-2.5 w-2.5 text-tinta/30 transition-colors group-hover:text-tinta/70" />
                          </button>
                        ) : (
                          <span className="whitespace-nowrap px-1.5 py-0.5">{nombreTalla}</span>
                        )}
                        {tallaNueva && <span className="text-[9.5px] font-bold uppercase tracking-wide text-ambar-profundo">nueva</span>}
                      </span>
                      <button
                        type="button"
                        aria-label={quitarTitulo}
                        title={quitarTitulo}
                        disabled={deshabilitado}
                        onClick={() => onQuitarTalla(t)}
                        data-talla={nombreTalla}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-rojo-profundo/25 bg-papel text-rojo-profundo transition-colors duration-200 ease-cayla hover:border-rojo-profundo hover:bg-rojo-profundo/[0.07] disabled:opacity-40"
                      >
                        <Trash2 aria-hidden className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                );
              })}
              {conColumnaTotal && (
                <th scope="col" className="sticky top-0 z-[2] whitespace-nowrap border-l border-sand bg-hueso px-1 py-2 text-center text-xs font-semibold text-taupe">
                  {TITULO_RESUMEN[vista]}
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
                    className={`sticky left-0 z-[1] relative overflow-hidden border-r border-t border-sand py-1.5 pl-3 pr-1.5 text-left text-[12.5px] font-semibold text-tinta @lg:py-2 @lg:pl-3.5 @lg:pr-2 @lg:text-[13.5px] ${fondoFila}`}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_color-mix(in_srgb,var(--color-tinta)_18%,transparent)]" style={{ background: franja }} />
                    <span className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      aria-pressed={c === colorActivo}
                      title={`Ver ${nombreColor} en el panel`}
                      onClick={() => onElegirColor(c)}
                      onMouseEnter={() => onVerColor(c)}
                      onMouseLeave={() => onVerColor(undefined)}
                      className="-ml-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-hueso aria-pressed:bg-hueso"
                    >
                      {color ? <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} /> : <Punto hex={null} />}
                      {/* «nueva» va DEBAJO del nombre: al lado le quitaba espacio y «Azul eléctrico» salía cortado. */}
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate" title={nombreColor}>
                          {nombreColor}
                        </span>
                        {esNuevo && <span className="text-[9.5px] font-bold uppercase tracking-wide text-ambar-profundo">nueva</span>}
                      </span>
                    </button>
                    {botonesColor(botonesDeColor(c), nombreColor)}
                    </span>
                  </th>
                  {m.tallas.map((t) => {
                    const f = m.celda(c, t);
                    if (!f) {
                      return (
                        <td key={t ?? "x"} className={`border-t border-sand p-0 ${fondoFila}`}>
                          {celdaHueco(c, t, nombreColor)}
                        </td>
                      );
                    }
                    const etiqueta = `${nombreColor} en ${n.talla(t) || "Única"}`;
                    return (
                      <td key={f.clave} className={`border-t border-sand p-0 ${fondoFila}`}>
                        <span
                          className={`flex h-12 items-center justify-center px-0.5 @lg:h-[52px] ${vista === "costo" && ctx.veCosto ? "flex-col gap-px" : ""}`}
                        >
                          {enUnidades ? celdaUnidades(f, etiqueta) : enEtiquetas ? celdaEtiqueta(f, etiqueta) : celdaDinero(f, etiqueta, vista)}
                        </span>
                      </td>
                    );
                  })}
                  {conColumnaTotal && (
                    <td className={`truncate border-l border-t border-sand px-1 text-center text-[12px] tabular-nums text-taupe ${fondoFila}`}>
                      {resumenDeFila(c, delColor)}
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
                  <td className="sticky bottom-0 z-[1] border-l border-t border-sand bg-hueso px-1 py-2 text-center font-semibold tabular-nums text-tinta">
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
            className="grid h-7 w-7 place-items-center rounded-lg border border-tinta/15 bg-papel text-tinta/60 transition-colors duration-200 ease-cayla hover:border-tinta/45 hover:text-tinta disabled:opacity-40 aria-disabled:opacity-45"
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
          className="grid h-7 w-7 place-items-center rounded-lg border border-rojo-profundo/25 bg-papel text-rojo-profundo transition-colors duration-200 ease-cayla hover:border-rojo-profundo hover:bg-rojo-profundo/[0.07] disabled:opacity-40"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  /** La celda «—»: esa combinación no se vende. Si se puede, tocarla la agrega (nueva en 0, o la que existió desactivada vuelve);
   *  si no, dice por qué al tocarla (un `title` no llega al celular). Mide lo mismo que una celda con stepper: nada se corre. */
  function celdaHueco(c: string | null, t: string | null, nombreColor: string) {
    const h = huecos.como(c, t);
    const donde = `${nombreColor} en ${n.talla(t) || "Única"}`;
    const titulo = h.puede
      ? h.queHace === "reactiva"
        ? `${donde} existió y está desactivada: tócala para que vuelva a venderse (se guarda con «Revisar y guardar»)`
        : `${donde} no existe: tócala para agregarla (nace en 0 y se guarda con «Revisar y guardar»)`
      : h.motivo;
    return (
      <button
        type="button"
        aria-label={h.puede ? `Agregar ${donde}` : `${donde} no existe. ${h.motivo}`}
        aria-disabled={!h.puede || undefined}
        title={titulo}
        disabled={deshabilitado}
        onClick={() => (h.puede ? huecos.onLlenar(c, t) : avisar.error(h.motivo))}
        className={`group flex h-12 w-full items-center justify-center text-tinta/25 transition-colors duration-200 ease-cayla @lg:h-[52px] ${RAYADO_FUERA} ${
          h.puede ? "hover:bg-hueso hover:text-tinta focus-visible:bg-hueso focus-visible:text-tinta" : "cursor-help"
        } disabled:pointer-events-none`}
      >
        <span aria-hidden className={h.puede ? "group-hover:hidden group-focus-visible:hidden" : ""}>
          —
        </span>
        {h.puede && (
          <span aria-hidden className="hidden items-center gap-1 text-[12px] font-semibold group-hover:inline-flex group-focus-visible:inline-flex">
            <Plus strokeWidth={2.5} className="h-3 w-3" />
            {h.queHace === "reactiva" ? "Volver" : "Agregar"}
          </span>
        )}
      </button>
    );
  }

  /** La caja − N + de la celda: el stock de HOY en el lugar que se ajusta, más lo tocado (en ámbar hasta guardarlo). */
  function celdaUnidades(f: FilaFicha, etiqueta: string) {
    const guardada = !!(f.id && f.guardada);
    const u = numero(f);
    // Mientras llega el stock de la base, «…»: un 0 de relleno se lee como «no hay nada» (Felipe, 2026-10-02).
    const esperando = guardada && stock.cargando;
    // Sin «Ajustar stock» se ve el número, no la caja. Una variante nueva también: nace en 0 y no se le puede poner stock inicial
    // (la carga es un ajuste: `cargarNuevas` no podría hacerla y se perdería en silencio).
    if (!stock.puedeAjustar) {
      return (
        <span
          className="px-2 text-sm tabular-nums text-tinta"
          title={guardada ? "Tu rol ve el stock; para ajustarlo hace falta el módulo «Ajustar stock»" : "Nace sin unidades: para cargarlas hace falta el módulo «Ajustar stock»"}
        >
          {esperando ? "…" : u}
        </span>
      );
    }
    const antes = guardada ? stock.numeroGuardado(f.id!) : 0;
    const cambiada = guardada ? u !== antes : u > 0;
    const puedeBajar = guardada ? !esperando && stock.puedeBajar(f.id!) : u > 0;
    // ADR-0328: con la carga inicial cerrada, una talla que nunca estuvo en la tienda suma solo con «Encontré prendas». Con otro
    // motivo la celda queda quieta (sin cambios no hay nada que restar) y dice por qué; la línea bajo el motivo dice qué hacer.
    const bloqueo = guardada ? stock.bloqueoDeSubida(f.id!) : stock.bloqueoNuevas;
    const quieta = !!bloqueo && u === 0;
    const valor = borrador[f.clave] ?? (esperando ? "" : String(u));
    return (
      <span
        className="matriz-paso inline-flex items-center gap-0.5 rounded-[7px] border bg-hueso pl-0.5 pr-0.5 focus-within:border-taupe focus-within:bg-papel"
        data-tocada={tocadas.has(f.clave) || undefined}
        data-cambiada={cambiada || undefined}
        data-nueva={!guardada || undefined}
        title={
          bloqueo ??
          (cambiada ? (guardada ? `Antes ${antes} · se guarda con «Revisar y guardar»` : "Entra como stock inicial al guardar") : undefined)
        }
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
          disabled={deshabilitado || esperando || quieta}
          onChange={(e) => escribir(f, e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => salirDeCelda(f)}
          className={`w-8 border-0 bg-transparent py-1.5 text-center text-sm tabular-nums outline-none placeholder:text-tinta/25 @lg:w-9 ${
            cambiada ? "font-semibold text-ambar-profundo" : "text-tinta"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={deshabilitado || esperando || !!bloqueo}
          aria-label={bloqueo ? `Sumar a ${etiqueta}: ${bloqueo}` : `Sumar a ${etiqueta}`}
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
          id="ficha-stock-motivo"
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
      {/* ADR-0328: «Encontré prendas» dice dónde estaban (la base la exige: 3 letras o más). Va junto al motivo que la pide, con su
          marca de la guía: ✓ cuando ya alcanza, «falta» mientras no. Sin «Encontré prendas» no se ve ni se envía. */}
      {stock.pideNota && (
        <div className="max-w-sm">
          <CampoTexto
            id="ficha-stock-nota"
            etiqueta={<ConMarca estado={notaSuficiente(stock.motivo, stock.nota) ? "hecho" : "falta"}>{stock.ayudaNota.etiqueta}</ConMarca>}
            ayuda={AYUDA_ENCONTRE_PRENDAS}
            value={stock.nota}
            disabled={deshabilitado}
            onChange={(e) => stock.cambiarNota(e.target.value)}
            maxLength={200}
            placeholder={stock.ayudaNota.placeholder}
          />
        </div>
      )}
      <div id="ficha-stock-responsable" className="max-w-sm">
        <ComboResponsable control={stock.responsable} compacto deshabilitado={deshabilitado} />
      </div>
      {/* ADR-0328: hasta cuándo esta sede carga lo que ya tenía (o que ya se cerró), antes de tocar una talla nueva. */}
      {stock.avisoCarga && <p className="text-[12px] text-taupe">{stock.avisoCarga}</p>}
    </div>
  );
}
