"use client";

import { dondeEstanLasDanadas } from "@/lib/danadas-correccion";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeftRight, Bandage, Check, ChevronRight, ShoppingBag, Truck, Warehouse, ZoomIn } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pestanas } from "@/components/ui/Pestanas";
import { Chip } from "@/components/ui/Chip";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { avisar } from "@/components/ui/Avisos";
import { Ayuda } from "@/components/Ayuda";
import { Boton } from "@/components/ui/campos";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { avisoSinStock } from "@/lib/stock-en-sede-reglas";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { AroSemanas } from "@/components/existencias/AroSemanas";
import { navegacionSinEspera } from "@/components/ui/Espera";
import { FlujoTalla } from "@/components/existencias/FlujoTalla";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { fotoQueDistingue } from "@/lib/color-estampado-reglas";
import { MuestraEstampado } from "@/components/ui/MuestraEstampado";
import { BandaAjustar, ListoDelAjuste, PieDelAjuste, PlanillaDelAjuste, TalonDelAjuste, useTopeDeLaPlanilla } from "@/components/existencias/AjusteDelModelo";
import { useAjusteDelModelo, type AjusteGuardado } from "@/components/existencias/useAjusteDelModelo";
import { anchoDelModalAlAjustar, lugarInicial } from "@/lib/existencias-ajuste-modelo";
import { sonarConfirmacion } from "@/lib/sonido-confirmar";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { FotoAmpliada } from "@/components/existencias/FotoAmpliada";
import { accionesDeTalla, insigniaDeTalla, loQueFaltaEnElPiso, marcaDeColor, origenesDeTalla, pieDeTalla, fraseDelEstado, queTocaConLaTalla, resumenDeLugar, separarAcciones, subtituloColgarVarias, type ClaveAccionTalla } from "@/lib/existencias-panel-talla";
import { ritmoDePrenda, textoDeRitmo, vendidasDeLaTalla } from "@/lib/existencias-colgar-primero";
import { VENTANA_RITMO_RECIENTE_DIAS } from "@/lib/existencias-ritmo";
import { estadoTalla, urlEtiquetas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { celdaTarjeta, tallasSinColgar } from "@/lib/existencias-tarjeta-compacta";
import { hrefApartarDesdeTicket } from "@/lib/apartar-desde-ticket";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { CLAVE_CASA, lineaDeDuenos, textoDeDueno } from "@/lib/stock-por-dueno-reglas";
import { mejorOrigen, type DatosFlujo, type SedeConCantidad, type TipoFlujo } from "@/lib/existencias-flujos";
import { esRafaga, MS_ENTRE_TECLAS } from "@/lib/existencias-pistola";
import { urlRotulos } from "@/lib/rotulos-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { FOTO_PANEL_TALLA } from "@/lib/fotos-tamanos";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { fondoDelPunto } from "@/lib/color-combinado";

type Vista = "talla" | "todas";
type Prenda = PrendaAgrupada<FilaExistencias>;
type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** El flujo que el panel abre de entrada (las acciones rápidas de la tarjeta y «Colgar primero» abren el panel YA en su paso). «ajustar»
 *  no es un paso: abre la planilla del modelo entero con esa talla en foco (ADR-0494). */
export type FlujoPedido = { tipo: TipoFlujo; datos?: DatosFlujo; paso?: number } | { tipo: "ajustar" };

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
  danada: Bandage,
};

/** El estado de la talla (`insigniaDeTalla`) bajo la frase grande, con su punto: rojo = se acabó, ámbar = falta colgar, pizarra = informativo,
 *  verde = bien (maqueta 2026-11-24: el estado en una línea, como en «Todas», en vez de la insignia junto a «Dónde está»). */
const TONO_ESTADO = { rojo: "text-rojo-profundo", ambar: "text-ambar-profundo", pizarra: "text-pizarra", verde: "text-verde" } as const;
const PUNTO_ESTADO = { rojo: "bg-rojo", ambar: "bg-ambar", pizarra: "bg-pizarra", verde: "bg-verde" } as const;

const CLASE_TALLA = {
  normal: "border-sand bg-crema",
  por_colgar: "border-ambar/35 bg-ambar/[0.10]",
  sin_atras: "border-sand bg-crema",
  // Agotada (nada libre en la sede): rojo suave, como la columna de la tarjeta (2026-10-07).
  sin_stock: "border-rojo/35 bg-rojo/[0.08] text-rojo-profundo",
} as const;

const solesDe = (n: number | null | undefined) => (n == null ? null : `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** El punto del color y la insignia de la talla con un filtro puesto: los mismos tonos que en las tarjetas (`ExistenciasTarjetas`). */
const TONO_PUNTO = { ambar: "bg-ambar", pizarra: "bg-pizarra", tinta: "bg-tinta" } as const;
const TONO_INSIGNIA = { ambar: "text-ambar", pizarra: "text-pizarra", tinta: "text-tinta" } as const;
const SIN_FALTA: ReadonlySet<string> = new Set();
const SIN_CALCULAR: ReadonlySet<string> = new Set();
const escribiendo = (el: Element | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
/** Las casillas de «Dónde está» y de «Todo el modelo»: las cuatro en UNA fila, también en el celular (Felipe 2026-11-24, maqueta del modal
 *  liviano: de a dos alargaban la hoja sin decir más). Sin el piso y el almacén separados son tres. */
const casillasDeLaFila = (separa: boolean) => `grid gap-1.5 ${separa ? "grid-cols-4" : "grid-cols-3"}`;
/** La cifra de cada casilla: 22 px, cuatro en fila en todos los anchos. */
const CIFRA_CASILLA = "text-[22px]";
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
  volverAEditar = null,
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
  lugarDanadas = null,
  ritmoCalculando = SIN_CALCULAR,
  hrefCatalogo,
  fotoDesde = null,
  onAjustarCompleto,
  onVerApartadas,
  onVerDanadas,
  puedeResolverDanadas = false,
  onArreglarDanada,
  onCerrar,
}: {
  /** Los colores del modelo, cada uno con sus tallas (`coloresDelModelo`). */
  colores: Prenda[];
  claveInicial: string;
  varianteInicial?: string;
  /** Abrir directamente en un paso (acción rápida de la tarjeta, «Colgar primero»). Cambia con cada pedido. */
  flujoInicial?: FlujoPedido | null;
  /** La ficha de Editar producto de donde se llegó (candado → «Ajustar stock»): la vuelta de la planilla va ahí, no a la talla. */
  volverAEditar?: string | null;
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
  /** Dónde deja la tienda las prendas dañadas (ADR-0564): «Reportar dañada» lo repite. */
  lugarDanadas?: string | null;
  /** Las tallas cuyo Ritmo reciente viene en camino (llega después que la lista, `lib/existencias-ritmo-panel.ts`): «¿Cómo se vende?» dice
   *  «calculando» mientras alguna talla del color lo espera, en vez de no decir nada y aparecer de golpe. */
  ritmoCalculando?: ReadonlySet<string>;
  /** El enlace a Catálogo ▸ Productos con esta prenda, solo si el rol ve Productos. */
  hrefCatalogo?: (referencia: string) => string;
  /** La miniatura de la tarjeta desde la que se abrió: la foto cruza desde ahí hasta el modal. `null`: entra sin cruzar. */
  fotoDesde?: HTMLElement | null;
  /** La ventana completa de Ajustar (una talla que faltó en un conteo se enlaza ahí). */
  onAjustarCompleto: (f: FilaExistencias) => void;
  onVerApartadas?: () => void;
  onVerDanadas?: () => void;
  puedeResolverDanadas?: boolean;
  /** ADR-0640: «Volvió arreglada» de una talla con dañadas: abre Dañadas con su «Se arregló» listo. Sin esto, la fila no se ofrece. */
  onArreglarDanada?: (varianteId: string) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("talla");
  const [clave, setClave] = useState(claveInicial);
  const [varianteId, setVarianteId] = useState<string | undefined>(varianteInicial);
  const [flujo, setFlujo] = useState<FlujoPedido | null>(flujoInicial);
  // La talla de la que se viene al abrir «Ajustar stock»: queda en foco hasta que se toque otra o «Ver todo el modelo» (ronda 3).
  const [focoAjuste, setFocoAjuste] = useState<string | null>(flujoInicial?.tipo === "ajustar" ? (varianteInicial ?? null) : null);
  // Lo recién guardado, si entraron prendas: el modal muestra «Etiquetas de lo que entró» antes de volver a la talla.
  const [listoAjuste, setListoAjuste] = useState<AjusteGuardado | null>(null);
  // Lo recién guardado mientras cada talla se sella en verde, una tras otra (unos 0,7 s), antes del «listo» o de volver a la talla.
  const [sellando, setSellando] = useState<AjusteGuardado | null>(null);
  // Las cifras de «Dónde está» de la talla de antes de guardar: al volver, cuentan desde ellas hasta el número nuevo.
  const [cifrasAntes, setCifrasAntes] = useState<{ varianteId: string; piso: number; almacen: number; disponible: number } | null>(null);
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
    setFocoAjuste(flujoInicial?.tipo === "ajustar" ? (varianteInicial ?? null) : null);
    setListoAjuste(null);
    setSellando(null);
    setCifrasAntes(null);
    setHecho(null);
  }

  // El modal bloquea la pantalla de atrás (2026-10-06, Felipe): tocar afuera, la ✕ o Escape lo cierran, y si hay un paso a medias
  // (un dato cambiado, un paso avanzado, un guardado en camino) primero se pregunta «¿Salir sin guardar?». La pregunta la hace
  // `useSalidaSinGuardar`; el `<Modal>` le pasa su cierre por `antesDeCerrar`.
  const [pasoSucio, setPasoSucio] = useState(false);
  // «Ajustar stock» (ADR-0494): la planilla del modelo entero. El hook se llama siempre y trabaja solo con la planilla abierta; entra en el
  // lugar donde la talla elegida tiene más unidades (Felipe, ronda 3).
  const modoAjuste = flujo?.tipo === "ajustar";
  // Con la planilla a la vista, la hoja no se desliza (desde 640 px; en el celular sí, con el pie pegado): solo la planilla (ronda 2 de la
  // «Planilla rápida», Felipe 2026-10-26). Las
  // etiquetas de lo que entró vuelven a la hoja de siempre.
  const planillaFija = modoAjuste && !listoAjuste;
  // Pasar a la planilla es un cambio de VISTA, no un bloque que se encogió: se suelta <PaginaEstable> antes de pintar (ADR-0185, como
  // los pasos de Nuevo producto). Sin esto, quien bajó la hoja de la talla y tocó «Ajustar stock» la encontraba con 862 px de relleno
  // dentro de la hoja de alto fijo: la planilla aplastada y el pie encima de «Dónde» (/chaos 2026-10-26, H1).
  useLayoutEffect(() => {
    if (planillaFija) soltarPaginaEstable();
  }, [planillaFija]);
  const prendaDeAhora = colores.find((c) => c.clave === clave) ?? colores[0];
  const filaDeAhora = prendaDeAhora?.tallas.find((t) => t.varianteId === varianteId) ?? prendaDeAhora?.tallas[0];
  const ajuste = useAjusteDelModelo({
    activo: modoAjuste && Boolean(prendaDeAhora),
    productoId: prendaDeAhora?.productoId ?? "",
    ubicacionId,
    separa,
    sububicacionPisoId,
    sububicacionAlmacenId,
    puedeBajarAlPiso: puedeReponer,
    ordenColores: colores.map((c) => c.color),
    tonosDe: (color) => colores.find((c) => c.color === color)?.colorTonos,
    ubicadoInicial: lugarInicial({ piso: filaDeAhora?.piso ?? 0, almacen: filaDeAhora?.almacen ?? 0 }, separa),
  });
  // La última versión del ajuste, para lo que corre después de guardar (el cambio de lugar de «Guardar y pasar a almacén»): la del render
  // que guardó todavía tiene lo contado y rechazaría el cambio.
  const ajusteAhora = useRef(ajuste);
  useEffect(() => {
    ajusteAhora.current = ajuste;
  });
  // «Guardar y pasar a almacén» (ronda 2 de la «Planilla rápida»): tras guardar se sigue en el otro lugar, no se vuelve a la talla.
  const [pasarDespues, setPasarDespues] = useState<"piso" | "almacen" | null>(null);
  // El lugar en el que el aviso «¿Qué hacemos con lo que contaste?» se abrió: mientras sigue ahí, el «Guardar» del pie es secundario. Se guarda
  // el lugar y no un sí/no: al cambiar de lugar (la planilla empieza de nuevo) deja de valer solo.
  const [avisoLugarEn, setAvisoLugarEn] = useState<string | null>(null);
  const ajusteSucio = modoAjuste && (ajuste.lineas.length > 0 || ajuste.enviando || ajuste.incierto);
  const { pedirAccion, retirarYa, aviso } = useSalidaSinGuardar(
    ajusteSucio || (Boolean(flujo) && !modoAjuste && pasoSucio),
    modoAjuste
      ? "Tocaste el stock de este modelo y todavía no se guardó. Si sales ahora, se pierde lo que contaste."
      : "Dejaste esta acción a medias y todavía no se guardó. Si sales ahora, se pierde lo que llenaste."
  );
  // ↑ ↓ cambian el color (como la maqueta), por la pieza de los cajones (ADR-0128): ignora la flecha de un campo o de otro portal.
  const [pasoColor, setPasoColor] = useState<{ delta: 1 | -1; n: number } | null>(null);
  const alFlecha = useFlechasDelCajon(useCallback((delta: 1 | -1) => setPasoColor((p) => ({ delta, n: (p?.n ?? 0) + 1 })), []));

  // La hora de la última tecla dentro del modal: distingue un atajo (una tecla) de la pistola (una ráfaga).
  const ultimaTecla = useRef(0);
  // Al abrir, el teclado entra al modal (como la maqueta): ← → ↑ ↓ y 1–7 funcionan sin tocar el mouse.
  const raiz = useRef<HTMLDivElement>(null);
  // En el celular la hoja de la planilla se desliza entera: la planilla se topa en lo que se ve sobre el pie (Felipe 2026-10-26).
  useTopeDeLaPlanilla(raiz, planillaFija && !sellando);
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
    if (!origen || !destino || !origen.isConnected || prefiereQuieto()) return;
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
      borderRadius: "var(--radius-md)",
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
        Object.assign(vuela.style, { left: `${r2.left}px`, top: `${r2.top}px`, width: `${r2.width}px`, height: `${r2.height}px`, borderRadius: "var(--radius-campo)" });
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
    { puedeReponer, puedeEnviar: puedeEnviar && destinos.length > 0, puedeApartar, puedePedir: puedePedir && sedesParaPedir.length > 0, origenes, puedeReportarDanada },
    separa
  );
  const { posibles } = separarAcciones(acciones);
  // ADR-0640: «Volvió arreglada» se ofrece si esta talla tiene una dañada y quien mira puede decidir qué hacer con ella.
  const arreglable = (fila.danado ?? 0) > 0 && puedeResolverDanadas && !!onArreglarDanada;
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
  const calculandoRitmo = prenda.tallas.some((t) => ritmoCalculando.has(t.varianteId));
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
  const codigo = fila.codigosBarras?.[0] ?? fila.sku ?? null;
  // Cuánto tiene cada otra sede de esta talla: cada una en su etiqueta («LIM 3» «AQP 1»), sin «·» (Felipe 2026-11-24).
  const otrasSedes = (fila.enRed ?? []).filter((s) => s.cantidad > 0);
  // De quién son las unidades de esta talla aquí (ADR-0542): solo donde conviven dos empresas y solo si alguien que no es la casa tiene.
  const duenosDeLaTalla = lineaDeDuenos(fila.duenos);
  const insignia = insigniaDeTalla(queToca);
  // El porqué del estado sin repetir los números que ya dice la frase grande («cuelga 1», «Lima tiene 2»).
  const fraseCorta = fraseDelEstado(insignia);
  // La frase grande: dónde están las libres, con sus números (`resumenDeLugar`). La acción que el sistema sugiere va con ella, como botón;
  // las demás, en «También puedes».
  const resumen = resumenDeLugar(
    { piso: fila.pisoDisponible ?? 0, almacen: fila.almacenDisponible ?? 0, disponible: fila.disponible, apartado: fila.apartado, danado: fila.danado ?? 0 },
    separa
  );
  const sugerida = posibles.find((a) => a.sugerida) ?? null;
  const tambien = posibles.filter((a) => a !== sugerida);
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
  const resumenModelo = resumenDeLugar({ piso: sumaModelo.piso, almacen: sumaModelo.almacen, disponible: sumaModelo.piso + sumaModelo.almacen }, separa);
  // «Colgar varias» es la acción del modelo: oscura si algo falta colgar, clara si no (sigue a mano para colgar de más).
  const faltaColgarModelo = porColgarModelo > 0 || sinColgarModelo > 0;
  // Lo de la prenda (fila de arriba): las etiquetas de las tallas de ESTE color, el rótulo del modelo, el historial y Catálogo.
  const hrefEtiquetas = urlEtiquetas(prenda.tallas);
  const hrefRotulo = urlRotulos([prenda.productoId], { desde: "existencias" });
  // Las unidades libres de este color en la sede, lo que Existencias ya tiene en memoria: `EnlaceEtiquetas` avisa si no hay nada que
  // imprimir en vez de abrir una pantalla vacía (la lista se refresca tras cada guardado, así que no hay una lectura vieja que engañe).
  const unidadesDelColor = prenda.tallas.reduce((n, t) => n + Math.max(0, separa ? (t.pisoDisponible ?? 0) + (t.almacenDisponible ?? 0) : t.disponible), 0);
  // «Más» (maqueta 2026-11-24): los cuatro botones de la prenda, que antes ocupaban una fila entera, en el menú del sistema.
  const itemsMas: ItemMenu[] = [
    ...(enSedeActiva && hrefEtiquetas
      ? [{
          clave: "etiquetas",
          etiqueta: "Etiquetas",
          onSelect: () => {
            // Sin nada que imprimir no navega (lo mismo que hacía `EnlaceEtiquetas`): lo dice el aviso.
            if (unidadesDelColor === 0) {
              const aviso = avisoSinStock(`${prenda.referencia}${prenda.color ? ` ${prenda.color}` : ""}`, sedeNombre, false);
              avisar.error(aviso.texto, { detalle: aviso.detalle });
              return;
            }
            router.push(hrefEtiquetas);
          },
        }]
      : []),
    ...(hrefRotulo ? [{ clave: "rotulo", etiqueta: "Rótulo", onSelect: () => router.push(hrefRotulo) }] : []),
    ...(enSedeActiva ? [{ clave: "historial", etiqueta: "Historial", onSelect: () => router.push(`/productos/${prenda.productoId}/historial`) }] : []),
    ...(hrefCatalogo ? [{ clave: "catalogo", etiqueta: "Catálogo", onSelect: () => router.push(hrefCatalogo(prenda.referencia)) }] : []),
  ];

  // Las cifras de antes de ajustar, solo para la talla que se ajustó y solo hasta mirar otra.
  const antesDeEsta = cifrasAntes?.varianteId === fila.varianteId ? cifrasAntes : null;

  function irA(c: Prenda, t: FilaExistencias) {
    setClave(c.clave);
    setVarianteId(t.varianteId);
    setHecho(null);
    setCifrasAntes(null);
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
      case "danada":
        return lanzar("danada");
      case "apartar":
        // La separación de Vender, con esta talla puesta: ahí se pide el cliente, el adelanto y se cobra con la caja abierta.
        return router.push(hrefApartarDesdeTicket([{ varianteId: fila!.varianteId, cantidad: 1 }]));
    }
  }

  // «Ajustar stock» (ADR-0494): el modal se vuelve la planilla del modelo entero, con ESTA talla en foco.
  function abrirAjuste() {
    setHecho(null);
    setListoAjuste(null);
    setCifrasAntes(null);
    setVista("talla");
    setFocoAjuste(fila!.varianteId);
    setFlujo({ tipo: "ajustar" });
  }
  // Volver a la talla: si hay algo tocado sin guardar, primero «¿Salir sin guardar?».
  const volverDeAjuste = () =>
    pedirAccion(() => {
      if (volverAEditar) {
        router.push(volverAEditar);
        return;
      }
      setFlujo(null);
      setFocoAjuste(null);
      setListoAjuste(null);
      raiz.current?.focus({ preventScroll: true });
    });
  async function guardarAjuste(luego?: "piso" | "almacen") {
    const antes = { varianteId: fila!.varianteId, piso: fila!.pisoDisponible ?? 0, almacen: fila!.almacenDisponible ?? 0, disponible: fila!.disponible };
    const r = await ajuste.guardar();
    if (!r) return;
    setCifrasAntes(antes);
    const n = r.lineas.length;
    const texto = r.yaEstaba ? "Esto ya estaba guardado. No se repitió." : `Stock ajustado en ${n} ${n === 1 ? "talla" : "tallas"}`;
    if (r.yaEstaba) avisar.aviso(texto, { detalle: prenda!.referencia });
    else {
      sonarConfirmacion();
      avisar.exito(texto, { detalle: `${prenda!.referencia} · ${r.lineas.map((l) => `${l.nombre} ${l.actual} → ${l.resultado}`).join(" · ")}` });
    }
    // La lista de atrás se pone al día sin el loader con el logo (como Colgar y Subir).
    navegacionSinEspera(window.location.href);
    router.refresh();
    setHecho(texto);
    // Cada talla guardada se sella en verde, una tras otra (ADR-0136, excepción de la planilla); después, si entraron prendas, sus
    // etiquetas (como en Editar producto), y si solo se restó, de vuelta a la talla. Con movimiento reducido, sin espera.
    setFocoAjuste(null);
    setSellando(r);
    const quieto = prefiereQuieto();
    window.setTimeout(
      () => {
        setSellando(null);
        // Si entraron prendas, primero sus etiquetas; con «Guardar y pasar», «Más tarde» sigue en el otro lugar.
        if (!r.yaEstaba && r.lineas.some((l) => l.delta > 0)) {
          setListoAjuste(r);
          setPasarDespues(luego ?? null);
          return;
        }
        if (luego) {
          ajusteAhora.current.cambiarLugar(luego);
          return;
        }
        setFlujo(null);
        raiz.current?.focus({ preventScroll: true });
      },
      quieto ? 0 : Math.min(r.lineas.length, 10) * 70 + 650
    );
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
    if (esRafaga(e.key, antes, e.timeStamp)) return;
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
      // La 6 es «Ajustar stock», que dejó la lista por la banda de «Dónde está» (ADR-0494) y conserva su tecla.
      const ajustar = e.key === "6" && puedeAjustar;
      if (!a?.ok && !ajustar) return;
      e.preventDefault();
      const marca = e.timeStamp;
      window.setTimeout(() => {
        if (ultimaTecla.current !== marca) return;
        if (ajustar) abrirAjuste();
        else if (a) alAccionar(a.clave);
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
  // `desde`: la cifra de antes de ajustar el stock: al volver de la planilla cuenta desde ella hasta la nueva (ADR-0494).
  // En el celular las cuatro van de a dos (`casillasDeLaFila`) y la cifra sube a 28 px, el tope de `TarjetaCifra` (Felipe
  // 2026-11-17: «poder visualizar en grande lo importante»): de a cuatro medían 74 px y «En almacén», «apartadas» y «dañadas» se salían.
  const casilla = (valor: number, rotulo: string, Ico: Icono, clase?: "falta" | "apartada" | "danada", abre?: () => void, queHace = "ver cuáles", desde?: number) => {
    const fondo =
      clase === "falta"
        ? "border border-ambar/45 bg-ambar/[0.12] text-ambar-profundo"
        : valor === 0
          ? "border border-dashed border-sand text-taupe"
          : clase === "apartada"
            ? "bg-pizarra/[0.12] text-tinta"
            : clase === "danada"
              ? "bg-rojo/[0.09] text-tinta"
              : "vd-hundido text-tinta";
    const cuerpo = (
      <>
        <b className={`block font-display ${CIFRA_CASILLA} font-medium leading-none tabular-nums`}>{desde === undefined ? valor : <CifraQueCuenta valor={valor} desde={desde} />}</b>
        <small className="text-xs leading-tight text-secundario sm:text-sm">{rotulo}</small>
        <Ico aria-hidden className="absolute right-2 top-2 h-3.5 w-3.5 text-secundario max-sm:hidden" />
        {abre && <ChevronRight aria-hidden className="absolute bottom-2 right-1.5 h-3.5 w-3.5 text-secundario max-sm:hidden" />}
      </>
    );
    // En el celular van cuatro en fila (maqueta 2026-11-24): centradas, sin ícono ni flecha, para que la palabra quepa entera.
    const base = `relative grid min-h-14 place-items-center gap-0.5 rounded-md px-1 py-2 text-center sm:place-items-stretch sm:gap-1 sm:px-2.5 sm:text-left ${fondo}`;
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
    // Sin fondo de color (maqueta 2026-11-24): el ícono lleva el tono, igual que en la celda.
    const tono = cual === "piso" ? "vd-hundido text-verde" : "vd-hundido text-pizarra";
    return (
      <button
        type="button"
        aria-pressed={elegida}
        onClick={() => setCapa(elegida ? null : cual)}
        title={elegida ? "Ver piso y almacén" : `Ver solo lo que está ${cual === "piso" ? "en el piso" : "en el almacén"}`}
        className={`relative grid min-h-14 place-items-center gap-0.5 rounded-md border px-1 py-2 text-center transition-[opacity,box-shadow,border-color,outline] sm:place-items-stretch sm:gap-1 sm:px-2 sm:text-left ${HOVER_CASILLA} ${tono} ${
          elegida ? "border-tinta shadow-[0_0_0_1px_var(--color-tinta)]" : "border-transparent"
        } ${apagada ? "opacity-45" : ""}`}
      >
        <span className="flex items-center gap-1.5">
          <Icono aria-hidden className="h-4 w-4 shrink-0" />
          <b className={`block font-display ${CIFRA_CASILLA} font-medium leading-none tabular-nums text-tinta`}>{valor}</b>
        </span>
        <small className="text-xs font-semibold leading-tight text-tinta sm:whitespace-nowrap sm:text-sm">{rotulo}</small>
        {elegida && <Check aria-hidden className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-tinta" />}
      </button>
    );
  };

  /** La celda de totales de «Todas» (ADR-0391): en hueso, sin borde, no se toca; sigue a la capa (una cifra) o apila las dos. */
  const totalCelda = (pisoN: number, almacenN: number) => {
    if (!separa) return <div className="grid h-16 place-items-center rounded-md vd-hundido text-sm font-semibold tabular-nums text-tinta">{pisoN}</div>;
    if (capa === "piso") return <div className="grid h-16 place-items-center rounded-md vd-hundido text-lg font-semibold tabular-nums text-tinta">{pisoN}</div>;
    if (capa === "almacen") return <div className="grid h-16 place-items-center rounded-md vd-hundido text-lg font-semibold tabular-nums text-tinta">{almacenN}</div>;
    return (
      <div className="grid h-16 grid-rows-2 overflow-hidden rounded-md vd-hundido tabular-nums text-tinta">
        <span className="flex items-center justify-center gap-1 text-sm font-semibold">
          <IconoPercha aria-hidden className="h-3 w-3 text-taupe" />
          {pisoN}
        </span>
        <span className="flex items-center justify-center gap-1 border-t border-sand text-sm font-semibold">
          <Archive aria-hidden className="h-3 w-3 text-taupe" />
          {almacenN}
        </span>
      </div>
    );
  };

  // La bajada del título (maqueta 2026-11-24): la marca y la categoría como etiquetas y el precio solo, sin «·» entre ellos (Felipe: «no
  // se ve bien»); a la derecha, «Más» con lo que antes era la fila de cuatro botones.
  const subtitulo = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        {prenda.marca && <Chip versalitas={false}>{prenda.marca}</Chip>}
        {prenda.categoria && <Chip versalitas={false}>{prenda.categoria}</Chip>}
        {precio && <b className="text-lg font-semibold tabular-nums text-tinta">{precio}</b>}
        {/* Precio propio de esta sede (Felipe 2026-10-09): distinto del de las demás tiendas. */}
        {prenda.precioDeSede && (
          <Chip tono="ambar" versalitas={false}>
            precio de esta tienda
          </Chip>
        )}
        {!modoAjuste && itemsMas.length > 0 && (
          <span className="ml-auto">
            <MenuAcciones texto="Más" etiqueta={`Más de ${prenda.referencia}`} items={itemsMas} guia="existencias.cajon-prenda" />
          </span>
        )}
      </span>
      {descripcion && !modoAjuste && <span className="mt-1 block whitespace-pre-line break-words text-sm leading-snug text-tinta/80">{descripcion}</span>}
    </>
  );

  return (
    <>
      <Modal
        alCerrarEnfocar={abridor}
        variante="hoja"
        ancho={`max-w-[62rem] transition-[max-width] duration-[420ms] ease-[var(--ease-cayla)] ${modoAjuste ? anchoDelModalAlAjustar(ajuste.modelo?.tallas.length ?? tallasDeTodos.length).clase : ""}`} /* unificar-fijo: el modal de la prenda de Existencias es de diseño propio (ADR-0344); al ajustar crece solo si la planilla no cabe (ADR-0494) */
        conCerrar
        altoFijo={planillaFija}
        titulo={
          modoAjuste ? (
            <>
              {prenda.referencia}
              <span className="text-taupe"> · Ajustar stock</span>
            </>
          ) : (
            prenda.referencia
          )
        }
        subtitulo={subtitulo}
        onClose={onCerrar}
        antesDeCerrar={(cerrar) => pedirAccion(cerrar)}
      >
        {(cerrar) => (
          <div ref={raiz} tabIndex={-1} onKeyDown={alTeclear} data-guia="existencias.cajon" className={`outline-none ${planillaFija ? "flex min-h-0 flex-auto flex-col" : ""}`}>
            <div
              className={`grid gap-5 transition-[grid-template-columns] duration-[420ms] ease-[var(--ease-cayla)] sm:gap-6 ${modoAjuste ? "sm:grid-cols-[14rem_minmax(0,1fr)]" : "sm:grid-cols-[17rem_minmax(0,1fr)]"} ${planillaFija ? "min-h-0 flex-auto grid-rows-[minmax(0,1fr)]" : ""}`}
            >
              {/* ¿Cuál? La foto, las vistas, el color, la talla y su código. Al ajustar, la foto y el talón (en el celular se van: el pie ya
                  dice cuántos cambios, y la planilla se queda con el alto). */}
              {/* En el celular (maqueta 2026-11-24) la foto se achica a 64 px y va al lado del color y las tallas; «Esta talla / Todas» va
                  primero, a lo ancho. Desde 640 px, la columna de siempre. */}
              <aside className={planillaFija ? "flex min-h-0 flex-col gap-3 max-sm:hidden" : `grid content-start gap-3 ${modoAjuste ? "" : "max-sm:grid-cols-[64px_minmax(0,1fr)] max-sm:gap-x-3"}`}>
                <div
                  ref={fotoGrandeRef}
                  onClick={prenda.fotoUrl ? () => setFotoGrande(true) : undefined}
                  role={prenda.fotoUrl ? "button" : undefined}
                  tabIndex={prenda.fotoUrl ? 0 : undefined}
                  onKeyDown={prenda.fotoUrl ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setFotoGrande(true)) : undefined}
                  aria-label={prenda.fotoUrl ? `Ver la foto de ${prenda.referencia} en grande` : undefined}
                  title={prenda.fotoUrl ? "Ver la foto en grande" : undefined}
                  className={`group relative w-full overflow-hidden rounded-campo vd-hundido outline-none ring-tinta/40 transition-[box-shadow,height] duration-[420ms] ease-[var(--ease-cayla)] ${modoAjuste ? "h-20 sm:h-[168px]" : "max-sm:row-span-2 max-sm:h-[76px] sm:h-[330px]"} ${prenda.fotoUrl ? "cursor-zoom-in hover:ring-2 focus-visible:ring-2" : ""}`}
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
                  {modoAjuste && (
                    <span className="ajuste-rotulo">
                      Ajustando · {ajuste.modelo?.colores.length ?? colores.length} {(ajuste.modelo?.colores.length ?? colores.length) === 1 ? "color" : "colores"}
                    </span>
                  )}
                </div>

                {modoAjuste ? (
                  <TalonDelAjuste control={ajuste} guardadas={listoAjuste?.lineas ?? sellando?.lineas} sellado={Boolean(listoAjuste || sellando)} />
                ) : flujo ? (
                  // En un paso, el color y la talla no se cambian: el chip dice sobre cuál se está trabajando.
                  <span className="inline-flex w-fit items-center gap-2 rounded-full vd-gota-chica px-3 py-1.5 text-sm text-taupe">
                    <i /* beige-fijo: muestra de la prenda sin color: el beige es el dato */ aria-hidden className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: fondoDelPunto(prenda.colorHex, prenda.colorTonos) ?? "var(--color-hueso)" }} />
                    {prenda.color ?? "Sin color"}
                    {/* Sin «·» (Felipe 2026-11-24): la talla en su etiqueta. */}
                    <Chip versalitas={false}>Talla {fila.talla ?? "Única"}</Chip>
                  </span>
                ) : (
                  <>
                    <Pestanas
                      etiquetaAccesible="Vista"
                      // La pieza hugs su contenido, pero como ítem de la grilla se estiraba a las 17 rem de la columna (Felipe, 2026-10-13:
                      // «ocupa más espacio del que debería»): centrada y del ancho de sus dos pestañas. En el celular, primera y a lo ancho.
                      className="justify-self-center max-sm:order-first max-sm:col-span-2"
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
                            style={{ background: fondoDelPunto(c.colorHex, c.colorTonos) ?? "var(--color-hueso)" }} /* beige-fijo: muestra de la prenda sin color: el beige es el dato */
                            className="area-dedo relative h-[30px] w-[30px] rounded-full border-2 border-papel shadow-[0_0_0_1px_var(--color-sand)] aria-checked:shadow-[0_0_0_2px_var(--color-tinta)]"
                          >
                            {c.colorEstampado && fotoQueDistingue(c.fotoUrl, colores.map((x) => x.fotoUrl)) && (
                              <span className="absolute inset-0 overflow-hidden rounded-full">
                                <MuestraEstampado fotoUrl={c.fotoUrl!} hex={c.colorHex} />
                              </span>
                            )}
                            {punto && <i aria-hidden className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-papel ${punto}`} />}
                          </button>
                        );
                      })}
                      {prenda.color && <span className="text-sm text-secundario">{prenda.color}</span>}
                      {/* Con una sola talla no hay fila de tallas: la talla va aquí, en su etiqueta (maqueta 2026-11-24). */}
                      {prenda.tallas.length === 1 && <Chip versalitas={false}>Talla {fila.talla ?? "Única"}</Chip>}
                    </div>
                    <div role="group" aria-label="Talla" data-guia="existencias.cajon-tallas" className={`flex flex-wrap gap-1.5 ${prenda.tallas.length === 1 || vista === "todas" ? "hidden" : ""}`}>
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
                                <Simbolo /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ aria-hidden className="h-3 w-3" strokeWidth={3} />
                              </span>
                            )}
                            <b className="text-base font-semibold">{t.talla ?? "Única"}</b>
                            <small className={`text-sm tabular-nums ${sel ? "text-sand" : pie.afuera ? "font-medium text-pizarra" : "text-taupe"}`}>{pie.texto}</small>
                          </button>
                        );
                      })}
                    </div>
                    {/* El código es de la TALLA, no de la prenda: va junto a la talla, y se copia de un toque (para Buscar o Vender). */}
                    {/* Copiar es la pieza del sistema (ronda 13): el código a la vista y, junto a él, el ícono que lo copia. */}
                    {codigo && (
                      <span data-guia="existencias.cajon-codigo" className="inline-flex w-fit items-center gap-1 px-1.5 py-1 text-sm text-secundario max-sm:col-span-2">
                        código <b className="font-mono text-xs font-semibold text-tinta select-all">{codigo}</b>
                        <BotonCopiar forma="icono" texto={codigo} que="el código de esta talla" alCopiar={() => avisar.exito(`Código copiado: ${codigo}`)} className="-my-1.5" />
                      </span>
                    )}
                  </>
                )}
              </aside>

              {/* ¿Dónde está? ¿Qué hago? ¿Cómo se vende? — o el paso en curso, o «Todas». */}
              <section key={`${vista}-${prenda.clave}-${flujo?.tipo ?? ""}`} className={`anim-asentar min-w-0 ${planillaFija ? "flex min-h-0 flex-col" : "grid content-start gap-3.5"}`}>
                {flujo?.tipo === "ajustar" && listoAjuste ? (
                  <ListoDelAjuste
                    guardado={listoAjuste}
                    prenda={prenda.referencia}
                    hexDe={(c) => ajuste.modelo?.colores.find((x) => x.color === c)?.hex ?? null}
                    tonosDe={(c) => ajuste.modelo?.colores.find((x) => x.color === c)?.tonos ?? null}
                    precioDe={(c) => colores.find((x) => x.color === c)?.precio ?? prenda.precio ?? null}
                    onMasTarde={() => {
                      setListoAjuste(null);
                      if (pasarDespues) {
                        ajuste.cambiarLugar(pasarDespues);
                        setPasarDespues(null);
                        return;
                      }
                      setFlujo(null);
                      setFocoAjuste(null);
                      raiz.current?.focus({ preventScroll: true });
                    }}
                  />
                ) : flujo?.tipo === "ajustar" ? (
                  <PlanillaDelAjuste
                    fotoDelEstampado={(color) => {
                      const c = colores.find((x) => x.color === color);
                      return c?.colorEstampado ? fotoQueDistingue(c.fotoUrl, colores.map((x) => x.fotoUrl)) : null;
                    }}
                    // Al cambiar de lugar la planilla empieza de nuevo: «Revisaste» y el aviso son de lo contado en un lugar.
                    key={ajuste.ubicado}
                    control={ajuste}
                    foco={focoAjuste}
                    onApagarFoco={() => setFocoAjuste(null)}
                    onVolver={volverDeAjuste}
                    volverA={volverAEditar ? "Editar producto" : undefined}
                    onAbrirConteo={(id) => {
                      // Esa talla faltó en un conteo cerrado: se suma en la ventana completa de Ajustar, que la enlaza a ese conteo.
                      const f = colores.flatMap((c) => c.tallas).find((t) => t.varianteId === id);
                      if (f) onAjustarCompleto(f);
                    }}
                    onGuardarYPasar={(u) => void guardarAjuste(u)}
                    onAvisoLugar={(abierto) => setAvisoLugarEn(abierto ? ajuste.ubicado : null)}
                    sedeNombre={sedeNombre}
                    sellados={sellando?.lineas.map((l) => l.variante.varianteId)}
                  />
                ) : flujo ? (
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
                    lugarDanadas={lugarDanadas}
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
                  />
                ) : (
                  <>
                    {hecho && (
                      <p role="status" className="flex items-center gap-2 rounded-xl bg-verde/[0.10] px-3 py-2.5 text-sm font-medium text-verde">
                        <Check aria-hidden className="h-4 w-4 shrink-0" />
                        {hecho}
                      </p>
                    )}

                    {vista === "talla" && (
                      <>
                        {/* ¿Dónde está? (maqueta 2026-11-24, «el modal liviano»): la frase grande dice dónde están las libres, con sus números;
                            debajo, el estado con su punto y, si el sistema sugiere algo, su botón. Después las cuatro casillas y, siempre, en camino
                            y otras sedes. Cómo se vende (el ritmo del color) va detrás del «?» del estado. */}
                        <div data-guia="existencias.cajon-donde" className="grid gap-2.5">
                          <div className="rounded-2xl vd-placa px-4 py-3.5 sm:px-5 sm:py-4">
                            <p className="font-display text-[28px] font-medium leading-tight text-tinta max-sm:text-[24px]">{resumen.titulo}</p>
                            {resumen.bajada && <p className="mt-1 text-sm text-secundario">{resumen.bajada}</p>}
                            <p className={`mt-2 text-detalle font-semibold ${TONO_ESTADO[insignia.tono]}`}>
                              <i aria-hidden className={`mr-2 inline-block h-2 w-2 -translate-y-px rounded-full ${PUNTO_ESTADO[insignia.tono]}`} />
                              <span>
                                {insignia.texto}
                                {fraseCorta && <span className="font-normal">: {fraseCorta}</span>}
                              </span>
                              {!calculandoRitmo && (ritmo || vendidasTalla !== null) && (
                                <span data-guia="existencias.cajon-ritmo" className="ml-1.5 inline-block align-middle font-normal">
                                  <Ayuda titulo="Cómo se vende">
                                    <span className="flex items-center gap-3">
                                      {ritmo && <AroSemanas ritmo={ritmoColor} />}
                                      <span className="min-w-0">
                                        {ritmo && <span className="block">{prenda.color ? `${prenda.color}: ${ritmo.charAt(0).toLocaleLowerCase("es")}${ritmo.slice(1)}` : ritmo}</span>}
                                        {vendidasTalla !== null && (
                                          <span className="block text-secundario">
                                            De esta talla: {vendidasTalla} {vendidasTalla === 1 ? "vendida" : "vendidas"} en los últimos {VENTANA_RITMO_RECIENTE_DIAS} días
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                  </Ayuda>
                                </span>
                              )}
                            </p>
                            {sugerida && (
                              <Boton peso="primario" aria-keyshortcuts={String(sugerida.tecla)} onClick={() => alAccionar(sugerida.clave)} className="group mt-3 max-sm:w-full">
                                <span className="inline-flex items-center gap-2">
                                  {(() => {
                                    const Ico = ICONO[sugerida.clave];
                                    return <Ico aria-hidden className="h-4 w-4" />;
                                  })()}
                                  {sugerida.texto}
                                  {/* La tecla se ve solo con el mouse encima o con el foco del teclado (/formidable 2026-11-24: a la vista, se leía como una cantidad). Su
                                    lugar queda guardado: aparecer no corre nada. */}
                                  <kbd className="invisible hidden rounded-sm border border-current px-1.5 text-xs opacity-70 group-hover:visible group-focus-visible:visible sm:inline">{sugerida.tecla}</kbd>
                                </span>
                              </Boton>
                            )}
                          </div>
                          <div className={casillasDeLaFila(separa)}>
                            {casilla(separa ? (fila.pisoDisponible ?? 0) : fila.disponible, separa ? "En piso" : "disponibles", IconoPercha, separa && insignia.tono === "ambar" ? "falta" : undefined, separa ? () => irATodas("piso") : undefined, "ver todas las tallas y colores en el piso", antesDeEsta ? (separa ? antesDeEsta.piso : antesDeEsta.disponible) : undefined)}
                            {separa && casilla(fila.almacenDisponible ?? 0, "En almacén", Archive, undefined, () => irATodas("almacen"), "ver todas las tallas y colores en el almacén", antesDeEsta?.almacen)}
                            {casilla(fila.apartado, fila.apartado === 1 ? "apartada" : "apartadas", ShoppingBag, "apartada", fila.apartado > 0 ? onVerApartadas : undefined)}
                            {casilla(fila.danado ?? 0, (fila.danado ?? 0) === 1 ? "dañada" : "dañadas", Bandage, "danada", (fila.danado ?? 0) > 0 ? onVerDanadas : undefined, puedeResolverDanadas ? "decidir qué hacer" : "ver cuáles")}
                          </div>
                          {/* En camino y otras sedes: cada dato con su rótulo arriba y su valor abajo; en el celular, en una línea. Los rótulos dicen hacia dónde y de
                              qué talla (/formidable 2026-11-24: «En camino» no decía si llega o sale, ni «Taller 14» si era de esta talla). */}
                          <div className="flex flex-wrap items-start gap-x-8 gap-y-2 max-sm:items-center max-sm:gap-x-5">
                            <p className="grid gap-1 max-sm:flex max-sm:items-center max-sm:gap-2">
                              <span className="label-cayla text-xs text-secundario">Viene en camino</span>
                              <b className="text-sm font-semibold tabular-nums text-tinta">{Math.max(0, fila.enTransito ?? 0)}</b>
                            </p>
                            <div className="grid gap-1 max-sm:flex max-sm:items-center max-sm:gap-2">
                              <span className="label-cayla text-xs text-secundario">En otras sedes (esta talla)</span>
                              {otrasSedes.length ? (
                                <span className="flex flex-wrap gap-1.5">
                                  {otrasSedes.map((o) => (
                                    <Chip key={o.ubicacionId} versalitas={false} title={`${o.cantidad} en ${o.sede}`}>
                                      {nombreCortoSede(o.sede)} <b className="font-semibold text-tinta">{o.cantidad}</b>
                                    </Chip>
                                  ))}
                                </span>
                              ) : (
                                <b className="text-sm font-semibold text-tinta">ninguna la tiene</b>
                              )}
                            </div>
                          </div>
                          {duenosDeLaTalla && (
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secundario">
                              <span>De quién es:</span>
                              {duenosDeLaTalla.map((d) => (
                                <Chip key={d.empresaId} tono={d.clave === CLAVE_CASA ? "tinta" : "pizarra"} versalitas={false} title={`${d.cantidad} de ${d.nombre} en esta tienda`}>
                                  {textoDeDueno(d)}
                                </Chip>
                              ))}
                            </p>
                          )}
                        </div>

                        {/* «Ajustar stock» (ADR-0494, Felipe: la banda bajo los números): justo bajo lo que se corrige. Abre la planilla del modelo
                            entero con esta talla en foco; reemplaza la fila «Ajustar stock» de «Qué hago», que era la sexta de siete. */}
                        {puedeAjustar && (
                          <BandaAjustar
                            que={`${prenda.color ?? "esta prenda"}${tallasDeTodos.length > 1 ? ` ${fila.talla ?? "Única"}` : ""}`}
                            conResto={colores.length > 1 || tallasDeTodos.length > 1}
                            onAjustar={abrirAjuste}
                          />
                        )}

                        {/* También puedes (maqueta 2026-11-24): lo demás que hoy se puede, en el orden que pide la talla. La sugerida ya está
                            arriba, con la frase; lo que hoy no se puede ya no se lista («No ahora»): la frase y las casillas dicen por qué. */}
                        {(tambien.length > 0 || arreglable) && (
                        <div className="grid gap-2">
                          <span className="label-cayla text-xs text-secundario">También puedes</span>
                            <ul data-guia="existencias.cajon-acciones" className="overflow-hidden rounded-2xl border border-sand bg-crema">
                              {/* ADR-0640 (Felipe 2026-11-10: «más notable y accesible el pasar de dañada a arreglada»): con una dañada de ESTA
                                  talla, lo primero es devolverla a la venta cuando vuelve arreglada; un toque abre su «Se arregló». */}
                              {arreglable && (
                                <li className="border-t border-sand first:border-t-0">
                                  <button
                                    type="button"
                                    data-guia="existencias.cajon-arreglada"
                                    onClick={() => onArreglarDanada!(fila.varianteId)}
                                    className="flex w-full items-center gap-3 bg-verde/[0.08] px-3 py-2.5 text-left transition-colors hover:bg-verde/[0.14]"
                                  >
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-verde/[0.16] text-verde">
                                      <Check aria-hidden className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <b className="block text-detalle font-semibold text-tinta">Volvió arreglada</b>
                                      <small className="block text-sm text-taupe">
                                        {fila.danado === 1 ? "1 dañada de esta talla" : `${fila.danado} dañadas de esta talla`}: devuélvela a la venta
                                      </small>
                                    </span>
                                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" />
                                  </button>
                                </li>
                              )}
                              {tambien.map((a) => {
                                const Ico = ICONO[a.clave];
                                return (
                                  <li key={a.clave} className="border-t border-sand first:border-t-0">
                                    <button
                                      type="button"
                                      aria-keyshortcuts={String(a.tecla)}
                                      onClick={() => alAccionar(a.clave)}
                                      className="vd-pasa group flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                                    >
                                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg vd-lente text-tinta">
                                        <Ico aria-hidden className="h-4 w-4" />
                                      </span>
                                      {/* El nombre y, a su lado, lo que hay: una línea (se parte sola si no cabe). */}
                                      <span className="min-w-0 flex-1">
                                        <b className="text-sm font-semibold text-tinta">{a.texto}</b>
                                        {/* Secundario y no tenue: sobre el vidrio, el tenue a 14 px daba 4,26:1 (bajo AA; /milimetro 2026-11-24). */}
                                        <small className="ml-2 text-detalle text-secundario max-sm:ml-0 max-sm:block">{a.sub}</small>
                                      </span>
                                      <kbd className="invisible hidden rounded-sm border border-sand px-1.5 text-xs text-secundario group-hover:visible group-focus-visible:visible sm:inline">{a.tecla}</kbd>
                                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-secundario" />
                                    </button>
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
                        {/* «Todas» (opción B del 2026-10-07, afinada el 2026-10-12, ADR-0391): el modelo entero. Las casillas «colgadas» y
                            «guardadas» FILTRAN la tabla (tocas una: solo esa capa, con el número grande; tocas otra vez: las dos). Dentro de la
                            capa del piso la celda que falta colgar sigue en ámbar y dice «falta · +N atrás»: el filtro no esconde el problema.
                            Totales por color y por talla que siguen al filtro; la talla abierta en negro en la cabecera, el color abierto en
                            hueso, la celda abierta con marco; un color sin nada en la capa se atenúa, no desaparece. Se fue el «N en esta
                            sede» de 46 px: era la suma de las casillas. */}
                        {/* La frase del modelo entero (maqueta 2026-11-24): las sumas de todos los colores y tallas, y «Colgar varias». Lo que
                            falta colgar (ámbar) y lo que se acabó (rojo) lo dice la tabla, en su celda: arriba no se repite. */}
                        <div className="rounded-2xl vd-placa px-4 py-3.5 sm:px-5 sm:py-4">
                          <p className="font-display text-[28px] font-medium leading-tight text-tinta max-sm:text-[24px]">{resumenModelo.titulo}</p>
                          {separa && puedeReponer && (
                            <Boton
                              peso={faltaColgarModelo ? "primario" : "fantasma"}
                              data-guia="existencias.cajon-colgar-varias"
                              disabled={sumaModelo.almacen === 0}
                              title={subtituloColgarVarias({ porColgar: porColgarModelo, sinColgar: sinColgarModelo, almacen: sumaModelo.almacen })}
                              onClick={() => lanzar("colgarVarias", { cant: {} })}
                              className="mt-3 max-sm:w-full"
                            >
                              <span className="inline-flex items-center gap-2">
                                <IconoPercha aria-hidden className="h-4 w-4" />
                                Colgar varias tallas y colores
                              </span>
                            </Boton>
                          )}
                        </div>
                        <div className={casillasDeLaFila(separa)}>
                          {separa ? casillaCapa("piso", sumaModelo.piso) : casilla(sumaModelo.piso, "disponibles", IconoPercha)}
                          {separa && casillaCapa("almacen", sumaModelo.almacen)}
                          {casilla(sumaModelo.apartado, sumaModelo.apartado === 1 ? "apartada" : "apartadas", ShoppingBag, "apartada")}
                          {/* ADR-0640: la casilla dice en qué talla está la dañada y abre su lista: una talla mal reportada se nota aquí. */}
                          {casilla(
                            sumaModelo.danado,
                            sumaModelo.danado > 0 ? `${sumaModelo.danado === 1 ? "dañada" : "dañadas"} en ${dondeEstanLasDanadas(colores)}` : "dañadas",
                            Bandage,
                            "danada",
                            sumaModelo.danado > 0 ? onVerDanadas : undefined,
                            puedeResolverDanadas ? "decidir qué hacer" : "ver cuáles"
                          )}
                        </div>
                        {separa &&
                          (capa ? (
                            // Con una capa elegida, la línea dice qué se está viendo y cómo volver a ver las dos.
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
                              {capa === "piso" ? <IconoPercha aria-hidden className="h-3.5 w-3.5 text-verde" /> : <Archive aria-hidden className="h-3.5 w-3.5 text-pizarra" />}
                              <span>
                                Solo lo que está <b className="font-semibold">{capa === "piso" ? "en el piso" : "en el almacén"}</b>
                                {capa === "piso" ? ". En ámbar, lo que falta colgar" : ""}
                              </span>
                              <button type="button" onClick={() => setCapa(null)} className="btn-cayla btn-enlace text-xs leading-tight">
                                Ver piso y almacén
                              </button>
                            </p>
                          ) : (
                            // La leyenda con los mismos íconos de la celda (Felipe 2026-11-24: «quitar la leyenda de colores y poner los íconos»).
                            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-detalle text-secundario">
                              <span className="inline-flex items-center gap-1.5">
                                <IconoPercha aria-hidden className="h-3.5 w-3.5 text-verde" />
                                en piso
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Archive aria-hidden className="h-3.5 w-3.5 text-pizarra" />
                                en almacén
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className="inline-block h-3 w-3.5 rounded-[3px] border border-ambar/45 bg-ambar/[0.16]" />
                                falta colgar
                              </span>
                              {sumaModelo.danado > 0 && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Bandage aria-hidden className="h-3.5 w-3.5 text-rojo-profundo" />
                                  dañada (no se vende)
                                </span>
                              )}
                            </p>
                          ))}
                        <div data-guia="existencias.cajon-todas-tabla" className="scroll-cayla overflow-x-auto">
                          <table // unificar-fijo: la matriz color × talla de «Todas» (ADR-0391), no una lista de registros
                            className="w-full table-fixed border-separate border-spacing-y-3 text-center text-sm"
                            // Un piso de 52 px por talla (más el color y el total): con 5 o más tallas en el celular, `table-fixed` las
                            // apretaba bajo 36 px y «Se acabó» se montaba en la celda vecina; ahí corre de lado en su caja. Con 4 tallas cabe
                            // entera a 375 px (maqueta 2026-11-24): la marca de la dañada va sobre la celda, ya no la ensancha.
                            style={{ minWidth: `${104 + tallasDeTodos.length * 52}px` }}
                          >
                            <colgroup>
                              <col className="w-[64px] sm:w-[96px]" />
                              {tallasDeTodos.map((t) => (
                                <col key={t} />
                              ))}
                              <col className="w-[40px] sm:w-[58px]" />
                            </colgroup>
                            <thead>
                              <tr>
                                <th scope="col" className="text-left text-sm font-medium text-taupe">
                                  <span className="max-sm:hidden">color \ talla</span>
                                  <span className="sm:hidden">Color</span>
                                </th>
                                {tallasDeTodos.map((t) => (
                                  <th key={t} scope="col" className="px-[3px] text-sm font-semibold text-taupe">
                                    {/* La talla que se estaba viendo, en negro: la tabla responde «¿y las demás?» sin perder cuál era la mía. */}
                                    <span className={`inline-block rounded-full px-2 py-0.5 ${t === (fila.talla ?? "Única") ? "bg-tinta text-crema" : ""}`}>{t}</span>
                                  </th>
                                ))}
                                <th scope="col" className="text-sm font-semibold text-taupe">
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
                                    <th scope="row" className={`rounded-lg pl-1.5 pr-1.5 text-left text-sm font-semibold text-tinta max-sm:pl-1 max-sm:pr-0.5 max-sm:text-xs ${colorAbierto ? "vd-marca" : ""}`}>
                                      {/* El nombre baja a una segunda línea en vez de cortarse: «Azul m…» no decía qué color era (Felipe
                                          2026-11-17). La fila mide 64 px (con «falta» bajo el número, /formidable 2026-11-24), así que dos líneas caben. */}
                                      <span className="flex items-center gap-1.5">
                                        <span /* beige-fijo: muestra de la prenda sin color: el beige es el dato */ aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_1px_var(--color-sand)] max-sm:hidden" style={{ background: fondoDelPunto(c.colorHex, c.colorTonos) ?? "var(--color-hueso)" }} />
                                        <span className="line-clamp-2 leading-tight [overflow-wrap:anywhere]" title={c.color ?? "Sin color"}>
                                          {c.color ?? "Sin color"}
                                        </span>
                                      </span>
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
                                      }${(f.danado ?? 0) > 0 ? `, ${f.danado} ${f.danado === 1 ? "dañada" : "dañadas"} aparte` : ""}. Ver esta talla`;
                                      // Con una capa elegida, la celda muestra SOLO esa mitad, a todo el alto y con el número más grande.
                                      const verPiso = !separa || capa !== "almacen";
                                      const verAlmacen = separa && capa !== "piso";
                                      const grande = separa && capa !== null;
                                      return (
                                        <td key={t} className="relative px-[3px]">
                                          {/* ADR-0640: la dañada de esta talla, encima de su celda (no cuenta en piso ni en almacén: está aparte). */}
                                          {(f.danado ?? 0) > 0 && celda.estado !== "agotada" && (
                                            <span
                                              aria-hidden
                                              title={`${f.danado} ${f.danado === 1 ? "dañada" : "dañadas"} de esta talla, aparte: no se vende`}
                                              className="pointer-events-none absolute -top-3 left-1/2 z-[1] inline-flex -translate-x-1/2 whitespace-nowrap items-center gap-0.5 rounded-full border border-rojo/30 bg-crema px-1.5 text-xs font-semibold leading-[18px] text-rojo-profundo" // unificar-fijo: marca dentro de la matriz de tallas, no una insignia de estado
                                            >
                                              <Bandage className="h-3 w-3" />
                                              {f.danado}
                                              {/* En el celular, el ícono y el número: la palabra no cabe sobre una celda de 54 px. */}
                                              <span className="max-sm:hidden">&nbsp;dañada{f.danado === 1 ? "" : "s"}</span>
                                            </span>
                                          )}
                                          {celda.estado === "agotada" ? (
                                            <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`grid h-16 w-full place-items-center rounded-md border border-rojo/40 bg-rojo/[0.10] text-sm font-bold text-rojo-profundo ${sel ? "ring-2 ring-tinta" : ""}`}>
                                              {/* ADR-0640: si lo único que queda de la talla está dañado, la celda lo dice: «Se acabó» escondía dónde estaba. */}
                                              {(f.danado ?? 0) > 0 ? (
                                                <span className="inline-flex items-center gap-1">
                                                  <Bandage aria-hidden className="h-3.5 w-3.5" />
                                                  {f.danado === 1 ? "Dañada" : `${f.danado} dañadas`}
                                                </span>
                                              ) : (
                                                "Se acabó"
                                              )}
                                            </button>
                                          ) : (
                                            <button type="button" aria-pressed={sel} aria-label={lectura} onClick={ir} className={`flex h-16 w-full flex-col overflow-hidden rounded-md border bg-crema transition-colors ${sel ? "border-tinta ring-1 ring-tinta" : "border-sand hover:border-tinta/35"}`}>
                                              {verPiso && (
                                                <span className={`flex w-full flex-1 flex-col items-center justify-center gap-0 font-bold tabular-nums ${grande ? "text-lg" : "text-sm"} ${celda.estado === "falta" ? "bg-ambar/[0.16] text-ambar-profundo" : celda.piso > 0 ? "text-tinta [&_svg]:text-verde" : "text-tenue"}`}>
                                                  <span className="inline-flex items-center gap-1">
                                                    <IconoPercha aria-hidden className={grande ? "h-3.5 w-3.5" : "h-3 w-3"} />
                                                    {celda.piso}
                                                  </span>
                                                  {/* Dentro de la capa del piso, la que falta colgar dice cuántas hay atrás: el filtro subraya el problema, no lo esconde. */}
                                                  {grande && capa === "piso" && celda.estado === "falta" && <small className="text-sm font-semibold leading-none">falta, +{celda.almacen} atrás</small>}
                                                  {/* Sin filtro, la palabra además del ámbar (/formidable 2026-11-24): solo el color se confundía con el de una prenda Beige. */}
                                                  {!grande && celda.estado === "falta" && <small className="text-xs font-semibold leading-none">falta</small>}
                                                </span>
                                              )}
                                              {verAlmacen && (
                                                <span className={`flex w-full flex-1 items-center justify-center gap-1 tabular-nums ${grande ? "text-lg font-bold" : "border-t border-sand text-sm font-semibold"} ${celda.almacen === 0 ? "text-tenue" : "text-secundario [&_svg]:text-pizarra"}`}>
                                                  <Archive aria-hidden className={grande ? "h-3.5 w-3.5" : "h-3 w-3"} />
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
                                <th scope="row" className="pl-1.5 text-left text-sm font-semibold text-taupe">
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
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
            {modoAjuste && !listoAjuste && !sellando && (
              <PieDelAjuste
                control={ajuste}
                secundario={avisoLugarEn === ajuste.ubicado && ajuste.lineas.length > 0}
                onCancelar={() => (ajuste.lineas.length > 0 ? ajuste.descartar() : volverDeAjuste())} onGuardar={() => void guardarAjuste()} />
            )}
          </div>
        )}
      </Modal>
      {aviso}
      {fotoGrande && prenda.fotoUrl && <FotoAmpliada fotoUrl={prenda.fotoUrl} referencia={prenda.referencia} color={prenda.color} onCerrar={() => setFotoGrande(false)} />}
    </>
  );
}
