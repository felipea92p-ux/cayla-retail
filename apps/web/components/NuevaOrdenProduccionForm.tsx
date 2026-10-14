"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoTexto, Desplegable, Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Aviso } from "@/components/ui/Aviso";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { Chip } from "@/components/ui/Chip";
import type { ModeloProducible } from "@/lib/produccion";
import type { DecisionProduccion } from "@/lib/decision-produccion";
import type { Tolerado } from "@/lib/resultado";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { ETIQUETA_BANDA } from "@/lib/resumen-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MotorEnProduccion } from "@/components/motor-demanda/MotorEnProduccion";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { DIAS_OBJETIVO_PRODUCCION, OPCIONES_DIAS_OBJETIVO, analizarInsumos, cantidadesDeLaCurva, cantidadesInicialesDeNuevaOrden, costoMaterialesPorPrenda, sugerirCurva } from "@/lib/produccion-decision-reglas";
import { costoUnitario, precioParaMargen, semaforoMargen, TEXTO_SEMAFORO, type Semaforo } from "@/lib/produccion-reglas";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ModeloNuevoCampos } from "@/components/ModeloNuevoCampos";
import { ElegirModelo, TarjetaModelo } from "@/components/orden-produccion/ElegirModelo";
import { AgregarColor, QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { FichaOrden } from "@/components/orden-produccion/FichaOrden";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { tipoAlElegir, urgentesDeLaRed } from "@/lib/orden-modelo-reglas";
import { cantidadesAlCambiarColores, lineasDeModeloExistente, tablaDeModeloExistente, tablaDeModeloNuevo } from "@/lib/orden-tabla-reglas";
import { sugerirNotaDeOrden } from "@/lib/sugerencias-orden-produccion";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { contarQueSeFabrica, fechaCorta, nombreDeLaFicha, soles, textoColoresYTallas, textoSeVendeA } from "@/lib/orden-ficha-reglas";
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
  problemaDeCostos,
  problemasDelModelo,
  resumenCantidades,
  tallasHabituales,
  type BorradorModelo,
  type ErrorModeloNuevo,
  type VocabularioModeloNuevo,
} from "@/lib/modelo-nuevo-reglas";
import { Ruler } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

// Abrir una orden (abrir_produccion). Lo que se decide acá: qué modelo, cuántas
// por talla-color y el costo ESTIMADO. El costo real se corrige al cerrar.
//
// F5 (ADR-0133): para el líder, «Nueva orden» aconseja ANTES de abrir: la curva sugerida por talla y color (ritmo de venta y stock de TODA la red, con las
// mismas reglas de Inventario), si alcanza la tela y los avíos (con el consumo real medido de las órdenes cerradas del modelo, D-D) y cuánto costará cada
// prenda. Son consejos, no órdenes: las cantidades siguen siendo del líder. Sin datos, el formulario es el de siempre.
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
// ADR-0396 (A3, «la hoja ancha con ficha viva»): la hoja mide ~1080 px y es una rejilla de dos paneles dentro del propio `<form>`: el pedido a la izquierda y, a la derecha y siempre a la vista,
// la ficha de la orden (`FichaOrden`: la prenda, cuántas son, a cuánto se vende, para cuándo, y debajo lo que la cierra). La ficha es presentacional; el formulario sigue dueño de los números, de
// los controles de cierre (lo que falta, el responsable, el aviso de nombre repetido, Cancelar y «Abrir orden») y del envío. Ya no hay pie pegado: lo que tapaba al responsable.
//
// El token de idempotencia nace con el formulario (useRef): si el Taller
// pierde la red a mitad del clic y reintenta, la base devuelve la misma orden
// en vez de abrir dos. Mismo mecanismo que `registrar_venta` (p_token).

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

const CHIP_SEMAFORO: Record<Semaforo["tono"], { tono: "verde" | "ambar" | "rojo"; texto: string }> = {
  gana: { tono: "verde", texto: TEXTO_SEMAFORO.gana },
  filo: { tono: "ambar", texto: TEXTO_SEMAFORO.filo },
  pierde: { tono: "rojo", texto: TEXTO_SEMAFORO.pierde },
};

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
  onClose,
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
  onClose: () => void;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());
  // El tipo con que arranca: un `?tipo=muestra` de la URL (al volver de Nuevo producto) es una elección de la persona y no se pisa (`aMano`).
  const tipoAMano = useRef(tipoInicial === "muestra");
  const [tipo, setTipo] = useState<Tipo>(() => tipoAlElegir({ eleccion: modelos.length === 0 ? "nuevo" : "existente", tipoActual: tipoInicial, aMano: tipoInicial === "muestra" }));
  // Sin modelo elegido (`""`) se ve el buscador: ya no se preselecciona «el primero» (ADR-0396).
  const [productoId, setProductoId] = useState(modelos.find((m) => m.productoId === productoInicialId)?.productoId ?? "");
  // Con `sugeridaInicial` la matriz nace llena, en el estado inicial y no en un efecto: lo que trae la sugerencia es el PUNTO DE PARTIDA (`fotoAlAbrir`), así que cerrar sin tocar nada no pregunta
  // «¿salir sin guardar?». Solo si el modelo pedido existe (nunca se llena el primero de la lista por error), si es una orden de producción (la muestra se hace aparte) y si la red respondió.
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    cantidadesInicialesDeNuevaOrden({ sugerida: sugeridaInicial, tipo: tipoInicial, productoInicialId, modelos, datos: decision?.datos ?? null })
  );
  // Modelo nuevo (ADR-0361): sin modelos en el catálogo, el primero nace acá.
  const [modoModelo, setModoModelo] = useState<ModoModelo>(modelos.length === 0 ? "nuevo" : "existe");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [categoriaNuevaId, setCategoriaNuevaId] = useState("");
  const [tallasNuevas, setTallasNuevas] = useState<string[]>([]);
  const [coloresNuevos, setColoresNuevos] = useState<string[]>([]);
  const coloresAhora = useRef<string[]>([]);
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const [precioNuevo, setPrecioNuevo] = useState("");
  // La base dijo «ya existe un modelo así» (o «casi igual»): se muestra con lo que se puede hacer, no como un error cualquiera.
  const [choque, setChoque] = useState<Extract<ErrorModeloNuevo, { tipo: "nombre_duplicado" | "nombre_casi_igual" }> | null>(null);
  const [tela, setTela] = useState("");
  const [avios, setAvios] = useState("");
  const [maquila, setMaquila] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [nota, setNota] = useState("");
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
  const costoTotal = (Number(tela) || 0) + (Number(avios) || 0) + (Number(maquila) || 0);
  // Como lo calcula la base (`producciones.costo_unitario`): costos ÷ prendas, a 2 decimales. Una sola fórmula en `produccion-reglas.ts`.
  const unitario = costoUnitario(Number(tela) || 0, Number(avios) || 0, Number(maquila) || 0, total);
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
  const rendimiento = datos && modelo ? (datos.rendimientoPorModelo[modelo.productoId] ?? []) : [];
  const saldos = useMemo(() => new Map((datos?.insumos ?? []).map((i) => [i.insumoId, i])), [datos]);
  const analisis = analizarInsumos(rendimiento, total, saldos);
  const materialesPorPrenda = costoMaterialesPorPrenda(rendimiento, (id) => saldos.get(id)?.costoUnitario ?? null);
  const materialesPorTipo = { tela: 0, avio: 0 };
  for (const r of rendimiento) materialesPorTipo[r.tipo] += r.porPrenda * total * (saldos.get(r.insumoId)?.costoUnitario ?? 0);
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
  const guia = useGuiaCampos(camposDeGuiaOrden({ esNuevo, hayModelo: modeloExistente !== null, borrador, celdas: celdasNuevas, totalExistente: total, costos: { tela, avios, maquila } }));

  // «¿Salir sin guardar?» (2026-09-28; /chaos NAV-04, 2026-10-10). Escape, el clic fuera y «Cancelar» cerraban la hoja y TODO lo escrito (nombre, tallas, colores, la matriz
  // de cantidades) se perdía sin avisar. Mismo hook que «Registrar gasto». Escape, el clic fuera y la ✕ preguntan por `antesDeCerrar` y NO por `onClose` (que corre después de animar la salida: con «Seguir editando» la hoja quedaba invisible y la pantalla sin responder; /pantalla 2026-10-13, `lib/hojas-salida-sin-guardar.test.ts`). La foto cuenta el TRABAJO (lo escrito y lo elegido para el modelo nuevo), no el tipo, el modo ni el modelo de la
  // lista: abrir la hoja y mirar «Modelo nuevo» no es nada que perder. Guardar bien cierra directo.
  const fotoActual = fotoFormulario({ nombreNuevo, categoriaNuevaId, tallasNuevas, coloresNuevos, precioNuevo, cantidades, tela, avios, maquila, fechaEntrega, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Llenaste parte de esta orden y todavía no se abrió. Si cierras ahora, se pierde lo que llenaste.");
  /** Tras guardar: se retira la guardia ANTES de cerrar y de refrescar (juntos, Next podía volver a montar la pantalla de atrás: ver `useSalidaSinGuardar`). */
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  function usarCurva() {
    setCantidades(cantidadesDeLaCurva(curva));
  }
  function usarEstimadoDeMateriales() {
    setTela(materialesPorTipo.tela > 0 ? materialesPorTipo.tela.toFixed(2) : "");
    setAvios(materialesPorTipo.avio > 0 ? materialesPorTipo.avio.toFixed(2) : "");
  }

  // Las cantidades de un modelo nuevo van por celda del borrador y las de uno existente por variante: al cambiar de modelo o de modo no se arrastran.
  /** Elegir un modelo que ya existe (o `""` para volver al buscador). El tipo vuelve a «lote», salvo que la persona ya hubiera tocado el interruptor. */
  function elegirModelo(id: string) {
    setModoModelo("existe");
    setProductoId(id);
    setCantidades({});
    setChoque(null);
    setTipo((actual) => tipoAlElegir({ eleccion: "existente", tipoActual: actual, aMano: tipoAMano.current }));
  }
  /** «Crear un modelo nuevo»: lo escrito en el buscador pasa a ser su nombre, y la orden arranca como muestra (se desarrolla antes de fabricarlo). */
  function crearModelo(nombre: string) {
    setModoModelo("nuevo");
    setProductoId("");
    setCantidades({});
    setChoque(null);
    if (nombre) setNombreNuevo(nombre);
    setTipo((actual) => tipoAlElegir({ eleccion: "nuevo", tipoActual: actual, aMano: tipoAMano.current }));
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
    const faltas = problemasDelModelo(borrador, celdasNuevas, { tela, avios, maquila });
    if (faltas.length > 0) {
      avisar.error(faltas[0].texto);
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
      resultado = await firmar(
        createClient().rpc(
          "abrir_produccion_con_modelo_nuevo",
          paramsRpcModeloNuevo({
            ubicacionId: tallerId,
            borrador,
            celdas: celdasNuevas,
            costos: { tela, avios, maquila },
            fechaEntrega,
            nota,
            confirmoDistinto,
            token: token.current,
          })
        ),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
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
    avisar.exito(`Orden de ${nombreDelModelo(borrador)} abierta`, { detalle: `Modelo nuevo · ${resumenNuevo.total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}` });
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
    // Un costo que no se lee como monto («12,50») ya no se guarda como 0 en silencio: se dice (/chaos 2026-10-10, hallazgo #3).
    const costoMalo = problemaDeCostos({ tela, avios, maquila });
    if (costoMalo) {
      avisar.error(costoMalo);
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
      resultado = await firmar(createClient().rpc("abrir_produccion", {
        p_ubicacion_id: tallerId,
        p_producto_id: modelo.productoId,
        p_lineas: lineas,
        p_costo_tela: Number(tela) || 0,
        p_costo_avios: Number(avios) || 0,
        p_costo_maquila: Number(maquila) || 0,
        p_es_muestra: tipo === "muestra",
        p_fecha_entrega: fechaEntrega || undefined,
        p_nota: nota.trim() || undefined,
        p_token: token.current,
      }), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "abrir la orden", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Orden de ${modelo.referencia} abierta`, { detalle: `${total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}` });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo="Nueva orden de producción"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
      variante="hoja"
      // 1080 px (A3). `scroll-pb`: bajo 980 px la ficha es una barra pegada abajo y, al llevar el cursor a un campo (la guía de foco), no debe quedar detrás de ella.
      ancho="max-w-[1080px] scroll-pb-[calc(var(--alto-barra-ficha,10rem)+1rem)] min-[980px]:scroll-pb-0"
    >
      <form onSubmit={onSubmit} className="mt-3.5 grid gap-y-5 min-[980px]:grid-cols-[minmax(0,1fr)_332px] min-[980px]:items-start min-[980px]:gap-x-8">
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
          <section data-guia="prod-orden-nueva.red" aria-label="Lo que dice la red" className="space-y-3 rounded-2xl border border-sand bg-crema p-3.5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={campoEtiqueta}>Curva sugerida por la red</p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  Ritmo de venta y stock de todas las tiendas, con lo que ya hay en el Taller, viene en camino o se está fabricando.
                </p>
              </div>
              <div data-guia="prod-orden-nueva.cubrir" className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-tinta/70">
                  Cubrir
                  <Desplegable
                    valor={String(diasObjetivo)}
                    onValor={(v) => setDiasObjetivo(Number(v))}
                    opciones={OPCIONES_DIAS_OBJETIVO.map((d) => ({ valor: String(d), texto: `${d} días` }))}
                    etiquetaAccesible="Días de venta a cubrir"
                    forma="pastilla"
                  />
                </label>
                <button
                  type="button"
                  onClick={usarCurva}
                  disabled={curva.total === 0}
                  className="h-8 rounded-md border border-tinta/25 px-3 text-[13px] text-tinta outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-tinta/25"
                >
                  {curva.total > 0 ? `Usar la sugerencia · ${curva.total} prendas` : "Nada que fabricar"}
                </button>
              </div>
            </div>
            {curva.porVariante.size === 0 ? (
              <p className="text-xs text-tinta/65">La red todavía no tiene datos de venta de este modelo.</p>
            ) : (
              <details data-guia="prod-orden-nueva.por-que">
                <summary data-guia="prod-orden-nueva.por-que-abrir" className="cursor-pointer text-xs text-tinta/75">Ver por qué, variante por variante</summary>
                <ul className="mt-2 divide-y divide-tinta/10">
                  {(modelo.variantes ?? [])
                    .filter((v) => curva.porVariante.has(v.varianteId))
                    .sort((a, b) => (curva.porVariante.get(b.varianteId)?.sugerido ?? 0) - (curva.porVariante.get(a.varianteId)?.sugerido ?? 0))
                    .map((v) => {
                      const d = demandaPorVariante.get(v.varianteId);
                      const sug = curva.porVariante.get(v.varianteId);
                      return (
                        <li key={v.varianteId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
                          <span className="min-w-0">
                            <span className="text-tinta">
                              {v.color ?? "Sin color"} · {v.talla ?? "Única"}
                            </span>
                            {d && (
                              <span className="ml-2 align-middle">
                                <Chip tono={d.banda === "agotado" || d.banda === "critica" || d.banda === "atencion" ? "ambar" : "neutro"}>{ETIQUETA_BANDA[d.banda]}</Chip>
                              </span>
                            )}
                            <small className="block text-xs text-tinta/65">
                              {d ? `Red ${d.stockRed} · Taller ${d.stockTaller}${d.enCamino > 0 ? ` · en camino ${d.enCamino}` : ""}${enProduccion.get(v.varianteId) ? ` · fabricando ${enProduccion.get(v.varianteId)}` : ""}` : ""}
                            </small>
                          </span>
                          <span className="text-right tabular-nums">
                            <b className="font-semibold text-tinta">{sug?.sugerido ?? 0}</b>
                            <small className="block max-w-[15rem] text-xs text-tinta/60">{sug?.motivo}</small>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </details>
            )}
            {datos.motor && (
              <div data-guia="prod-orden-nueva.motor">
                <MotorEnProduccion motor={datos.motor} modelo={modelo} disponible={disponibleDeVariante} diasObjetivo={diasObjetivo} onUsar={setCantidades} />
              </div>
            )}
          </section>
        )}

        {datos && modelo && !esNuevo && (
          <section data-guia="prod-orden-nueva.insumos" aria-label="Tela y avíos de esta orden" className="space-y-2.5 rounded-2xl border border-sand bg-crema p-3.5">
            <p className={campoEtiqueta}>¿Alcanza la tela y los avíos?</p>
            {rendimiento.length === 0 ? (
              <Vacio tamano="chico" alinear="izquierda" className="p-0" icono={<Ruler />}>
                Todavía no hay órdenes cerradas de este modelo con insumos descontados: el rendimiento se mide desde la primera. Mientras tanto, escribe el costo a mano.
              </Vacio>
            ) : total === 0 ? (
              <p className="text-xs text-tinta/65">Indica cuántas prendas para ver si alcanza. Por prenda, según {rendimiento[0].ordenes === 1 ? "la última orden" : "las órdenes cerradas"}: {rendimiento.map((r) => `${r.insumo} ${cantidadTexto(r.porPrenda, r.unidad)}`).join(" · ")}.</p>
            ) : (
              <>
                <ul className="divide-y divide-tinta/10">
                  {analisis.map((a) => (
                    <li key={a.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="text-tinta">{a.insumo}</span>
                        <small className="block text-xs text-tinta/65">
                          necesita {cantidadTexto(a.necesita, a.unidad)} · hay {cantidadTexto(a.saldo, a.unidad)}
                          {a.porLlegar > 0 ? ` · por llegar ${cantidadTexto(a.porLlegar, a.unidad)}` : ""} · con lo que hay salen {a.prendasConElSaldo} prendas
                        </small>
                      </span>
                      <Chip tono={a.estado === "alcanza" ? "verde" : "ambar"}>
                        {a.estado === "alcanza" ? "Alcanza" : a.estado === "alcanza_si_llega" ? "Alcanza si llega lo pedido" : `Faltan ${cantidadTexto(a.faltan, a.unidad)}`}
                      </Chip>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-tinta/60">
                  Medido: consumo real de {rendimiento[0].ordenes === 1 ? "1 orden cerrada" : `${Math.max(...rendimiento.map((r) => r.ordenes))} órdenes cerradas`} de este modelo.
                </p>
                {materialesPorPrenda !== null && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tinta/10 pt-2 text-[13px]">
                    <span className="text-tinta/80">
                      Materiales ≈ <b className="font-semibold tabular-nums text-tinta">{soles(materialesPorPrenda)}</b> por prenda, a costo del lote que se usaría
                    </span>
                    <button
                      type="button"
                      onClick={usarEstimadoDeMateriales}
                      className="h-8 rounded-md border border-tinta/25 px-3 text-[13px] text-tinta outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60"
                    >
                      Usar como costo estimado
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <CampoGuiado id="costos" guia={guia}>
          <div data-guia="prod-orden-nueva.costos" className="grid gap-3 sm:grid-cols-3">
            <CampoMonto etiqueta="Tela" pie="Opcional · de toda la corrida" inputMode="decimal" placeholder="0.00" value={tela} onChange={(e) => setTela(e.target.value)} />
            <CampoMonto etiqueta="Avíos" pie="Opcional · botones, cierres, etiquetas e hilo" inputMode="decimal" placeholder="0.00" value={avios} onChange={(e) => setAvios(e.target.value)} />
            <CampoMonto etiqueta="Maquila" pie="Opcional · lo que se manda afuera: planchado, corte, etc." inputMode="decimal" placeholder="0.00" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
          </div>
        </CampoGuiado>

        <div data-guia="prod-orden-nueva.entrega" className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Fecha de entrega" pie="Opcional" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          <CampoTexto etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={sugerirNotaDeOrden(tipo)} maxLength={MAX_NOTA_ORDEN_BASE} />
        </div>

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
          costo={costoTotal > 0 ? { total: soles(costoTotal), porPrenda: total > 0 ? soles(unitario) : null } : null}
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
            <PieGuia guia={guia} listo={responsable.listo ? "Todo listo para abrir la orden." : "Solo falta elegir quién abre la orden."} conFrase />
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

            <div className="pie-acciones">
              <button type="button" onClick={() => avisoSalida.pedirAccion(onClose)} className="btn-cayla btn-secundario">
                Cancelar
              </button>
              <Boton peso="primario" cargando={cargando} textoCargando="Abriendo…"
                type="submit"
                disabled={cargando || !guia.puedeConfirmar || !responsable.listo}
                title={guia.frase ?? responsable.motivo ?? undefined}
                className={`flex-1 ${guia.claseConfirmar}`}
              >
                {esNuevo ? "Crear y abrir orden" : "Abrir orden"}
              </Boton>
            </div>
          </div>
        </FichaOrden>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
