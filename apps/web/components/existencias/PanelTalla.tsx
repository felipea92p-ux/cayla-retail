"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeftRight, Bandage, Barcode, Check, ClipboardList, FileText, Info, PencilLine, ShoppingBag, Trash2, Truck, Warehouse, X } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { AroSemanas } from "@/components/existencias/ColgarPrimero";
import { FlujoTalla } from "@/components/existencias/FlujoTalla";
import { accionesDeTalla, diagnosticoDeTalla, type ClaveAccionTalla } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo } from "@/lib/existencias-colgar-primero";
import { casiNoHay, fraseDeLoQueFalta } from "@/lib/reponer-prenda-reglas";
import { aclaracionDeLaCaja, desgloseDePrenda, estadoTalla, lineaDeLaSuma, urlEtiquetas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { hrefApartarDesdeTicket } from "@/lib/apartar-desde-ticket";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { mejorOrigen, type DatosFlujo, type SedeConCantidad, type TipoFlujo } from "@/lib/existencias-flujos";
import { MS_ENTRE_TECLAS } from "@/lib/existencias-pistola";
import type { FilaExistencias } from "@/lib/inventario-v2";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

type Vista = "talla" | "todas" | "ficha";
type Prenda = PrendaAgrupada<FilaExistencias>;
type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** El flujo que el panel abre de entrada (las acciones rápidas de la tarjeta y «Colgar primero» abren el panel YA en su paso). */
export type FlujoPedido = { tipo: TipoFlujo; datos?: DatosFlujo; paso?: number };

/** Lo que el filtro de la lista marca en este modelo («Sin stock atrás en este modelo · 2»), con la talla que más se vende primero. */
export type MarcaDelFiltro = {
  etiqueta: string;
  coincide: (f: FilaExistencias) => boolean;
  /** El tono del punto que marca el color y la talla en la tarjeta (ámbar lo que se hace aquí, pizarra lo de afuera). */
  tono: "ambar" | "pizarra" | "tinta";
  /** «Por colgar»: la acción es colgar (no «Ver»). */
  esColgar: boolean;
};

const ICONO: Record<ClaveAccionTalla, Icono> = {
  colgar: IconoPercha,
  subir: Warehouse,
  enviar: Truck,
  apartar: ShoppingBag,
  pedir: ArrowLeftRight,
  ajustar: PencilLine,
  ficha: ClipboardList,
};

const TONO_DIAGNOSTICO = { ambar: "bg-ambar/[0.10] text-ambar-profundo", pizarra: "bg-pizarra/[0.10] text-pizarra", verde: "bg-verde/[0.10] text-verde" } as const;

const CLASE_TALLA = {
  normal: "border-sand bg-crema",
  por_colgar: "border-ambar/35 bg-ambar/[0.10]",
  sin_atras: "border-sand bg-crema",
  sin_stock: "border-dashed border-sand bg-transparent text-taupe",
} as const;

const solesDe = (n: number | null | undefined) => (n == null ? null : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ventasDia = (f: FilaExistencias) => (f.ritmoReciente?.tipo === "medida" ? f.ritmoReciente.unidadesDia : 0);
const escribiendo = (el: Element | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

/* ====================================================================
   El panel de una talla (maqueta `docs/maquetas/existencias-tactil-2026-10/`, 2026-10-05 y 2026-10-06)

   Reemplaza al cajón de la prenda: sale por la derecha, sin velo, y se cierra con la ✕ o con Escape. Arriba la prenda con su
   precio; debajo, tres vistas —Esta talla, Todas (la matriz de colores y tallas) y Ficha—, el color y la talla para cambiar sin
   salir, y el cuerpo de la vista.

   «Esta talla»: lo que hay en piso, almacén, apartado y dañado; la frase de qué toca; lo que falta en el piso del modelo; lo agotado
   aquí con quién lo tiene y su «Pedir»; el ritmo con su aro de semanas; las otras sedes; el código; y siete acciones con lo que dicen
   debajo. Cada acción (menos Ficha y Apartar) se hace AQUÍ, paso a paso (`FlujoTalla`), y al terminar el panel vuelve a la talla con
   «✓ hecho». Apartar abre la separación de Vender con la talla puesta (ahí se cobra el adelanto).

   Teclado (como la maqueta): ← → cambian la talla, ↑ ↓ el color, 1–7 eligen la acción; dentro de un paso, Enter sigue y Escape
   vuelve a la talla.
   ==================================================================== */
export function PanelTalla({
  colores,
  claveInicial,
  varianteInicial,
  flujoInicial = null,
  ubicacionId,
  sedeNombre,
  separa,
  puedeReponer,
  puedeEnviar,
  puedeAjustar,
  puedeApartar = false,
  puedePedir = false,
  puedePedirParaCliente = false,
  destinos = [],
  sedesParaPedir = [],
  sububicacionPisoId = null,
  sububicacionAlmacenId = null,
  marcaDelFiltro = null,
  enSedeActiva,
  puedeEliminar = false,
  puedeReportarDanada = false,
  onAjustarCompleto,
  onEliminar,
  onVerApartadas,
  onVerDanadas,
  puedeResolverDanadas = false,
  onCerrar,
}: {
  /** Los colores del modelo, cada uno con sus tallas (`coloresDelModelo`). */
  colores: Prenda[];
  claveInicial: string;
  varianteInicial?: string;
  /** Abrir directamente en un paso (acción rápida de la tarjeta, «Colgar primero»). Cambia con cada pedido. */
  flujoInicial?: FlujoPedido | null;
  ubicacionId: string;
  sedeNombre: string;
  separa: boolean;
  puedeReponer: boolean;
  /** Su rol ve Traslados: Enviar a otra sede (y subir «para enviar»). */
  puedeEnviar: boolean;
  puedeAjustar: boolean;
  /** Módulo Apartados en una tienda. */
  puedeApartar?: boolean;
  /** Puede pedir a otra tienda (Traslados, en una tienda). */
  puedePedir?: boolean;
  /** Puede pedir PARA UN CLIENTE (Apartados, en una tienda). */
  puedePedirParaCliente?: boolean;
  /** A qué sedes se puede enviar o subir «para enviar». */
  destinos?: readonly { id: string; nombre: string }[];
  /** Las otras tiendas a las que se les puede pedir (`sedesParaPedir`). */
  sedesParaPedir?: readonly { id: string; nombre: string }[];
  sububicacionPisoId?: string | null;
  sububicacionAlmacenId?: string | null;
  /** El filtro de la lista, para marcar sus tallas en este modelo. `null`: «Todo». */
  marcaDelFiltro?: MarcaDelFiltro | null;
  enSedeActiva: boolean;
  puedeEliminar?: boolean;
  puedeReportarDanada?: boolean;
  /** La ventana completa de Ajustar (una talla que faltó en un conteo se enlaza ahí). */
  onAjustarCompleto: (f: FilaExistencias) => void;
  onEliminar?: () => void;
  onVerApartadas?: () => void;
  onVerDanadas?: () => void;
  puedeResolverDanadas?: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("talla");
  const [clave, setClave] = useState(claveInicial);
  const [varianteId, setVarianteId] = useState<string | undefined>(varianteInicial);
  const [flujo, setFlujo] = useState<FlujoPedido | null>(flujoInicial);
  const [hecho, setHecho] = useState<string | null>(null);
  // Cada vez que la tarjeta pide algo nuevo (otra talla, otra acción rápida), el panel lo toma sin cerrarse ni abrirse de nuevo.
  const [pedida, setPedida] = useState({ claveInicial, varianteInicial, flujoInicial });
  if (pedida.claveInicial !== claveInicial || pedida.varianteInicial !== varianteInicial || pedida.flujoInicial !== flujoInicial) {
    setPedida({ claveInicial, varianteInicial, flujoInicial });
    setClave(claveInicial);
    setVarianteId(varianteInicial);
    setVista("talla");
    setFlujo(flujoInicial);
    setHecho(null);
  }

  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(pedirCierre);
  // ↑ ↓ cambian el color (como la maqueta), por la pieza de los cajones (ADR-0128): ignora la flecha de un campo o de otro portal.
  const [pasoColor, setPasoColor] = useState<{ delta: 1 | -1; n: number } | null>(null);
  const alFlecha = useFlechasDelCajon(useCallback((delta: 1 | -1) => setPasoColor((p) => ({ delta, n: (p?.n ?? 0) + 1 })), []));

  // La hora de la última tecla dentro del panel: distingue un atajo (una tecla) de la pistola (una ráfaga).
  const ultimaTecla = useRef(0);
  // Al abrir, el teclado entra al panel (como la maqueta): ← → ↑ ↓ y 1–7 funcionan sin tocar el mouse.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // El portal de Radix monta el contenido un instante después: el foco espera a que exista (la maqueta espera 80 ms).
    const t = window.setTimeout(() => raiz.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(t);
  }, []);

  const prenda = colores.find((c) => c.clave === clave) ?? colores[0];
  if (!prenda) return null;
  const fila = prenda.tallas.find((t) => t.varianteId === varianteId) ?? prenda.tallas[0];
  if (!fila) return null;

  // Las otras tiendas, con lo que cada una tiene de esta talla (la red viene por nombre de sede).
  const origenes: SedeConCantidad[] = sedesParaPedir.map((s) => ({ ...s, cantidad: (fila.enRed ?? []).find((r) => r.sede === s.nombre)?.cantidad ?? 0 }));
  const acciones = accionesDeTalla(fila, { puedeReponer, puedeEnviar: puedeEnviar && destinos.length > 0, puedeAjustar, puedeApartar, puedePedir: puedePedir && sedesParaPedir.length > 0, origenes }, separa);
  const diag = diagnosticoDeTalla(fila, separa);
  const desglose = desgloseDePrenda({ piso: fila.pisoDisponible, almacen: fila.almacenDisponible, apartado: fila.apartado, danado: fila.danado ?? 0 });
  const ritmoTalla = ritmoDePrenda({ ...prenda, tallas: [fila], disponible: fila.disponible });
  const ritmo = textoDeRitmo(ritmoTalla);
  const precio = solesDe(prenda.precio);
  const tallasDeTodos = [...new Set(colores.flatMap((c) => c.tallas.map((t) => t.talla ?? "Única")))];
  const frase = separa ? fraseDeLoQueFalta(colores) : null;
  // Lo agotado o casi (1 o ninguna aquí, nada en camino) que otra sede tiene: la maqueta lo lista con su «Pedir» (`casiNoHay`, la misma
  // regla que usaba la ventana de Reponer).
  const afuera = casiNoHay(colores).flatMap((x) => {
    const c = colores.find((col) => col.tallas.some((t) => t.varianteId === x.clave));
    const t = c?.tallas.find((tt) => tt.varianteId === x.clave);
    return c && t ? [{ ...x, c, t }] : [];
  });
  // Lo que el filtro marca en este modelo, la que más se vende primero.
  const marcadas = marcaDelFiltro
    ? colores
        .flatMap((c) => c.tallas.filter(marcaDelFiltro.coincide).map((t) => ({ c, t })))
        .sort((a, b) => ventasDia(b.t) - ventasDia(a.t))
    : [];
  const codigo = fila.codigosBarras?.[0] ?? fila.sku ?? null;

  // La flecha pidió otro color: se aplica aquí, donde ya se conoce el color de ahora (y la talla se conserva si existe).
  if (pasoColor) {
    setPasoColor(null);
    if (!flujo && vista === "talla" && colores.length > 1) {
      const j = colores.indexOf(prenda);
      const otro = colores[(j + pasoColor.delta + colores.length) % colores.length];
      const misma = otro.tallas.find((t) => t.talla === fila.talla) ?? otro.tallas[0];
      setClave(otro.clave);
      setVarianteId(misma.varianteId);
      setHecho(null);
    }
  }

  function irA(c: Prenda, t: FilaExistencias) {
    setClave(c.clave);
    setVarianteId(t.varianteId);
    setHecho(null);
  }

  function elegirColor(c: Prenda) {
    // Conserva la talla si el otro color la tiene; si no, la primera.
    const misma = c.tallas.find((t) => t.talla === fila.talla);
    irA(c, misma ?? c.tallas[0]);
  }

  function lanzar(tipo: TipoFlujo, datos: DatosFlujo = {}, paso = 0) {
    setHecho(null);
    setVista("talla");
    setFlujo({ tipo, datos, paso });
  }

  function alAccionar(k: ClaveAccionTalla) {
    switch (k) {
      case "colgar":
        return lanzar("colgar");
      case "subir":
        return lanzar("subir");
      case "enviar":
        return lanzar("enviar");
      case "pedir":
        return lanzar("pedir");
      case "ajustar":
        return lanzar("ajustar");
      case "apartar":
        // La separación de Vender, con esta talla puesta: ahí se pide el cliente, el adelanto y se cobra con la caja abierta.
        return router.push(hrefApartarDesdeTicket([{ varianteId: fila.varianteId, cantidad: 1 }]));
      case "ficha":
        return setVista("ficha");
    }
  }

  // «Pedir» rápido de una fila de agotadas: la tienda que más tiene, 1 unidad, directo al paso de cuántas.
  function pedirRapido(c: Prenda, t: FilaExistencias) {
    const mejor = mejorOrigen(t.enRed, sedesParaPedir);
    irA(c, t);
    lanzar("pedir", mejor ? { para: "reponer", origenId: mejor.id, n: 1 } : {}, mejor ? 2 : 0);
  }

  function alTeclear(e: KeyboardEventReact<HTMLDivElement>) {
    const antes = ultimaTecla.current;
    ultimaTecla.current = e.timeStamp;
    if (e.key.length === 1 && e.timeStamp - antes < MS_ENTRE_TECLAS) return;
    alFlecha(e);
    if (e.defaultPrevented || flujo || vista !== "talla" || escribiendo(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = prenda.tallas.indexOf(fila);
      const n = prenda.tallas.length;
      irA(prenda, prenda.tallas[(j + (e.key === "ArrowRight" ? 1 : n - 1)) % n]);
    } else if (/^[1-7]$/.test(e.key)) {
      // Un dígito solo es un atajo; una ráfaga (la pistola leyendo un código que empieza con números) no: el atajo espera un instante
      // y se cancela si llega otra tecla enseguida (`MS_ENTRE_TECLAS`).
      const a = acciones[Number(e.key) - 1];
      if (!a?.ok) return;
      e.preventDefault();
      const marca = e.timeStamp;
      window.setTimeout(() => {
        if (ultimaTecla.current === marca) alAccionar(a.clave);
      }, MS_ENTRE_TECLAS + 10);
    }
  }

  const cifra = (valor: number | null, rotulo: string, abre?: { texto: string; onClick: () => void }) => {
    const cuerpo = (
      <>
        <b className={`font-display text-[30px] font-medium leading-none tabular-nums ${valor ? "text-tinta" : "text-taupe"}`}>{valor ?? 0}</b>
        <small className="text-xs text-taupe">{rotulo}</small>
        {abre && <small className="text-xs font-medium text-tinta underline-offset-2 group-hover:underline">{abre.texto}</small>}
      </>
    );
    const base = "grid gap-0.5 rounded-[14px] border border-sand bg-crema p-2.5 text-left";
    return abre ? (
      <button type="button" onClick={abre.onClick} className={`group ${base} transition-colors hover:border-taupe`}>
        {cuerpo}
      </button>
    ) : (
      <div className={base}>{cuerpo}</div>
    );
  };

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          ref={raiz}
          tabIndex={-1}
          onKeyDown={alTeclear}
          onEscapeKeyDown={alEscape}
          // Sin velo y sin cerrar al tocar afuera: las tarjetas siguen vivas y tocar otra talla le cambia la talla al panel.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // En el celular, una hoja que sube desde abajo con su asa (maqueta); desde `sm`, el cajón de la derecha. Las dos entradas son las
          // del sistema (`cayla-hoja`, `cayla-cajon-*`, ADR-0136), quietas con `prefers-reduced-motion`.
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-sand bg-papel outline-none motion-reduce:animate-none sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-full sm:max-w-[30rem] sm:rounded-none sm:border-l sm:border-t-0 ${
            cerrando
              ? "animate-[cayla-hoja-salida_240ms_var(--ease-salida)_both] sm:animate-[cayla-cajon-sale_240ms_var(--ease-salida)_both]"
              : "animate-[cayla-hoja_380ms_var(--ease-cayla)_both] sm:animate-[cayla-cajon-entra_380ms_var(--ease-cayla)_both]"
          }`}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-[5px] w-[46px] shrink-0 rounded-full bg-sand sm:hidden" />
          {/* Cabecera: la prenda, su marca, categoría y precio. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-sand px-[18px] pb-2.5 pt-3">
            <div className="h-14 w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-sand/50">
              {prenda.fotoUrl ? <Image src={prenda.fotoUrl} alt="" width={92} height={112} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={prenda.colorHex} {...categoriaDe(prenda)} />}
            </div>
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2 className="truncate font-display text-[21px] leading-tight text-tinta">{prenda.referencia}</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="truncate text-[13px] text-taupe">
                  {[prenda.marca, prenda.categoria].filter(Boolean).join(" · ")}
                  {precio && (
                    <b className="font-semibold text-tinta">
                      {prenda.marca || prenda.categoria ? " · " : ""}
                      {precio}
                    </b>
                  )}
                </p>
              </Dialog.Description>
            </div>
            <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-full bg-hueso text-tinta transition-colors hover:text-rojo">
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          {flujo ? (
            <FlujoTalla
              key={`${flujo.tipo}-${fila.varianteId}`}
              tipo={flujo.tipo}
              datosIniciales={flujo.datos}
              pasoInicial={flujo.paso}
              prenda={prenda}
              colores={colores}
              fila={fila}
              ubicacionId={ubicacionId}
              sedeNombre={sedeNombre}
              separa={separa}
              destinos={destinos}
              origenes={origenes}
              puedePedirParaCliente={puedePedirParaCliente}
              sububicacionPisoId={sububicacionPisoId}
              sububicacionAlmacenId={sububicacionAlmacenId}
              onHecho={(texto) => {
                setFlujo(null);
                setHecho(texto);
                raiz.current?.focus({ preventScroll: true });
              }}
              onSalir={() => {
                setFlujo(null);
                raiz.current?.focus({ preventScroll: true });
              }}
              onCambiar={(tipo, datos) => setFlujo({ tipo, datos, paso: 0 })}
              onAjustarCompleto={() => onAjustarCompleto(fila)}
            />
          ) : (
            <>
              {/* Vistas, color y talla. */}
              <div className="grid gap-2.5 border-b border-sand px-[18px] py-3">
                <div role="group" aria-label="Vista" className="flex gap-1.5">
                  {(
                    [
                      ["talla", "Esta talla"],
                      ["todas", "Todas"],
                      ["ficha", "Ficha"],
                    ] as const
                  ).map(([v, texto]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={vista === v}
                      onClick={() => {
                        setVista(v);
                        setHecho(null);
                      }}
                      className="min-h-11 flex-1 rounded-xl border border-sand bg-crema text-sm transition-colors aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel"
                    >
                      {texto}
                    </button>
                  ))}
                </div>
                {vista === "talla" && (
                  <>
                    <div role="radiogroup" aria-label="Color" className="flex flex-wrap items-center gap-2">
                      {colores.map((c) => (
                        <button
                          key={c.clave}
                          type="button"
                          role="radio"
                          aria-checked={c.clave === prenda.clave}
                          aria-label={c.color ?? "Sin color"}
                          title={c.color ?? "Sin color"}
                          onClick={() => elegirColor(c)}
                          style={{ background: c.colorHex ?? "var(--color-hueso)" }}
                          className="h-[30px] w-[30px] rounded-full border-2 border-papel shadow-[0_0_0_1px_var(--color-sand)] aria-checked:shadow-[0_0_0_2px_var(--color-tinta)]"
                        />
                      ))}
                      {prenda.color && <span className="text-sm text-taupe">{prenda.color}</span>}
                    </div>
                    <div role="group" aria-label="Talla" className="flex flex-wrap gap-1.5">
                      {prenda.tallas.map((t) => {
                        const sel = t.varianteId === fila.varianteId;
                        return (
                          <button
                            key={t.varianteId}
                            type="button"
                            aria-pressed={sel}
                            onClick={() => irA(prenda, t)}
                            title={separa ? `Talla ${t.talla ?? "Única"}: ${t.pisoDisponible ?? 0} en piso, ${t.almacenDisponible ?? 0} en almacén` : undefined}
                            className={`grid min-h-14 min-w-[52px] place-items-center content-center gap-px rounded-xl border px-1.5 py-1 leading-none aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel ${CLASE_TALLA[estadoTalla(t)]}`}
                          >
                            <b className="text-base font-semibold">{t.talla ?? "Única"}</b>
                            <small className={`text-[11px] tabular-nums ${sel ? "text-sand" : "text-taupe"}`}>{estadoTalla(t) === "sin_stock" ? "—" : separa ? `${t.pisoDisponible ?? 0} piso` : t.disponible}</small>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div key={`${vista}-${prenda.clave}`} className="anim-asentar scroll-cayla grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto px-[18px] pb-[18px] pt-3.5">
                {hecho && (
                  <p role="status" className="flex items-center gap-2 rounded-xl bg-verde/[0.10] px-3 py-2.5 text-sm font-medium text-verde">
                    <Check aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                    {hecho}
                  </p>
                )}

                {vista === "talla" && (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {cifra(separa ? (fila.pisoDisponible ?? 0) : fila.disponible, separa ? "En piso" : "Disponible")}
                      {separa && cifra(fila.almacenDisponible ?? 0, "En almacén")}
                      {cifra(fila.apartado, "Apartado", fila.apartado > 0 && onVerApartadas ? { texto: "Ver apartados", onClick: onVerApartadas } : undefined)}
                      {cifra(fila.danado ?? 0, "Dañado", (fila.danado ?? 0) > 0 && onVerDanadas ? { texto: puedeResolverDanadas ? "Decidir" : "Ver cuáles", onClick: onVerDanadas } : undefined)}
                    </div>
                    {/* La suma explicada de la talla (Felipe, 2026-10-04: lo que había en el cajón de la prenda) y, en la ⓘ, qué cobra la caja. */}
                    {desglose && (
                      <p className="-mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-taupe">
                        <span className="tabular-nums text-tinta">{lineaDeLaSuma(desglose).cuenta}</span>
                        {lineaDeLaSuma(desglose).texto}
                        {lineaDeLaSuma(desglose).aparte && <span>· {lineaDeLaSuma(desglose).aparte}</span>}
                        <span title={aclaracionDeLaCaja(desglose)} aria-label={aclaracionDeLaCaja(desglose)} role="img" className="inline-flex cursor-help text-taupe">
                          <Info aria-hidden className="h-3.5 w-3.5" />
                        </span>
                      </p>
                    )}
                    <p className={`rounded-xl px-3 py-2.5 text-sm ${TONO_DIAGNOSTICO[diag.tono]}`}>{diag.texto}</p>
                    {/* Lo que falta en el piso de TODO el modelo (todos sus colores), como en la maqueta. */}
                    {frase && (
                      <p className="rounded-xl bg-hueso px-3 py-2.5 text-sm text-tinta">
                        <b className="font-semibold">{frase.split(":")[0]}:</b>
                        {frase.slice(frase.indexOf(":") + 1)} Quedan marcadas al colgar.
                      </p>
                    )}
                    {afuera.length > 0 && (
                      <div className="grid gap-1.5">
                        {afuera.map(({ c, t, agotada, sedes, clave }) => (
                          <div key={clave} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-pizarra/[0.10] px-3 py-2 text-sm text-pizarra">
                            <b className="min-w-0 font-semibold">
                              {c.color ? `${c.color} ` : ""}
                              {t.talla ?? "Única"} {agotada ? "agotada" : "casi no hay"}: en otras sedes
                            </b>
                            <span className="ml-auto shrink-0 tabular-nums">{sedes}</span>
                            {/* Solo si alguna TIENDA a la que se le puede pedir la tiene: al Taller no se le pide (la base lo rechaza). */}
                            {puedePedir && mejorOrigen(t.enRed, sedesParaPedir) && (
                              <button type="button" onClick={() => pedirRapido(c, t)} className="btn-cayla btn-secundario btn-chico gap-1.5 border-pizarra/40 text-pizarra">
                                <ArrowLeftRight aria-hidden className="h-4 w-4" />
                                Pedir
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ritmo && (
                      <p className="flex items-center gap-3 text-sm text-tinta/85">
                        <AroSemanas ritmo={ritmoTalla} tam={40} />
                        <span>
                          {prenda.color ? `${prenda.color} ${fila.talla ?? ""}: ` : ""}
                          {ritmo}
                        </span>
                      </p>
                    )}
                    {marcaDelFiltro && marcadas.length > 0 && (
                      <div>
                        <p className="label-cayla mb-1.5 text-[11px] text-taupe">
                          {marcaDelFiltro.etiqueta} en este modelo · {marcadas.length}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {marcadas.map(({ c, t }, j) => (
                            <button
                              key={t.varianteId}
                              type="button"
                              aria-pressed={t.varianteId === fila.varianteId}
                              onClick={() => irA(c, t)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-papel px-3 py-1.5 text-[13px] text-tinta aria-pressed:border-tinta aria-pressed:shadow-[0_0_0_1px_var(--color-tinta)]"
                            >
                              <i aria-hidden className="h-3 w-3 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                              {c.color ?? "Sin color"} · {t.talla ?? "Única"}
                              {j === 0 && ventasDia(t) > 0 && <span className="text-taupe"> · más vendida</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="label-cayla mr-1 text-[11px] text-taupe">Otras sedes</span>
                      {(fila.enRed ?? []).length === 0 && fila.enTransito === 0 && <span className="text-sm text-taupe">Ninguna tiene</span>}
                      {(fila.enRed ?? []).map((s) => (
                        <span key={s.sede} className="rounded-full border border-pizarra px-2.5 py-1 text-[13px] font-semibold text-pizarra">
                          {nombreCortoSede(s.sede)} {s.cantidad}
                        </span>
                      ))}
                      {fila.enTransito > 0 && <span className="rounded-full border border-pizarra px-2.5 py-1 text-[13px] font-semibold text-pizarra">En camino {fila.enTransito}</span>}
                    </div>
                    {codigo && (
                      <p className="text-[13px] text-taupe">
                        Código <span className="tabular-nums text-tinta">{codigo}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {acciones.map((a, i) => {
                        const Ico = ICONO[a.clave];
                        return (
                          <button
                            key={a.clave}
                            type="button"
                            aria-disabled={!a.ok}
                            aria-keyshortcuts={String(i + 1)}
                            title={a.ok ? undefined : a.sub}
                            onClick={() => a.ok && alAccionar(a.clave)}
                            // La última, si queda sola en su fila, ocupa las dos columnas (como la maqueta).
                            className={`grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-2xl border px-3 py-2.5 text-left transition-[border-color,transform] duration-200 active:scale-[0.98] ${i === acciones.length - 1 && acciones.length % 2 === 1 ? "col-span-2" : ""} ${
                              a.sugerida ? "border-tinta bg-tinta text-papel" : "border-sand bg-papel hover:border-taupe"
                            } ${a.ok ? "" : "cursor-not-allowed opacity-50 active:scale-100"}`}
                          >
                            <Ico aria-hidden className={`row-span-2 h-[22px] w-[22px] ${a.sugerida ? "text-sand" : "text-taupe"}`} strokeWidth={1.5} />
                            <b className="flex items-center gap-1.5 text-[15.5px] font-semibold">
                              {a.texto}
                              <kbd className={`hidden rounded border px-1 text-[10.5px] font-normal sm:inline ${a.sugerida ? "border-papel/30 text-sand" : "border-sand text-taupe"}`}>{i + 1}</kbd>
                            </b>
                            <small className={`text-xs leading-tight ${a.sugerida ? "text-sand" : "text-taupe"}`}>{a.sub}</small>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {vista === "todas" && (
                  <>
                    <p className="text-[13px] text-taupe">Número grande: en piso. Debajo: en almacén. Toca una casilla para elegir esa talla y color.</p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-1 text-center text-sm">
                        <thead>
                          <tr>
                            <th className="text-left text-xs font-medium text-taupe">Color</th>
                            {tallasDeTodos.map((t) => (
                              <th key={t} className="text-xs font-medium text-taupe">
                                {t}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {colores.map((c) => (
                            <tr key={c.clave}>
                              <th scope="row" className="whitespace-nowrap text-left text-[13px] font-normal">
                                <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                                {c.color ?? "Sin color"}
                              </th>
                              {tallasDeTodos.map((t) => {
                                const f = c.tallas.find((x) => (x.talla ?? "Única") === t);
                                if (!f)
                                  return (
                                    <td key={t} className="text-taupe/50">
                                      ·
                                    </td>
                                  );
                                const sel = c.clave === prenda.clave && f.varianteId === fila.varianteId;
                                return (
                                  <td key={t}>
                                    <button
                                      type="button"
                                      aria-pressed={sel}
                                      aria-label={`${c.color ?? "Sin color"} ${t}: ${f.pisoDisponible ?? 0} en piso, ${f.almacenDisponible ?? 0} en almacén`}
                                      onClick={() => {
                                        irA(c, f);
                                        setVista("talla");
                                      }}
                                      className={`grid min-h-12 w-full place-items-center rounded-lg border leading-none aria-pressed:border-tinta ${CLASE_TALLA[estadoTalla(f)]}`}
                                    >
                                      <b className="text-base font-semibold tabular-nums">{estadoTalla(f) === "sin_stock" ? "—" : separa ? (f.pisoDisponible ?? 0) : f.disponible}</b>
                                      {separa && <small className="text-[11px] tabular-nums text-taupe">{f.almacenDisponible ?? 0}</small>}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="flex flex-wrap gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ambar/[0.10] px-2.5 py-1 text-ambar-profundo">
                        <i aria-hidden className="h-1.5 w-1.5 rounded-full bg-ambar" />
                        Por colgar
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-pizarra/[0.10] px-2.5 py-1 text-pizarra">
                        <i aria-hidden className="h-1.5 w-1.5 rounded-full bg-pizarra" />
                        Sin stock aquí
                      </span>
                    </p>
                    {separa && puedeReponer && (
                      <button type="button" onClick={() => lanzar("colgarVarias", { cant: {} })} className="btn-cayla btn-primario gap-2 justify-self-start">
                        <IconoPercha aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
                        Colgar varias tallas y colores
                      </button>
                    )}
                  </>
                )}

                {vista === "ficha" && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {colores.slice(0, 3).map((c) => (
                        <div key={c.clave} className="aspect-[3/4] overflow-hidden rounded-xl bg-sand/50">
                          {c.fotoUrl ? <Image src={c.fotoUrl} alt={c.color ?? ""} width={120} height={160} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={c.colorHex} {...categoriaDe(c)} />}
                        </div>
                      ))}
                    </div>
                    <dl className="divide-y divide-sand text-sm">
                      {(
                        [
                          ["Precio", precio],
                          ["Categoría", prenda.categoria ?? null],
                          ["Marca", prenda.marca],
                          ["Colores", colores.map((c) => c.color).filter(Boolean).join(" · ") || null],
                          ["Código", codigo],
                        ] as const
                      )
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 py-2.5">
                            <dt className="text-taupe">{k}</dt>
                            <dd className="text-right text-tinta">{v}</dd>
                          </div>
                        ))}
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {enSedeActiva && (
                        <Link href={`/productos/${prenda.productoId}/historial`} className="btn-cayla btn-secundario gap-2">
                          <FileText aria-hidden className="h-4 w-4" />
                          Ver historial en esta sede
                        </Link>
                      )}
                      {enSedeActiva && urlEtiquetas(prenda.tallas) && (
                        <Link href={urlEtiquetas(prenda.tallas) as string} className="btn-cayla btn-secundario gap-2">
                          <Barcode aria-hidden className="h-4 w-4" />
                          Imprimir etiquetas
                        </Link>
                      )}
                      {puedeReportarDanada && (fila.pisoDisponible ?? 0) + (fila.almacenDisponible ?? 0) > 0 && (
                        <button type="button" onClick={() => lanzar("danada")} className="btn-cayla btn-secundario gap-2">
                          <Bandage aria-hidden className="h-4 w-4" />
                          Reportar dañada
                        </button>
                      )}
                      {puedeEliminar && onEliminar && (
                        <button type="button" onClick={onEliminar} className="btn-cayla btn-peligro gap-2">
                          <Trash2 aria-hidden className="h-4 w-4" />
                          Eliminar el producto
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
