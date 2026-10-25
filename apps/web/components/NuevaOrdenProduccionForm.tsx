"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Aviso } from "@/components/ui/Aviso";
import { campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { leerOrdenCreada, type OrdenCreada } from "@/lib/ordenes-lista-reglas";
import { crearTokenDeOrden } from "@/lib/token-de-orden";
import {
  almacenDelNavegador,
  borrarBorrador,
  guardarBorrador,
  haceCuanto,
  leerBorradorGuardado,
  modeloDelBorrador,
  prendasDelBorrador,
  tieneTrabajo,
  type BorradorDeOrden,
  type FotoDelBorrador,
  type PartidaDeOrden,
} from "@/lib/borrador-orden";
import type { ModeloProducible, OpcionesNuevaOrden } from "@/lib/produccion";
import type { InsumoVista } from "@/lib/insumos";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { Tolerado } from "@/lib/resultado";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { DIAS_OBJETIVO_PRODUCCION, cantidadesDeLaCurva, cantidadesInicialesDeNuevaOrden, sugerirCurva } from "@/lib/produccion-decision-reglas";
import { costoUnitario, precioParaMargen, problemaDeEntrega, semaforoMargen, TEXTO_SEMAFORO, type Semaforo } from "@/lib/produccion-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ModeloNuevoCampos } from "@/components/ModeloNuevoCampos";
import { ElegirModelo, TarjetaModelo } from "@/components/orden-produccion/ElegirModelo";
import { AgregarColor, QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { FichaOrden } from "@/components/orden-produccion/FichaOrden";
import { ConsejoDeLaRed } from "@/components/orden-produccion/ConsejoDeLaRed";
import { FasesDeLaOrden } from "@/components/orden-produccion/FasesDeLaOrden";
import { TelaDeLaOrden, type ColorDeLaTela } from "@/components/orden-produccion/TelaDeLaOrden";
import { NivelDos } from "@/components/orden-produccion/NivelDos";
import { esDeNivelDos, nivelDosPideAbrirse, resumenNivelDos } from "@/lib/orden-nivel-dos-reglas";
import { costoServiciosEstimado, fasesIniciales, fasesParaRpc, problemasFases, proveedoresQueSirven, serviciosConCosto, type FaseBorrador, type FaseClave, type TarifaDeLista } from "@/lib/orden-fases-reglas";
import { coloresDeLaOrden, consumoSugerido, insumosParaRpc, metrosAPedir, ofertaDeConsumoDelModelo, problemasTela, telasSugeridas, type InsumoDelTaller, type TelaBorrador } from "@/lib/orden-tela-reglas";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { tipoAlElegir, urgentesDeLaRed } from "@/lib/orden-modelo-reglas";
import { cantidadesAlCambiarColores, lineasDeModeloExistente, tablaDeModeloExistente, tablaDeModeloNuevo } from "@/lib/orden-tabla-reglas";
import { sugerirNotaDeOrden } from "@/lib/sugerencias-orden-produccion";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { contarQueSeFabrica, fechaCorta, nombreDeLaFicha, partesDelCostoPorPrenda, soles, textoColoresYTallas, textoSeVendeA } from "@/lib/orden-ficha-reglas";
import type { ColorAlta } from "@/lib/alta-producto";
import {
  TEXTO_FUNCION_AUSENTE,
  camposDeGuiaOrden,
  MAX_NOTA_ORDEN_BASE,
  celdasDelBorrador,
  leerErrorModeloNuevo,
  ordenarTallas,
  nombreDelModelo,
  paramsRpcModeloNuevo,
  precioDelBorrador,
  problemasDelModelo,
  cantidadDeCelda,
  resumenCantidades,
  tallasHabituales,
  type BorradorModelo,
  type ErrorModeloNuevo,
  type VocabularioModeloNuevo,
} from "@/lib/modelo-nuevo-reglas";

// Abrir una orden (`abrir_orden_produccion`, ADR-0400). Lo que se decide acá: qué modelo, cuántas por talla y color, qué fases lleva y quién hace
// cada una (el Taller o un servicio de afuera, con su tarifa congelada), y su tela (por color, con el consumo por prenda y los metros a pedir).
// Los tres montos tecleados de antes ya no existen: el costo estimado sale de la tela y de las tarifas, y el real se mide al cerrar.
//
// F5 (ADR-0133): para el líder, «Nueva orden» aconseja ANTES de abrir: la curva sugerida por talla y color (ritmo de venta y stock de TODA la red, con las
// mismas reglas de Inventario), si alcanza la tela y los avíos (con el consumo real medido de las órdenes cerradas del modelo, D-D) y cuánto costará cada
// prenda. Son consejos, no órdenes: las cantidades siguen siendo del líder. Sin datos, el formulario es el de siempre.
// Formidable H5 (2026-10-16): el consejo de la red ya no ocupa ~290 px antes de «Fases»: es UNA línea («La red sugiere 40 prendas · Usarla · ¿Por qué?») y lo difícil vive bajo ese «¿Por qué?»
// (`orden-produccion/ConsejoDeLaRed.tsx`, frases en `lib/nueva-orden-consejo-reglas.ts`). La cuenta, «Usarla» y el selector de días son los mismos de siempre; la hoja no se reordena.
//
// ADR-0361: el Taller crea modelos nuevos como parte normal de su trabajo (una Muestra desarrolla un modelo que todavía no existe), así que «Modelo nuevo» se
// arma ACÁ: nombre, categoría, tallas y colores del vocabulario y precio, y `abrir_produccion_con_modelo_nuevo` crea el modelo y abre la orden en UNA
// transacción y con UN token. El modelo nuevo se trata como cualquier otro: se arma un modelo VIRTUAL con las celdas del borrador y la matriz, el costo por
// prenda y el margen no saben la diferencia. Quien prefiera cargarlo completo (con fotos) lo crea en Productos y vuelve (`hrefAltaDesdeProduccion`).
// El margen y el semáforo los ve el líder aunque la lectura de la red falle, y un modelo sin precio lo dice.
// La guía de foco (ADR-0284) sale de `camposDeGuiaOrden`, que coincide con lo que la base rechaza (lo prueba `modelo-nuevo-reglas.test.ts`).
//
// ADR-0396 (A1, «el modelo primero»): la primera pregunta es QUÉ se fabrica y se contesta buscando (`ElegirModelo`: arriba los que se están acabando, para el líder; abajo
// «Crear un modelo nuevo»). Ya no hay dos selectores de pestañas (Tipo y Modelo): el tipo SE DEDUCE de lo que la persona hizo —un modelo que existe es un lote, uno nuevo
// arranca como muestra (`tipoAlElegir`)— y se corrige con un interruptor que dice qué cambia. Lo que se manda a la base no cambia.
//
// ADR-0396 (A2, «la tabla única»): «cuántas por talla y color» se contesta con LA MISMA tabla de Nuevo producto (`MatrizCantidades`, en su modo `soloCantidades`), no con una matriz hecha a
// mano: una sola pieza para una sola pregunta. Enter y ↓ bajan por la talla, «Llenar todas con» repite un número, el gris de cada celda es lo que sugiere la red, y en un modelo nuevo
// cada color elegido es una fila con su «×» y «+ Agregar color» suma otra. Lo que se manda a la base NO cambia: `lib/orden-tabla-reglas.ts` arma la tabla desde las mismas celdas y las mismas
// líneas de siempre, y `lib/orden-carga-util.test.ts` lo fija con los números de antes.
//
// ADR-0396 (A3, «la hoja ancha con ficha viva»): el formulario es una rejilla de dos paneles dentro del propio `<form>` (era una hoja de ~1080 px; desde ADR-0509 vive en la página y los dos paneles salen cuando su marco mide 880 px o más): el pedido a la izquierda y, a la derecha y siempre a la vista,
// la ficha de la orden (`FichaOrden`: la prenda, cuántas son, a cuánto se vende, para cuándo, y debajo lo que la cierra). La ficha es presentacional; el formulario sigue dueño de los números, de
// los controles de cierre (lo que falta, el responsable, el aviso de nombre repetido, Cancelar y «Abrir orden») y del envío. Ya no hay pie pegado: lo que tapaba al responsable.
//
// El token de idempotencia (`lib/token-de-orden.ts`) vive con el formulario: si el Taller pierde la red a mitad del clic y reintenta, la base devuelve la misma orden en vez de abrir dos.
// Mismo mecanismo que `registrar_venta` (p_token). Se renueva cuando la base confirma una orden: el formulario ya no se desmonta al guardar por fuerza (ADR-0509).
//
// El MARCO (ADR-0509): el formulario no sabe dónde vive. Hasta ADR-0509 era una hoja de 1080 px que tapaba la lista; hoy vive en la página de Órdenes (`ordenes-lista/MarcoDePagina`).
// El marco recibe el cuerpo y la salida sin guardar (`antesDeCerrar`: la pregunta «¿Salir sin guardar?» que corre antes de descartar lo escrito).

type Tipo = "produccion" | "muestra";
const OPCIONES_TIPO = [
  { clave: "produccion", etiqueta: "Lote de producción" },
  { clave: "muestra", etiqueta: "Muestra" },
];
const CONSECUENCIA_DEL_TIPO: Record<Tipo, string> = {
  produccion: "Fabrica el lote. Al cerrarlo entra al stock del Taller.",
  muestra: "Desarrolla el modelo: patronaje, aprobación y escalado. No entra al stock.",
};

/** «existe» sin `productoId` = todavía no se eligió (se muestra el buscador); «nuevo» = se está creando uno. */
type ModoModelo = "existe" | "nuevo";

// La RPC es nueva (migración 20261014154000) y los tipos generados no la conocen: se llama por su nombre, como las de Órdenes de insumos.
const RPC_ABRIR_ORDEN = "abrir_orden_produccion";
// Los costos ya no se teclean (ADR-0400): a la función de hoy le viajan en cero y la base los deriva.
const SIN_COSTOS = { tela: "", avios: "", maquila: "" };

const CHIP_SEMAFORO: Record<Semaforo["tono"], { tono: "verde" | "ambar" | "rojo"; texto: string }> = {
  gana: { tono: "verde", texto: TEXTO_SEMAFORO.gana },
  filo: { tono: "ambar", texto: TEXTO_SEMAFORO.filo },
  pierde: { tono: "rojo", texto: TEXTO_SEMAFORO.pierde },
};

/** Dónde vive el formulario: recibe el cuerpo (el `<form>` y el aviso de salida) y cómo preguntar «¿Salir sin guardar?» antes de descartarlo. */
export type MarcoDeLaOrden = ComponentType<{ onClose: () => void; antesDeCerrar: (cerrar: () => void) => void; children: ReactNode }>;

export function NuevaOrdenProduccionForm({
  tallerId,
  modelos,
  decision,
  productoInicialId = null,
  sugeridaInicial = false,
  tipoInicial = "produccion",
  puedeEditarCatalogo = false,
  vocabulario = null,
  abiertas,
  recientes = [],
  opciones = null,
  insumos = [],
  hoy,
  partida = null,
  onCreada,
  onOtra,
  onRetomar,
  marco,
  onClose: cerrarMarco,
}: {
  tallerId: string;
  modelos: ModeloProducible[];
  /** Solo el líder recibe la decisión; `null` = el formulario de siempre. */
  decision: Tolerado<DecisionProduccion> | null;
  /** Modelo que llega elegido desde el Resumen; si no existe, se usa el primero. */
  productoInicialId?: string | null;
  /** Llegó desde «Abrir orden sugerida» del Resumen: la matriz abre ya con la cantidad sugerida por la red (la misma que dijo la tarjeta). Solo para el modelo pedido y una orden de producción. */
  sugeridaInicial?: boolean;
  /** Con qué tipo se abre (al volver de crear un modelo nuevo se conserva el que la persona había elegido). */
  tipoInicial?: Tipo;
  /** Puede crear el modelo que falta y agregarle tallas o colores (`fn_puede_editar_catalogo`); si no, ve a quién pedírselo. */
  puedeEditarCatalogo?: boolean;
  /** Tallas, colores y categorías que ofrece «Modelo nuevo» (dato secundario: si no se pudo leer, «Modelo nuevo» lo dice y el resto sigue igual). */
  vocabulario?: Tolerado<VocabularioModeloNuevo> | null;
  /** Cuántas órdenes en proceso tiene cada modelo («1 orden abierta» en la lista). */
  abiertas?: ReadonlyMap<string, number>;
  /** Los modelos de las últimas órdenes, la más reciente primero. */
  recientes?: readonly string[];
  /** Lo que la hoja ofrece elegir (ADR-0400): servicios con su lista de precios, consumo por modelo, tela comprometida. Secundario: sin esto, fases en el Taller y sin tela. */
  opciones?: Tolerado<OpcionesNuevaOrden> | null;
  /** Telas y avíos del Taller con su saldo (la misma lectura de Insumos). */
  insumos?: InsumoVista[];
  /** `aaaa-mm-dd` de Lima: la tarifa vigente y las fechas prometidas se juzgan contra hoy. */
  hoy: string;
  /** De dónde arranca cuando no es en blanco (ADR-0509): un borrador que se retoma o lo que deja «crear otra orden» (tipo, fases y modelo). La lista cambia su `key` para que el formulario nazca de nuevo con esto. */
  partida?: PartidaDeOrden | null;
  /** Se abrió la orden (ADR-0509): la lista salta a la pestaña donde quedó y la marca. Solo si la base devolvió su número. `seguiraAbierta`: la persona pidió «crear otra», así que la lista no se la lleva de la vista. */
  onCreada?: (orden: OrdenCreada & { esMuestra: boolean; seguiraAbierta: boolean }) => void;
  /** «Crear otra orden después de esta»: la lista vuelve a armar el formulario con esta partida. */
  onOtra: (partida: PartidaDeOrden) => void;
  /** «Retomarla»: la persona eligió un modelo que ya tenía un borrador y quiere seguir con él. */
  onRetomar: (borrador: BorradorDeOrden) => void;
  /** Dónde vive el formulario (ADR-0509): hoy, la página de Órdenes (`MarcoDePagina`). */
  marco: MarcoDeLaOrden;
  onClose: () => void;
}) {
  const router = useRouter();
  const [token] = useState(() => crearTokenDeOrden());
  // Lo que trae una partida (un borrador retomado, o lo que deja «crear otra»); el resto nace como siempre. El formulario nace de nuevo con cada partida (la lista cambia su `key`), así que se lee una sola vez.
  const inicio = partida?.foto ?? null;
  // El tipo con que arranca: un `?tipo=muestra` de la URL (al volver de Nuevo producto) es una elección de la persona y no se pisa (`aMano`).
  const tipoAMano = useRef(inicio ? inicio.tipo === "muestra" : tipoInicial === "muestra");
  const [tipo, setTipo] = useState<Tipo>(() => inicio?.tipo ?? tipoAlElegir({ eleccion: modelos.length === 0 ? "nuevo" : "existente", tipoActual: tipoInicial, aMano: tipoInicial === "muestra" }));
  // Sin modelo elegido (`""`) se ve el buscador: ya no se preselecciona «el primero» (ADR-0396).
  const [productoId, setProductoId] = useState(inicio?.productoId ?? modelos.find((m) => m.productoId === productoInicialId)?.productoId ?? "");
  // Con `sugeridaInicial` la matriz nace llena, en el estado inicial y no en un efecto: lo que trae la sugerencia es el PUNTO DE PARTIDA (`fotoAlAbrir`), así que cerrar sin tocar nada no pregunta
  // «¿salir sin guardar?». Solo si el modelo pedido existe (nunca se llena el primero de la lista por error), si es una orden de producción (la muestra se hace aparte) y si la red respondió.
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    () => inicio?.cantidades ?? cantidadesInicialesDeNuevaOrden({ sugerida: sugeridaInicial, tipo: tipoInicial, productoInicialId, modelos, datos: decision?.datos ?? null })
  );
  // Modelo nuevo (ADR-0361): sin modelos en el catálogo, el primero nace acá.
  const [modoModelo, setModoModelo] = useState<ModoModelo>(inicio?.modoModelo ?? (modelos.length === 0 ? "nuevo" : "existe"));
  const [nombreNuevo, setNombreNuevo] = useState(inicio?.nombreNuevo ?? "");
  const [categoriaNuevaId, setCategoriaNuevaId] = useState(inicio?.categoriaNuevaId ?? "");
  const [tallasNuevas, setTallasNuevas] = useState<string[]>(inicio?.tallasNuevas ?? []);
  const [coloresNuevos, setColoresNuevos] = useState<string[]>(inicio?.coloresNuevos ?? []);
  const coloresAhora = useRef<string[]>(inicio?.coloresNuevos ?? []);
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const [precioNuevo, setPrecioNuevo] = useState(inicio?.precioNuevo ?? "");
  // La base dijo «ya existe un modelo así» (o «casi igual»): se muestra con lo que se puede hacer, no como un error cualquiera.
  const [choque, setChoque] = useState<Extract<ErrorModeloNuevo, { tipo: "nombre_duplicado" | "nombre_casi_igual" }> | null>(null);
  // ADR-0400: las fases (quién hace cada una) y la tela de la orden reemplazan a los tres montos tecleados. Nacen válidas: la espina en el Taller, sin tela.
  const [fases, setFases] = useState<FaseBorrador[]>(() => inicio?.fases ?? fasesIniciales());
  // Lo que la persona eligió de tela (null = no tocó nada: manda la sugerencia). Las filas que se ven se DERIVAN de la sugerencia más esto, sin efectos.
  const [telasManual, setTelasManual] = useState<TelaBorrador[] | null>(inicio?.telasManual ?? null);
  // «Dejar este consumo como el del modelo»: apagado de fábrica; solo vale si el modelo ya dice otra cosa y quien abre edita el catálogo (`ofertaConsumo`).
  const [fijarConsumo, setFijarConsumo] = useState(false);
  const [fechaEntrega, setFechaEntrega] = useState(inicio?.fechaEntrega ?? "");
  const [nota, setNota] = useState(inicio?.nota ?? "");
  const [cargando, setCargando] = useState(false);
  // Dos clics en el mismo ciclo del navegador leen el MISMO `cargando` (falso) y enviaban dos llamadas (/chaos DC-01, 2026-10-10): la base las resolvía con el
  // token (1 modelo, 1 orden), pero la pantalla no debe depender de eso. Una marca síncrona corta la segunda.
  const enVuelo = useRef(false);
  // Responsable (ADR-0161/0162): la orden la abre quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();
  const [diasObjetivo, setDiasObjetivo] = useState<number>(DIAS_OBJETIVO_PRODUCCION);

  const modeloExistente = useMemo(() => modelos.find((m) => m.productoId === productoId) ?? null, [modelos, productoId]);

  // Elegido el modelo, el cursor pasa a la primera celda de la tabla: el campo donde se buscaba desaparece (la lista se vuelve una tarjeta) y, sin esto, el cursor quedaba en
  // el aire y la guía de foco seguía diciendo «Sigue aquí» en Modelo (retiene la luz mientras la persona «está» en un campo). Sin desplazar la hoja.
  // Con un modelo que ya llega elegido (desde el Resumen) la hoja todavía se está pintando cuando corre este efecto: se reintenta unos cuadros hasta que la tabla exista.
  useEffect(() => {
    if (!productoId) return;
    let cuadros = 0;
    let id = 0;
    const poner = () => {
      const celda = document.querySelector<HTMLInputElement>('[data-guia="prod-orden-nueva.matriz"] input:not([data-sin-cursor])');
      if (celda) celda.focus({ preventScroll: true });
      else if (cuadros++ < 20) id = window.requestAnimationFrame(poner);
    };
    poner();
    return () => window.cancelAnimationFrame(id);
  }, [productoId]);

  // ----- Modelo nuevo: el borrador, sus celdas y un modelo VIRTUAL para que la matriz, el costo por prenda y el margen lo traten como a cualquier otro -----
  const esNuevo = modoModelo === "nuevo";
  const vocab = vocabulario?.datos ?? null;
  const categoriaNueva = useMemo(() => vocab?.categorias.find((cat) => cat.id === categoriaNuevaId) ?? null, [vocab, categoriaNuevaId]);
  const coloresDisponibles = useMemo<ColorAlta[]>(() => {
    const vistos = new Set<string>();
    return [...(vocab?.colores ?? []), ...coloresCreados].filter((col) => !vistos.has(col.codigo) && vistos.add(col.codigo));
  }, [vocab, coloresCreados]);
  const borrador = useMemo<BorradorModelo>(
    () => ({ nombre: nombreNuevo, categoria: categoriaNueva, tallaIds: tallasNuevas, colorCodigos: coloresNuevos, precio: precioNuevo, esMuestra: tipo === "muestra", cantidades }),
    [nombreNuevo, categoriaNueva, tallasNuevas, coloresNuevos, precioNuevo, tipo, cantidades]
  );
  const celdasNuevas = useMemo(() => celdasDelBorrador(borrador, coloresDisponibles), [borrador, coloresDisponibles]);
  const resumenNuevo = useMemo(() => resumenCantidades(borrador, celdasNuevas), [borrador, celdasNuevas]);
  const modeloVirtual = useMemo<ModeloProducible | null>(() => {
    if (!esNuevo) return null;
    const precioBorrador = precioDelBorrador(borrador);
    return {
      productoId: "__nuevo",
      referencia: nombreDelModelo(borrador) || "Modelo nuevo",
      categoria: categoriaNueva?.nombre ?? null,
      categoriaId: categoriaNueva?.id ?? null,
      variantes: celdasNuevas.map((celda) => {
        const color = coloresDisponibles.find((col) => col.codigo === celda.color);
        return {
          varianteId: celda.clave,
          sku: "",
          talla: categoriaNueva?.tallas.find((t) => t.id === celda.tallaId)?.valor ?? null,
          color: color?.nombre ?? null,
          colorHex: color?.hex ?? null,
          colorCodigo: color?.codigo ?? null,
          precio: Number.isFinite(precioBorrador) ? precioBorrador : 0,
        };
      }),
    };
  }, [esNuevo, borrador, categoriaNueva, celdasNuevas, coloresDisponibles]);
  const modelo = esNuevo ? modeloVirtual : modeloExistente;
  // Sin categoría y sin tallas no hay matriz que dibujar (la celda única «Sin color» de un borrador vacío confundiría): se explica qué falta.
  const mostrarMatriz = !esNuevo || (categoriaNueva !== null && ordenarTallas(categoriaNueva, tallasNuevas).length > 0);

  // La tabla color × talla (una fila por color, una columna por talla, y en cada celda cuántas van). Solo existen las celdas que el catálogo ya tiene como variante — Producción
  // no inventa tallas ni colores (decisión con Felipe, 2026-09-15: las variantes nacen en Productos, con su código y su precio, nunca al vuelo desde una orden; en V1 sí pasaba y
  // dejaba colores duplicados y prendas sin precio): una combinación que el modelo no tiene sale rayada. En un modelo nuevo las celdas son las del borrador (ADR-0361).
  const tabla = useMemo(
    () =>
      esNuevo
        ? tablaDeModeloNuevo({ celdas: celdasNuevas, categoria: categoriaNueva, tallaIds: tallasNuevas, colorCodigos: coloresNuevos, colores: coloresDisponibles })
        : tablaDeModeloExistente(modeloExistente?.variantes ?? []),
    [esNuevo, celdasNuevas, categoriaNueva, tallasNuevas, coloresNuevos, coloresDisponibles, modeloExistente]
  );
  const variantePorId = useMemo(() => new Map((modeloExistente?.variantes ?? []).map((v) => [v.varianteId, v] as const)), [modeloExistente]);

  const lineas = esNuevo ? [] : lineasDeModeloExistente(modelo?.variantes ?? [], cantidades);
  // Un modelo nuevo lee las cantidades como las lee la base (enteros de 0 a 9999); uno existente, como siempre.
  const total = esNuevo ? resumenNuevo.total : lineas.reduce((s, l) => s + l.cantidad, 0);
  // ----- Fases y tela de la orden (ADR-0400) -----
  const opcionesDatos = opciones?.datos ?? null;
  const proveedoresServicio = useMemo(() => proveedoresQueSirven(opcionesDatos?.proveedores ?? []), [opcionesDatos]);
  const listaDePrecios = useMemo<TarifaDeLista[]>(
    () =>
      (opcionesDatos?.proveedores ?? []).flatMap((p) =>
        p.tarifas.map((t) => ({ proveedorId: p.id, faseClave: t.faseClave as FaseClave, tarifa: t.tarifa, minimo: t.minimo, fijo: t.fijo, vigenteDesde: t.vigenteDesde }))
      ),
    [opcionesDatos]
  );
  const insumosDelTaller = useMemo<InsumoDelTaller[]>(
    () => insumos.map((i) => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, tejidoId: i.tejidoId, colorCodigo: i.colorCodigo, saldo: i.saldo, mermaPct: i.merma, archivado: false })),
    [insumos]
  );
  // Los colores que la orden fabrica, con cuántas prendas: de las variantes (modelo que existe) o de las celdas del borrador (modelo nuevo).
  const lineasDeColor = useMemo(
    () =>
      esNuevo
        ? celdasNuevas.map((c) => ({ colorCodigo: c.color ?? null, cantidad: cantidadDeCelda(borrador, c.clave) ?? 0 }))
        : lineas.map((l) => ({ colorCodigo: variantePorId.get(l.variante_id)?.colorCodigo ?? null, cantidad: l.cantidad })),
    // `lineas` se rearma en cada render; lo que de verdad lo mueve es `cantidades`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esNuevo, celdasNuevas, borrador, cantidades, variantePorId]
  );
  const coloresOrden = useMemo(() => coloresDeLaOrden(lineasDeColor), [lineasDeColor]);
  const coloresDeLaTela = useMemo<ColorDeLaTela[]>(
    () =>
      coloresOrden.map((c) => {
        const deVariante = modeloExistente?.variantes.find((v) => v.colorCodigo === c.colorCodigo);
        const deVocab = coloresDisponibles.find((col) => col.codigo === c.colorCodigo);
        return {
          codigo: c.colorCodigo,
          nombre: c.colorCodigo === null ? "Sin color" : (deVariante?.color ?? deVocab?.nombre ?? c.colorCodigo),
          hex: deVariante?.colorHex ?? deVocab?.hex ?? null,
          prendas: c.cantidad,
        };
      }),
    [coloresOrden, modeloExistente, coloresDisponibles]
  );
  const consumoDeclarado = !esNuevo && modeloExistente ? (opcionesDatos?.consumos[modeloExistente.productoId] ?? null) : null;
  const tejidoId = !esNuevo ? (modeloExistente?.tejidoId ?? null) : null;
  // La tela sugerida sigue al modelo y a los colores; si la persona ya tocó la tela, cada color conserva lo elegido y los colores nuevos entran sugeridos.
  const consumoDeclaradoTexto = consumoSugerido(consumoDeclarado);
  const telasSugeridasAhora = useMemo(
    () => telasSugeridas({ tejidoId, colores: coloresOrden, insumos: insumosDelTaller, consumo: consumoDeclaradoTexto }),
    [tejidoId, coloresOrden, insumosDelTaller, consumoDeclaradoTexto]
  );
  const telasTocadas = telasManual !== null;
  const telas = useMemo<TelaBorrador[]>(() => {
    if (telasManual === null) return telasSugeridasAhora;
    const porColor = telasSugeridasAhora.map((s) => telasManual.find((p) => p.colorCodigo !== null && p.colorCodigo === s.colorCodigo) ?? s);
    const avios = telasSugeridasAhora.some((s) => s.colorCodigo === null) ? [] : telasManual.filter((p) => p.colorCodigo === null && p.insumoId);
    return [...porColor, ...avios];
  }, [telasManual, telasSugeridasAhora]);
  const problemasDeFases = useMemo(() => problemasFases(fases, { hoy, proveedores: proveedoresServicio, lista: listaDePrecios }), [fases, hoy, proveedoresServicio, listaDePrecios]);
  const problemasDeTela = useMemo(() => problemasTela(telas, { insumos: insumosDelTaller, colores: coloresOrden }), [telas, insumosDelTaller, coloresOrden]);
  const ofertaConsumo = useMemo(() => ofertaDeConsumoDelModelo(telas, insumosDelTaller, consumoDeclarado), [telas, insumosDelTaller, consumoDeclarado]);
  const fijarElConsumo = fijarConsumo && !esNuevo && ofertaConsumo.tipo === "corregir" && puedeEditarCatalogo;
  // Los costos ya no se teclean: la tela sale de los metros a pedir × el costo del lote que se usaría (solo quien ve costos), y los servicios de la tarifa congelada.
  const conCostos = decision !== null;
  const costoPorMetro = useMemo(
    () =>
      new Map(
        insumos.flatMap((i) => {
          const lote = i.lotes.find((l) => l.saldo > 0 && l.costoUnitario !== null);
          return lote ? [[i.id, lote.costoUnitario as number] as const] : [];
        })
      ),
    [insumos]
  );
  const comprometido = useMemo(() => new Map(Object.entries(opcionesDatos?.comprometido ?? {})), [opcionesDatos]);
  const enCamino = useMemo(() => new Map(Object.entries(opcionesDatos?.enCamino ?? {})), [opcionesDatos]);
  const costoTelaEstimado = conCostos
    ? telas.reduce((suma, t) => {
        if (!t.insumoId) return suma;
        const i = insumosDelTaller.find((x) => x.id === t.insumoId);
        const prendas = t.colorCodigo === null ? total : (coloresOrden.find((c) => c.colorCodigo === t.colorCodigo)?.cantidad ?? 0);
        const plan = i ? metrosAPedir(t.consumoPorPrenda, prendas, i.mermaPct) : null;
        return suma + (plan ?? 0) * (costoPorMetro.get(t.insumoId) ?? 0);
      }, 0)
    : 0;
  const costoServicios = costoServiciosEstimado(fases, total, listaDePrecios, hoy) ?? 0;
  const costoTotal = costoTelaEstimado + costoServicios;
  // Como lo calcula la base (`producciones.costo_unitario`): costos ÷ prendas, a 2 decimales. Una sola fórmula en `produccion-reglas.ts`.
  const unitario = costoUnitario(costoTelaEstimado, 0, costoServicios, total);
  // El mismo costo por prenda, partido en lo que lo forma (la tela y cada servicio de afuera): suma EXACTAMENTE `unitario`. La ficha lo lista cuando hay dos partes o más;
  // con una sola, lo que sale afuera sigue diciéndose en su línea «Afuera» (quién la hace).
  const serviciosDeLaOrden = serviciosConCosto(fases, total, listaDePrecios, hoy, proveedoresServicio);
  const partesDelCosto = partesDelCostoPorPrenda({
    totalPrendas: total,
    porPrenda: unitario,
    partes: [{ clave: "tela", nombre: "Tela", detalle: null, costo: costoTelaEstimado }, ...serviciosDeLaOrden.map((s) => ({ clave: s.clave, nombre: s.nombre, detalle: s.proveedor, costo: s.costo }))],
  });
  const serviciosSinListar = partesDelCosto.length > 1 ? serviciosDeLaOrden.filter((s) => s.costo <= 0) : serviciosDeLaOrden;
  const precio = Math.max(0, ...(modelo?.variantes ?? []).map((v) => v.precio));

  // ----- La decisión (solo líder) -----
  const datos = decision?.datos ?? null;
  // «Se están acabando»: los MISMOS modelos que el Resumen sugiere abrir (`filasPorModelo`); quien no ve la red no trae datos y la lista sale sin ese grupo.
  const urgentes = useMemo(() => (datos ? urgentesDeLaRed({ modelos, demanda: datos.demanda, enProduccion: datos.enProduccion }) : new Map<string, { dias: number }>()), [datos, modelos]);
  const demandaPorVariante = useMemo(() => new Map((datos?.demanda ?? []).map((d) => [d.varianteId, d])), [datos]);
  const enProduccion = useMemo(() => new Map(Object.entries(datos?.enProduccion ?? {})), [datos]);
  const curva = useMemo(() => sugerirCurva(modelo?.variantes ?? [], demandaPorVariante, enProduccion, diasObjetivo), [modelo, demandaPorVariante, enProduccion, diasObjetivo]);
  // El motor de demanda (ADR-0347) se compara con la curva de arriba sobre el MISMO disponible: solo cambia el ritmo.
  const disponibleDeVariante = useMemo(
    () => (id: string) => curva.porVariante.get(id)?.disponible ?? (enProduccion.get(id) ?? 0),
    [curva, enProduccion]
  );
  // El margen es del líder (`decision` solo le llega a él), con o sin lectura de la red: si la red falla, el margen no se esconde.
  const verMargen = decision !== null;
  // El margen se mide con el precio propio MÁS BAJO de una tienda, si lo hay (ADR-0370); `precio` (el de la grilla) es el que se dice en «se vende a».
  const precioMasBajo = modelo?.precioMasBajo ?? null;
  const semaforo = semaforoMargen(precioParaMargen({ precioVenta: precio, precioMasBajo }), unitario);

  // ----- La ficha viva (A3): solo se arman los textos; los números son los de arriba -----
  const hayModelo = modeloExistente !== null || esNuevo;
  const prendaDeLaFicha = esNuevo ? { prefijo: categoriaNueva?.prefijo, familia: categoriaNueva?.familia, categoria: categoriaNueva?.nombre } : categoriaDe(modeloExistente);
  const colorDeLaFicha = esNuevo ? (coloresDisponibles.find((c) => c.codigo === coloresNuevos[0])?.hex ?? null) : (modeloExistente?.variantes.find((v) => v.colorHex)?.colorHex ?? null);
  const nombreDeLaFichaVista = nombreDeLaFicha({ esNuevo, hayModelo: modeloExistente !== null, nombre: esNuevo ? nombreDelModelo(borrador) : (modeloExistente?.referencia ?? "") });

  // La guía de foco (ADR-0284): qué está hecho, qué sigue y qué falta. Sale de la misma validación que apaga el botón.
  const guia = useGuiaCampos(
    camposDeGuiaOrden({
      esNuevo,
      hayModelo: modeloExistente !== null,
      borrador,
      celdas: celdasNuevas,
      totalExistente: total,
      fases: { falta: problemasDeFases[0]?.texto ?? null },
      tela: { falta: problemasDeTela[0]?.texto ?? null, elegida: telas.some((t) => t.insumoId !== null) },
    }),
    // Ya no vive en una hoja que se desplaza sola: la guía lleva el campo a la vista de la ventana, sin taparlo (la cabecera y la barra de abajo cuentan).
    { enModal: false }
  );

  // «¿Salir sin guardar?» (2026-09-28; /chaos NAV-04, 2026-10-10). Escape, el clic fuera y «Cancelar» cerraban la hoja y TODO lo escrito (nombre, tallas, colores, la matriz
  // de cantidades) se perdía sin avisar. Mismo hook que «Registrar gasto». Escape, el clic fuera y la ✕ preguntan por `antesDeCerrar` y NO por `onClose` (que corre después de animar la salida: con «Seguir editando» la hoja quedaba invisible y la pantalla sin responder; /pantalla 2026-10-13, `lib/hojas-salida-sin-guardar.test.ts`). La foto cuenta el TRABAJO (lo escrito y lo elegido para el modelo nuevo), no el tipo, el modo ni el modelo de la
  // lista: abrir la hoja y mirar «Modelo nuevo» no es nada que perder. Guardar bien cierra directo.
  // La tela sugerida por el sistema no cuenta como trabajo (entra sola al elegir el modelo): solo lo que la persona tocó.
  const fotoActual = fotoFormulario({ nombreNuevo, categoriaNuevaId, tallasNuevas, coloresNuevos, precioNuevo, cantidades, fases, telas: telasTocadas ? telas : null, fechaEntrega, nota });
  // Un borrador que se retoma cuenta como trabajo desde el primer instante (`""` nunca es igual a una foto): cerrarlo pregunta y, si la persona confirma, lo descarta.
  const [fotoAlAbrir] = useState(() => (partida?.deBorrador ? "" : fotoActual));
  const hayCambios = fotoActual !== fotoAlAbrir;

  // ----- El borrador (ADR-0509): lo escrito sobrevive a salir de la pantalla -----
  // Cada cambio con trabajo se guarda en el navegador, por Taller y por modelo (`lib/borrador-orden.ts`: nunca lanza). Mientras SE GUARDÓ, salir por el menú o por «atrás» ya no pregunta: no se pierde nada, y la lista
  // lo ofrece al volver. Solo «Cancelar» pregunta, porque cancelar sí descarta. Si no se pudo guardar (ventana privada, disco lleno) o todavía no hay modelo al que atarlo, la guardia es la de siempre.
  const fotoDelBorrador = useMemo<FotoDelBorrador>(
    () => ({ tipo, modoModelo, productoId, nombreNuevo, categoriaNuevaId, tallasNuevas, coloresNuevos, precioNuevo, cantidades, fases, telasManual, fechaEntrega, nota }),
    [tipo, modoModelo, productoId, nombreNuevo, categoriaNuevaId, tallasNuevas, coloresNuevos, precioNuevo, cantidades, fases, telasManual, fechaEntrega, nota]
  );
  const claveDeModelo = modeloDelBorrador(fotoDelBorrador);
  const [almacenSirve, setAlmacenSirve] = useState(true);
  // El borrador viejo del modelo que se acaba de elegir, a la espera de que la persona decida (retomarlo o descartarlo): mientras tanto NO se pisa.
  const [oferta, setOferta] = useState<BorradorDeOrden | null>(null);
  // Los borradores que ESTE formulario guardó: son los únicos que descarta al cancelar o al abrir la orden.
  const guardadoPara = useRef(new Set<string>());
  useEffect(() => {
    if (oferta || !claveDeModelo) return;
    const almacen = almacenDelNavegador();
    if (hayCambios && tieneTrabajo(fotoDelBorrador)) {
      const quedo = guardarBorrador(almacen, tallerId, fotoDelBorrador);
      if (quedo) guardadoPara.current.add(claveDeModelo);
      if (quedo === almacenSirve) return;
      // Solo cuando el almacén cambia de estado (casi nunca): la pantalla se entera en el siguiente ciclo, no dentro del efecto.
      const aviso = window.setTimeout(() => setAlmacenSirve(quedo), 0);
      return () => window.clearTimeout(aviso);
    }
    // Lo escrito se borró todo: el borrador que este formulario había guardado ya no tiene qué conservar.
    if (!tieneTrabajo(fotoDelBorrador) && guardadoPara.current.has(claveDeModelo)) {
      borrarBorrador(almacen, tallerId, claveDeModelo);
      guardadoPara.current.delete(claveDeModelo);
    }
  }, [oferta, claveDeModelo, hayCambios, fotoDelBorrador, tallerId, almacenSirve]);
  const guardado = claveDeModelo !== null && almacenSirve && oferta === null;
  const avisoSalida = useSalidaSinGuardar(hayCambios, "Llenaste parte de esta orden y todavía no se abrió. Si cierras ahora, se pierde lo que llenaste.", { soloAlCerrar: guardado });
  const [otraDespues, setOtraDespues] = useState(partida?.otraDespues ?? false);
  // El nivel 2 (ADR-0509): fases, tela, entrega y nota, plegados bajo una línea. Se abre a mano, o solo si algo adentro está mal (lo que está mal no se esconde) o si la guía de foco quiere
  // llevar al cursor a un campo de adentro. Una vez que algo lo abrió, se queda abierto mientras esté mal: cerrarlo con el problema a la vista no lo esconde.
  const [nivelDosAMano, setNivelDosAMano] = useState(false);
  const [nivelDosPidio, setNivelDosPidio] = useState(false);
  const nivelDosPide = nivelDosPideAbrirse({ problemasFases: problemasDeFases.length, problemasTela: problemasDeTela.length, entregaMala: problemaDeEntrega(fechaEntrega, hoyLima()) });
  if (nivelDosPide && !nivelDosPidio) setNivelDosPidio(true);
  const nivelDosAbierto = nivelDosAMano || nivelDosPidio;
  function cambiarNivelDos(abrir: boolean) {
    setNivelDosAMano(abrir);
    if (!abrir) setNivelDosPidio(false);
  }
  // «Falta: Fases…» lleva al campo: si está plegado, se abre primero (plegado, ni se ve ni se alcanza).
  const guiaDelPie = {
    ...guia,
    ir: (id: string) => {
      if (esDeNivelDos(id) && !nivelDosAbierto) {
        setNivelDosAMano(true);
        window.setTimeout(() => guia.ir(id), 120);
      } else guia.ir(id);
    },
  };
  /** Tras guardar: se retira la guardia ANTES de cerrar y de refrescar (juntos, Next podía volver a montar la pantalla de atrás: ver `useSalidaSinGuardar`). */
  function cerrarTrasGuardar() {
    // La base confirmó la orden: la siguiente es otra orden y lleva otro token (nunca se renueva tras un error o una respuesta perdida: ahí el reintento necesita el mismo).
    token.renovar();
    // La orden ya existe: el borrador que este formulario guardó sobra.
    descartarBorrador();
    const guardiaFuera = avisoSalida.retirarYa();
    // «Crear otra»: la lista arma el formulario de nuevo con el mismo tipo, las mismas fases y el mismo modelo (si ya existía), con las cantidades vacías.
    if (otraDespues) onOtra({ foto: { tipo, fases, ...(esNuevo ? {} : { productoId }) }, otraDespues: true });
    else onClose();
    void guardiaFuera.then(() => router.refresh());
  }
  /** Lo que este formulario guardó como borrador. Se llama al cancelar (con la pregunta ya hecha) y al abrir la orden; salir por el menú lo deja guardado. */
  function descartarBorrador() {
    const almacen = almacenDelNavegador();
    for (const clave of guardadoPara.current) borrarBorrador(almacen, tallerId, clave);
    guardadoPara.current.clear();
  }
  function onClose() {
    descartarBorrador();
    cerrarMarco();
  }
  /** Elegido un modelo (o «Crear un modelo nuevo»): si ya tenía un borrador, se ofrece retomarlo en vez de pisarlo en silencio. */
  function ofrecerBorrador(clave: string | null) {
    setOferta(clave ? leerBorradorGuardado(almacenDelNavegador(), tallerId, clave) : null);
  }
  function descartarOferta() {
    if (!oferta) return;
    const clave = modeloDelBorrador(oferta.foto);
    if (clave) {
      borrarBorrador(almacenDelNavegador(), tallerId, clave);
      guardadoPara.current.delete(clave);
    }
    setOferta(null);
  }
  /** Tras abrir la orden, el aviso dice cuál es y lleva a su página; la lista salta a donde quedó. Si la base no devolvió el número, el aviso es el de siempre: nunca se inventa uno. */
  function avisarCreada(texto: string, detalle: string, data: unknown) {
    const creada = leerOrdenCreada(data);
    avisar.exito(texto, { detalle, ...(creada ? { accion: { texto: `Ver ${creada.numeroTexto}`, onClick: () => router.push(creada.href) } } : {}) });
    if (creada) onCreada?.({ ...creada, esMuestra: tipo === "muestra", seguiraAbierta: otraDespues });
  }

  function usarCurva() {
    setCantidades(cantidadesDeLaCurva(curva));
  }

  // Las cantidades de un modelo nuevo van por celda del borrador y las de uno existente por variante: al cambiar de modelo o de modo no se arrastran.
  /** Elegir un modelo que ya existe (o `""` para volver al buscador). El tipo vuelve a «lote», salvo que la persona ya hubiera tocado el interruptor. */
  function elegirModelo(id: string) {
    setModoModelo("existe");
    setProductoId(id);
    setCantidades({});
    setChoque(null);
    setTipo((actual) => tipoAlElegir({ eleccion: "existente", tipoActual: actual, aMano: tipoAMano.current }));
    ofrecerBorrador(id || null);
  }
  /** «Crear un modelo nuevo»: lo escrito en el buscador pasa a ser su nombre, y la orden arranca como muestra (se desarrolla antes de fabricarlo). */
  function crearModelo(nombre: string) {
    setModoModelo("nuevo");
    setProductoId("");
    setCantidades({});
    setChoque(null);
    if (nombre) setNombreNuevo(nombre);
    setTipo((actual) => tipoAlElegir({ eleccion: "nuevo", tipoActual: actual, aMano: tipoAMano.current }));
    ofrecerBorrador("nuevo");
  }
  function cambiarTipo(clave: string) {
    tipoAMano.current = true;
    setTipo(clave === "muestra" ? "muestra" : "produccion");
  }
  function cambiarCategoria(id: string) {
    setCategoriaNuevaId(id);
    setTallasNuevas(tallasHabituales(vocab?.categorias.find((cat) => cat.id === id) ?? null));
    setCantidades({});
  }
  /** Cambia los colores del modelo nuevo y mueve lo escrito si pasa de «sin color» a un color (o al revés): sin eso, el primer color dejaba lo ya escrito en una celda que ya no existe.
   *  «Antes» se lee de un ref y no del render: dos clics en el mismo ciclo (doble clic en un círculo) no pueden partir del mismo punto. */
  function ponerColores(despues: string[]) {
    const antes = coloresAhora.current;
    coloresAhora.current = despues;
    setColoresNuevos(despues);
    const tallasQueSeVen = ordenarTallas(categoriaNueva, tallasNuevas);
    setCantidades((c) => cantidadesAlCambiarColores(c, tallasQueSeVen, antes, despues));
  }
  function alternarColor(codigo: string) {
    const antes = coloresAhora.current;
    ponerColores(antes.includes(codigo) ? antes.filter((x) => x !== codigo) : [...antes, codigo]);
  }
  /** El «×» de una fila. Con el teclado la fila donde estaba el foco desaparece: el cursor pasa a la primera celda (si no, Tab volvía al principio de la hoja). */
  function quitarColor(codigo: string, conTeclado: boolean) {
    alternarColor(codigo);
    if (conTeclado) window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-guia="prod-orden-nueva.matriz"] input:not([data-sin-cursor])')?.focus({ preventScroll: true }));
  }
  function colorCreado(color: ColorAlta) {
    setColoresCreados((prev) => (prev.some((x) => x.codigo === color.codigo) ? prev : [...prev, color]));
    if (!coloresAhora.current.includes(color.codigo)) ponerColores([...coloresAhora.current, color.codigo]);
  }
  /** «Ya existe un modelo con ese nombre»: se pasa a ese modelo (las cantidades se escriben otra vez: sus celdas son otras). */
  function usarExistente(id: string) {
    elegirModelo(id);
  }

  /** Modelo nuevo + orden en UNA llamada. `confirmoDistinto`: la persona dijo que un nombre casi igual es otro modelo de verdad. */
  async function abrirConModeloNuevo(confirmoDistinto: boolean) {
    const faltas = problemasDelModelo(borrador, celdasNuevas);
    if (faltas.length > 0) {
      avisar.error(faltas[0].texto);
      return;
    }
    // Una fase o una tela que la base rechazaría se dice antes de mandar (es lo mismo que apaga el botón y lo que dice la guía de foco).
    if (problemasDeFases.length > 0 || problemasDeTela.length > 0) {
      avisar.error(problemasDeFases[0]?.texto ?? problemasDeTela[0]?.texto ?? "");
      return;
    }
    // ADR-0415: la entrega es una promesa; no puede ser antes de hoy (la base dice lo mismo, `entrega_pasada`).
    const entregaMala = problemaDeEntrega(fechaEntrega, hoyLima());
    if (entregaMala) {
      avisar.error(entregaMala);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setChoque(null);
    if (enVuelo.current) return;
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      // La MISMA carga útil de siempre para `abrir_produccion_con_modelo_nuevo` (`paramsRpcModeloNuevo`, con los costos en cero), envuelta por la
      // RPC nueva que además escribe las fases y la tela en la misma transacción (ADR-0400).
      const p = paramsRpcModeloNuevo({ ubicacionId: tallerId, borrador, celdas: celdasNuevas, costos: SIN_COSTOS, fechaEntrega, nota, confirmoDistinto, token: token.actual() });
      resultado = await firmar(
        createClient().rpc(RPC_ABRIR_ORDEN as never, {
          p_apertura: {
            modelo_nuevo: true,
            ubicacion_id: p.p_ubicacion_id,
            referencia: p.p_referencia,
            categoria_id: p.p_categoria_id,
            variantes: p.p_variantes,
            precio: p.p_precio,
            es_muestra: p.p_es_muestra,
            fecha_entrega: p.p_fecha_entrega ?? null,
            nota: p.p_nota ?? null,
            confirmo_distinto: p.p_confirmo_distinto,
            token: p.p_token,
          },
          p_fases: fasesParaRpc(fases, listaDePrecios, hoy),
          p_insumos: insumosParaRpc(telas),
        } as never),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      const lectura = leerErrorModeloNuevo(error);
      if (lectura.tipo === "nombre_duplicado" || lectura.tipo === "nombre_casi_igual") {
        setChoque(lectura);
        return;
      }
      // La base pudo guardar y la respuesta perderse: «No se guardó nada» sería mentira (/chaos RS-03). Se dice que no se sabe y se pide revisar antes de repetir.
      avisar.error(lectura.tipo === "funcion_ausente" ? TEXTO_FUNCION_AUSENTE : traducirError(error, "abrir la orden", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisarCreada(`Orden de ${nombreDelModelo(borrador)} abierta`, `Modelo nuevo · ${resumenNuevo.total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}`, data);
    cerrarTrasGuardar();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (esNuevo) {
      await abrirConModeloNuevo(false);
      return;
    }
    if (!modelo) {
      avisar.error("Elige el modelo que se va a producir.");
      return;
    }
    if (lineas.length === 0) {
      avisar.error("Indica cuántas prendas de al menos una talla o color.");
      return;
    }
    // Una fase o una tela que la base rechazaría se dice antes de mandar (es lo mismo que apaga el botón y lo que dice la guía de foco).
    if (problemasDeFases.length > 0 || problemasDeTela.length > 0) {
      avisar.error(problemasDeFases[0]?.texto ?? problemasDeTela[0]?.texto ?? "");
      return;
    }
    // ADR-0415: la entrega es una promesa; no puede ser antes de hoy (la base dice lo mismo, `entrega_pasada`).
    const entregaMala = problemaDeEntrega(fechaEntrega, hoyLima());
    if (entregaMala) {
      avisar.error(entregaMala);
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    if (enVuelo.current) return;
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      // Las MISMAS líneas de siempre (`lineasDeModeloExistente`) viajan dentro de `p_apertura` a `abrir_produccion`; la RPC nueva suma las fases y la tela.
      resultado = await firmar(
        createClient().rpc(RPC_ABRIR_ORDEN as never, {
          p_apertura: {
            ubicacion_id: tallerId,
            producto_id: modelo.productoId,
            lineas,
            es_muestra: tipo === "muestra",
            fecha_entrega: fechaEntrega || null,
            nota: nota.trim() || null,
            token: token.actual(),
            // Solo cuando se marcó a propósito: la base lo vuelve a comprobar (corregir lo que el modelo ya dice es de quien edita el catálogo).
            ...(fijarElConsumo ? { fijar_consumo_modelo: true } : {}),
          },
          p_fases: fasesParaRpc(fases, listaDePrecios, hoy),
          p_insumos: insumosParaRpc(telas),
        } as never),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "abrir la orden", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisarCreada(`Orden de ${modelo.referencia} abierta`, `${total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}`, data);
    cerrarTrasGuardar();
  }

  const Marco = marco;
  return (
    <Marco onClose={onClose} antesDeCerrar={avisoSalida.pedirAccion}>
      <form onSubmit={onSubmit} className="mt-3.5 grid gap-y-5 @min-[880px]:grid-cols-[minmax(0,1fr)_332px] @min-[880px]:items-start @min-[880px]:gap-x-8">
        <div className="min-w-0 space-y-5">
        {/* El modelo primero (ADR-0396, A1): el buscador, o la tarjeta del elegido, o los campos del modelo nuevo. El interruptor del tipo aparece cuando ya hay modelo. */}
        <div data-guia="prod-orden-nueva.modelo" className="space-y-4">
          {!esNuevo && (
            <CampoGuiado id="modelo" guia={guia}>
              <span className={`${campoEtiqueta} mb-1.5 block`}>{guia.etiqueta("modelo", "Modelo")}</span>
              {modeloExistente ? (
                <TarjetaModelo modelo={modeloExistente} precio={Math.max(0, ...modeloExistente.variantes.map((v) => v.precio))} onCambiar={() => elegirModelo("")} />
              ) : (
                <ElegirModelo modelos={modelos} urgentes={urgentes} abiertas={abiertas ?? new Map()} recientes={recientes} onElegir={elegirModelo} onCrear={crearModelo} />
              )}
            </CampoGuiado>
          )}

          {oferta && (
            <Aviso
              tono="info"
              guia="prod-orden-nueva.oferta"
              titulo="Hay una orden a medias de este modelo"
              accion={
                <span className="flex flex-wrap gap-2">
                  <Boton type="button" peso="fantasma" onClick={() => onRetomar(oferta)}>
                    Retomarla
                  </Boton>
                  <Boton type="button" peso="peligro" onClick={descartarOferta}>
                    Descartarla
                  </Boton>
                </span>
              }
            >
              Quedó guardada {haceCuanto(oferta.guardadoEn)}
              {prendasDelBorrador(oferta.foto) > 0 ? ` · ${prendasDelBorrador(oferta.foto)} prendas` : ""}.
            </Aviso>
          )}

          {(modeloExistente || esNuevo) && (
            <div data-guia="prod-orden-nueva.tipo" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={campoEtiqueta}>Tipo de orden</span>
              <SegmentoDeslizante etiqueta="Tipo de orden" valor={tipo} onCambio={cambiarTipo} opciones={OPCIONES_TIPO} />
              <p className="min-w-[14rem] flex-1 text-[12.5px] leading-snug text-tinta/70">{CONSECUENCIA_DEL_TIPO[tipo]}</p>
            </div>
          )}

          {esNuevo && (
            <ModeloNuevoCampos
              guia={guia}
              vocabulario={vocab}
              fallo={vocabulario?.fallo ?? null}
              nombre={nombreNuevo}
              onNombre={(v) => {
                setNombreNuevo(v);
                setChoque(null);
              }}
              categoria={categoriaNueva}
              onCategoria={cambiarCategoria}
              tallaIds={tallasNuevas}
              onTallas={setTallasNuevas}
              precio={precioNuevo}
              onPrecio={setPrecioNuevo}
              esMuestra={tipo === "muestra"}
              puedeEditarCatalogo={puedeEditarCatalogo}
              tipo={tipo}
              onElegirExistente={modelos.length > 0 ? () => elegirModelo("") : undefined}
            />
          )}
        </div>

        {modelo && (
          <div data-guia="prod-orden-nueva.matriz">
          <CampoGuiado id="cantidades" guia={guia} className="space-y-2">
            <span className={campoEtiqueta}>{guia.etiqueta("cantidades", "Cuántas por talla y color")}</span>
            {mostrarMatriz ? (
              <>
                {esNuevo && vocab && <AgregarColor colores={coloresDisponibles} elegidos={coloresNuevos} onAlternar={alternarColor} onCreado={colorCreado} />}
                {/* La misma tabla de Nuevo producto (ADR-0396, A2). `key`: «Llenar todas con» arranca vacío al cambiar de modelo o de categoría (las cantidades también se vacían). */}
                <MatrizCantidades
                  key={esNuevo ? `nuevo-${categoriaNuevaId}` : productoId}
                  soloCantidades
                  teclado
                  celdas={tabla.celdas}
                  tallas={tabla.tallas}
                  colores={tabla.colores}
                  excluidas={tabla.excluidas}
                  cantidades={cantidades}
                  // Funcional a propósito: «Llenar todas con» llama a esto una vez por celda en el mismo ciclo, y cada llamada tiene que partir de lo que dejó la anterior.
                  onCantidad={(clave, valor) => setCantidades((c) => ({ ...c, [clave]: valor }))}
                  preguntaCelda="Cuántas prendas de"
                  fantasma={(clave) => String(curva.porVariante.get(clave)?.sugerido || 0)}
                  tituloDe={(clave) => [variantePorId.get(clave)?.sku, curva.porVariante.get(clave)?.motivo].filter(Boolean).join(" · ") || undefined}
                  accionFila={esNuevo ? (color) => <QuitarColor nombre={color.nombre} onQuitar={(conTeclado) => quitarColor(color.codigo, conTeclado)} /> : undefined}
                />
              </>
            ) : (
              <Aviso tono="info" chico>
                Elige la categoría y las tallas, y aquí aparece la matriz: una fila por color y una columna por talla.
              </Aviso>
            )}
            {!esNuevo && (
              <p className="text-xs text-tinta/65">
                {tabla.excluidas.size > 0 && "Una raya (—) es una combinación que este modelo no tiene. "}
                ¿Falta una talla o un color? Se agrega en{" "}
                {puedeEditarCatalogo ? (
                  <Link href={`/productos/${modelo.productoId}/editar`} className="btn-enlace">
                    Editar producto
                  </Link>
                ) : (
                  "Productos (pídeselo a quien edita el catálogo)"
                )}
                , no desde la orden.
              </p>
            )}
          </CampoGuiado>
          </div>
        )}

        {!esNuevo && decision?.fallo && <p className="rounded-md bg-sand/60 px-3 py-2 text-xs text-tinta/75">{decision.fallo}</p>}

        {datos && modelo && !esNuevo && (
          <ConsejoDeLaRed
            curva={curva}
            modelo={modelo}
            demandaPorVariante={demandaPorVariante}
            enProduccion={enProduccion}
            diasObjetivo={diasObjetivo}
            onDias={setDiasObjetivo}
            onUsar={usarCurva}
            motor={datos.motor}
            disponible={disponibleDeVariante}
            onUsarMotor={setCantidades}
          />
        )}

        <NivelDos
          abierto={nivelDosAbierto}
          onCambio={cambiarNivelDos}
          resumen={resumenNivelDos({ hayModelo: Boolean(modelo), fases, telasElegidas: telas.filter((t) => t.insumoId !== null).length, entrega: fechaCorta(fechaEntrega), hayNota: nota.trim() !== "" })}
        >
        {modelo && (
          <>
            <FasesDeLaOrden fases={fases} onFases={setFases} proveedores={proveedoresServicio} tarifas={listaDePrecios} totalPrendas={total} hoy={hoy} guia={guia} problemas={problemasDeFases} />
            <TelaDeLaOrden
              telas={telas}
              onTelas={setTelasManual}
              insumos={insumosDelTaller}
              tejidoId={tejidoId}
              tejidoNombre={!esNuevo ? (modeloExistente?.tejidoNombre ?? null) : null}
              colores={coloresDeLaTela}
              comprometido={comprometido}
              enCamino={enCamino}
              consumoDeclarado={consumoDeclarado}
              conCostos={conCostos}
              costoPorMetro={costoPorMetro}
              guia={guia}
              problemas={problemasDeTela}
              ofertaConsumo={ofertaConsumo}
              puedeCorregirConsumo={puedeEditarCatalogo}
              fijarConsumo={fijarElConsumo}
              onFijarConsumo={setFijarConsumo}
            />
            {opciones?.fallo && (
              <Aviso tono="info" chico>
                {opciones.fallo}
              </Aviso>
            )}
          </>
        )}

        <div data-guia="prod-orden-nueva.entrega" className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Fecha de entrega" pie="Opcional" type="date" min={hoyLima()} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          <CampoTexto etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={sugerirNotaDeOrden(tipo)} maxLength={MAX_NOTA_ORDEN_BASE} />
        </div>
        </NivelDos>

        </div>

        <FichaOrden
          prenda={prendaDeLaFicha}
          colorHex={colorDeLaFicha}
          nombre={nombreDeLaFichaVista.texto}
          nombreVacio={nombreDeLaFichaVista.vacio}
          esMuestra={tipo === "muestra"}
          esNuevo={esNuevo}
          hayModelo={hayModelo}
          total={total}
          coloresYTallas={textoColoresYTallas(contarQueSeFabrica(tabla.celdas, tabla.excluidas, cantidades))}
          seVendeA={textoSeVendeA({ precio, esNuevo, esMuestra: tipo === "muestra" })}
          precioMasBajo={verMargen && precioMasBajo ? `${soles(precioMasBajo.precio)} en ${precioMasBajo.sede}` : null}
          costo={
            costoTotal > 0
              ? {
                  total: soles(costoTotal),
                  porPrenda: total > 0 ? soles(unitario) : null,
                  partes: partesDelCosto.map((p) => ({ clave: p.clave, nombre: p.nombre, detalle: p.detalle, valor: soles(p.porPrenda) })),
                }
              : null
          }
          afuera={serviciosSinListar.map((s) => `${s.nombre}: ${s.proveedor ?? "elige a quién"}`)}
          margen={verMargen && semaforo ? { porcentaje: Math.round(semaforo.margen * 100), chip: CHIP_SEMAFORO[semaforo.tono] } : null}
          entrega={fechaCorta(fechaEntrega)}
          notaSinPrecio={
            modelo && !esNuevo && verMargen && precio <= 0 ? (
              <p className="text-xs text-tinta/70">
                Este modelo no tiene precio en el catálogo, así que no hay margen que calcular.{" "}
                <Link href={`/productos/${modelo.productoId}/editar`} className="btn-enlace">
                  Ponle precio en Editar producto
                </Link>
                .
              </p>
            ) : null
          }
        >
          <div data-guia="prod-orden-nueva.cierre" className="space-y-3">
            <PieGuia guia={guiaDelPie} listo={responsable.listo ? "Todo listo para abrir la orden." : "Solo falta elegir quién abre la orden."} conFrase />
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />

            {choque && (
              <Aviso
                tono="atencion"
                titulo={choque.tipo === "nombre_duplicado" ? "Ese modelo ya existe" : "Hay uno casi igual"}
                accion={
                  choque.tipo === "nombre_duplicado" ? (
                    choque.existenteId && modelos.some((m) => m.productoId === choque.existenteId) ? (
                      <Boton type="button" peso="fantasma" onClick={() => usarExistente(choque.existenteId as string)}>
                        Usar ese modelo
                      </Boton>
                    ) : null
                  ) : (
                    <Boton type="button" peso="fantasma" onClick={() => void abrirConModeloNuevo(true)} disabled={cargando}>
                      Es otro modelo, crearlo igual
                    </Boton>
                  )
                }
              >
                {choque.mensaje}
              </Aviso>
            )}

            <div data-guia="prod-orden-nueva.otra">
              <Interruptor
                activo={otraDespues}
                onActivo={setOtraDespues}
                etiqueta="Crear otra orden después de esta"
                pie={otraDespues ? (esNuevo ? "Se queda abierta con el mismo tipo y las mismas fases." : "Se queda abierta con el mismo modelo, tipo y fases; solo falta elegir cuántas.") : undefined}
                disabled={cargando}
              />
            </div>

            <div className="pie-acciones">
              <button type="button" onClick={() => avisoSalida.pedirAccion(onClose)} className="btn-cayla btn-secundario" data-guia="prod-orden-nueva.cancelar">
                Cancelar
              </button>
              <Boton
                peso="primario"
                cargando={cargando}
                textoCargando="Abriendo…"
                type="submit"
                disabled={cargando || !guia.puedeConfirmar || !responsable.listo}
                title={guia.frase ?? responsable.motivo ?? undefined}
                className={`flex-1 ${guia.claseConfirmar}`}
              >
                {esNuevo ? "Crear orden" : "Abrir orden"}
              </Boton>
            </div>
          </div>
        </FichaOrden>
      </form>
      {avisoSalida.aviso}
    </Marco>
  );
}
