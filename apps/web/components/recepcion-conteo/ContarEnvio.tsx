"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type Dispatch, type SetStateAction } from "react";
import { PackageOpen } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import { CorregirSalida, LlevarAlStock, SalidaHecha } from "./LlevarAlStock";
import { leerSalidasDelEnvio } from "@/lib/recepcion-conteo-acciones";
import { loQueSale, ultimaSalidaDe, type ResultadoDeSalida, type SalidaDelEnvio } from "@/lib/recepcion-salida-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import { leerObservacionesDelEnvio } from "@/lib/recepcion-conteo-acciones";
import { deLasLineas, type ObservacionDeEnvio } from "@/lib/observaciones-envio-reglas";
import { sumasDe, type CatalogoParaRecibir, type DetalleEnvio, type PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  cambiarNuevasSinDescribir,
  describirNuevas,
  detallarPrenda,
  lineasALaVista,
  nuevasSinDescribir,
  ponerTallas,
  prendaCreadaDeNueva,
  resumenDelCierre,
  sumarPrenda,
  textoResumenDelCierre,
  variantesDeConteo,
  type ClaveLinea,
  type ConteosDelEnvio,
  type LineaParaContar,
  type PrendaSeparada,
  type Separado,
  SEPARADO_VACIO,
  agregarModeloEnCero,
  devolverModelo,
  totalSeparado,
  quitarModelo,
  renombrarModelo,
  agregarPrendaEnCero,
  marcaDeLinea,
  contadasDe,
} from "@/lib/recepcion-conteo-reglas";
import {
  agruparLineas,
  alAgregarALaLista,
  gruposSinIdentificar,
  idCampoIdentificar,
  lineaDeLaPrenda,
  minimoDelGrupo,
  repartirSeparado,
  sinIdentificarDelGrupo,
  repartirTotal,
  type GrupoDeLineas,
  type Reparto,
} from "@/lib/recepcion-grupos-reglas";
import {
  camposDelConteoPorModelo,
  cantidadDeModelo,
  categoriasDelEnvio,
  categoriasDelFiltro,
  categoriasEnOrden,
  cifrasDelResumen,
  claveDeCategoria,
  claveDeNombre,
  sePuedeQuitarCategoria,
  claveDeParada,
  conMiles,
  esToqueRepetido,
  focoTrasElFiltro,
  grupoDeLaClave,
  hayFiltro,
  idCampoParada,
  faltaAparteDeContar,
  primeroPorContar,
  lineasDeLaParada,
  opcionesDelFiltro,
  paradaContada,
  paradaEnFoco,
  paradasDelGrupo,
  siguientePendiente,
  repartirModeloCon,
  repartirOtroCambio,
  SIN_FILTRO,
  vecinosDeLaParada,
  type CategoriaDelEnvio,
  type FiltroDelConteo,
  type OrdenDelConteo,
  type ParadaDelConteo,
  modelosDelGrupo,
  categoriasConLoQueYaEntro,
  yaEnStockDelEnvio,
} from "@/lib/recepcion-modelos-reglas";
import { borradorDeTallas, botonPrincipal, estadoDeLaTarjeta, marcasDeLaTabla, mismasVariantes, modoDeTallas, modosAlCambiar, tablaConLoMarcado, tablaParaElNumero, tallasListas, tocaRepartir, type BorradorTallas, type MarcasDeLaTabla, type ModoDeTallas } from "@/lib/recepcion-tallas-reglas";
import { EditarModelo } from "./EditarModelo";
import { QuitarModelo } from "./QuitarModelo";
import { YaExisteLaPrenda } from "./YaExisteLaPrenda";
import { NuevoModelo, type ModeloPedido } from "./NuevoModelo";
import type { ProveedorDeLaLista } from "./ProveedorNuevoRecepcion";
import type { MarcaRegistrada } from "./MarcaNuevaRecepcion";
import { ElegirQuienCuenta } from "./ElegirQuienCuenta";
import { ListaDelEnvio } from "./CategoriasAcordeon";
import { AnotarObservacion, ObservacionesAnotadas } from "./ObservacionesDeLinea";
import { PapelesDeLaCompra } from "./PapelesDeLaCompra";
import { HojaTallas } from "./HojaTallas";
import { PlacaDelModelo } from "./PlacaDelModelo";
import { PrendasDeLaPlaca } from "./PrendasDeLaPlaca";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { AvanceDelEnvio } from "./AvanceDelEnvio";
import { BotonCerrarConteo } from "./BotonCerrarConteo";
import { HojaRepartir } from "./HojaRepartir";
import { HojaDeLaLista, IslaDelEnvio } from "./ListaEnElCelular";
import { PieDeLaLista, sinTurno } from "./PieDeLaLista";
import { TallasDeLaPlaca } from "./TallasDeLaPlaca";
import { TarjetaDeTallas } from "./TarjetaDeTallas";

// Contar (ADR-0393; modelo por modelo desde el 2026-11-02, ADR-0604; en dos mitades desde el 2026-11-11, ADR-0645). A la izquierda, lo del envío: cómo va todo, el buscador con sus filtros
// en un botón, las categorías, cada una una sola vez y con sus modelos adentro, y abajo quién cuenta y el único «Revisar y cerrar». A la derecha, UNO a la vez: cuántas llegaron de ese modelo
// y, si se quiere, sus tallas y colores. Se fueron la columna «Resumen del envío» y las tarjetas Re stock / Producto nuevo: nadie las leía y lo que hacían vive en la lista. Cada cambio se
// guarda solo. La guía de foco enciende el próximo modelo sin contar.
//
// Por dentro la base sigue guardando una fila por línea de la compra: `lib/recepcion-modelos-reglas.ts` dice en qué línea cae cada modelo y `lib/recepcion-grupos-reglas.ts` reparte. Lo que no
// tiene modelo (un envío sin aviso, una compra que no anotó qué prendas eran) se cuenta como un total y después se identifica.

const ID_CAMPO_QUIEN = "rc-quien-cuenta";

type Hoja =
  // «Cambiar de prenda»: la hoja de tallas, donde se elige otra.
  | { tipo: "tallas"; grupo: string; original: PrendaSeparada; prenda: PrendaRecepcion; parada: string }
  // `tabla`: la abrió la tabla de la placa para crear lo que la prenda no tiene, y vuelve a ella.
  // `enTabla`: lo que la tabla mostraba al abrirla; la hoja arranca con eso marcado y la tabla muestra después lo que quedó marcado.
  | { tipo: "prenda"; grupo: string; original: PrendaSeparada; modo: "nueva" | "agregar"; prenda: PrendaRecepcion | null; parada: string; tabla: boolean; pedidas?: DestinoHoja["pedidas"]; enTabla?: MarcasDeLaTabla }
  // «Crear ahora» de una nueva ya descrita: la hoja de la prenda, sin una prenda de partida (la descripción es el nombre que se ofrece).
  | { tipo: "salida-hecha"; resultado: ResultadoDeSalida; nombre: string }
  | { tipo: "corregir-salida"; salida: SalidaDelEnvio }
  | { tipo: "crear"; grupo: string; nueva: { cantidad: number; descripcion: string; porDefecto: boolean; nota: string | null }; parada: string }
  // Antes de crear: lo contado como nuevo puede ser una prenda que ya existe.
  | { tipo: "existe"; grupo: string; nueva: { cantidad: number; descripcion: string; porDefecto: boolean; nota: string | null }; parada: string }
  // «Tallas y colores»: la tabla de un modelo, en su hoja (ADR-0645). `danadas`: se abrió desde «Llegó dañada».
  | { tipo: "repartir"; parada: string; danadas?: boolean }
  // «¿Qué llegó?» o, con su categoría, el «+»: otro modelo para contar aparte.
  | { tipo: "modelo"; categoria: string | null }
  | { tipo: "editar"; parada: string }
  | { tipo: "quitar"; parada: string }
  | { tipo: "quitar-categoria"; categoria: string }
  | null;

/** La mesa llena la ventana: dónde empieza depende de lo que tenga encima (la cabecera, un aviso). Lo mide, y lo vuelve a medir si cambia algo de eso. */
function useAltoDeLaMesa() {
  const mesa = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = mesa.current;
    if (!el) return;
    const medir = () => el.style.setProperty("--rc-mesa-arriba", `${el.getBoundingClientRect().top + window.scrollY}px`);
    medir();
    const obs = new ResizeObserver(medir);
    if (el.parentElement) obs.observe(el.parentElement);
    window.addEventListener("resize", medir);
    void document.fonts?.ready.then(medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);
  return mesa;
}

export function ContarEnvio({
  detalle,
  lineas,
  conteos,
  sinAviso,
  proveedorPorConfirmar = false,
  reabierto,
  catalogo,
  responsable,
  guardados,
  errores,
  prendas,
  papeles = [],
  alSubirFoto,
  veDinero,
  soloSede = false,
  veExistencias,
  esperandoGuardar,
  onSalida,
  onPrendaVista,
  proveedoresDirectorio = [],
  onProveedorNuevo,
  onMarcaNueva,
  onCostoDePrenda,
  onEscribir,
  sinGuardar = 0,
  onReintentar,
  onCancelarRecepcion,
  modos,
  onModos: setModos,
  tablas,
  onTablas: setTablas,
  onAgregar,
  onCerrar,
  lineaInicial = null,
  focoPrevio = null,
  onFoco,
}: {
  detalle: DetalleEnvio;
  lineas: readonly LineaParaContar[];
  conteos: ConteosDelEnvio | null;
  sinAviso: boolean;
  /** Llegó sin aviso y sin saber de quién (Felipe 2026-10-14): se cuenta igual; el proveedor se elige al cerrar. */
  proveedorPorConfirmar?: boolean;
  reabierto: boolean;
  catalogo: CatalogoParaRecibir | null;
  responsable: ControlResponsable;
  guardados: Readonly<Record<string, EstadoGuardado>>;
  errores: Readonly<Record<string, string>>;
  prendas: ReadonlyMap<string, PrendaRecepcion>;
  /** Los papeles de la compra: su botón va en el resumen. */
  papeles?: ComponentProps<typeof PapelesDeLaCompra>["papeles"];
  alSubirFoto?: ComponentProps<typeof PapelesDeLaCompra>["alSubirFoto"];
  veDinero: boolean;
  /** Una terminal (ADR-0531): el precio de venta que se pone al llevar al stock vale solo en su sede. */
  soloSede?: boolean;
  veExistencias: boolean;
  /** Lo último que se escribió todavía viaja a la base. */
  esperandoGuardar: boolean;
  /** Algo salió al stock o se corrigió: se vuelve a leer lo contado y la página. */
  onSalida: () => void;
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  /** Sin aviso: todo el directorio, para decir quién trae una marca nueva (ADR-0635). */
  proveedoresDirectorio?: readonly ProveedorDeLaLista[];
  /** Se creó un proveedor o una marca en esta visita: la pantalla los suma a sus listas. */
  onProveedorNuevo?: (p: ProveedorDeLaLista) => void;
  onMarcaNueva?: (r: MarcaRegistrada) => void;
  /** ADR-0641 act. 2026-11-11: el costo escrito al crear una prenda (en su hoja), para que el cierre lo traiga puesto. */
  onCostoDePrenda?: (claveLinea: string, productoId: string, costoTexto: string) => void;
  onEscribir: (linea: LineaParaContar, cambio: Partial<Borrador>) => void;
  /** Cuántas líneas no se pudieron guardar, en todo el envío. */
  sinGuardar?: number;
  /** Vuelve a mandar lo que no se pudo guardar. */
  onReintentar: () => void;
  /** Sin aviso y sin nada en el stock: el envío se puede cancelar. */
  onCancelarRecepcion?: () => void;
  /** De cada modelo: «solo la cantidad» o «tallas y colores ahora», y lo escrito en su tabla (viven en la pantalla: ir a Cerrar y volver no los borra). */
  modos: Readonly<Record<string, ModoDeTallas>>;
  onModos: Dispatch<SetStateAction<Readonly<Record<string, ModoDeTallas>>>>;
  tablas: Readonly<Record<string, BorradorTallas>>;
  onTablas: Dispatch<SetStateAction<Readonly<Record<string, BorradorTallas>>>>;
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string | null; separado?: Separado }) => Promise<ClaveLinea | null>;
  onCerrar: () => void;
  /** Se llega desde Cerrar a contar una línea que faltó. */
  lineaInicial?: ClaveLinea | null;
  /** Lo que se estaba contando antes de ir a Cerrar: al volver, ahí sigue (la prueba ciega volvía al primer modelo). */
  focoPrevio?: string | null;
  onFoco?: (clave: string | null) => void;
}) {
  // Lo agregado en esta visita se ve aunque todavía esté en 0 (lo de fuera de la guía en 0 es «lo quitado»).
  const [agregados, setAgregados] = useState<ReadonlySet<string>>(new Set());
  // Se cuenta UNA cosa a la vez: `foco` es la llave de su parada (un modelo, o el total de un grupo sin modelos). Arranca en la primera sin contar.
  const [foco, setFoco] = useState<string | null>(() => {
    const inicio = categoriasDelEnvio(agruparLineas(lineasALaVista(lineas, new Set(), null))).flatMap((c) => c.paradas);
    const deLaLinea = lineaInicial ? inicio.filter((p) => lineasDeLaParada(p).some((l) => l.clave === lineaInicial)) : [];
    return (deLaLinea.find((p) => !paradaContada(p)) ?? deLaLinea[0] ?? paradaEnFoco(inicio, focoPrevio))?.clave ?? null;
  });
  const [filtro, setFiltro] = useState<FiltroDelConteo>(SIN_FILTRO);
  const [orden, setOrden] = useState<OrdenDelConteo>(null);
  // Las categorías que la persona abrió o plegó a mano, que no cambian lo que se cuenta. Al pasar a contar otra cosa, la de antes y la de ahora vuelven a lo suyo; al filtrar, todas.
  const [alternadas, setAlternadas] = useState<ReadonlySet<string>>(new Set());
  // Lo que llega con su número listo para escribir: viene de apretar Enter en lo anterior.
  const [escribirEn, setEscribirEn] = useState<string | null>(null);
  const [fotos, setFotos] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const filaSeguir = useRef<HTMLDivElement>(null);
  const ultimoPaso = useRef(Number.NEGATIVE_INFINITY);
  const mesa = useAltoDeLaMesa();

  const visibles = lineasALaVista(lineas, agregados, foco?.startsWith("extra:") ? (grupoDeLaClave(foco) as ClaveLinea) : null);
  const grupos = agruparLineas(visibles);
  // Lo último de cada grupo, para un «Deshacer» que llega cuando ya cambió algo más.
  const gruposVivos = useRef(grupos);
  // Todas las líneas, también las que no se ven: lo quitado que se queda en 0 sale de los grupos, y «Deshacer» tiene que poder volver a escribirlo.
  const lineasVivas = useRef(lineas);
  useLayoutEffect(() => {
    gruposVivos.current = grupos;
    lineasVivas.current = lineas;
  });
  // La guía, «Pasar a cerrar» y el resumen miran todo el envío; el filtro solo decide qué se ve a la izquierda.
  const todas = categoriasEnOrden(categoriasDelEnvio(grupos), orden);
  const paradasDelEnvio = todas.flatMap((c) => c.paradas);
  // Lo que se cuenta es lo que se eligió, esté o no en la lista: si el filtro lo sacara mientras se le suma, el contador se iría bajo el dedo.
  const parada = paradaEnFoco(paradasDelEnvio, foco);
  const categoriaEnFoco = parada ? claveDeCategoria(parada.grupo) : null;
  const claveEnFoco = parada?.clave ?? null;
  useEffect(() => onFoco?.(claveEnFoco), [claveEnFoco, onFoco]);
  const [focoVisto, setFocoVisto] = useState({ parada: parada?.clave ?? null, categoria: categoriaEnFoco });
  if (focoVisto.parada !== (parada?.clave ?? null)) {
    setFocoVisto({ parada: parada?.clave ?? null, categoria: categoriaEnFoco });
    setAlternadas((a) => new Set([...a].filter((k) => k !== focoVisto.categoria && k !== categoriaEnFoco)));
  }
  // El modo de cada modelo viene contestado por lo que es (ADR-0645): lo del catálogo se reparte ahora; lo nuevo sin crear, después. Lo que la persona eligió manda.
  const modoDe = (p: ParadaDelConteo): ModoDeTallas => modoDeTallas(modos[p.clave], !!p.modelo?.conTallas, !!p.modelo?.productoId);
  const enAhora = new Set(paradasDelEnvio.filter((p) => p.modelo && modoDe(p) === "ahora").map((p) => p.clave));
  const categoriasDelConteo = categoriasEnOrden(categoriasDelFiltro(grupos, filtro, parada?.clave ?? null, enAhora), orden);
  const paradas = categoriasDelConteo.flatMap((c) => c.paradas);
  const { anterior, siguiente } = vecinosDeLaParada(paradas, parada?.clave ?? null);
  // En el último modelo, lo que sigue es lo que quedó sin contar en todo el envío: el contador no cierra, lleva a lo pendiente.
  const pendiente = siguiente || !parada ? null : siguientePendiente(paradasDelEnvio, parada.clave);
  const opciones = opcionesDelFiltro(grupos, filtro);
  const cifras = cifrasDelResumen(todas, enAhora);
  // En una terminal hay que elegir quién cuenta antes de guardar: es lo primero que falta, y se elige ahí mismo.
  const faltaQuien = responsable.estado === "falta";
  const guiaBase = useGuiaCampos(
    [...(faltaQuien ? [{ id: ID_CAMPO_QUIEN, nombre: "Quién cuenta", requerido: true, hecho: false, pendiente: "Elige quién está contando." }] : []), ...camposDelConteoPorModelo(todas)],
    { enModal: false },
  );
  const [hoja, setHoja] = useState<Hoja>(null);
  // En el celular la lista vive en una hoja que se abre desde la isla de abajo. Al abrirse otra hoja (agregar un modelo, quitar), esta se cierra.
  const [listaEnHoja, setListaEnHoja] = useState(false);
  const [hojaVista, setHojaVista] = useState<Hoja>(null);
  if (hojaVista !== hoja) {
    setHojaVista(hoja);
    if (hoja) setListaEnHoja(false);
  }
  // Las observaciones de todo el envío (ADR-0507), leídas una vez; cada modelo muestra las suyas.
  const [observaciones, setObservaciones] = useState<readonly ObservacionDeEnvio[]>([]);
  useEffect(() => {
    let vivo = true;
    void leerObservacionesDelEnvio(detalle.id).then(({ observaciones: leidas }) => vivo && setObservaciones(leidas));
    return () => {
      vivo = false;
    };
  }, [detalle.id]);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const grupo = parada?.grupo ?? null;
  const lineasDeEsto = parada ? lineasDeLaParada(parada) : [];
  const plegada = !!categoriaEnFoco && alternadas.has(categoriaEnFoco);

  // «Falta: Vestido Antonella» desde otra categoría (o escondido por el filtro, o con la categoría plegada): primero se abre esa categoría y recién después se lleva hasta él.
  const guia: GuiaCampos = {
    ...guiaBase,
    ir: (id) => {
      const destino = paradasDelEnvio.find((p) => idCampoParada(p) === id) ?? paradasDelEnvio.find((p) => idCampoIdentificar(p.grupo.clave) === id);
      const despuesDeAbrir = () => requestAnimationFrame(() => requestAnimationFrame(() => guiaBase.ir(id)));
      setAlternadas(new Set());
      if (destino && !paradas.some((p) => p.clave === destino.clave)) setFiltro(SIN_FILTRO);
      if (!destino || destino.grupo.clave === grupo?.clave) {
        if (destino && destino.modelo && idCampoParada(destino) === id) setFoco(destino.clave);
        if (plegada || (destino && !paradas.some((p) => p.clave === destino.clave))) return void despuesDeAbrir();
        return guiaBase.ir(id);
      }
      setFoco(destino.clave);
      despuesDeAbrir();
    },
  };
  const faltanIdentificar = gruposSinIdentificar(grupos);
  const proveedores = conteos?.proveedores ?? [];
  // Sin aviso, sin nada contado no hay recepción (la base tampoco la cierra): se cuenta o se cancela.
  const nadaContado = sinAviso && visibles.length > 0 && visibles.every((l) => contadasDe(l) === 0);
  const puedeCerrar = visibles.length > 0 && faltanIdentificar.length === 0 && !nadaContado;
  // Lo que frena el cierre, todo a la vez: el botón apagado lo dice (`BotonCerrarConteo`).
  const motivosNoCierra = [
    ...(visibles.length === 0 ? ["Agrega lo que llegó"] : []),
    ...(faltanIdentificar.length > 0 ? [`Identifica las prendas de ${faltanIdentificar.map((g) => g.principal.categoria?.nombre ?? "una categoría").join(", ")}`] : []),
    ...(nadaContado ? ["Cuenta lo que llegó, o cancela la recepción"] : []),
  ];

  function elegir(p: ParadaDelConteo, escribir = false) {
    const suya = claveDeCategoria(p.grupo);
    setAlternadas((a) => new Set([...a].filter((k) => k !== suya)));
    setErrorHoja(null);
    setEscribirEn(escribir ? p.clave : null);
    setFoco(p.clave);
  }

  /** Elegir en la lista de la pantalla. Apiladas (una pantalla angosta), el contador queda bajo la lista: la vista baja hasta él, o el toque parecería no hacer nada. */
  function elegirEnLaLista(p: ParadaDelConteo, escribir = false) {
    elegir(p, escribir);
    requestAnimationFrame(() => {
      const placa = mesa.current?.querySelector<HTMLElement>(".rc-placa");
      if (placa && placa.getBoundingClientRect().top > window.innerHeight / 2) placa.scrollIntoView({ block: "start", behavior: prefiereQuieto() ? "auto" : "smooth" });
    });
  }

  /** «Anterior» o «Listo, siguiente». */
  function pasarA(p: ParadaDelConteo | null, ahora: number) {
    if (!p || esToqueRepetido(ultimoPaso.current, ahora)) return;
    ultimoPaso.current = ahora;
    elegir(p);
  }

  /** Cambió el filtro: si lo que se cuenta ya no se ve, se pasa a lo primero sin contar de lo que se ve. Escribir en el buscador no cuenta: el contador cambiaba solo mientras se tecleaba (prueba ciega, 2026-11-02). */
  function cambiarFiltro(f: FiltroDelConteo) {
    setFiltro(f);
    setAlternadas(new Set());
    if (f.texto !== filtro.texto) return;
    const nuevo = focoTrasElFiltro(categoriasEnOrden(categoriasDelFiltro(grupos, f, null, enAhora), orden), parada?.clave ?? null);
    if (nuevo !== (parada?.clave ?? null)) {
      setFoco(nuevo);
      setEscribirEn(null);
    }
  }

  /** Guarda lo que cambió en cada línea de la categoría (cada una se guarda sola, con su propio aviso). */
  function aplicar(r: Reparto) {
    // El modelo que se está mirando sigue en su modo aunque este cambio le suelte las tallas: su tabla no se cierra mientras se escribe.
    if (parada) setModos((ms) => modosAlCambiar(ms, parada.clave, !!prendaSeparada(parada)?.variantes));
    for (const c of r.cambios) onEscribir(c.linea, { contadas: c.contadas, separado: c.separado });
  }

  const faltanTallas = (p: ParadaDelConteo): boolean => !!p.modelo && p.modelo.contadas > 0 && !p.modelo.conTallas && modoDe(p) === "ahora";
  const coloresOrden = (catalogo?.colores ?? []).map((c) => c.codigo);
  const tallasDeLaCategoria = (g: GrupoDeLineas) => catalogo?.categorias.find((c) => c.id === g.principal.categoria?.id)?.tallas ?? [];
  const prendaSeparada = (p: ParadaDelConteo): PrendaSeparada | undefined => (p.modelo?.productoId ? p.grupo.separado.prendas.find((x) => x.productoId === p.modelo?.productoId) : undefined);

  /** La persona dejó este número en el contador: el del modelo, o el total de un grupo sin modelos (se reparte entre sus líneas cambiando lo mínimo). */
  function escribirEnParada(p: ParadaDelConteo, n: number) {
    // Sin modelo: lo contado de antes, sobre lo que ya se dijo qué es.
    if (!p.modelo) return aplicar(repartirTotal(p.grupo, minimoDelGrupo(p.grupo) + n));
    // Si lo repartido en su tabla ahora suma justo lo contado, se guarda con sus tallas.
    const prenda = p.modelo.productoId ? prendas.get(p.modelo.productoId) : undefined;
    const tabla = tablaParaElNumero(tablas[p.clave], prenda, prendaSeparada(p)?.variantes ?? null, coloresOrden, tallasDeLaCategoria(p.grupo), n - p.modelo.enStock);
    const conNumero = cantidadDeModelo(p.grupo.separado, p.modelo, n);
    // La tabla reparte lo que queda por entrar al stock: lo que ya entró no se vuelve a repartir.
    const cuadra = !!tabla && !!prenda && tallasListas(tabla.conteo, prenda, n - p.modelo.enStock);
    const nuevo = cuadra ? ponerTallas(conNumero, prenda.productoId, prenda, variantesDeConteo(tabla.conteo, prenda)) : conNumero;
    aplicar(repartirModeloCon(p.grupo, p.modelo, nuevo));
    if (tabla && prenda) setTablas((t) => ({ ...t, [p.clave]: { ...tabla, sinGuardar: !cuadra && sumasDe(tabla.conteo, prenda).contado > 0 } }));
  }

  /**
   * «Llegaron las N» y «Poner en cero» pisan lo que ya se había contado de un toque: si había algo, el aviso ofrece deshacerlo, tallas incluidas (ley 7 de Formidable: se confirma solo lo
   * irreversible). Desde cero no hay nada que perder y no se avisa.
   */
  function ponerDeUnToque(p: ParadaDelConteo, n: number) {
    const antes = p.modelo ? p.modelo.contadas : sinIdentificarDelGrupo(p.grupo);
    const sep = prendaSeparada(p);
    escribirEnParada(p, n);
    if (antes <= 0 || antes === n) return;
    avisar.exito(n === 0 ? "Lo pusiste en cero" : `Lo dejaste en ${conMiles(n)}`, {
      detalle: `Tenía ${conMiles(antes)}.`,
      accion: {
        texto: "Deshacer",
        onClick: () => {
          const g = gruposVivos.current.find((x) => x.clave === p.grupo.clave);
          const actual = g ? paradasDelGrupo(g).find((x) => x.clave === p.clave) : undefined;
          if (!g || !actual) return;
          if (actual.modelo && sep?.variantes) {
            aplicar(repartirModeloCon(g, actual.modelo, ponerTallas(cantidadDeModelo(g.separado, actual.modelo, antes), sep.productoId, sep, sep.variantes)));
            // Volvió lo guardado: la tabla se arma de ahí, sin nada que esperar.
            setTablas((t) => {
              const copia = { ...t };
              delete copia[p.clave];
              return copia;
            });
          } else escribirEnParada(actual, antes);
        },
      },
    });
  }

  /** Lo separado de un grupo cambió por otra cosa que el contador (llegó otra prenda, sus tallas, las sin nombre): lo contado lo sigue. */
  function escribirSeparado(g: GrupoDeLineas, s: Separado) {
    aplicar(repartirOtroCambio(g, s));
  }

  /** Lo escrito en la tabla de un modelo: se guarda recién cuando reparte justo lo contado. Si lo guardado ya no es lo que se ve, se suelta: la pantalla nunca contradice a la base. */
  function cambiarTabla(clave: string, prenda: PrendaRecepcion, tabla: BorradorTallas) {
    const g = gruposVivos.current.find((x) => x.clave === grupoDeLaClave(clave));
    const sep = g?.separado.prendas.find((x) => x.productoId === prenda.productoId);
    const cuadra = !!sep && tallasListas(tabla.conteo, prenda, sep.cantidad);
    setTablas((t) => ({ ...t, [clave]: { ...tabla, sinGuardar: !cuadra && sumasDe(tabla.conteo, prenda).contado > 0 } }));
    if (!g || !sep) return;
    if (cuadra) {
      const vs = variantesDeConteo(tabla.conteo, prenda);
      if (!mismasVariantes(vs, sep.variantes)) escribirSeparado(g, ponerTallas(g.separado, prenda.productoId, prenda, vs));
    } else if (sep.variantes) {
      escribirSeparado(g, detallarPrenda(g.separado, prenda.productoId, []));
    }
  }

  /** «Para después» o «repartir ahora» (se abre la hoja de tallas). Una nueva primero se crea. Dejar para después lo que ya tenía tallas las suelta, y el aviso ofrece deshacerlo. */
  function elegirModo(p: ParadaDelConteo, modo: ModoDeTallas) {
    const m = p.modelo;
    if (!m) return;
    if (modo === "ahora" && !m.productoId) {
      setHoja({ tipo: "existe", grupo: p.grupo.clave, nueva: { cantidad: m.contadas, descripcion: m.nombre, porDefecto: m.porDefecto, nota: m.nota }, parada: p.clave });
      return;
    }
    const sep = prendaSeparada(p);
    setModos((ms) => ({ ...ms, [p.clave]: modo }));
    if (modo === "ahora") setHoja({ tipo: "repartir", parada: p.clave });
    if (modo === "despues" && sep?.variantes) {
      const antes = sep.variantes;
      const productoId = sep.productoId;
      escribirSeparado(p.grupo, detallarPrenda(p.grupo.separado, productoId, []));
      setTablas((t) => {
        const copia = { ...t };
        delete copia[p.clave];
        return copia;
      });
      avisar.exito("Tallas y colores para después", {
        detalle: `${m.nombre} entra al almacén, sin sus tallas.`,
        accion: {
          texto: "Deshacer",
          onClick: () => {
            const g = gruposVivos.current.find((x) => x.clave === p.grupo.clave);
            if (!g) return;
            setModos((ms) => ({ ...ms, [p.clave]: "ahora" }));
            escribirSeparado(g, detallarPrenda(g.separado, productoId, antes));
          },
        },
      });
    }
  }

  /** El tacho. El aviso ofrece volverlo atrás: quitar uno por error no debería costar el conteo. */
  function quitarModeloDe(p: ParadaDelConteo) {
    const m = p.modelo;
    if (!m) return;
    const antes = p.grupo.separado;
    const siguiente = paradasDelEnvio.find((x) => x.clave !== p.clave && !paradaContada(x)) ?? paradasDelEnvio.find((x) => x.clave !== p.clave) ?? null;
    escribirSeparado(p.grupo, quitarModelo(antes, m));
    if (parada?.clave === p.clave) setFoco(siguiente?.clave ?? null);
    if (p.grupo.separado.prendas.length + p.grupo.separado.nuevas.length === 1) setAgregados((a) => new Set([...a].filter((k) => !p.grupo.lineas.some((l) => l.clave === k))));
    avisar.exito(`Quitaste ${m.nombre}`, {
      accion: {
        texto: "Deshacer",
        onClick: () => {
          // Si era lo único de su línea, ya no está a la vista: se vuelve a mostrar y se escribe sobre la línea de ahora. Comparado con el grupo de antes parecería que no cambió nada.
          setAgregados((a) => new Set([...a, ...p.grupo.lineas.map((l) => l.clave)]));
          const g = gruposVivos.current.find((x) => x.clave === p.grupo.clave);
          if (g) {
            escribirSeparado(g, devolverModelo(g.separado, antes, m));
          } else {
            const l = lineasVivas.current.find((x) => x.clave === p.grupo.principal.clave) ?? p.grupo.principal;
            const separado = devolverModelo(l.conteo?.separado ?? SEPARADO_VACIO, antes, m);
            onEscribir(l, { contadas: (l.conteo?.enStock ?? 0) + totalSeparado(separado), separado });
          }
          setFoco(p.clave);
        },
      },
    });
  }

  /** El tacho de una categoría que se agregó entera (ADR-0605). El aviso la devuelve con lo que tenía. */
  function quitarCategoria(c: CategoriaDelEnvio) {
    if (!sePuedeQuitarCategoria(c)) return;
    const antes = c.grupos.flatMap((g) => g.lineas);
    const claves = antes.map((l) => l.clave);
    const siguiente = paradasDelEnvio.find((x) => !c.paradas.some((p) => p.clave === x.clave) && !paradaContada(x)) ?? paradasDelEnvio.find((x) => !c.paradas.some((p) => p.clave === x.clave)) ?? null;
    const focoAntes = parada?.clave ?? null;
    for (const g of c.grupos) aplicar(repartirSeparado(g, SEPARADO_VACIO, 0));
    setAgregados((a) => new Set([...a].filter((k) => !claves.includes(k as ClaveLinea))));
    if (parada && c.paradas.some((p) => p.clave === parada.clave)) setFoco(siguiente?.clave ?? null);
    avisar.exito(`Quitaste ${c.categoria?.nombre ?? "la categoría"}`, {
      accion: {
        texto: "Deshacer",
        onClick: () => {
          setAgregados((a) => new Set([...a, ...claves]));
          // Cada línea, sobre su versión de ahora: quitarlas ya la cambió.
          for (const l of antes) onEscribir(lineasVivas.current.find((x) => x.clave === l.clave) ?? l, { contadas: l.conteo?.contadas ?? 0, separado: l.conteo?.separado ?? SEPARADO_VACIO });
          setFoco(focoAntes);
        },
      },
    });
  }

  /** El «+» de la categoría: el modelo cae en la línea de esa categoría y marca (o abre una) y queda en 0 en el contador. */
  async function crearModelo(m: ModeloPedido): Promise<string | null> {
    const { categoriaId } = m;
    const llave = m.prenda ? m.prenda.productoId : claveDeNombre(m.nombre);
    const conModelo = (s: Separado): Separado =>
      m.prenda ? agregarPrendaEnCero(s, { productoId: m.prenda.productoId, nombre: m.prenda.nombre, codigo: m.prenda.codigo }) : agregarModeloEnCero(s, { nombre: m.nombre, nota: m.nota, porDefecto: m.porDefecto });
    if (m.prenda) onPrendaVista(m.prenda);
    const destino = alAgregarALaLista(grupos, { proveedorId: m.proveedorId, categoriaId, marcaId: m.marcaId });
    if (destino.tipo === "dentro") {
      escribirSeparado(destino.grupo, conModelo(destino.grupo.separado));
      setFoco(claveDeParada(destino.grupo, llave));
    } else {
      const clave = await onAgregar({ proveedorId: m.proveedorId, categoriaId, marcaId: m.marcaId, separado: conModelo(SEPARADO_VACIO) });
      if (!clave) return "No se pudo agregar. Revisa la conexión y vuelve a intentar.";
      setAgregados((a) => new Set([...a, clave]));
      setFoco(`${clave}::${llave}`);
    }
    setFiltro(SIN_FILTRO);
    setErrorHoja(null);
    return null;
  }

  async function leerPrenda(g: GrupoDeLineas, productoId: string, nombre: string | null): Promise<PrendaRecepcion | null> {
    const ya = prendas.get(productoId);
    if (ya) return ya;
    const l = g.principal;
    if (!l.categoria) return null;
    const { prendas: halladas } = await buscarPrendasParaRecibir(l.categoria.id, marcaDeLinea(l).id, nombre ?? "");
    const hallada = halladas.find((x) => x.productoId === productoId) ?? null;
    if (hallada) onPrendaVista(hallada);
    return hallada;
  }

  /** «Cambiar de prenda»: se abre la hoja de tallas, donde se elige otra. */
  async function cambiarDePrenda(p: ParadaDelConteo, s: PrendaSeparada) {
    setErrorHoja(null);
    const completa = await leerPrenda(p.grupo, s.productoId, s.nombre);
    if (!completa) {
      setErrorHoja(`No se pudieron leer las tallas y colores de ${s.nombre ?? "esa prenda"}. Recarga la pantalla y vuelve a intentar.`);
      return;
    }
    setHoja({ tipo: "tallas", grupo: p.grupo.clave, original: s, prenda: completa, parada: p.clave });
  }

  /**
   * La prenda de «Crear ahora» ya existe (recién creada, o «Usar esa prenda»): esas nuevas dejan de estar «por crear» y pasan a ser la prenda, sin tallas todavía, y se sigue con su tabla, en la
   * misma pantalla. Se guarda ya: si la tabla se deja para después, la fila queda como cualquier otra sin tallas.
   */
  function prendaDeLaNueva(g: GrupoDeLineas, claveParada: string, descripcion: string, prenda: PrendaRecepcion) {
    onPrendaVista(prenda);
    escribirSeparado(g, prendaCreadaDeNueva(g.separado, descripcion, prenda));
    // Si la anotó Compras, la fila sigue siendo la misma aunque se cree con otro nombre (toma el de la prenda, Felipe 2026-11-11). Si la agregó
    // quien cuenta y se creó con otro nombre, ahora es otra fila: el contador la sigue.
    const misma = parada?.modelo?.nombre === prenda.nombre || !!parada?.modelo?.anotada;
    const nuevaClave = misma ? claveParada : claveDeParada(g, prenda.productoId);
    if (!misma) setFoco(nuevaClave);
    setModos((ms) => ({ ...ms, [nuevaClave]: "ahora" }));
    // Recién creada, se sigue con sus tallas: se abre su hoja.
    setHoja({ tipo: "repartir", parada: nuevaClave });
  }

  /**
   * Volvió de la hoja de tallas y colores de la prenda. Abierta desde la tabla (`eran` y `marcas`), la tabla muestra justo lo que quedó marcado: lo nuevo y lo que la prenda ya tenía
   * y estaba escondido se suman; lo desmarcado sale con sus cantidades, y el aviso ofrece deshacerlo. Si no, se suma lo recién creado, sin perder lo escrito.
   */
  function volverATabla(claveParada: string, g: GrupoDeLineas, antes: PrendaRecepcion | null, prenda: PrendaRecepcion, eran?: MarcasDeLaTabla, marcas?: MarcasDeLaTabla) {
    onPrendaVista(prenda);
    const guardadas = g.separado.prendas.find((x) => x.productoId === prenda.productoId)?.variantes ?? null;
    const tabla = tablas[claveParada] ?? borradorDeTallas(antes ?? prenda, coloresOrden, tallasDeLaCategoria(g), guardadas);
    if (eran && marcas) {
      const r = tablaConLoMarcado(tabla, prenda, eran, marcas);
      cambiarTabla(claveParada, prenda, r.tabla);
      if (r.perdidas > 0) {
        avisar.exito("Quitaste tallas o colores de la tabla", {
          detalle: `${conMiles(r.perdidas)} ${r.perdidas === 1 ? "prenda" : "prendas"} por repartir otra vez.`,
          accion: { texto: "Deshacer", onClick: () => cambiarTabla(claveParada, prenda, tabla) },
        });
      }
    } else {
      const ejes = (vs: PrendaRecepcion["variantes"], de: "tallaId" | "colorCodigo") => new Set(vs.map((v) => v[de] ?? ""));
      const nuevas = (de: "tallaId" | "colorCodigo") => [...ejes(prenda.variantes, de)].filter((x) => !ejes(antes?.variantes ?? [], de).has(x));
      setTablas((t) => ({ ...t, [claveParada]: { ...tabla, tallas: [...new Set([...tabla.tallas, ...nuevas("tallaId")])], colores: [...new Set([...tabla.colores, ...nuevas("colorCodigo")])] } }));
    }
    setHoja({ tipo: "repartir", parada: claveParada });
  }

  const categoriaDelModelo = hoja?.tipo === "modelo" && hoja.categoria ? (todas.find((c) => c.clave === hoja.categoria) ?? null) : null;
  const paradaAEditar = hoja?.tipo === "editar" ? (paradasDelEnvio.find((p) => p.clave === hoja.parada) ?? null) : null;
  const paradaAQuitar = hoja?.tipo === "quitar" ? (paradasDelEnvio.find((p) => p.clave === hoja.parada) ?? null) : null;
  const categoriaAQuitar = hoja?.tipo === "quitar-categoria" ? (todas.find((c) => c.clave === hoja.categoria) ?? null) : null;
  const grupoDeHoja = hoja && "grupo" in hoja ? (grupos.find((g) => g.clave === hoja.grupo) ?? null) : null;
  // Vino en la guía sin decir qué modelos: lo que sigue es agregarlos.
  const sinModelos = todas.find((c) => c.paradas.length === 0 && !c.hayConteo) ?? null;
  // La prenda de la hoja se guarda en la línea de la compra que la anotó (de ahí salen su precio sugerido y su costo).
  const lineaDeHoja =
    grupoDeHoja && hoja && "grupo" in hoja
      ? lineaDeLaPrenda(grupoDeHoja, hoja.tipo === "crear" || hoja.tipo === "existe" ? { descripcion: hoja.nueva.descripcion } : { productoId: hoja.original.productoId })
      : null;
  const categoriaDeHoja = grupoDeHoja?.principal.categoria ? (catalogo?.categorias.find((c) => c.id === grupoDeHoja.principal.categoria?.id) ?? null) : null;

  // «Revisar y cerrar» pasa a ser el botón principal recién cuando ya no queda nada por contar: hasta ahí lo principal es «Listo, siguiente».
  const todoContado = cifras.estados["por-contar"] === 0 && puedeCerrar;
  const faltaFotoDeFactura = papeles.some((p) => !p.fotoRuta);
  const sepDeLaParada = parada ? prendaSeparada(parada) : undefined;
  const prendaDeLaParada = parada?.modelo?.productoId ? (prendas.get(parada.modelo.productoId) ?? null) : null;
  // La tabla del modelo que se cuenta: lo escrito en esta visita o, si no, lo guardado. Sin la prenda leída todavía, lo guardado dice cuánto va.
  const tablaDeLaParada = parada && grupo && prendaDeLaParada && sepDeLaParada ? (tablas[parada.clave] ?? borradorDeTallas(prendaDeLaParada, coloresOrden, tallasDeLaCategoria(grupo), sepDeLaParada.variantes)) : null;
  const repartidas = tablaDeLaParada && prendaDeLaParada ? sumasDe(tablaDeLaParada.conteo, prendaDeLaParada).contado : (sepDeLaParada?.variantes ?? []).reduce((a, v) => a + v.cantidad, 0);
  // Lo que se puede llevar al stock ya, sin cerrar el envío: lo repartido en la tabla (aunque sea una parte) o, si la tabla no se abrió en esta visita, lo guardado.
  const paraLlevar = (() => {
    if (!parada?.modelo || !grupo || !sepDeLaParada) return null;
    const linea = lineaDeLaPrenda(grupo, { productoId: sepDeLaParada.productoId });
    if (!linea?.conteo) return null;
    if (tablaDeLaParada && prendaDeLaParada) {
      const sumas = sumasDe(tablaDeLaParada.conteo, prendaDeLaParada);
      const unidades = loQueSale(sumas, sepDeLaParada.cantidad, tablaDeLaParada.conteo.conDanadas && sumas.danadas > 0 && !tablaDeLaParada.conteo.arreglo);
      return unidades > 0 ? { linea, unidades, variantes: variantesDeConteo(tablaDeLaParada.conteo, prendaDeLaParada) } : null;
    }
    const guardadas = sepDeLaParada.variantes ?? [];
    const unidades = guardadas.reduce((a, v) => a + v.cantidad, 0);
    return unidades > 0 ? { linea, unidades, variantes: guardadas } : null;
  })();
  /** «Llevar al stock ahora», donde haga falta: en la tarjeta (sin frase) y al pie de la hoja de tallas. Con todo repartido es el botón principal; con una parte, acompaña. */
  const botonLlevar = (donde: "tarjeta" | "hoja") => {
    if (!paraLlevar || !parada?.modelo || !sepDeLaParada) return null;
    const clave = parada.clave;
    const nombre = parada.modelo.nombre;
    const todo = paraLlevar.unidades === sepDeLaParada.cantidad;
    return (
      <LlevarAlStock
        key={`${donde}:${clave}`}
        despachoId={detalle.id}
        unidades={paraLlevar.unidades}
        nombre={nombre}
        sede={detalle.sede?.nombre ?? "esta sede"}
        sedeId={detalle.sede?.id ?? null}
        linea={paraLlevar.linea}
        productoId={sepDeLaParada.productoId}
        variantes={paraLlevar.variantes}
        sinAviso={sinAviso}
        veDinero={veDinero}
        soloSede={soloSede}
        responsable={responsable}
        esperandoGuardar={esperandoGuardar}
        peso={todo ? "primario" : "fantasma"}
        parcial={!todo}
        conFrase={donde === "hoja"}
        onConteoCambiado={onSalida}
        onHecho={(r) => {
          setTablas((t) => {
            const { [clave]: _sale, ...resto } = t;
            return resto;
          });
          setHoja({ tipo: "salida-hecha", resultado: r, nombre });
          void leerSalidasDelEnvio(detalle.id).then(setSalidas);
          onSalida();
        }}
      />
    );
  };
  const tarjeta = parada?.modelo ? estadoDeLaTarjeta({ contadas: parada.modelo.contadas, enStock: parada.modelo.enStock, enCatalogo: !!parada.modelo.productoId, modo: modoDe(parada), repartidas }) : null;
  // Un solo botón negro a la vez (cambio 2 de /formidable): el de la tarjeta si al modelo le toca algo, «Revisar y cerrar» con todo contado, o «Listo, siguiente».
  const principal = botonPrincipal({ tarjeta, hayParaLlevar: !!paraLlevar, hayConteo: parada?.modelo ? parada.modelo.contado : true, todoContado });

  // Lo que salió de este envío, para ofrecer «Corregir». Se relee cuando cambia lo recibido.
  const nRecibidos = detalle.recibidos?.length ?? 0;
  const [salidas, setSalidas] = useState<SalidaDelEnvio[]>([]);
  useEffect(() => {
    let vivo = true;
    void leerSalidasDelEnvio(detalle.id).then((s) => vivo && setSalidas(s));
    return () => {
      vivo = false;
    };
  }, [detalle.id, nRecibidos]);
  // Lo que ya entró al stock va en su categoría (Felipe 2026-11-07): buscando, una categoría escondida vuelve si lo suyo coincide.
  const yaEntro = categoriasConLoQueYaEntro(
    categoriasDelConteo,
    todas,
    yaEnStockDelEnvio(detalle.recibidos, todas.flatMap((c) => c.grupos.flatMap(modelosDelGrupo))).map((y) => ({ ...y, salida: ultimaSalidaDe(salidas, y.prenda) })),
    filtro,
  );

  // La lista del envío. Se dibuja en la mesa y, en el celular, dentro de su hoja (`enHoja`): ahí elegir un modelo cierra la hoja y deja el contador a la vista.
  const listaDelEnvio = (enHoja: boolean) => (
    <ListaDelEnvio
      enHoja={enHoja}
      yaEnStock={yaEntro.porCategoria}
      sueltos={yaEntro.sueltos}
      colores={catalogo?.colores ?? []}
      onCorregirSalida={(s) => setHoja({ tipo: "corregir-salida", salida: s })}
      categorias={yaEntro.categorias}
      enFoco={parada}
      alternadas={alternadas}
      sinAviso={sinAviso}
      totalCategorias={todas.length}
      filtro={filtro}
      proveedores={opciones.proveedores}
      marcas={opciones.marcas}
      filtrarProveedor={opciones.hayQueFiltrarProveedor}
      filtrarMarca={opciones.hayQueFiltrarMarca}
      modelosTotales={paradasDelEnvio.filter((p) => p.modelo).length}
      orden={orden}
      fotos={fotos}
      faltanTallas={faltanTallas}
      onFiltro={cambiarFiltro}
      onOrden={setOrden}
      onAlternar={(clave) =>
        setAlternadas((a) => {
          const n = new Set(a);
          if (!n.delete(clave)) n.add(clave);
          return n;
        })
      }
      onElegir={enHoja ? (p) => (elegir(p), setListaEnHoja(false)) : elegirEnLaLista}
      onElegirPrimero={() => {
        if (paradas[0]) elegirEnLaLista(paradas[0], true);
      }}
      onAgregar={() => setHoja({ tipo: "modelo", categoria: null })}
      onAgregarModelo={(categoria) => setHoja({ tipo: "modelo", categoria })}
      onNoLlego={(c) => c.grupos.forEach((g) => aplicar(repartirTotal(g, 0)))}
      onQuitar={(p) => (p.modelo && p.modelo.contadas > 0 ? setHoja({ tipo: "quitar", parada: p.clave }) : quitarModeloDe(p))}
      onQuitarCategoria={(c) => (c.contadas > 0 ? setHoja({ tipo: "quitar-categoria", categoria: c.clave }) : quitarCategoria(c))}
      onFotos={(nuevas) => setFotos((f) => new Map([...f, ...nuevas]))}
      cifras={cifras}
      avance={
        <AvanceDelEnvio
          cifras={cifras}
          sinAviso={sinAviso}
          onIrAlQueFalta={() => {
            const destino = primeroPorContar(paradasDelEnvio, parada?.clave ?? null);
            if (!destino) return;
            // En el celular la lista está en su hoja: se elige y se cierra, y el contador queda a la vista. En la pantalla, se lleva hasta su fila.
            if (enHoja) {
              elegir(destino);
              setListaEnHoja(false);
            } else guia.ir(idCampoParada(destino));
          }}
        />
      }
      aviso={
        sinGuardar > 0 ? (
          <Aviso
            tono="error"
            chico
            accion={
              <button type="button" className="btn-cayla btn-enlace" onClick={onReintentar}>
                Reintentar
              </button>
            }
          >
            {sinGuardar === 1 ? "Una línea no se pudo guardar." : `${conMiles(sinGuardar)} líneas no se pudieron guardar.`}
          </Aviso>
        ) : undefined
      }
      pie={
        <PieDeLaLista
          enHoja={enHoja}
          guia={guia}
          faltaAparte={faltaAparteDeContar(guia.faltan, paradasDelEnvio)}
          responsable={responsable}
          papeles={papeles.length > 0 ? <PapelesDeLaCompra papeles={papeles} alSubirFoto={alSubirFoto} /> : undefined}
          explicacion={
            <>
              Lo que cuentas se guarda solo. Cada categoría guarda quién la contó: varias personas pueden contar a la vez, y firma quien cierra.{" "}
              {notaAlCerrar(cifras.estados["por-contar"] - cifras.agregadosEnCero, cifras.agregadosEnCero)} Al cerrar: {textoResumenDelCierre(resumenDelCierre(visibles))}
              {faltaFotoDeFactura && " La foto de las facturas no frena el cierre."}
            </>
          }
          cierrePrincipal={principal === "cerrar"}
          puedeCerrar={puedeCerrar}
          motivosNoCierra={motivosNoCierra}
          onCerrar={onCerrar}
          onIrALoQueFalta={() => guia.faltan[0] && guia.ir(guia.faltan[0].id)}
          onCancelarRecepcion={nadaContado ? onCancelarRecepcion : undefined}
        />
      }
    />
  );

  return (
    <div className="rc-conteo">
      {reabierto && (
        <Aviso tono="info" titulo="Reabriste el envío">
          Cuenta solo lo nuevo y vuelve a cerrarlo. Lo que ya entró al stock sale en su categoría, marcado «En stock», y desde ahí se corrige.
        </Aviso>
      )}
      {proveedorPorConfirmar && (
        <p className="nota-cayla text-sm">
          <b className="text-tinta">Algo no dice de quién es.</b> Cuenta igual: al cerrar eliges el proveedor de esa marca (pregúntale a Compras). Lo demás lo dice su marca.
        </p>
      )}
      {/* Lo primero al entrar: sin un responsable la base rechaza todo guardado (ElegirQuienCuenta). */}
      {faltaQuien && <ElegirQuienCuenta responsable={responsable} sede={detalle.sede?.nombre ?? "esta sede"} />}
      {/* Nadie marcó entrada hoy (o no se pudo leer el turno): nada se guarda hasta resolverlo. El combo lo explica con sus pasos y va aquí, a lo ancho:
          en el pie de la lista ocupaba media columna y dejaba una sola fila de modelos a la vista. Ahí queda dicho en una insignia. */}
      {sinTurno(responsable.estado) && (
        <div data-guia="recepcion.sin-turno">
          <ComboResponsable control={responsable} />
        </div>
      )}

      <div ref={mesa} className="rc-mesa">
        {listaDelEnvio(false)}

        <section className="rc-panel rc-placa" aria-label="Cuántas llegaron">
          {!grupo || !parada ? (
            <div className="rc-scroll">
              <Vacio
                icono={<PackageOpen />}
                titulo={sinModelos ? `Faltan los modelos de ${sinModelos.categoria?.nombre ?? "esta categoría"}` : "¿Qué llegó?"}
                acciones={
                  <Boton type="button" peso="primario" onClick={() => setHoja({ tipo: "modelo", categoria: sinModelos?.clave ?? null })}>
                    {sinModelos ? "Agregar un modelo" : sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}
                  </Boton>
                }
              >
                {sinModelos ? "Agrega cada modelo que llegó y cuéntalo aparte." : "Agrega lo primero que llegó y cuéntalo. Uno a la vez; después agregas lo demás."}
              </Vacio>
            </div>
          ) : (
            <PlacaDelModelo
              key={parada.clave}
              parada={parada}
              sinAviso={sinAviso}
              foto={parada.modelo?.productoId ? (fotos.get(parada.modelo.productoId) ?? prendaDeLaParada?.fotoUrl ?? null) : null}
              faltanTallas={faltanTallas(parada)}
              guardado={estadoDelGrupo(lineasDeEsto, guardados)}
              error={grupo.lineas.map((l) => errores[l.clave]).find(Boolean) ?? errorHoja}
              onReintentar={() => {
                setErrorHoja(null);
                onReintentar();
              }}
              onQuitarFiltro={() => cambiarFiltro(SIN_FILTRO)}
              onDeUnToque={(n) => ponerDeUnToque(parada, n)}
              pasoTallas={!tarjeta || tarjeta === "espera" ? "falta" : tarjeta === "lista" || tarjeta === "en-stock" ? "hecha" : tocaRepartir(tarjeta) ? "toca" : "falta"}
              principalEnLaTarjeta={principal === "tarjeta"}
              abrirNumero={escribirEn === parada.clave}
              anterior={anterior}
              siguiente={siguiente}
              pendiente={pendiente}
              hayFiltroPuesto={hayFiltro(filtro)}
              todoContado={todoContado}
              filaSeguir={filaSeguir}
              onPoner={(n) => escribirEnParada(parada, n)}
              onAnterior={(e) => pasarA(anterior, e.timeStamp)}
              onSiguiente={(e) => pasarA(siguiente, e.timeStamp)}
              onPendiente={(e) => pasarA(pendiente, e.timeStamp)}
              onEnter={() => {
                // Enter pasa al siguiente con su número listo para escribir; en el último, a lo que quedó sin contar; y con todo contado, el cursor va a «Revisar y cerrar».
                const destino = siguiente ?? (hayFiltro(filtro) ? null : pendiente);
                if (destino) elegir(destino, true);
                else requestAnimationFrame(() => (mesa.current?.querySelector<HTMLButtonElement>('[data-guia="recepcion.pasar-a-cerrar"]') ?? filaSeguir.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus());
              }}
              observacion={
                <AnotarObservacion
                  despachoId={detalle.id}
                  lineaId={lineasDeEsto[0]?.linea?.id ?? null}
                  nombre={parada.modelo ? parada.modelo.nombre : grupo.principal.categoria ? grupo.principal.categoria.nombre.toLowerCase() : "prendas"}
                  responsable={responsable}
                  onAnotada={(o) => setObservaciones((ya) => [...ya, o])}
                />
              }
              observaciones={<ObservacionesAnotadas observaciones={deLasLineas(observaciones, lineasDeEsto.map((l) => l.linea?.id ?? null))} />}
              onEditarNombre={() => setHoja({ tipo: "editar", parada: parada.clave })}
              // Las dañadas se anotan por talla y color, dentro de la hoja de tallas: solo donde esa hoja se puede abrir.
              onDanada={
                tarjeta && tarjeta !== "espera" && tarjeta !== "nueva" && tarjeta !== "en-stock"
                  ? () => {
                      setModos((ms) => ({ ...ms, [parada.clave]: "ahora" }));
                      setHoja({ tipo: "repartir", parada: parada.clave, danadas: true });
                    }
                  : undefined
              }
              onOtraPrenda={
                sepDeLaParada
                  ? () => void cambiarDePrenda(parada, sepDeLaParada)
                  : parada.modelo && !parada.modelo.productoId && parada.modelo.contadas > 0
                    ? () => setHoja({ tipo: "existe", grupo: grupo.clave, nueva: { cantidad: parada.modelo?.contadas ?? 0, descripcion: parada.modelo?.nombre ?? "", porDefecto: !!parada.modelo?.porDefecto, nota: parada.modelo?.nota ?? null }, parada: parada.clave })
                    : undefined
              }
              notaDeAlgo={
                !parada.modelo
                  ? null
                  : tarjeta === "espera"
                    ? null // La tarjeta de tallas, justo arriba, ya dice «Primero cuenta cuántas llegaron»: no se repite (cambio 3 de /formidable).
                    : tarjeta === "nueva"
                      ? "Las dañadas se anotan por talla y color: primero crea la prenda."
                      : tarjeta === "en-stock"
                        ? "Ya entró al stock: lo dañado se anota desde Existencias."
                        : null
              }
              identificar={<PrendasDeLaPlaca parada={parada} onSeparado={(s) => escribirSeparado(grupo, s)} onQuitarSueltas={() => aplicar(repartirTotal(grupo, minimoDelGrupo(grupo)))} />}
              tallas={
                parada.modelo && tarjeta ? (
                  <TarjetaDeTallas
                    estado={tarjeta}
                    contadas={parada.modelo.contadas - parada.modelo.enStock}
                    repartidas={repartidas}
                    variantes={sepDeLaParada?.variantes ?? null}
                    colores={catalogo?.colores ?? []}
                    esperaTabla={!!tablas[parada.clave]?.sinGuardar}
                    onAbrir={() => elegirModo(parada, "ahora")}
                    onModo={(m) => elegirModo(parada, m)}
                    despues={botonLlevar("tarjeta")}
                  />
                ) : null
              }
            />
          )}
        </section>
      </div>

      <IslaDelEnvio
        cifras={cifras}
        sinAviso={sinAviso}
        todoContado={todoContado}
        listaAbierta={listaEnHoja}
        onLista={() => setListaEnHoja(true)}
        cierre={<BotonCerrarConteo peso={principal === "cerrar" ? "primario" : "fantasma"} puedeCerrar={puedeCerrar} motivos={motivosNoCierra} onCerrar={onCerrar} onIrALoQueFalta={() => guia.faltan[0] && guia.ir(guia.faltan[0].id)} />}
      />
      {listaEnHoja && (
        <HojaDeLaLista
          titulo={sinAviso ? "Lo que llegó" : "Categorías del envío"}
          cuantos={`${conMiles(paradasDelEnvio.filter((p) => p.modelo).length)} ${paradasDelEnvio.filter((p) => p.modelo).length === 1 ? "modelo" : "modelos"}`}
          onCerrar={() => setListaEnHoja(false)}
        >
          {listaDelEnvio(true)}
        </HojaDeLaLista>
      )}

      {paradaAQuitar?.modelo && <QuitarModelo nombre={paradaAQuitar.modelo.nombre} contadas={paradaAQuitar.modelo.contadas} onQuitar={() => quitarModeloDe(paradaAQuitar)} onCerrar={() => setHoja(null)} />}
      {categoriaAQuitar && <QuitarModelo nombre={categoriaAQuitar.categoria?.nombre ?? "la categoría"} contadas={categoriaAQuitar.contadas} onQuitar={() => quitarCategoria(categoriaAQuitar)} onCerrar={() => setHoja(null)} />}

      {paradaAEditar?.modelo && paradaAEditar.grupo.principal.categoria && (
        <EditarModelo
          modelo={paradaAEditar.modelo}
          categoria={paradaAEditar.grupo.principal.categoria}
          enLista={todas.find((c) => c.paradas.some((p) => p.clave === paradaAEditar.clave)) ?? todas[0]}
          onGuardar={(cambio) => {
            const { grupo: g, modelo: m } = paradaAEditar;
            if (!m) return;
            escribirSeparado(g, renombrarModelo(g.separado, m.nombre, cambio));
            setFoco(claveDeParada(g, claveDeNombre(cambio.nombre)));
          }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "modelo" && (
        <NuevoModelo
          categoriaFija={categoriaDelModelo?.categoria ?? null}
          categorias={todas}
          grupos={grupos}
          sinAviso={sinAviso}
          catalogo={catalogo}
          proveedores={proveedores}
          proveedoresDirectorio={proveedoresDirectorio}
          responsable={responsable}
          onProveedorNuevo={onProveedorNuevo}
          onMarcaNueva={onMarcaNueva}
          errorDelGuardado={errores["extra:0"] ?? null}
          onCrear={crearModelo}
          onIrA={elegir}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "tallas" && grupoDeHoja?.principal.categoria && (
        <HojaTallas
          key={hoja.prenda.productoId}
          prenda={hoja.prenda}
          categoria={grupoDeHoja.principal.categoria}
          marca={marcaDeLinea(grupoDeHoja.principal)}
          colores={catalogo?.colores ?? []}
          variantes={hoja.original.productoId === hoja.prenda.productoId ? hoja.original.variantes : null}
          sugeridas={hoja.original.cantidad}
          textoListo="Listo"
          onListo={(prenda, variantes) => {
            escribirSeparado(grupoDeHoja, ponerTallas(grupoDeHoja.separado, hoja.original.productoId, prenda, variantes));
            // Lo de la tabla ya no vale: manda lo que se guardó.
            setTablas((t) => {
              const copia = { ...t };
              delete copia[hoja.parada];
              return copia;
            });
            setHoja(null);
          }}
          onAbrirHoja={(modo, prenda) => setHoja({ tipo: "prenda", grupo: hoja.grupo, original: hoja.original, modo, prenda, parada: hoja.parada, tabla: false })}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "repartir" && parada?.modelo && grupo && sepDeLaParada && hoja.parada === parada.clave && (
        <HojaRepartir
          nombre={parada.modelo.nombre}
          contadas={sepDeLaParada.cantidad}
          onCerrar={() => setHoja(null)}
          pie={botonLlevar("hoja")}
        >
          <TallasDeLaPlaca
            prenda={prendaDeLaParada}
            cargar={async () => !!(await leerPrenda(grupo, sepDeLaParada.productoId, sepDeLaParada.nombre))}
            coloresCatalogo={catalogo?.colores ?? []}
            contadas={sepDeLaParada.cantidad}
            traerALaVista
            conDanadas={!!hoja.danadas}
            borrador={tablaDeLaParada}
            onCambiar={(t) => prendaDeLaParada && cambiarTabla(parada.clave, prendaDeLaParada, t)}
            onDejarSuma={(n) => escribirEnParada(parada, n + (parada.modelo?.enStock ?? 0))}
            onCrear={(pedidas) => setHoja({ tipo: "prenda", grupo: grupo.clave, original: sepDeLaParada, modo: "agregar", prenda: prendaDeLaParada, parada: parada.clave, tabla: true, pedidas, enTabla: tablaDeLaParada ? marcasDeLaTabla(tablaDeLaParada) : undefined })}
          />
        </HojaRepartir>
      )}

      {hoja?.tipo === "salida-hecha" && <SalidaHecha resultado={hoja.resultado} nombre={hoja.nombre} envioId={detalle.id} veExistencias={veExistencias} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === "corregir-salida" && (
        <CorregirSalida
          salida={hoja.salida}
          responsable={responsable}
          onCerrar={() => setHoja(null)}
          onHecho={() => {
            avisar.exito(`Corregiste ${hoja.salida.prenda}`, { detalle: "Salieron del almacén y volvieron a lo contado." });
            setHoja(null);
            void leerSalidasDelEnvio(detalle.id).then(setSalidas);
            onSalida();
          }}
        />
      )}

      {hoja?.tipo === "existe" && grupoDeHoja?.principal.categoria && (
        <YaExisteLaPrenda
          categoria={grupoDeHoja.principal.categoria}
          marca={marcaDeLinea(grupoDeHoja.principal)}
          nombre={hoja.nueva.porDefecto ? null : hoja.nueva.descripcion}
          cantidad={hoja.nueva.cantidad}
          costo={null}
          comoCorregirMarca="Si la marca anotada está mal, quita este modelo y agrégalo de nuevo con su marca."
          onUsar={(prenda) => prendaDeLaNueva(grupoDeHoja, hoja.parada, hoja.nueva.descripcion, prenda)}
          onCrear={() => setHoja({ ...hoja, tipo: "crear" })}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "crear" && grupoDeHoja?.principal.categoria && lineaDeHoja && (
        <HojaPrenda
          // Lo escrito al contar ya llena la hoja, igual que con «Crear ahora» de «Para después». Un nombre provisional («Blusa 1») no: aquí se le pone el de verdad.
          destino={{ ...destinoDe(detalle, lineaDeHoja, "nueva", null, proveedores.length, sinAviso), nombreEscrito: hoja.nueva.porDefecto ? null : hoja.nueva.descripcion, nota: hoja.nueva.nota, descripcionOrden: sinAviso ? null : (lineaDeHoja.linea?.descripcion ?? null) }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          vocabulario={catalogo?.vocabulario ?? null}
          responsable={responsable}
          onListo={(prenda) => prendaDeLaNueva(grupoDeHoja, hoja.parada, hoja.nueva.descripcion, prenda)}
          onCostoEscrito={(productoId, costoTexto) => onCostoDePrenda?.(lineaDeHoja.clave, productoId, costoTexto)}
          onUsarExistente={async (productoId, nombre) => {
            if (!grupoDeHoja.principal.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(grupoDeHoja.principal.categoria.id, marcaDeLinea(grupoDeHoja.principal).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            prendaDeLaNueva(grupoDeHoja, hoja.parada, hoja.nueva.descripcion, hallada);
            return true;
          }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === "prenda" && grupoDeHoja?.principal.categoria && lineaDeHoja && (
        <HojaPrenda
          destino={{ ...destinoDe(detalle, lineaDeHoja, hoja.modo, hoja.prenda, proveedores.length, sinAviso), pedidas: hoja.pedidas, enTabla: hoja.enTabla }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          vocabulario={catalogo?.vocabulario ?? null}
          responsable={responsable}
          onCostoEscrito={(productoId, costoTexto) => onCostoDePrenda?.(lineaDeHoja.clave, productoId, costoTexto)}
          onListo={(prenda, marcas) => {
            if (hoja.tabla) return volverATabla(hoja.parada, grupoDeHoja, hoja.prenda, prenda, hoja.enTabla, marcas);
            onPrendaVista(prenda);
            setHoja({ tipo: "tallas", grupo: hoja.grupo, original: hoja.original, prenda, parada: hoja.parada });
          }}
          onUsarExistente={async (productoId, nombre) => {
            if (!grupoDeHoja.principal.categoria) return false;
            const { prendas: halladas } = await buscarPrendasParaRecibir(grupoDeHoja.principal.categoria.id, marcaDeLinea(grupoDeHoja.principal).id, nombre);
            const hallada = halladas.find((x) => x.productoId === productoId);
            if (!hallada) return false;
            onPrendaVista(hallada);
            setHoja({ tipo: "tallas", grupo: hoja.grupo, original: hoja.original, prenda: hallada, parada: hoja.parada });
            return true;
          }}
          onCerrar={() => setHoja(hoja.tabla ? { tipo: "repartir", parada: hoja.parada } : null)}
        />
      )}
    </div>
  );
}

/** Lo que falta contar de lo que anotó Compras se pide al cerrar; lo agregado en 0 no: se descarta. */
function notaAlCerrar(faltanDeCompras: number, agregadosEnCero: number): string {
  if (faltanDeCompras > 0) return "Lo que falte por contar, al cerrar te lo va a pedir.";
  if (agregadosEnCero > 0) return "Lo que dejes en 0 no se guarda.";
  return "";
}

/** Cómo va el guardado de lo que se cuenta: guardando si alguna de sus líneas guarda, con error si alguna falló, guardado si todas lo están. */
function estadoDelGrupo(lineas: readonly LineaParaContar[], guardados: Readonly<Record<string, EstadoGuardado>>): EstadoGuardado | null {
  const e = lineas.map((l) => guardados[l.clave]);
  if (e.includes("guardando")) return "guardando";
  if (e.includes("error")) return "error";
  return e.includes("guardado") ? "guardado" : null;
}

/** A dónde va la hoja de la prenda («Es nueva» / «+ talla o color») desde una línea del conteo. */
function destinoDe(detalle: DetalleEnvio, l: LineaParaContar, modo: "nueva" | "agregar", prenda: PrendaRecepcion | null, nProveedores: number, sinAviso = false): DestinoHoja {
  return {
    modo,
    despachoId: detalle.id,
    despachoItemId: l.linea?.id ?? null,
    categoriaId: l.categoria?.id ?? "",
    marcaId: l.marca?.id ?? null,
    marcaNombre: marcaDeLinea(l).nombre,
    descripcionOrden: l.linea?.descripcion ?? null,
    precioSugerido: l.linea?.precioVentaSugerido ?? null,
    costoUnitario: l.conteo?.costoUnitario ?? l.linea?.costoUnitario ?? null,
    prenda,
    // Lo de fuera de la guía lleva el proveedor de su línea: con dos o más en el envío, o sin aviso, donde cada línea es de su proveedor (Felipe 2026-11-07).
    proveedorId: !l.linea && (nProveedores >= 2 || sinAviso) ? (l.proveedor?.id ?? null) : null,
  };
}
