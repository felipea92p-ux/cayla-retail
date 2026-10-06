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
import { AroSemanas } from "@/components/existencias/AroSemanas";
import { FlujoTalla } from "@/components/existencias/FlujoTalla";
import { accionesDeTalla, lineaDeLoQueFalta, loQueFaltaEnElPiso, marcaDeColor, pieDeTalla, queTocaConLaTalla, type ClaveAccionTalla, type TonoQueToca } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo } from "@/lib/existencias-colgar-primero";
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
  /** El símbolo del filtro (el mismo de su botón rápido): la talla y el color que cumplen lo llevan en una insignia, no solo un punto. */
  simbolo?: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
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

/** «Qué toca»: el color de la respuesta corta y su punto (ámbar = hay que hacerlo aquí, pizarra = informativo o afuera, verde = está bien). */
const TONO_QUE_TOCA: Record<TonoQueToca, { texto: string; punto: string }> = {
  ambar: { texto: "text-ambar-profundo", punto: "bg-ambar" },
  pizarra: { texto: "text-pizarra", punto: "bg-pizarra" },
  verde: { texto: "text-verde", punto: "bg-verde" },
};

const CLASE_TALLA = {
  normal: "border-sand bg-crema",
  por_colgar: "border-ambar/35 bg-ambar/[0.10]",
  sin_atras: "border-sand bg-crema",
  sin_stock: "border-dashed border-sand bg-transparent text-taupe",
} as const;

const solesDe = (n: number | null | undefined) => (n == null ? null : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** El punto del color y la insignia de la talla con un filtro puesto: los mismos tonos que en las tarjetas (`ExistenciasTarjetas`). */
const TONO_PUNTO = { ambar: "bg-ambar", pizarra: "bg-pizarra", tinta: "bg-tinta" } as const;
const TONO_INSIGNIA = { ambar: "text-ambar", pizarra: "text-pizarra", tinta: "text-tinta" } as const;
const SIN_FALTA: ReadonlySet<string> = new Set();
const escribiendo = (el: Element | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

/* ====================================================================
   El panel de una talla (maqueta `docs/maquetas/existencias-tactil-2026-10/`, 2026-10-05 y 2026-10-06)

   Reemplaza al cajón de la prenda: sale por la derecha, sin velo, y se cierra con la ✕ o con Escape. Arriba la prenda con su
   precio; debajo, tres vistas —Esta talla, Todas (la matriz de colores y tallas) y Ficha—, el color y la talla para cambiar sin
   salir, y el cuerpo de la vista.

   «Esta talla»: arriba, los colores y las tallas dicen lo suyo en su lugar (fondo ámbar si falta en el piso, «otra sede» o «en camino»
   si aquí no queda, la insignia del filtro, un punto en el color que tiene algo) y una sola línea dice cuántas faltan; debajo, lo que
   hay en piso, almacén, apartado y dañado; «Qué toca» (¿Hay? ¿Colgar? ¿Pedir?, con lo que tiene cada otra sede); el ritmo con su aro
   y el código; y las acciones con lo que dicen debajo. Nada vuelve a listar tallas más abajo (2026-10-06, noche: «es muy repetitivo
   poner de nuevo la talla, eso se podría poner arriba junto a las tallas»). Cada acción (menos Ficha y Apartar) se hace AQUÍ, paso a paso (`FlujoTalla`), y al terminar el panel vuelve a la talla con
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
  // Las tres respuestas de la talla —hay, colgar, pedir— que siempre dicen algo, aunque el motor del piso no haya decidido (2026-10-06).
  const queToca = queTocaConLaTalla(fila, {
    separa,
    tiendas: new Set(sedesParaPedir.map((s) => s.nombre)),
    puedeColgar: puedeReponer,
    puedePedir: puedePedir && sedesParaPedir.length > 0,
  });
  const desglose = desgloseDePrenda({ piso: fila.pisoDisponible, almacen: fila.almacenDisponible, apartado: fila.apartado, danado: fila.danado ?? 0 });
  const ritmoTalla = ritmoDePrenda({ ...prenda, tallas: [fila], disponible: fila.disponible });
  const ritmo = textoDeRitmo(ritmoTalla);
  const precio = solesDe(prenda.precio);
  // Es del producto: cualquier talla de cualquier color la trae igual (`conDescripcion`, página de Existencias).
  const descripcion = prenda.tallas.find((t) => t.descripcion)?.descripcion ?? null;
  const tallasDeTodos = [...new Set(colores.flatMap((c) => c.tallas.map((t) => t.talla ?? "Única")))];
  // Lo que falta en el piso de TODO el modelo: la del motor, o, si no decidió, la de los números (con la pausa advertida). Ya no se lista
  // abajo (2026-10-06, noche: «es muy repetitivo poner de nuevo la talla»): cada botón de talla lo dice con su fondo ámbar, y UNA línea
  // bajo los botones dice cuántas faltan en este color y en qué otros, sin volver a nombrarlas.
  const falta = separa ? loQueFaltaEnElPiso(colores) : null;
  const faltaEnPiso = (t: FilaExistencias) => !!falta?.ids.has(t.varianteId) || estadoTalla(t) === "por_colgar";
  const lineaFalta = lineaDeLoQueFalta(colores, prenda.clave, falta);
  const codigo = fila.codigosBarras?.[0] ?? fila.sku ?? null;
  // Cuánto tiene cada otra sede de esta talla: va bajo «¿Pedir?» (o bajo «¿Hay?» donde no se separa piso y almacén y no hay «¿Pedir?»).
  const otrasSedes = (fila.enRed ?? []).map((s) => `${nombreCortoSede(s.sede)} ${s.cantidad}`).join(" · ");
  const filaConSedes = queToca.some((q) => q.tema === "pedir") ? "pedir" : "hay";

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
      // La tecla es de la acción (Colgar = 1 … Ficha = 7), no de su lugar: el orden cambia con lo que la talla necesita.
      const a = acciones.find((x) => x.tecla === Number(e.key));
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
        {/* El velo de la maqueta: el fondo se atenúa para que el panel se lea como lo único activo. Solo visual (`pointer-events-none`):
            las tarjetas siguen vivas y tocar otra talla le cambia la talla al panel. En el celular, la hoja sube con velo más oscuro y
            un desenfoque leve, como el sistema de modales (ADR-0136). Cierra con el mismo tiempo que el panel. */}
        <div
          aria-hidden
          data-velo-panel
          className={`pointer-events-none fixed inset-0 z-40 bg-tinta/[0.12] max-sm:bg-tinta/25 max-sm:backdrop-blur-[3px] motion-reduce:animate-none ${cerrando ? "anim-velo-salida" : "anim-velo"}`}
        />
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
            {/* La descripción de la prenda (Felipe, 2026-10-06), a todo el ancho bajo el nombre: es del modelo, no cambia con el color ni con
                la vista. Sin descripción no se dibuja nada. */}
            {descripcion && <p className="col-span-3 whitespace-pre-line break-words text-[13px] leading-snug text-tinta/80">{descripcion}</p>}
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
                      {colores.map((c) => {
                        // El punto del color, como en las tarjetas: con un filtro, si alguna talla lo cumple; sin filtro, si le falta algo en
                        // el piso o si otra sede tiene lo que aquí se agotó. Así los otros colores no se vuelven a listar más abajo.
                        const marca = marcaDeColor(c.tallas, { faltan: falta?.ids ?? SIN_FALTA, coincide: marcaDelFiltro?.coincide ?? null, separa });
                        const punto = marca === "filtro" ? TONO_PUNTO[marcaDelFiltro?.tono ?? "tinta"] : marca === "falta" ? "bg-ambar" : marca === "afuera" ? "bg-pizarra" : null;
                        const dice = marca === "filtro" ? marcaDelFiltro?.etiqueta : marca === "falta" ? (falta?.enPausa ? "tallas sin colgar, según el sistema" : "faltan tallas en el piso") : marca === "afuera" ? "una agotada aquí la tiene otra sede" : null;
                        return (
                          <button
                            key={c.clave}
                            type="button"
                            role="radio"
                            aria-checked={c.clave === prenda.clave}
                            aria-label={`${c.color ?? "Sin color"}${dice ? `: ${dice}` : ""}`}
                            title={`${c.color ?? "Sin color"}${dice ? ` · ${dice}` : ""}`}
                            onClick={() => elegirColor(c)}
                            style={{ background: c.colorHex ?? "var(--color-hueso)" }}
                            className="relative h-[30px] w-[30px] rounded-full border-2 border-papel shadow-[0_0_0_1px_var(--color-sand)] aria-checked:shadow-[0_0_0_2px_var(--color-tinta)]"
                          >
                            {punto && <i aria-hidden className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-papel ${punto}`} />}
                          </button>
                        );
                      })}
                      {prenda.color && <span className="text-sm text-taupe">{prenda.color}</span>}
                    </div>
                    <div role="group" aria-label="Talla" className="flex flex-wrap gap-1.5">
                      {prenda.tallas.map((t) => {
                        const sel = t.varianteId === fila.varianteId;
                        // Cada talla dice lo suyo aquí, no en una lista aparte: fondo ámbar si falta en el piso; debajo, el piso o, si aquí no
                        // queda ninguna, «otra sede» o «en camino»; y la insignia del filtro en la esquina, como en las tarjetas.
                        const estado = faltaEnPiso(t) ? "por_colgar" : estadoTalla(t);
                        const pie = pieDeTalla(t, separa);
                        const cumple = !!marcaDelFiltro?.coincide(t);
                        const Simbolo = marcaDelFiltro?.simbolo;
                        const lectura = `Talla ${t.talla ?? "Única"}: ${separa ? `${t.pisoDisponible ?? 0} en piso, ${t.almacenDisponible ?? 0} en almacén` : `${t.disponible} en la sede`}${
                          estado === "por_colgar" ? (falta?.enPausa ? ", sin colgar según el sistema" : ", falta en el piso") : ""
                        }${pie.afuera ? `, ${pie.texto === "en camino" ? "viene en camino" : "otra sede la tiene"}` : ""}${cumple && marcaDelFiltro ? `. ${marcaDelFiltro.etiqueta}` : ""}`;
                        return (
                          <button
                            key={t.varianteId}
                            type="button"
                            aria-pressed={sel}
                            aria-label={lectura}
                            title={lectura}
                            onClick={() => irA(prenda, t)}
                            className={`relative grid min-h-14 min-w-[52px] place-items-center content-center gap-px rounded-xl border px-1.5 py-1 leading-none aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel ${CLASE_TALLA[estado]}`}
                          >
                            {cumple && Simbolo && (
                              <span aria-hidden className={`absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-papel shadow-[0_0_0_1.5px_currentColor] ${TONO_INSIGNIA[marcaDelFiltro?.tono ?? "tinta"]}`}>
                                <Simbolo aria-hidden className="h-3 w-3" strokeWidth={2.6} />
                              </span>
                            )}
                            <b className="text-base font-semibold">{t.talla ?? "Única"}</b>
                            <small className={`text-[11px] tabular-nums ${sel ? "text-sand" : pie.afuera ? "font-medium text-pizarra" : "text-taupe"}`}>{pie.texto}</small>
                          </button>
                        );
                      })}
                    </div>
                    {/* Lo que falta en el piso, en UNA línea y sin volver a nombrar las tallas: el fondo ámbar de arriba ya dice cuáles. */}
                    {lineaFalta && (
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-taupe">
                        <span aria-hidden className="inline-block h-3 w-3.5 shrink-0 rounded-[3px] border border-ambar/45 bg-ambar/[0.10]" />
                        {lineaFalta}
                      </p>
                    )}
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
                    {/* «Qué toca con esta talla»: tres preguntas cortas —¿Hay? ¿Colgar? ¿Pedir?— con su respuesta y su porqué, y si se
                        resuelve aquí mismo, su botón. La pregunta va en una columna angosta fija y el botón en la suya: ni la pregunta se
                        parte en dos líneas ni el botón salta abajo (con «COLGAR EN EL PISO» en mayúsculas pasaba las dos cosas). Bajo
                        «¿Pedir?», cuánto tiene cada otra sede: antes era un bloque de pastillas aparte, más abajo. */}
                    <section aria-label="Qué toca con esta talla" className="grid divide-y divide-sand/80 rounded-2xl border border-sand">
                      {queToca.map((q) => {
                        const boton =
                          q.accion === "colgar" ? (
                            <button type="button" onClick={() => alAccionar("colgar")} className="btn-cayla btn-secundario btn-chico shrink-0 gap-1.5">
                              <IconoPercha aria-hidden className="h-4 w-4" />
                              Colgar
                            </button>
                          ) : q.accion === "pedir" && mejorOrigen(fila.enRed, sedesParaPedir) ? (
                            <button type="button" onClick={() => pedirRapido(prenda, fila)} className="btn-cayla btn-secundario btn-chico shrink-0 gap-1.5 border-pizarra/40 text-pizarra">
                              <ArrowLeftRight aria-hidden className="h-4 w-4" />
                              Pedir
                            </button>
                          ) : null;
                        return (
                          <div
                            key={q.tema}
                            className={`grid items-center gap-x-3 px-3 py-2.5 ${boton ? "grid-cols-[4.25rem_minmax(0,1fr)_auto]" : "grid-cols-[4.25rem_minmax(0,1fr)]"}`}
                          >
                            <span className="self-start pt-px text-[13px] font-medium text-taupe">{q.titulo}</span>
                            <div className="min-w-0 text-sm leading-snug">
                              <p>
                                <b className={`mr-1.5 inline-flex items-center gap-1.5 font-semibold ${TONO_QUE_TOCA[q.tono].texto}`}>
                                  <i aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONO_QUE_TOCA[q.tono].punto}`} />
                                  {q.respuesta}
                                </b>
                                <span className="text-tinta/80">{q.detalle}.</span>
                              </p>
                              {q.tema === filaConSedes && otrasSedes && <p className="mt-0.5 text-[12.5px] text-taupe">Otras sedes: {otrasSedes}</p>}
                            </div>
                            {boton}
                          </div>
                        );
                      })}
                    </section>
                    {/* El ritmo de la talla con su aro de semanas, y el código debajo: una sola pieza en vez de dos líneas sueltas. */}
                    {(ritmo || codigo) && (
                      <div className="flex items-center gap-3 text-sm text-tinta/85">
                        {ritmo && <AroSemanas ritmo={ritmoTalla} tam={40} />}
                        <div className="min-w-0">
                          {ritmo && (
                            <p>
                              {prenda.color ? `${prenda.color} ${fila.talla ?? ""}: ` : ""}
                              {ritmo}
                            </p>
                          )}
                          {codigo && (
                            <p className="text-[12.5px] text-taupe">
                              Código <span className="tabular-nums text-tinta">{codigo}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Las acciones (2026-10-06): primero la que la talla necesita, después las que se pueden usar, como tarjetas; las que no se
                        pueden ahora, al final y chicas, con su porqué (`accionesDeTalla` decide el orden). Cada una conserva su tecla. */}
                    <div className="grid grid-cols-2 gap-2">
                      {acciones
                        .filter((a) => a.ok)
                        .map((a, i, usables) => {
                          const Ico = ICONO[a.clave];
                          return (
                            <button
                              key={a.clave}
                              type="button"
                              aria-keyshortcuts={String(a.tecla)}
                              onClick={() => alAccionar(a.clave)}
                              // La última, si queda sola en su fila, ocupa las dos columnas (como la maqueta).
                              className={`grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-2xl border px-3 py-2.5 text-left transition-[border-color,transform] duration-200 active:scale-[0.98] ${i === usables.length - 1 && usables.length % 2 === 1 ? "col-span-2" : ""} ${
                                a.sugerida ? "border-tinta bg-tinta text-papel" : "border-sand bg-papel hover:border-taupe"
                              }`}
                            >
                              <Ico aria-hidden className={`row-span-2 h-[22px] w-[22px] ${a.sugerida ? "text-sand" : "text-taupe"}`} strokeWidth={1.5} />
                              <b className="flex items-center gap-1.5 text-[15.5px] font-semibold">
                                {a.texto}
                                <kbd className={`hidden rounded border px-1 text-[10.5px] font-normal sm:inline ${a.sugerida ? "border-papel/30 text-sand" : "border-sand text-taupe"}`}>{a.tecla}</kbd>
                              </b>
                              <small className={`text-xs leading-tight ${a.sugerida ? "text-sand" : "text-taupe"}`}>{a.sub}</small>
                            </button>
                          );
                        })}
                    </div>
                    {acciones.some((a) => !a.ok) && (
                      <div>
                        <p className="label-cayla mb-1.5 text-[10.5px] text-taupe">No se puede ahora</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {acciones
                            .filter((a) => !a.ok)
                            .map((a) => {
                              const Ico = ICONO[a.clave];
                              return (
                                <li
                                  key={a.clave}
                                  title={`${a.texto}: ${a.sub}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-sand px-2.5 py-1 text-[12.5px] text-tinta/50"
                                >
                                  <Ico aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                                  {a.texto}
                                  <span className="text-tinta/40">· {a.sub.charAt(0).toLocaleLowerCase("es") + a.sub.slice(1)}</span>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {vista === "todas" && (
                  <>
                    {/* La matriz en su tarjeta y UNA leyenda debajo (2026-10-06, tarde): antes iban una frase de instrucciones arriba y dos
                        pastillas de colores abajo que parecían botones. */}
                    <div className="scroll-cayla overflow-x-auto rounded-2xl border border-sand p-1">
                      <table className="w-full border-separate border-spacing-1 text-center text-sm">
                        <thead>
                          <tr>
                            <th className="px-1.5 text-left text-xs font-medium text-taupe">Color</th>
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
                              <th scope="row" className="whitespace-nowrap px-1.5 text-left text-[13px] font-normal">
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
                                      {/* Lo del almacén con su «+» (como la tarjeta): un «0» suelto debajo se leía como otra cifra del piso. */}
                                      {separa && (f.almacenDisponible ?? 0) > 0 && <small className="text-[11px] tabular-nums text-taupe">+{f.almacenDisponible}</small>}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-taupe">
                      <span>{separa ? "Grande: en piso · «+N»: en almacén" : "Unidades en esta sede"} · toca una casilla para verla</span>
                      {separa && (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] border border-ambar/45 bg-ambar/[0.10]" />
                          Por colgar
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] border border-dashed border-taupe/50" />
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
