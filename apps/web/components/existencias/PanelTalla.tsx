"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, ArrowLeftRight, Bandage, Barcode, Check, ChevronRight, ClipboardList, FileText, Info, PencilLine, ShoppingBag, Trash2, Truck, Warehouse, X } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { AroSemanas } from "@/components/existencias/AroSemanas";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { FlujoTalla } from "@/components/existencias/FlujoTalla";
import { accionesDeTalla, origenesDeTalla, lineaDeLoQueFalta, loQueFaltaEnElPiso, marcaDeColor, pieDeTalla, queTocaConLaTalla, type ClaveAccionTalla, type TonoQueToca } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo, vendidasDeLaTalla } from "@/lib/existencias-colgar-primero";
import { VENTANA_RITMO_RECIENTE_DIAS } from "@/lib/existencias-ritmo";
import { estadoTalla, urlEtiquetas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { celdaTarjeta } from "@/lib/existencias-tarjeta-compacta";
import { insigniaDeTalla } from "@/lib/existencias-panel-talla";
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


/** La insignia junto al número grande (`insigniaDeTalla`): rojo = se acabó, ámbar = falta colgar, pizarra = informativo, verde = bien. */
const TONO_INSIGNIA_TALLA: Record<TonoQueToca | "rojo", string> = {
  rojo: "bg-rojo/[0.11] text-rojo-profundo",
  ambar: "bg-ambar/[0.13] text-ambar-profundo",
  pizarra: "bg-pizarra/[0.12] text-pizarra",
  verde: "bg-verde/[0.11] text-verde",
};

const CLASE_TALLA = {
  normal: "border-sand bg-crema",
  por_colgar: "border-ambar/35 bg-ambar/[0.10]",
  sin_atras: "border-sand bg-crema",
  // Agotada (nada libre en la sede): rojo suave, como la columna de la tarjeta (2026-10-07).
  sin_stock: "border-rojo/35 bg-rojo/[0.08] text-rojo-profundo",
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
  vistaInicial,
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
  /** Abrir en otra vista que «Esta talla» («Ver ficha» del menú «Más» de la tarjeta). */
  vistaInicial?: "ficha";
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
  const [vista, setVista] = useState<Vista>(vistaInicial ?? "talla");
  const [clave, setClave] = useState(claveInicial);
  const [varianteId, setVarianteId] = useState<string | undefined>(varianteInicial);
  const [flujo, setFlujo] = useState<FlujoPedido | null>(flujoInicial);
  const [hecho, setHecho] = useState<string | null>(null);
  // «¿Cómo se vende?» del pie: el ritmo y el código, plegados (2026-10-07).
  const [verRitmo, setVerRitmo] = useState(false);
  // Cada vez que la tarjeta pide algo nuevo (otra talla, otra acción rápida), el panel lo toma sin cerrarse ni abrirse de nuevo.
  const [pedida, setPedida] = useState({ claveInicial, varianteInicial, flujoInicial, vistaInicial });
  if (pedida.claveInicial !== claveInicial || pedida.varianteInicial !== varianteInicial || pedida.flujoInicial !== flujoInicial || pedida.vistaInicial !== vistaInicial) {
    setPedida({ claveInicial, varianteInicial, flujoInicial, vistaInicial });
    setClave(claveInicial);
    setVarianteId(varianteInicial);
    setVista(vistaInicial ?? "talla");
    setFlujo(flujoInicial);
    setHecho(null);
  }

  const [cerrando, setCerrando] = useState(false);
  const cerrarYa = useCallback(() => setCerrando(true), []);
  // El panel bloquea la pantalla de atrás (2026-10-06, Felipe): tocar afuera, la ✕ o Escape lo cierran, y si hay un paso a medias
  // (un dato cambiado, un paso avanzado, un guardado en camino) primero se pregunta «¿Salir sin guardar?».
  const [pasoSucio, setPasoSucio] = useState(false);
  const { pedirAccion, retirarYa, aviso } = useSalidaSinGuardar(
    Boolean(flujo) && pasoSucio,
    "Dejaste esta acción a medias y todavía no se guardó. Si sales ahora, se pierde lo que llenaste."
  );
  const pedirCierre = useCallback(() => pedirAccion(cerrarYa), [pedirAccion, cerrarYa]);
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

  // Las otras tiendas, con lo que cada una tiene de esta talla (por id de sede, no por nombre).
  const origenes: SedeConCantidad[] = origenesDeTalla(fila.enRed, sedesParaPedir);
  const acciones = accionesDeTalla(fila, { puedeReponer, puedeEnviar: puedeEnviar && destinos.length > 0, puedeAjustar, puedeApartar, puedePedir: puedePedir && sedesParaPedir.length > 0, origenes }, separa);
  // Las tres respuestas de la talla —hay, colgar, pedir— que siempre dicen algo, aunque el motor del piso no haya decidido (2026-10-06).
  const queToca = queTocaConLaTalla(fila, {
    separa,
    tiendas: new Set(sedesParaPedir.map((s) => s.id)),
    puedeColgar: puedeReponer,
    puedePedir: puedePedir && sedesParaPedir.length > 0,
  });
  // El ritmo es del COLOR, todas sus tallas juntas, como la maqueta (2026-10-06): una talla sola casi nunca junta las jornadas que pide la
  // regla de Felipe para decir una tasa (3, 2026-09-25), y el panel quedaba en «Poco tiempo…». De la talla va debajo un hecho, no una
  // tasa: cuántas se vendieron en la ventana del ritmo.
  const ritmoColor = ritmoDePrenda(prenda);
  const ritmo = textoDeRitmo(ritmoColor);
  const vendidasTalla = vendidasDeLaTalla(fila.ritmoReciente);
  const precio = solesDe(prenda.precio);
  // Es del producto: cualquier talla de cualquier color la trae igual (`conDescripcion`, página de Existencias).
  const descripcion = prenda.tallas.find((t) => t.descripcion)?.descripcion ?? null;
  const tallasDeTodos = [...new Set(colores.flatMap((c) => c.tallas.map((t) => t.talla ?? "Única")))];
  // Lo que falta en el piso de TODO el modelo: la del motor, o, si no decidió, la de los números (con la pausa advertida). Ya no se lista
  // abajo (2026-10-06, noche: «es muy repetitivo poner de nuevo la talla»): cada botón de talla lo dice con su fondo ámbar, y UNA línea
  // bajo los botones dice cuántas faltan en este color y en qué otros, sin volver a nombrarlas.
  const falta = separa ? loQueFaltaEnElPiso(colores) : null;
  // Con el piso en pausa (sin cuadrar), lo que el sistema cree sin colgar NO se pinta de «por colgar», igual que en las tarjetas
  // (ADR-0328, decisión 5): podría estar ya colgado. La línea lo nombra («Sin colgar, según el sistema») y solo «¿Colgar?» explica la
  // pausa: decirlo también en la línea lo repetía dos veces en la misma pantalla (visto en TRU, 2026-10-06).
  const faltanAPintar = falta && !falta.enPausa ? falta.ids : SIN_FALTA;
  const faltaEnPiso = (t: FilaExistencias) => faltanAPintar.has(t.varianteId) || estadoTalla(t) === "por_colgar";
  const lineaFalta = lineaDeLoQueFalta(colores, prenda.clave, falta);
  const codigo = fila.codigosBarras?.[0] ?? fila.sku ?? null;
  // Cuánto tiene cada otra sede de esta talla: va bajo «¿Pedir?» (o bajo «¿Hay?» donde no se separa piso y almacén y no hay «¿Pedir?»).
  const otrasSedes = (fila.enRed ?? []).map((s) => `${nombreCortoSede(s.sede)} ${s.cantidad}`).join(" · ");
  const insignia = insigniaDeTalla(queToca);
  // «Todas»: las sumas del modelo entero (todos los colores) y cuántas tallas faltan colgar o se acabaron.
  const tallasModelo = colores.flatMap((c) => c.tallas);
  const sumaModelo = tallasModelo.reduce(
    (acc, t) => {
      const c = celdaTarjeta(t, separa);
      return { piso: acc.piso + c.piso, almacen: acc.almacen + c.almacen, apartado: acc.apartado + t.apartado, danado: acc.danado + (t.danado ?? 0), total: acc.total + c.piso + c.almacen + t.apartado + (t.danado ?? 0) };
    },
    { piso: 0, almacen: 0, apartado: 0, danado: 0, total: 0 }
  );
  const porColgarModelo = separa ? tallasModelo.filter((t) => celdaTarjeta(t, separa).estado === "falta").length : 0;
  const agotadasModelo = tallasModelo.filter((t) => celdaTarjeta(t, separa).estado === "agotada").length;
  const total = (separa ? Math.max(0, fila.pisoDisponible ?? 0) + Math.max(0, fila.almacenDisponible ?? 0) : Math.max(0, fila.disponible)) + fila.apartado + (fila.danado ?? 0);

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
        // Directo a «cuántas», con la tienda que más tiene ya elegida (lo que hacía el botón «Pedir» de «¿Pedir?»).
        return pedirRapido(prenda, fila);
      case "ajustar":
        return lanzar("ajustar");
      case "apartar":
        // La separación de Vender, con esta talla puesta: ahí se pide el cliente, el adelanto y se cobra con la caja abierta.
        return router.push(hrefApartarDesdeTicket([{ varianteId: fila.varianteId, cantidad: 1 }]));
      case "ficha":
        return setVista("ficha");
    }
  }

  // «Pedir» rápido: la tienda que más tiene, 1 unidad, directo al paso de cuántas.
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

  /** Una de las cuatro casillas: en 0 se apaga (borde punteado), salvo el piso que falta colgar (ámbar). Apartadas y dañadas con algo
   *  se tocan: abren su lista (las mismas ventanas de siempre). */
  const casilla = (valor: number, rotulo: string, clase?: "falta" | "apartada" | "danada", abre?: () => void, queHace = "ver cuáles") => {
    const fondo =
      clase === "falta"
        ? "border border-ambar/45 bg-ambar/[0.12] text-ambar-profundo"
        : valor === 0
          ? "border border-dashed border-sand text-taupe/70"
          : clase === "apartada"
            ? "bg-pizarra/[0.12] text-tinta"
            : clase === "danada"
              ? "bg-rojo/[0.09] text-tinta"
              : "bg-hueso text-tinta";
    const cuerpo = (
      <>
        <b className="block font-display text-[22px] font-medium leading-none tabular-nums">{valor}</b>
        <small className="text-[11.5px] text-taupe">{rotulo}</small>
        {abre && <ChevronRight aria-hidden className="absolute right-1.5 top-2 h-3.5 w-3.5 text-taupe" strokeWidth={1.8} />}
      </>
    );
    const base = `relative grid gap-1 rounded-[11px] px-2.5 py-2 text-left ${fondo}`;
    return abre ? (
      <button type="button" onClick={abre} aria-label={`${valor} ${rotulo}: ${queHace}`} title={queHace.charAt(0).toLocaleUpperCase("es") + queHace.slice(1)} className={`${base} transition-[outline] hover:outline hover:outline-1 hover:outline-tinta/25`}>
        {cuerpo}
      </button>
    ) : (
      <div className={base}>{cuerpo}</div>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        {/* El velo de la maqueta: el fondo se atenúa para que el panel se lea como lo único activo. Es solo visual: lo que bloquea la
            pantalla de atrás es que el diálogo es modal (Radix deja sin clics, sin foco y sin scroll todo lo de afuera), y tocar afuera
            cierra el panel, con aviso si hay algo a medias. En el celular, la hoja sube con velo más oscuro y un desenfoque leve, como
            el sistema de modales (ADR-0136). Cierra con el mismo tiempo que el panel. Es de `sombra`, nunca de `tinta`: en oscuro la
            tinta es crema y el velo ACLARABA la pantalla (ADR-0336, regla 2). */}
        <div
          aria-hidden
          data-velo-panel
          className={`pointer-events-none fixed inset-0 z-40 bg-sombra/[0.12] dark:bg-sombra/35 max-sm:bg-sombra/25 max-sm:backdrop-blur-[3px] max-sm:dark:bg-sombra/55 motion-reduce:animate-none ${cerrando ? "anim-velo-salida" : "anim-velo"}`}
        />
        <Dialog.Content
          ref={raiz}
          tabIndex={-1}
          onKeyDown={alTeclear}
          onEscapeKeyDown={alEscape}
          // Tocar afuera cierra (con el aviso si hay cambios), salvo sobre el loader o un aviso, que no son «la pantalla de atrás».
          onInteractOutside={(e) => {
            if ((e.target as Element | null)?.closest?.("[data-espera], [aria-live]")) e.preventDefault();
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // En el celular, una hoja que sube desde abajo con su asa (maqueta); desde `sm`, el cajón de la derecha. Las dos entradas son las
          // del sistema (`cayla-hoja`, `cayla-cajon-*`, ADR-0136), quietas con `prefers-reduced-motion`.
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-sand bg-papel outline-none motion-reduce:animate-none sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-full sm:rounded-none ${flujo?.tipo === "colgarVarias" || flujo?.tipo === "subirVarias" ? "sm:max-w-[42rem]" : "sm:max-w-[30rem]"} sm:border-l sm:border-t-0 ${
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
              onHecho={(texto, opciones) => {
                setFlujo(null);
                // Bajar al piso y subir al almacén (Felipe, 2026-10-08): lo confirma el aviso destacado y el panel se va, con su salida de siempre;
                // la lista de atrás queda con la búsqueda y los filtros que tenía.
                // El refresco va DESPUÉS de retirar la guardia de «¿Salir sin guardar?» (`retirarYa`): juntos, Next volvía a montar la
                // página o la recargaba entera, y se perdía la vista elegida y el aviso.
                if (opciones?.cerrar) {
                  setPasoSucio(false);
                  cerrarYa();
                  // Y sin el loader con el logo (Felipe, 2026-10-08): la lista se pone al día por detrás, sin tapar la pantalla.
                  void retirarYa().then(() => {
                    navegacionSinEspera(window.location.href);
                    router.refresh();
                  });
                  return;
                }
                setHecho(texto);
                raiz.current?.focus({ preventScroll: true });
              }}
              onSalir={() => {
                setFlujo(null);
                raiz.current?.focus({ preventScroll: true });
              }}
              onCambiar={(tipo, datos) => setFlujo({ tipo, datos, paso: 0 })}
              onCambios={setPasoSucio}
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
                        const marca = marcaDeColor(c.tallas, { faltan: faltanAPintar, coincide: marcaDelFiltro?.coincide ?? null, separa });
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
                        {!falta?.enPausa && <span aria-hidden className="inline-block h-3 w-3.5 shrink-0 rounded-[3px] border border-ambar/45 bg-ambar/[0.10]" />}
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
                    {/* El número grande (todo lo de la talla en esta sede) con UNA respuesta (`insigniaDeTalla`) y su porqué; debajo, las cuatro
                        casillas (2026-10-07, maqueta `existencias-tarjeta-cajon-2026-10`): reemplazan a las cifras, la suma explicada y las tres
                        filas «¿Hay? ¿Colgar? ¿Pedir?», que decían lo mismo en tres lugares. */}
                    <div>
                      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <b className="font-display text-[46px] font-medium leading-[0.9] tabular-nums text-tinta">{total}</b>
                        <span className="text-sm text-taupe">en esta sede</span>
                        <span className={`inline-flex items-center gap-1.5 self-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_INSIGNIA_TALLA[insignia.tono]}`}>
                          <i aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
                          {insignia.texto}
                        </span>
                      </p>
                      {insignia.frase && <p className="mt-1.5 text-[13px] leading-snug text-tinta/75">{insignia.frase}.</p>}
                      {otrasSedes && <p className="mt-0.5 text-[12.5px] text-taupe">Otras sedes: {otrasSedes}</p>}
                    </div>
                    <div className={`grid gap-1.5 ${separa ? "grid-cols-4" : "grid-cols-3"}`}>
                      {casilla(separa ? (fila.pisoDisponible ?? 0) : fila.disponible, separa ? "en el piso" : "disponibles", separa && insignia.tono === "ambar" ? "falta" : undefined)}
                      {separa && casilla(fila.almacenDisponible ?? 0, "en almacén")}
                      {casilla(fila.apartado, fila.apartado === 1 ? "apartada" : "apartadas", "apartada", fila.apartado > 0 ? onVerApartadas : undefined)}
                      {casilla(fila.danado ?? 0, (fila.danado ?? 0) === 1 ? "dañada" : "dañadas", "danada", (fila.danado ?? 0) > 0 ? onVerDanadas : undefined, puedeResolverDanadas ? "decidir qué hacer" : "ver cuáles")}
                    </div>
                    {/* Las acciones en UNA lista (2026-10-07): la que la talla necesita primero y teñida; las que no se pueden ahora, apagadas al
                        final con su porqué, en la misma lista (antes iban aparte, «No se puede ahora»). «Ficha» baja al pie como enlace. */}
                    <ul className="overflow-hidden rounded-2xl border border-sand bg-crema">
                      {acciones
                        .filter((a) => a.clave !== "ficha")
                        .map((a) => {
                          const Ico = ICONO[a.clave];
                          const tono = a.sugerida && a.ok ? (a.clave === "pedir" ? "pizarra" : "ambar") : null;
                          return (
                            <li key={a.clave} className="border-t border-sand first:border-t-0">
                              <button
                                type="button"
                                disabled={!a.ok}
                                aria-keyshortcuts={String(a.tecla)}
                                onClick={() => alAccionar(a.clave)}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                  tono === "ambar" ? "bg-ambar/[0.10] hover:bg-ambar/[0.16]" : tono === "pizarra" ? "bg-pizarra/[0.09] hover:bg-pizarra/[0.15]" : "enabled:hover:bg-hueso/70"
                                }`}
                              >
                                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tono === "ambar" ? "bg-ambar/[0.18] text-ambar-profundo" : tono === "pizarra" ? "bg-pizarra/[0.16] text-pizarra" : "bg-hueso text-tinta"}`}>
                                  <Ico aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <b className="block text-[14px] font-semibold text-tinta">{a.texto}</b>
                                  <small className="block text-xs text-taupe">{a.sub}</small>
                                </span>
                                <kbd className="hidden rounded border border-sand px-1.5 text-[10.5px] text-taupe sm:inline">{a.tecla}</kbd>
                                {a.ok && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" strokeWidth={1.8} />}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                    {/* Al pie: la ficha (antes una pestaña) y, plegado, el ritmo y el código (antes siempre a la vista). */}
                    <div className="flex items-center justify-between gap-3 text-[13px] text-taupe">
                      <button type="button" onClick={() => setVista("ficha")} className="inline-flex items-center gap-1.5 hover:text-tinta">
                        <ClipboardList aria-hidden className="h-4 w-4" strokeWidth={1.6} />
                        Ver ficha
                      </button>
                      {(ritmo || codigo || vendidasTalla !== null) && (
                        <button type="button" aria-expanded={verRitmo} onClick={() => setVerRitmo((v) => !v)} className="inline-flex items-center gap-1.5 hover:text-tinta">
                          <Info aria-hidden className="h-3.5 w-3.5" />
                          ¿Cómo se vende?
                        </button>
                      )}
                    </div>
                    {verRitmo && (ritmo || codigo || vendidasTalla !== null) && (
                      <div className="anim-revelar flex items-center gap-3 rounded-xl bg-hueso px-3 py-2.5 text-sm text-tinta/85">
                        {ritmo && <AroSemanas ritmo={ritmoColor} tam={40} />}
                        <div className="min-w-0">
                          {ritmo && <p>{prenda.color ? `${prenda.color}: ${ritmo.charAt(0).toLocaleLowerCase("es")}${ritmo.slice(1)}` : ritmo}</p>}
                          {(vendidasTalla !== null || codigo) && (
                            <p className="text-[12.5px] text-taupe">
                              {vendidasTalla !== null && (
                                <>
                                  De esta talla: {vendidasTalla} {vendidasTalla === 1 ? "vendida" : "vendidas"} en los últimos {VENTANA_RITMO_RECIENTE_DIAS} días
                                  {codigo ? " · " : ""}
                                </>
                              )}
                              {codigo && (
                                <>
                                  {vendidasTalla !== null ? "código" : "Código"} <span className="tabular-nums text-tinta">{codigo}</span>
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {vista === "todas" && (
                  <>
                    {/* «Todas», opción B (Felipe, 2026-10-07; las otras dos en `docs/maquetas/existencias-tarjeta-cajon-2026-10/todas-opciones.html`):
                        el número del modelo con sus avisos y las cuatro casillas sumadas; después la tabla tallas × colores, cada celda partida
                        en dos —arriba lo colgado (verde, con la percha), abajo lo del almacén (con la caja)—. Ámbar = falta colgar; rojo entera =
                        se acabó; marco negro = la talla que se estaba viendo. Tocar una celda vuelve a «Esta talla» en esa talla. */}
                    <div>
                      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <b className="font-display text-[46px] font-medium leading-[0.9] tabular-nums text-tinta">{sumaModelo.total}</b>
                        <span className="text-sm text-taupe">en esta sede</span>
                        {porColgarModelo > 0 && (
                          <span className={`inline-flex items-center gap-1.5 self-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_INSIGNIA_TALLA.ambar}`}>
                            <i aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
                            {porColgarModelo} por colgar
                          </span>
                        )}
                        {agotadasModelo > 0 && (
                          <span className={`inline-flex items-center gap-1.5 self-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_INSIGNIA_TALLA.rojo}`}>
                            <i aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
                            {agotadasModelo} se acabó
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`grid gap-1.5 ${separa ? "grid-cols-4" : "grid-cols-3"}`}>
                      {casilla(sumaModelo.piso, separa ? "en el piso" : "disponibles")}
                      {separa && casilla(sumaModelo.almacen, "en almacén")}
                      {casilla(sumaModelo.apartado, sumaModelo.apartado === 1 ? "apartada" : "apartadas", "apartada")}
                      {casilla(sumaModelo.danado, sumaModelo.danado === 1 ? "dañada" : "dañadas", "danada")}
                    </div>
                    {separa && (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-taupe">
                        <span className="inline-flex items-center gap-1.5">
                          <i aria-hidden className="inline-block h-2.5 w-3 rounded-[3px] bg-verde/[0.22]" />
                          arriba: en el piso
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <i aria-hidden className="inline-block h-2.5 w-3 rounded-[3px] border border-sand" />
                          abajo: en almacén
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <i aria-hidden className="inline-block h-2.5 w-3 rounded-[3px] bg-ambar/[0.22]" />
                          falta colgar
                        </span>
                      </p>
                    )}
                    <div className="scroll-cayla overflow-x-auto">
                      <table className="w-full table-fixed border-separate border-spacing-y-2 text-center text-sm">
                        <colgroup>
                          <col className="w-[88px]" />
                          {tallasDeTodos.map((t) => (
                            <col key={t} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            <th aria-hidden />
                            {tallasDeTodos.map((t) => (
                              <th key={t} scope="col" className="text-xs font-semibold text-taupe">
                                {t}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {colores.map((c) => (
                            <tr key={c.clave}>
                              <th scope="row" className="truncate pr-1.5 text-left text-[13px] font-semibold text-tinta">
                                <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                                {c.color ?? "Sin color"}
                              </th>
                              {tallasDeTodos.map((t) => {
                                const f = c.tallas.find((x) => (x.talla ?? "Única") === t);
                                if (!f) return <td key={t} aria-hidden className="text-taupe/40">·</td>;
                                const sel = c.clave === prenda.clave && f.varianteId === fila.varianteId;
                                const celda = celdaTarjeta(f, separa);
                                const ir = () => {
                                  irA(c, f);
                                  setVista("talla");
                                };
                                const lectura = `${c.color ?? "Sin color"} ${t}: ${celda.estado === "agotada" ? "se acabó" : separa ? `${celda.piso} en el piso, ${celda.almacen} en almacén` : `${celda.piso} disponibles`}. Ver esta talla`;
                                return (
                                  <td key={t} className="px-[3px]">
                                    {celda.estado === "agotada" ? (
                                      <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`grid h-[46px] w-full place-items-center rounded-[9px] border border-rojo/40 bg-rojo/[0.10] text-xs font-bold text-rojo-profundo ${sel ? "ring-2 ring-tinta" : ""}`}>
                                        Se acabó
                                      </button>
                                    ) : (
                                      <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`flex h-[46px] w-full flex-col overflow-hidden rounded-[9px] border bg-crema transition-colors ${sel ? "border-tinta ring-1 ring-tinta" : "border-sand hover:border-tinta/35"}`}>
                                        <span className={`flex w-full flex-1 items-center justify-center gap-1 text-[13.5px] font-bold tabular-nums ${celda.estado === "falta" ? "bg-ambar/[0.16] text-ambar-profundo" : celda.piso > 0 ? "bg-verde/[0.14] text-verde" : "text-taupe/70"}`}>
                                          <IconoPercha aria-hidden className="h-3 w-3" strokeWidth={1.8} />
                                          {celda.piso}
                                        </span>
                                        {separa && (
                                          <span className={`flex w-full flex-1 items-center justify-center gap-1 border-t border-sand text-[13.5px] font-semibold tabular-nums text-taupe ${celda.almacen === 0 ? "opacity-55" : ""}`}>
                                            <Archive aria-hidden className="h-3 w-3" strokeWidth={1.8} />
                                            {celda.almacen}
                                          </span>
                                        )}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="-mt-1 text-xs text-taupe">Toca una talla para verla.</p>
                    {separa && puedeReponer && (
                      <button type="button" onClick={() => lanzar("colgarVarias", { cant: {} })} className="flex w-full items-center gap-3 rounded-2xl border border-sand bg-ambar/[0.10] px-3 py-2.5 text-left transition-colors hover:bg-ambar/[0.16]">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ambar/[0.18] text-ambar-profundo">
                          <IconoPercha aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[14px] font-semibold text-tinta">Colgar varias tallas y colores</b>
                          <small className="block text-xs text-taupe">{porColgarModelo > 0 ? `${porColgarModelo} ${porColgarModelo === 1 ? "talla falta" : "tallas faltan"} en el piso` : "Elige cuántas de cada una"}</small>
                        </span>
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" strokeWidth={1.8} />
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
      {aviso}
    </Dialog.Root>
  );
}
