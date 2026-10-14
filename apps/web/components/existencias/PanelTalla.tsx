"use client";

import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeftRight, Bandage, BookOpen, Check, ChevronRight, Copy, History, PencilLine, ShoppingBag, SignpostBig, Tag, Truck, Warehouse, ZoomIn } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pestanas } from "@/components/ui/Pestanas";
import { Chip } from "@/components/ui/Chip";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { avisar } from "@/components/ui/Avisos";
import { EnlaceEtiquetas } from "@/components/EnlaceEtiquetas";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { AroSemanas } from "@/components/existencias/AroSemanas";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { FlujoTalla } from "@/components/existencias/FlujoTalla";
import { FotoAmpliada } from "@/components/existencias/FotoAmpliada";
import { accionesDeTalla, insigniaDelModelo, insigniaDeTalla, lineaDeLoQueFalta, lineaNoAhora, loQueFaltaEnElPiso, marcaDeColor, origenesDeTalla, pieDeTalla, queTocaConLaTalla, separarAcciones, subtituloColgarVarias, type ClaveAccionTalla, type TonoQueToca } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo, vendidasDeLaTalla } from "@/lib/existencias-colgar-primero";
import { VENTANA_RITMO_RECIENTE_DIAS } from "@/lib/existencias-ritmo";
import { estadoTalla, urlEtiquetas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { celdaTarjeta, tallasSinColgar } from "@/lib/existencias-tarjeta-compacta";
import { hrefApartarDesdeTicket } from "@/lib/apartar-desde-ticket";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { mejorOrigen, type DatosFlujo, type SedeConCantidad, type TipoFlujo } from "@/lib/existencias-flujos";
import { MS_ENTRE_TECLAS } from "@/lib/existencias-pistola";
import { urlRotulos } from "@/lib/rotulos-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { FOTO_PANEL_TALLA } from "@/lib/fotos-tamanos";

type Vista = "talla" | "todas";
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
  danada: Bandage,
};

/** El tono del veredicto (`insigniaDeTalla`), en la pieza de estado del sistema (`<Chip>`): rojo = se acabó, ámbar = falta colgar,
 *  pizarra = informativo, verde = bien. */
const TONO_CHIP: Record<TonoQueToca | "rojo", "rojo" | "ambar" | "pizarra" | "verde"> = { rojo: "rojo", ambar: "ambar", pizarra: "pizarra", verde: "verde" };

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
/** Los cuatro botones de la prenda, la misma cara que en la vista rápida de Catálogo (una función, una pieza). */
const BOTON_PRENDA = "btn-cayla btn-secundario min-h-10 gap-1.5 text-[12.5px]";
/** Cuánto tarda la foto en cruzar de la tarjeta al modal: lo mismo que la hoja en entrar (ADR-0136). */
const MS_FOTO_CRUZA = 420;

/* ====================================================================
   El modal de la prenda (ADR-0391, Felipe 2026-10-12; maqueta `docs/maquetas/existencias-almacen-cajon-2026-10/`, distribución
   «Foto y lista», elegida entre cuatro)

   Reemplaza al cajón lateral del 2026-10-05: ahora es la hoja del sistema (`<Modal variante="hoja">`: velo con desenfoque, sube 18 px
   y crece, contenido en cascada), con el nombre de la prenda como título y su marca, categoría, precio y descripción como bajada.
   Al abrir desde una tarjeta, **la foto cruza** desde la miniatura hasta la foto grande del modal, como en la vista rápida de Catálogo.

   Adentro, en el orden en que la colaboradora se hace las preguntas:
     · ¿Qué prenda? — la fila de la prenda: Etiquetas (las tallas de este color con unidades aquí), Rótulo (del modelo), Historial y
       Catálogo. Las mismas cuatro de la vista rápida de Productos, al revés. Antes estaban detrás de «Ver ficha», y el rótulo no estaba.
     · ¿Cuál? — a la izquierda la foto, las pestañas «Esta talla / Todas», el color y la talla (cada talla dice lo suyo: ámbar si falta
       en el piso, «otra sede» o «en camino» si aquí no queda) y el código de la talla, que se copia de un toque.
     · ¿Dónde está? — el veredicto (`insigniaDeTalla`) con su porqué, las cuatro casillas (colgadas · guardadas · apartadas · dañadas,
       las palabras de la cabecera) y, siempre, en camino y otras tiendas. Se fue el «1 en esta sede» de 46 px: era la suma de las
       casillas y una línea lo repetía debajo.
     · ¿Qué hago? — solo las acciones que hoy se pueden, la sugerida primero y teñida; las que no, en UNA línea «No ahora: …» con su
       motivo. «Reportar dañada» entra a la lista; «Eliminar el producto» sale (es de Catálogo, y ahí está).
     · ¿Cómo se vende? — el ritmo del color con su aro y lo vendido de la talla, a la vista (antes plegado).
   Cada acción (menos Apartar) se hace AQUÍ, paso a paso (`FlujoTalla`), en la columna derecha mientras la foto se queda; al terminar
   el modal vuelve a la talla con «✓ hecho». Apartar abre la separación de Vender con la talla puesta (ahí se cobra el adelanto).

   Teclado: ← → cambian la talla, ↑ ↓ el color, 1–7 eligen la acción; Escape cierra (con «¿Salir sin guardar?» si hay un paso a medias).
   ==================================================================== */
/** El mismo efecto al pasar el mouse en toda casilla que se toca («En piso / En almacén» de «Esta talla» y de «Todas»; Felipe,
 *  2026-10-13): un filo fino de tinta, sin cambiar el fondo ni el borde. */
const HOVER_CASILLA = "hover:outline hover:outline-1 hover:outline-tinta/25";

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
  puedeReportarDanada = false,
  hrefCatalogo,
  fotoDesde = null,
  onAjustarCompleto,
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
  /** Mirando la sede propia: Etiquetas e Historial trabajan sobre ella. */
  enSedeActiva: boolean;
  puedeReportarDanada?: boolean;
  /** El enlace a Catálogo ▸ Productos con esta prenda, solo si el rol ve Productos. */
  hrefCatalogo?: (referencia: string) => string;
  /** La miniatura de la tarjeta desde la que se abrió: la foto cruza desde ahí hasta el modal. `null`: entra sin cruzar. */
  fotoDesde?: HTMLElement | null;
  /** La ventana completa de Ajustar (una talla que faltó en un conteo se enlaza ahí). */
  onAjustarCompleto: (f: FilaExistencias) => void;
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
  // «Todas»: ver solo lo del piso o solo lo del almacén (Felipe, 2026-10-09). `null` = las dos mitades de cada celda.
  const [capa, setCapa] = useState<"piso" | "almacen" | null>(null);
  // La foto a tamaño completo, al tocar la foto grande.
  const [fotoGrande, setFotoGrande] = useState(false);
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

  // El modal bloquea la pantalla de atrás (2026-10-06, Felipe): tocar afuera, la ✕ o Escape lo cierran, y si hay un paso a medias
  // (un dato cambiado, un paso avanzado, un guardado en camino) primero se pregunta «¿Salir sin guardar?». La pregunta la hace
  // `useSalidaSinGuardar`; el `<Modal>` le pasa su cierre por `antesDeCerrar`.
  const [pasoSucio, setPasoSucio] = useState(false);
  const { pedirAccion, retirarYa, aviso } = useSalidaSinGuardar(
    Boolean(flujo) && pasoSucio,
    "Dejaste esta acción a medias y todavía no se guardó. Si sales ahora, se pierde lo que llenaste."
  );
  // ↑ ↓ cambian el color (como la maqueta), por la pieza de los cajones (ADR-0128): ignora la flecha de un campo o de otro portal.
  const [pasoColor, setPasoColor] = useState<{ delta: 1 | -1; n: number } | null>(null);
  const alFlecha = useFlechasDelCajon(useCallback((delta: 1 | -1) => setPasoColor((p) => ({ delta, n: (p?.n ?? 0) + 1 })), []));

  // La hora de la última tecla dentro del modal: distingue un atajo (una tecla) de la pistola (una ráfaga).
  const ultimaTecla = useRef(0);
  // Al abrir, el teclado entra al modal (como la maqueta): ← → ↑ ↓ y 1–7 funcionan sin tocar el mouse.
  const raiz = useRef<HTMLDivElement>(null);
  // Quien tenía el foco al abrir (el botón de la talla, la miniatura, «Más»): al cerrar, el foco vuelve ahí y no al inicio de la página.
  // Radix solo lo devuelve si el modal se abrió desde su propio disparador, y este se abre por estado (/chaos TEC-06, 2026-10-12).
  // Se toma UNA vez, al montar (un `useState` perezoso: leer un ref durante el render lo prohíbe el compilador de React).
  const [abridor] = useState<{ readonly current: HTMLElement | null }>(() => {
    const inicial = typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    return {
      // Se resuelve al CERRAR: si quien abrió ya no está (el ítem del menú «Más ⌄» se desmonta al abrir el modal), vuelve al botón «Más» de esa
      // tarjeta; si tampoco, a la tarjeta.
      get current() {
        if (inicial?.isConnected) return inicial;
        const tarjeta = fotoDesde?.closest("article") ?? null;
        return tarjeta?.querySelector<HTMLElement>("button[aria-label^='Más acciones de']") ?? (tarjeta as HTMLElement | null);
      },
    };
  });
  useEffect(() => {
    // El portal de Radix monta el contenido un instante después: el foco espera a que exista (la maqueta espera 80 ms).
    const t = window.setTimeout(() => raiz.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(t);
  }, []);

  // La foto cruza (ADR-0391): una copia de la miniatura de la tarjeta viaja hasta el lugar de la foto grande mientras la hoja entra, y
  // al llegar la foto de verdad la reemplaza. Solo al abrir y solo si hay de dónde salir; con movimiento reducido, nada cruza.
  const fotoGrandeRef = useRef<HTMLDivElement>(null);
  const fotoDesdeRef = useRef(fotoDesde);
  useEffect(() => {
    const origen = fotoDesdeRef.current;
    const destino = fotoGrandeRef.current;
    if (!origen || !destino || !origen.isConnected || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // La hoja entra con un transform (sube 18 px y crece al 96,5 %): el cuadro final de la foto se mide sin él.
    const hoja = destino.closest<HTMLElement>("[data-variante]");
    const animacion = hoja?.style.animation ?? "";
    if (hoja) hoja.style.animation = "none";
    const r1 = origen.getBoundingClientRect();
    const r2 = destino.getBoundingClientRect();
    if (hoja) hoja.style.animation = animacion;
    if (!r1.width || !r2.width) return;
    const vuela = origen.cloneNode(true) as HTMLElement;
    vuela.setAttribute("aria-hidden", "true");
    Object.assign(vuela.style, {
      position: "fixed",
      left: `${r1.left}px`,
      top: `${r1.top}px`,
      width: `${r1.width}px`,
      height: `${r1.height}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
      borderRadius: "9px",
      transition: `left ${MS_FOTO_CRUZA}ms var(--ease-cayla), top ${MS_FOTO_CRUZA}ms var(--ease-cayla), width ${MS_FOTO_CRUZA}ms var(--ease-cayla), height ${MS_FOTO_CRUZA}ms var(--ease-cayla), border-radius ${MS_FOTO_CRUZA}ms var(--ease-cayla)`,
    });
    document.body.appendChild(vuela);
    destino.style.visibility = "hidden";
    let listo = false;
    const terminar = () => {
      if (listo) return;
      listo = true;
      vuela.remove();
      destino.style.visibility = "";
    };
    const marco = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        Object.assign(vuela.style, { left: `${r2.left}px`, top: `${r2.top}px`, width: `${r2.width}px`, height: `${r2.height}px`, borderRadius: "14px" });
      })
    );
    vuela.addEventListener("transitionend", terminar, { once: true });
    const t = window.setTimeout(terminar, MS_FOTO_CRUZA + 180);
    return () => {
      cancelAnimationFrame(marco);
      window.clearTimeout(t);
      terminar();
    };
  }, []);

  const prenda = colores.find((c) => c.clave === clave) ?? colores[0];
  const fila = prenda?.tallas.find((t) => t.varianteId === varianteId) ?? prenda?.tallas[0];

  // La flecha pidió otro color: se aplica aquí, donde ya se conoce el color de ahora (y la talla se conserva si existe).
  if (pasoColor && prenda && fila) {
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

  if (!prenda || !fila) return null;

  // Las otras tiendas, con lo que cada una tiene de esta talla (por id de sede, no por nombre).
  const origenes: SedeConCantidad[] = origenesDeTalla(fila.enRed, sedesParaPedir);
  const acciones = accionesDeTalla(
    fila,
    { puedeReponer, puedeEnviar: puedeEnviar && destinos.length > 0, puedeAjustar, puedeApartar, puedePedir: puedePedir && sedesParaPedir.length > 0, origenes, puedeReportarDanada },
    separa
  );
  const { posibles, noAhora } = separarAcciones(acciones);
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
  // Lo que falta en el piso de TODO el modelo: la del motor, o, si no decidió, la de los números (con la pausa advertida). Cada botón
  // de talla lo dice con su fondo ámbar, y UNA línea bajo los botones dice cuántas faltan en este color y en qué otros.
  const falta = separa ? loQueFaltaEnElPiso(colores) : null;
  // Con el piso en pausa (sin cuadrar), lo que el sistema cree sin colgar NO se pinta de «por colgar», igual que en las tarjetas
  // (ADR-0328, decisión 5): podría estar ya colgado.
  const faltanAPintar = falta && !falta.enPausa ? falta.ids : SIN_FALTA;
  const faltaEnPiso = (t: FilaExistencias) => faltanAPintar.has(t.varianteId) || estadoTalla(t) === "por_colgar";
  const lineaFalta = lineaDeLoQueFalta(colores, prenda.clave, falta);
  const codigo = fila.codigosBarras?.[0] ?? fila.sku ?? null;
  // Cuánto tiene cada otra sede de esta talla.
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
  // Lo físico, sin el motor: tallas con 0 colgadas y algo en almacén. Con el piso en pausa el motor no marca nada y decir «Todo en el
  // piso» sería falso (la tarjeta ya cuenta así, `botonDeTarjeta`).
  const sinColgarModelo = separa ? tallasSinColgar(colores) : 0;
  const agotadasModelo = tallasModelo.filter((t) => celdaTarjeta(t, separa).estado === "agotada").length;
  const chipModelo = insigniaDelModelo({ porColgar: porColgarModelo, sinColgar: sinColgarModelo, agotadas: agotadasModelo });
  // Lo de la prenda (fila de arriba): las etiquetas de las tallas de ESTE color, el rótulo del modelo, el historial y Catálogo.
  const hrefEtiquetas = urlEtiquetas(prenda.tallas);
  const hrefRotulo = urlRotulos([prenda.productoId], { desde: "existencias" });
  // Las unidades libres de este color en la sede, lo que Existencias ya tiene en memoria: `EnlaceEtiquetas` avisa si no hay nada que
  // imprimir en vez de abrir una pantalla vacía (la lista se refresca tras cada guardado, así que no hay una lectura vieja que engañe).
  const unidadesDelColor = prenda.tallas.reduce((n, t) => n + Math.max(0, separa ? (t.pisoDisponible ?? 0) + (t.almacenDisponible ?? 0) : t.disponible), 0);

  function irA(c: Prenda, t: FilaExistencias) {
    setClave(c.clave);
    setVarianteId(t.varianteId);
    setHecho(null);
  }

  function elegirColor(c: Prenda) {
    // Conserva la talla si el otro color la tiene; si no, la primera.
    const misma = c.tallas.find((t) => t.talla === fila!.talla);
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
        // Directo a «cuántas», con la tienda que más tiene ya elegida.
        return pedirRapido(prenda!, fila!);
      case "ajustar":
        return lanzar("ajustar");
      case "danada":
        return lanzar("danada");
      case "apartar":
        // La separación de Vender, con esta talla puesta: ahí se pide el cliente, el adelanto y se cobra con la caja abierta.
        return router.push(hrefApartarDesdeTicket([{ varianteId: fila!.varianteId, cantidad: 1 }]));
    }
  }

  // «Pedir» rápido: la tienda que más tiene, 1 unidad, directo al paso de cuántas.
  function pedirRapido(c: Prenda, t: FilaExistencias) {
    const mejor = mejorOrigen(t.enRed, sedesParaPedir);
    irA(c, t);
    lanzar("pedir", mejor ? { para: "reponer", origenId: mejor.id, n: 1 } : {}, mejor ? 2 : 0);
  }

  async function copiarCodigo() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      avisar.exito(`Código copiado: ${codigo}`);
    } catch {
      avisar.error("No se pudo copiar el código", { detalle: "Selecciónalo con el mouse y cópialo." });
    }
  }

  function alTeclear(e: KeyboardEventReact<HTMLDivElement>) {
    const antes = ultimaTecla.current;
    ultimaTecla.current = e.timeStamp;
    if (e.key.length === 1 && e.timeStamp - antes < MS_ENTRE_TECLAS) return;
    alFlecha(e);
    if (e.defaultPrevented || flujo || vista !== "talla" || escribiendo(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = prenda!.tallas.indexOf(fila!);
      const n = prenda!.tallas.length;
      irA(prenda!, prenda!.tallas[(j + (e.key === "ArrowRight" ? 1 : n - 1)) % n]);
    } else if (/^[1-7]$/.test(e.key)) {
      // Un dígito solo es un atajo; una ráfaga (la pistola leyendo un código que empieza con números) no: el atajo espera un instante
      // y se cancela si llega otra tecla enseguida (`MS_ENTRE_TECLAS`).
      // La tecla es de la acción (Colgar = 1 … Reportar dañada = 7), no de su lugar: el orden cambia con lo que la talla necesita.
      const a = acciones.find((x) => x.tecla === Number(e.key));
      if (!a?.ok) return;
      e.preventDefault();
      const marca = e.timeStamp;
      window.setTimeout(() => {
        if (ultimaTecla.current === marca) alAccionar(a.clave);
      }, MS_ENTRE_TECLAS + 10);
    }
  }

  /** «En piso» y «En almacén» de «Dónde está» llevan a «Todas» con esa capa ya puesta (Felipe, 2026-10-13): la pregunta «¿y en las otras
   *  tallas y colores?» se contesta con un toque, sin cambiar de pestaña y volver a filtrar. */
  const irATodas = (c: "piso" | "almacen") => {
    setVista("todas");
    setCapa(c);
    setHecho(null);
  };

  /** Una de las cuatro casillas (en piso · en almacén · apartadas · dañadas), con su ícono: en 0 se apaga (borde punteado), salvo las
   *  del piso que faltan (ámbar). Las dos primeras llevan a «Todas» con su capa; apartadas y dañadas con algo abren su lista (las mismas
   *  ventanas de siempre). Los rótulos son «En piso / En almacén» (Felipe, 2026-10-13: antes «colgadas / guardadas»). */
  const casilla = (valor: number, rotulo: string, Ico: Icono, clase?: "falta" | "apartada" | "danada", abre?: () => void, queHace = "ver cuáles") => {
    const fondo =
      clase === "falta"
        ? "border border-ambar/45 bg-ambar/[0.12] text-ambar-profundo"
        : valor === 0
          ? "border border-dashed border-sand text-taupe"
          : clase === "apartada"
            ? "bg-pizarra/[0.12] text-tinta"
            : clase === "danada"
              ? "bg-rojo/[0.09] text-tinta"
              : "bg-hueso text-tinta";
    const cuerpo = (
      <>
        <b className="block font-display text-[22px] font-medium leading-none tabular-nums">{valor}</b>
        <small className="text-[11.5px] text-taupe">{rotulo}</small>
        <Ico aria-hidden className="absolute right-2 top-2 h-3.5 w-3.5 text-taupe" strokeWidth={1.8} />
        {abre && <ChevronRight aria-hidden className="absolute bottom-2 right-1.5 h-3.5 w-3.5 text-taupe" strokeWidth={1.8} />}
      </>
    );
    const base = `relative grid gap-1 rounded-[11px] px-2.5 py-2 text-left ${fondo}`;
    return abre ? (
      <button type="button" onClick={abre} aria-label={`${valor} ${rotulo}: ${queHace}`} title={queHace.charAt(0).toLocaleUpperCase("es") + queHace.slice(1)} className={`${base} transition-[outline] ${HOVER_CASILLA}`}>
        {cuerpo}
      </button>
    ) : (
      <div className={base}>{cuerpo}</div>
    );
  };

  /** «Todas»: la casilla del piso o del almacén es también el filtro de la tabla (Felipe, 2026-10-09). Lleva el mismo ícono y el
   *  mismo tono que su mitad de la celda (percha verde arriba, caja pizarra abajo); tocarla deja ver solo esa mitad, y tocarla otra vez
   *  vuelve a las dos. La que no está elegida se apaga para que se note cuál manda. */
  const casillaCapa = (cual: "piso" | "almacen", valor: number) => {
    const elegida = capa === cual;
    const apagada = capa !== null && !elegida;
    const Icono = cual === "piso" ? IconoPercha : Archive;
    const rotulo = cual === "piso" ? "En piso" : "En almacén";
    const tono = cual === "piso" ? "bg-verde/[0.12] text-verde" : "bg-pizarra/[0.12] text-pizarra";
    return (
      <button
        type="button"
        aria-pressed={elegida}
        onClick={() => setCapa(elegida ? null : cual)}
        title={elegida ? "Ver piso y almacén" : `Ver solo lo que está ${cual === "piso" ? "en el piso" : "en el almacén"}`}
        className={`relative grid gap-1 rounded-[11px] border px-2 py-2 text-left transition-[opacity,box-shadow,border-color,outline] ${HOVER_CASILLA} ${tono} ${
          elegida ? "border-tinta shadow-[0_0_0_1px_var(--color-tinta)]" : "border-transparent"
        } ${apagada ? "opacity-45" : ""}`}
      >
        <span className="flex items-center gap-1.5">
          <Icono aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <b className="block font-display text-[22px] font-medium leading-none tabular-nums text-tinta">{valor}</b>
        </span>
        <small className="whitespace-nowrap text-[12px] font-semibold text-tinta sm:text-[12.5px]">{rotulo}</small>
        {elegida && <Check aria-hidden className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-tinta" strokeWidth={2.2} />}
      </button>
    );
  };

  /** La celda de totales de «Todas» (ADR-0391): en hueso, sin borde, no se toca; sigue a la capa (una cifra) o apila las dos. */
  const totalCelda = (pisoN: number, almacenN: number) => {
    if (!separa) return <div className="grid h-[52px] place-items-center rounded-[9px] bg-hueso text-[15px] font-semibold tabular-nums text-tinta">{pisoN}</div>;
    if (capa === "piso") return <div className="grid h-[52px] place-items-center rounded-[9px] bg-hueso text-[17px] font-semibold tabular-nums text-tinta">{pisoN}</div>;
    if (capa === "almacen") return <div className="grid h-[52px] place-items-center rounded-[9px] bg-hueso text-[17px] font-semibold tabular-nums text-tinta">{almacenN}</div>;
    return (
      <div className="grid h-[52px] grid-rows-2 overflow-hidden rounded-[9px] bg-hueso tabular-nums text-tinta">
        <span className="flex items-center justify-center gap-1 text-[13.5px] font-semibold">
          <IconoPercha aria-hidden className="h-3 w-3 text-taupe" strokeWidth={1.8} />
          {pisoN}
        </span>
        <span className="flex items-center justify-center gap-1 border-t border-sand text-[13.5px] font-semibold">
          <Archive aria-hidden className="h-3 w-3 text-taupe" strokeWidth={1.8} />
          {almacenN}
        </span>
      </div>
    );
  };

  const subtitulo = (
    <>
      {[prenda.marca, prenda.categoria].filter(Boolean).join(" · ")}
      {precio && (
        <>
          {prenda.marca || prenda.categoria ? " · " : ""}
          <b className="font-semibold text-tinta">{precio}</b>
        </>
      )}
      {/* Precio propio de esta sede (Felipe 2026-10-09): distinto del de las demás tiendas. */}
      {prenda.precioDeSede && <span className="font-semibold text-ambar-profundo"> · precio de esta tienda</span>}
      {descripcion && <span className="mt-1 block whitespace-pre-line break-words text-[13px] leading-snug text-tinta/80">{descripcion}</span>}
    </>
  );

  return (
    <>
      <Modal
        alCerrarEnfocar={abridor}
        variante="hoja"
        ancho="max-w-[62rem]"
        conCerrar
        titulo={prenda.referencia}
        subtitulo={subtitulo}
        onClose={onCerrar}
        antesDeCerrar={(cerrar) => pedirAccion(cerrar)}
      >
        {(cerrar) => (
          <div ref={raiz} tabIndex={-1} onKeyDown={alTeclear} data-guia="existencias.cajon" className="outline-none">
            {/* ¿Qué prenda? Lo que es del MODELO, no de la talla (ADR-0391): las mismas cuatro de la vista rápida de Catálogo. */}
            <div data-guia="existencias.cajon-prenda" className="mb-4 flex flex-wrap gap-2">
              {enSedeActiva && hrefEtiquetas && (
                <EnlaceEtiquetas
                  href={hrefEtiquetas}
                  unidades={async () => unidadesDelColor}
                  que={`${prenda.referencia}${prenda.color ? ` ${prenda.color}` : ""}`}
                  sede={sedeNombre}
                  className={(negado) => (negado ? "btn-cayla min-h-10 gap-1.5 bg-rojo text-[12.5px] text-crema hover:bg-rojo-profundo" : BOTON_PRENDA)}
                  title="Imprimir las etiquetas de precio de este color: en la pantalla eliges cuántas de cada talla"
                >
                  <Tag aria-hidden className="h-4 w-4" />
                  Etiquetas
                </EnlaceEtiquetas>
              )}
              {hrefRotulo && (
                <Link href={hrefRotulo} className={BOTON_PRENDA} title="El rótulo del anaquel de este modelo (no depende del stock)">
                  <SignpostBig aria-hidden className="h-4 w-4" />
                  Rótulo
                </Link>
              )}
              {enSedeActiva && (
                <Link href={`/productos/${prenda.productoId}/historial`} className={BOTON_PRENDA} title="Los movimientos de esta prenda en esta sede">
                  <History aria-hidden className="h-4 w-4" />
                  Historial
                </Link>
              )}
              {hrefCatalogo && (
                <Link href={hrefCatalogo(prenda.referencia)} className={BOTON_PRENDA} title="La ficha completa en Catálogo: tejido, patrón, proveedor, fotos">
                  <BookOpen aria-hidden className="h-4 w-4" />
                  Catálogo
                </Link>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-[17rem_minmax(0,1fr)] sm:gap-6">
              {/* ¿Cuál? La foto, las vistas, el color, la talla y su código. */}
              <aside className="grid content-start gap-3">
                <div
                  ref={fotoGrandeRef}
                  onClick={prenda.fotoUrl ? () => setFotoGrande(true) : undefined}
                  role={prenda.fotoUrl ? "button" : undefined}
                  tabIndex={prenda.fotoUrl ? 0 : undefined}
                  onKeyDown={prenda.fotoUrl ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setFotoGrande(true)) : undefined}
                  aria-label={prenda.fotoUrl ? `Ver la foto de ${prenda.referencia} en grande` : undefined}
                  title={prenda.fotoUrl ? "Ver la foto en grande" : undefined}
                  className={`group relative h-36 w-full overflow-hidden rounded-[14px] bg-sand/50 outline-none ring-tinta/40 transition-shadow sm:aspect-[3/4] sm:h-auto ${prenda.fotoUrl ? "cursor-zoom-in hover:ring-2 focus-visible:ring-2" : ""}`}
                >
                  {prenda.fotoUrl ? (
                    <>
                      <ImagenDePrenda src={prenda.fotoUrl} alt="" width={FOTO_PANEL_TALLA.width} height={FOTO_PANEL_TALLA.height} className="h-full w-full object-cover" fondo={prenda.colorHex} fallback={<SinFoto tamano="h-full w-full" colorHex={prenda.colorHex} {...categoriaDe(prenda)} />} />
                      <span aria-hidden className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-papel/90 text-tinta shadow-[0_1px_3px_color-mix(in_srgb,var(--color-sombra)_25%,transparent)]">
                        <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    </>
                  ) : (
                    <SinFoto tamano="h-full w-full" colorHex={prenda.colorHex} {...categoriaDe(prenda)} />
                  )}
                </div>

                {flujo ? (
                  // En un paso, el color y la talla no se cambian: el chip dice sobre cuál se está trabajando.
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-hueso px-3 py-1.5 text-[12.5px] text-taupe">
                    <i aria-hidden className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: prenda.colorHex ?? "var(--color-hueso)" }} />
                    {prenda.color ?? "Sin color"} · Talla {fila.talla ?? "Única"}
                  </span>
                ) : (
                  <>
                    <Pestanas
                      etiquetaAccesible="Vista"
                      // La pieza hugs su contenido, pero como ítem de la grilla se estiraba a las 17 rem de la columna (Felipe, 2026-10-13:
                      // «ocupa más espacio del que debería»): centrada y del ancho de sus dos pestañas.
                      className="justify-self-center"
                      activa={vista}
                      onCambio={(k) => {
                        setVista(k as Vista);
                        setHecho(null);
                      }}
                      items={[
                        { clave: "talla", etiqueta: "Esta talla", guia: "existencias.cajon-esta-talla" },
                        { clave: "todas", etiqueta: "Todas", guia: "existencias.cajon-todas" },
                      ]}
                    />
                    <div role="radiogroup" aria-label="Color" className="flex flex-wrap items-center gap-2">
                      {colores.map((c) => {
                        // El punto del color, como en las tarjetas: con un filtro, si alguna talla lo cumple; sin filtro, si le falta algo en
                        // el piso o si otra sede tiene lo que aquí se agotó.
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
                    <div role="group" aria-label="Talla" data-guia="existencias.cajon-tallas" className="flex flex-wrap gap-1.5">
                      {prenda.tallas.map((t) => {
                        const sel = t.varianteId === fila.varianteId;
                        // Cada talla dice lo suyo aquí: fondo ámbar si falta en el piso; debajo, lo colgado o, si aquí no queda ninguna,
                        // «otra sede» o «en camino»; y la insignia del filtro en la esquina, como en las tarjetas.
                        const estado = faltaEnPiso(t) ? "por_colgar" : estadoTalla(t);
                        const pie = pieDeTalla(t, separa);
                        const cumple = !!marcaDelFiltro?.coincide(t);
                        const Simbolo = marcaDelFiltro?.simbolo;
                        const lectura = `Talla ${t.talla ?? "Única"}: ${separa ? `${t.pisoDisponible ?? 0} colgadas, ${t.almacenDisponible ?? 0} guardadas` : `${t.disponible} en la sede`}${
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
                      <p className="text-[12.5px] leading-snug text-taupe">
                        {!falta?.enPausa && <span aria-hidden className="mr-1.5 inline-block h-3 w-3.5 translate-y-px rounded-[3px] border border-ambar/45 bg-ambar/[0.10]" />}
                        {lineaFalta}
                      </p>
                    )}
                    {/* El código es de la TALLA, no de la prenda: va junto a la talla, y se copia de un toque (para Buscar o Vender). */}
                    {codigo && (
                      <button
                        type="button"
                        onClick={copiarCodigo}
                        data-guia="existencias.cajon-codigo"
                        title="Copiar el código de esta talla"
                        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] text-taupe transition-colors hover:bg-hueso hover:text-tinta"
                      >
                        código <b className="font-mono text-[12.5px] font-semibold text-tinta">{codigo}</b>
                        <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </>
                )}
              </aside>

              {/* ¿Dónde está? ¿Qué hago? ¿Cómo se vende? — o el paso en curso, o «Todas». */}
              <section key={`${vista}-${prenda.clave}-${flujo?.tipo ?? ""}`} className="anim-asentar grid min-w-0 content-start gap-3.5">
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
                      // Colgar y subir (Felipe, 2026-10-08): lo confirma el aviso destacado y el modal se va con su salida de siempre; la lista
                      // de atrás queda con la búsqueda y los filtros que tenía. El refresco va DESPUÉS de retirar la guardia de «¿Salir sin
                      // guardar?» (`retirarYa`): juntos, Next volvía a montar la página y se perdía la vista elegida y el aviso.
                      if (opciones?.cerrar) {
                        setPasoSucio(false);
                        cerrar();
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
                    {hecho && (
                      <p role="status" className="flex items-center gap-2 rounded-xl bg-verde/[0.10] px-3 py-2.5 text-sm font-medium text-verde">
                        <Check aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        {hecho}
                      </p>
                    )}

                    {vista === "talla" && (
                      <>
                        {/* ¿Dónde está? El veredicto con su porqué, las cuatro casillas y, siempre, en camino y otras tiendas. */}
                        <div data-guia="existencias.cajon-donde" className="grid gap-2.5">
                          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="label-cayla text-[11px] text-taupe">Dónde está</span>
                            <Chip tono={TONO_CHIP[insignia.tono]} versalitas={false}>
                              {insignia.texto}
                            </Chip>
                            {insignia.frase && <span className="text-[12.5px] text-taupe">{insignia.frase}</span>}
                          </p>
                          <div className={`grid gap-1.5 ${separa ? "grid-cols-4" : "grid-cols-3"}`}>
                            {casilla(separa ? (fila.pisoDisponible ?? 0) : fila.disponible, separa ? "En piso" : "disponibles", IconoPercha, separa && insignia.tono === "ambar" ? "falta" : undefined, separa ? () => irATodas("piso") : undefined, "ver todas las tallas y colores en el piso")}
                            {separa && casilla(fila.almacenDisponible ?? 0, "En almacén", Archive, undefined, () => irATodas("almacen"), "ver todas las tallas y colores en el almacén")}
                            {casilla(fila.apartado, fila.apartado === 1 ? "apartada" : "apartadas", ShoppingBag, "apartada", fila.apartado > 0 ? onVerApartadas : undefined)}
                            {casilla(fila.danado ?? 0, (fila.danado ?? 0) === 1 ? "dañada" : "dañadas", Bandage, "danada", (fila.danado ?? 0) > 0 ? onVerDanadas : undefined, puedeResolverDanadas ? "decidir qué hacer" : "ver cuáles")}
                          </div>
                          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-taupe">
                            <span className="inline-flex items-center gap-1.5">
                              <Truck aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
                              En camino: <b className="font-semibold text-tinta">{Math.max(0, fila.enTransito ?? 0)}</b>
                            </span>
                            <span>
                              Otras sedes: <b className="font-semibold text-tinta">{otrasSedes || "ninguna la tiene"}</b>
                            </span>
                          </p>
                        </div>

                        {/* ¿Qué hago? Solo lo que hoy se puede, la sugerida primero y teñida; lo demás, en una línea con su porqué. */}
                        <div className="grid gap-2">
                          <span className="label-cayla text-[11px] text-taupe">Qué hago</span>
                          {posibles.length > 0 && (
                            <ul data-guia="existencias.cajon-acciones" className="overflow-hidden rounded-2xl border border-sand bg-crema">
                              {posibles.map((a) => {
                                const Ico = ICONO[a.clave];
                                const tono = a.sugerida ? (a.clave === "pedir" ? "pizarra" : "ambar") : null;
                                return (
                                  <li key={a.clave} className="border-t border-sand first:border-t-0">
                                    <button
                                      type="button"
                                      aria-keyshortcuts={String(a.tecla)}
                                      onClick={() => alAccionar(a.clave)}
                                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                        tono === "ambar" ? "bg-ambar/[0.10] hover:bg-ambar/[0.16]" : tono === "pizarra" ? "bg-pizarra/[0.09] hover:bg-pizarra/[0.15]" : "hover:bg-hueso/70"
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
                                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" strokeWidth={1.8} />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {noAhora.length > 0 && (
                            <p data-guia="existencias.cajon-no-ahora" className="text-xs leading-relaxed text-taupe">
                              {lineaNoAhora(noAhora)}
                            </p>
                          )}
                        </div>

                        {/* ¿Cómo se vende? A la vista (antes plegado bajo «¿Cómo se vende?»). */}
                        {(ritmo || vendidasTalla !== null) && (
                          <div data-guia="existencias.cajon-ritmo" className="flex items-center gap-3 rounded-xl bg-hueso px-3 py-2.5 text-sm text-tinta/85">
                            {ritmo && <AroSemanas ritmo={ritmoColor} tam={40} />}
                            <div className="min-w-0">
                              {ritmo && <p>{prenda.color ? `${prenda.color}: ${ritmo.charAt(0).toLocaleLowerCase("es")}${ritmo.slice(1)}` : ritmo}</p>}
                              {vendidasTalla !== null && (
                                <p className="text-[12.5px] text-taupe">
                                  De esta talla: {vendidasTalla} {vendidasTalla === 1 ? "vendida" : "vendidas"} en los últimos {VENTANA_RITMO_RECIENTE_DIAS} días
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {vista === "todas" && (
                      <>
                        {/* «Todas» (opción B del 2026-10-07, afinada el 2026-10-12, ADR-0391): el modelo entero. Las casillas «colgadas» y
                            «guardadas» FILTRAN la tabla (tocas una: solo esa capa, con el número grande; tocas otra vez: las dos). Dentro de la
                            capa del piso la celda que falta colgar sigue en ámbar y dice «falta · +N atrás»: el filtro no esconde el problema.
                            Totales por color y por talla que siguen al filtro; la talla abierta en negro en la cabecera, el color abierto en
                            hueso, la celda abierta con marco; un color sin nada en la capa se atenúa, no desaparece. Se fue el «N en esta
                            sede» de 46 px: era la suma de las casillas. */}
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="label-cayla text-[11px] text-taupe">Todo el modelo</span>
                          {chipModelo && (
                            <Chip tono={chipModelo.tono} versalitas={false}>
                              {chipModelo.texto}
                            </Chip>
                          )}
                          {agotadasModelo > 0 && (
                            <Chip tono="rojo" versalitas={false}>
                              {agotadasModelo} {agotadasModelo === 1 ? "talla se acabó" : "tallas se acabaron"}
                            </Chip>
                          )}
                          <span className="text-[12.5px] text-taupe">
                            {colores.length} {colores.length === 1 ? "color" : "colores"} · {tallasDeTodos.length} {tallasDeTodos.length === 1 ? "talla" : "tallas"}
                          </span>
                        </p>
                        <div className={`grid gap-1.5 ${separa ? "grid-cols-4" : "grid-cols-3"}`}>
                          {separa ? casillaCapa("piso", sumaModelo.piso) : casilla(sumaModelo.piso, "disponibles", IconoPercha)}
                          {separa && casillaCapa("almacen", sumaModelo.almacen)}
                          {casilla(sumaModelo.apartado, sumaModelo.apartado === 1 ? "apartada" : "apartadas", ShoppingBag, "apartada")}
                          {casilla(sumaModelo.danado, sumaModelo.danado === 1 ? "dañada" : "dañadas", Bandage, "danada")}
                        </div>
                        {separa &&
                          (capa ? (
                            // Con una capa elegida, la línea dice qué se está viendo y cómo volver a ver las dos.
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-tinta">
                              {capa === "piso" ? <IconoPercha aria-hidden className="h-3.5 w-3.5 text-verde" strokeWidth={1.8} /> : <Archive aria-hidden className="h-3.5 w-3.5 text-pizarra" strokeWidth={1.8} />}
                              <span>
                                Solo lo que está <b className="font-semibold">{capa === "piso" ? "en el piso" : "en el almacén"}</b>
                                {capa === "piso" ? " · en ámbar, lo que falta colgar" : ""}
                              </span>
                              <button type="button" onClick={() => setCapa(null)} className="btn-cayla btn-enlace text-[12.5px]">
                                Ver piso y almacén
                              </button>
                            </p>
                          ) : (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-taupe">
                              <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] bg-verde/[0.22]" />
                                Arriba: en piso
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] bg-pizarra/[0.16]" />
                                Abajo: en almacén
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] bg-ambar/[0.22]" />
                                Falta colgar
                              </span>
                              <span>Toca una celda para abrir esa talla</span>
                            </p>
                          ))}
                        <div data-guia="existencias.cajon-todas-tabla" className="scroll-cayla overflow-x-auto">
                          <table // unificar-fijo: la matriz color × talla de «Todas» (ADR-0391), no una lista de registros
                            className="w-full table-fixed border-separate border-spacing-y-1.5 text-center text-sm"
                          >
                            <colgroup>
                              <col className="w-[96px]" />
                              {tallasDeTodos.map((t) => (
                                <col key={t} />
                              ))}
                              <col className="w-[58px]" />
                            </colgroup>
                            <thead>
                              <tr>
                                <th scope="col" className="text-left text-[10.5px] font-medium text-taupe">
                                  color \ talla
                                </th>
                                {tallasDeTodos.map((t) => (
                                  <th key={t} scope="col" className="px-[3px] text-xs font-semibold text-taupe">
                                    {/* La talla que se estaba viendo, en negro: la tabla responde «¿y las demás?» sin perder cuál era la mía. */}
                                    <span className={`inline-block rounded-full px-2 py-0.5 ${t === (fila.talla ?? "Única") ? "bg-tinta text-crema" : ""}`}>{t}</span>
                                  </th>
                                ))}
                                <th scope="col" className="text-xs font-semibold text-taupe">
                                  Total
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {colores.map((c) => {
                                const celdasColor = c.tallas.map((t) => celdaTarjeta(t, separa));
                                const sumaColor = { piso: celdasColor.reduce((n, x) => n + x.piso, 0), almacen: celdasColor.reduce((n, x) => n + x.almacen, 0) };
                                // Un color sin nada en la capa elegida se atenúa (no desaparece: sigue diciendo que no hay).
                                const vacioEnCapa = capa === "piso" ? sumaColor.piso === 0 : capa === "almacen" ? sumaColor.almacen === 0 : false;
                                const colorAbierto = c.clave === prenda.clave;
                                return (
                                  <tr key={c.clave} className={vacioEnCapa ? "opacity-40" : ""}>
                                    <th scope="row" className={`truncate rounded-lg pl-1.5 pr-1.5 text-left text-[13px] font-semibold text-tinta ${colorAbierto ? "bg-hueso" : ""}`}>
                                      <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                                      {c.color ?? "Sin color"}
                                    </th>
                                    {tallasDeTodos.map((t) => {
                                      const f = c.tallas.find((x) => (x.talla ?? "Única") === t);
                                      if (!f) return <td key={t} aria-hidden className="text-taupe/40">·</td>;
                                      const sel = colorAbierto && f.varianteId === fila.varianteId;
                                      const celda = celdaTarjeta(f, separa);
                                      const ir = () => {
                                        irA(c, f);
                                        setVista("talla");
                                      };
                                      const lectura = `${c.color ?? "Sin color"} ${t}: ${
                                        celda.estado === "agotada"
                                          ? "se acabó"
                                          : !separa
                                            ? `${celda.piso} disponibles`
                                            : capa === "piso"
                                              ? `${celda.piso} colgadas${celda.estado === "falta" ? `, falta colgar (hay ${celda.almacen} guardadas)` : ""}`
                                              : capa === "almacen"
                                                ? `${celda.almacen} guardadas`
                                                : `${celda.piso} colgadas, ${celda.almacen} guardadas`
                                      }. Ver esta talla`;
                                      // Con una capa elegida, la celda muestra SOLO esa mitad, a todo el alto y con el número más grande.
                                      const verPiso = !separa || capa !== "almacen";
                                      const verAlmacen = separa && capa !== "piso";
                                      const grande = separa && capa !== null;
                                      return (
                                        <td key={t} className="px-[3px]">
                                          {celda.estado === "agotada" ? (
                                            <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`grid h-[52px] w-full place-items-center rounded-[9px] border border-rojo/40 bg-rojo/[0.10] text-xs font-bold text-rojo-profundo ${sel ? "ring-2 ring-tinta" : ""}`}>
                                              Se acabó
                                            </button>
                                          ) : (
                                            <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`flex h-[52px] w-full flex-col overflow-hidden rounded-[9px] border bg-crema transition-colors ${sel ? "border-tinta ring-1 ring-tinta" : "border-sand hover:border-tinta/35"}`}>
                                              {verPiso && (
                                                <span className={`flex w-full flex-1 flex-col items-center justify-center gap-0 font-bold tabular-nums ${grande ? "text-[17px]" : "text-[13.5px]"} ${celda.estado === "falta" ? "bg-ambar/[0.16] text-ambar-profundo" : celda.piso > 0 ? "bg-verde/[0.16] text-verde" : "text-taupe"}`}>
                                                  <span className="inline-flex items-center gap-1">
                                                    <IconoPercha aria-hidden className={grande ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={1.8} />
                                                    {celda.piso}
                                                  </span>
                                                  {/* Dentro de la capa del piso, la que falta colgar dice cuántas hay atrás: el filtro subraya el problema, no lo esconde. */}
                                                  {grande && capa === "piso" && celda.estado === "falta" && <small className="text-[10px] font-semibold leading-none">falta · +{celda.almacen} atrás</small>}
                                                </span>
                                              )}
                                              {verAlmacen && (
                                                <span className={`flex w-full flex-1 items-center justify-center gap-1 tabular-nums ${grande ? "text-[17px] font-bold" : "border-t border-sand text-[13.5px] font-semibold"} ${celda.almacen === 0 ? "text-taupe/60" : "bg-pizarra/[0.12] text-pizarra"}`}>
                                                  <Archive aria-hidden className={grande ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={1.8} />
                                                  {celda.almacen}
                                                </span>
                                              )}
                                            </button>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-[3px]">{totalCelda(sumaColor.piso, sumaColor.almacen)}</td>
                                  </tr>
                                );
                              })}
                              {/* La fila de totales por talla: cuántas de cada talla hay en el modelo (en la capa elegida, solo esa). */}
                              <tr>
                                <th scope="row" className="pl-1.5 text-left text-[12px] font-semibold text-taupe">
                                  Total
                                </th>
                                {tallasDeTodos.map((t) => {
                                  const col = colores.flatMap((c) => c.tallas.filter((x) => (x.talla ?? "Única") === t)).map((x) => celdaTarjeta(x, separa));
                                  return (
                                    <td key={t} className="px-[3px]">
                                      {totalCelda(
                                        col.reduce((n, x) => n + x.piso, 0),
                                        col.reduce((n, x) => n + x.almacen, 0)
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-[3px]">{totalCelda(sumaModelo.piso, sumaModelo.almacen)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {separa && puedeReponer && (
                          <button
                            type="button"
                            data-guia="existencias.cajon-colgar-varias"
                            disabled={sumaModelo.almacen === 0}
                            onClick={() => lanzar("colgarVarias", { cant: {} })}
                            className="flex w-full items-center gap-3 rounded-2xl border border-sand bg-ambar/[0.10] px-3 py-2.5 text-left transition-colors hover:bg-ambar/[0.16] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ambar/[0.10]"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ambar/[0.18] text-ambar-profundo">
                              <IconoPercha aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <b className="block text-[14px] font-semibold text-tinta">Colgar varias tallas y colores</b>
                              <small className="block text-xs text-taupe">
                                {subtituloColgarVarias({ porColgar: porColgarModelo, sinColgar: sinColgarModelo, almacen: sumaModelo.almacen })}
                              </small>
                            </span>
                            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" strokeWidth={1.8} />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </Modal>
      {aviso}
      {fotoGrande && prenda.fotoUrl && <FotoAmpliada fotoUrl={prenda.fotoUrl} referencia={prenda.referencia} color={prenda.color} onCerrar={() => setFotoGrande(false)} />}
    </>
  );
}
