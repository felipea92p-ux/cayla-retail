"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type Dispatch, type SetStateAction } from "react";
import { PackageOpen } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaPrenda, type DestinoHoja } from "@/components/recepcion-envio/HojaPrenda";
import type { ControlResponsable } from "@/lib/useResponsable";
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
  SIN_MARCA,
  marcaDeLinea,
} from "@/lib/recepcion-conteo-reglas";
import {
  agruparLineas,
  gruposSinIdentificar,
  idCampoIdentificar,
  lineaDeLaPrenda,
  minimoDelGrupo,
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
  claveDeParada,
  conMiles,
  esToqueRepetido,
  focoTrasElFiltro,
  grupoDeLaClave,
  hayFiltro,
  idCampoParada,
  lineasDeLaParada,
  opcionesDelFiltro,
  paradaContada,
  paradaEnFoco,
  paradasDelGrupo,
  repartirModeloCon,
  repartirOtroCambio,
  SIN_FILTRO,
  tipoDeParada,
  vecinosDeLaParada,
  type EstadoDelResumen,
  type FiltroDelConteo,
  type OrdenDelConteo,
  type ParadaDelConteo,
  type TipoDeModelo,
} from "@/lib/recepcion-modelos-reglas";
import { borradorDeTallas, mismasVariantes, modoDeTallas, modosAlCambiar, tablaParaElNumero, tallasListas, type BorradorTallas, type ModoDeTallas } from "@/lib/recepcion-tallas-reglas";
import { AgregarFueraDeGuia } from "./AgregarFueraDeGuia";
import { ElegirQuienCuenta } from "./ElegirQuienCuenta";
import { ListaDelEnvio } from "./CategoriasAcordeon";
import { AnotarObservacion, ObservacionesAnotadas } from "./ObservacionesDeLinea";
import { PapelesDeLaCompra } from "./PapelesDeLaCompra";
import { HojaTallas } from "./HojaTallas";
import { PlacaDelModelo } from "./PlacaDelModelo";
import { PrendasDeLaPlaca } from "./PrendasDeLaPlaca";
import type { Borrador, EstadoGuardado } from "./RecibirContando";
import { ResumenDelEnvio } from "./ResumenDelEnvio";
import { TallasDeLaPlaca } from "./TallasDeLaPlaca";
import { TiposDelEnvio } from "./TiposDelEnvio";

// Contar (ADR-0393; modelo por modelo y en tres columnas desde el 2026-11-02, ADR-0604): arriba, Re stock y Producto nuevo. A la izquierda las categorías del envío, cada una una sola vez,
// con sus modelos adentro; al centro, UNO a la vez: cuántas llegaron de ese modelo y, si se quiere, sus tallas y colores; a la derecha, cómo va todo el envío y qué sigue. Cada cambio se guarda
// solo. La guía de foco enciende el próximo modelo sin contar.
//
// Por dentro la base sigue guardando una fila por línea de la compra: `lib/recepcion-modelos-reglas.ts` dice en qué línea cae cada modelo y `lib/recepcion-grupos-reglas.ts` reparte. Lo que no
// tiene modelo (un envío sin aviso, una compra que no anotó qué prendas eran) se cuenta como un total y después se identifica.

const ID_CAMPO_QUIEN = "rc-quien-cuenta";

type Hoja =
  // «Cambiar de prenda»: la hoja de tallas, donde se elige otra.
  | { tipo: "tallas"; grupo: string; original: PrendaSeparada; prenda: PrendaRecepcion; parada: string }
  // `tabla`: la abrió la tabla de la placa para crear lo que la prenda no tiene, y vuelve a ella.
  | { tipo: "prenda"; grupo: string; original: PrendaSeparada; modo: "nueva" | "agregar"; prenda: PrendaRecepcion | null; parada: string; tabla: boolean; pedidas?: DestinoHoja["pedidas"] }
  // «Crear ahora» de una nueva ya descrita: la hoja de la prenda, sin una prenda de partida (la descripción es el nombre que se ofrece).
  | { tipo: "crear"; grupo: string; nueva: { cantidad: number; descripcion: string }; parada: string }
  | { tipo: "agregar" }
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
  onPrendaVista,
  onEscribir,
  sinGuardar = 0,
  onReintentar,
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
  /** Recuerda una prenda ya leída (con sus tallas y colores), para no volver a buscarla. */
  onPrendaVista: (p: PrendaRecepcion) => void;
  onEscribir: (linea: LineaParaContar, cambio: Partial<Borrador>) => void;
  /** Cuántas líneas no se pudieron guardar, en todo el envío. */
  sinGuardar?: number;
  /** Vuelve a mandar lo que no se pudo guardar. */
  onReintentar: () => void;
  /** De cada modelo: «solo la cantidad» o «tallas y colores ahora», y lo escrito en su tabla (viven en la pantalla: ir a Cerrar y volver no los borra). */
  modos: Readonly<Record<string, ModoDeTallas>>;
  onModos: Dispatch<SetStateAction<Readonly<Record<string, ModoDeTallas>>>>;
  tablas: Readonly<Record<string, BorradorTallas>>;
  onTablas: Dispatch<SetStateAction<Readonly<Record<string, BorradorTallas>>>>;
  onAgregar: (nuevo: { proveedorId: string | null; categoriaId: string; marcaId: string | null }) => Promise<ClaveLinea | null>;
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
  const [otraCosa, setOtraCosa] = useState(false);
  // Se acaba de pedir «Tallas y colores ahora»: la tabla queda bajo el borde de la columna y hay que traerla a la vista.
  const [traerTallas, setTraerTallas] = useState(false);
  const [fotos, setFotos] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const filaSeguir = useRef<HTMLDivElement>(null);
  const ultimoPaso = useRef(Number.NEGATIVE_INFINITY);
  const mesa = useAltoDeLaMesa();

  const visibles = lineasALaVista(lineas, agregados, foco?.startsWith("extra:") ? (grupoDeLaClave(foco) as ClaveLinea) : null);
  const grupos = agruparLineas(visibles);
  // Lo último de cada grupo, para un «Deshacer» que llega cuando ya cambió algo más.
  const gruposVivos = useRef(grupos);
  useLayoutEffect(() => {
    gruposVivos.current = grupos;
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
  const enAhora = new Set(Object.entries(modos).filter(([, m]) => m === "ahora").map(([k]) => k));
  const categorias = categoriasEnOrden(categoriasDelFiltro(grupos, filtro, parada?.clave ?? null, enAhora), orden);
  const paradas = categorias.flatMap((c) => c.paradas);
  const { anterior, siguiente } = vecinosDeLaParada(paradas, parada?.clave ?? null);
  const opciones = opcionesDelFiltro(grupos, filtro);
  const cifras = cifrasDelResumen(todas, enAhora);
  // En una terminal hay que elegir quién cuenta antes de guardar: es lo primero que falta, y se elige ahí mismo.
  const faltaQuien = responsable.estado === "falta";
  const guiaBase = useGuiaCampos(
    [...(faltaQuien ? [{ id: ID_CAMPO_QUIEN, nombre: "Quién cuenta", requerido: true, hecho: false, pendiente: "Elige quién está contando." }] : []), ...camposDelConteoPorModelo(todas)],
    { enModal: false },
  );
  const [hoja, setHoja] = useState<Hoja>(null);
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
  const yaUsadas = new Set(visibles.map((l) => `${l.categoria?.id}|${l.marca?.id ?? SIN_MARCA}`));
  const proveedores = conteos?.proveedores ?? [];
  const puedeCerrar = visibles.length > 0 && faltanIdentificar.length === 0;
  const motivoNoCierra =
    visibles.length === 0
      ? "Primero agrega lo que llegó."
      : faltanIdentificar.length > 0
        ? `Falta identificar las prendas de ${faltanIdentificar.map((g) => g.principal.categoria?.nombre ?? "una categoría").join(", ")}`
        : undefined;

  function elegir(p: ParadaDelConteo, escribir = false) {
    const suya = claveDeCategoria(p.grupo);
    setAlternadas((a) => new Set([...a].filter((k) => k !== suya)));
    setOtraCosa(false);
    setTraerTallas(false);
    setErrorHoja(null);
    setEscribirEn(escribir ? p.clave : null);
    setFoco(p.clave);
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
      setOtraCosa(false);
      setEscribirEn(null);
    }
  }

  /** Guarda lo que cambió en cada línea de la categoría (cada una se guarda sola, con su propio aviso). */
  function aplicar(r: Reparto) {
    // El modelo que se está mirando sigue en su modo aunque este cambio le suelte las tallas: su tabla no se cierra mientras se escribe.
    if (parada) setModos((ms) => modosAlCambiar(ms, parada.clave, !!prendaSeparada(parada)?.variantes));
    for (const c of r.cambios) onEscribir(c.linea, { contadas: c.contadas, separado: c.separado });
  }

  const modoDe = (p: ParadaDelConteo): ModoDeTallas => modoDeTallas(modos[p.clave], !!p.modelo?.conTallas);
  const faltanTallas = (p: ParadaDelConteo): boolean => !!p.modelo && p.modelo.contadas > 0 && !p.modelo.conTallas && modoDe(p) === "ahora";
  const coloresOrden = (catalogo?.colores ?? []).map((c) => c.codigo);
  const tallasDeLaCategoria = (g: GrupoDeLineas) => catalogo?.categorias.find((c) => c.id === g.principal.categoria?.id)?.tallas ?? [];
  const prendaSeparada = (p: ParadaDelConteo): PrendaSeparada | undefined => (p.modelo?.productoId ? p.grupo.separado.prendas.find((x) => x.productoId === p.modelo?.productoId) : undefined);

  /** La persona dejó este número en el contador: el del modelo, o el total de un grupo sin modelos (se reparte entre sus líneas cambiando lo mínimo). */
  function escribirEnParada(p: ParadaDelConteo, n: number) {
    if (!p.modelo) return aplicar(repartirTotal(p.grupo, n));
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
    const antes = p.modelo ? p.modelo.contadas : p.grupo.contadas;
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

  /** «Solo cuadrar» o «tallas y colores ahora». Una nueva primero se crea. Dejar para después lo que ya tenía tallas las suelta, y el aviso ofrece deshacerlo. */
  function elegirModo(p: ParadaDelConteo, modo: ModoDeTallas) {
    const m = p.modelo;
    if (!m) return;
    if (modo === "ahora" && !m.productoId) {
      setHoja({ tipo: "crear", grupo: p.grupo.clave, nueva: { cantidad: m.contadas, descripcion: m.nombre }, parada: p.clave });
      return;
    }
    const sep = prendaSeparada(p);
    setModos((ms) => ({ ...ms, [p.clave]: modo }));
    setTraerTallas(modo === "ahora");
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

  /** Llegó esta prenda del catálogo (parecida o buscada): una más en la lista y queda en el contador para seguir contándola. */
  function llegoPrenda(g: GrupoDeLineas, p: PrendaRecepcion) {
    onPrendaVista(p);
    escribirSeparado(g, sumarPrenda(g.separado, { productoId: p.productoId, nombre: p.nombre, codigo: p.codigo }));
    setOtraCosa(false);
    setFoco(claveDeParada(g, p.productoId));
  }

  /** Llegó algo que no está en el catálogo: se anota con su nombre y queda en el contador. */
  function llegoNueva(g: GrupoDeLineas, texto: string) {
    escribirSeparado(g, describirNuevas(cambiarNuevasSinDescribir(g.separado, nuevasSinDescribir(g.separado) + 1), texto, 1));
    setOtraCosa(false);
    setFoco(claveDeParada(g, claveDeNombre(texto)));
  }

  /** Esa prenda ya está en la lista, con otro proveedor o marca: no se suma de nuevo, se va a contarla allá. */
  function irAlModelo(productoId: string): boolean {
    const allá = paradasDelEnvio.find((p) => p.modelo?.productoId === productoId);
    if (!allá) return false;
    if (!paradas.some((p) => p.clave === allá.clave)) setFiltro(SIN_FILTRO);
    elegir(allá);
    return true;
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
    // Si se anotó por su nombre y se creó con otro, ahora es otra fila: el contador la sigue.
    const nombreIgual = parada?.modelo?.nombre === prenda.nombre;
    const nuevaClave = nombreIgual ? claveParada : claveDeParada(g, prenda.productoId);
    if (!nombreIgual) setFoco(nuevaClave);
    setModos((ms) => ({ ...ms, [nuevaClave]: "ahora" }));
    setTraerTallas(true);
    setHoja(null);
  }

  /** Volvió de crear lo que la prenda no tenía: la tabla muestra lo nuevo, sin perder lo escrito. */
  function volverATabla(claveParada: string, g: GrupoDeLineas, antes: PrendaRecepcion | null, prenda: PrendaRecepcion) {
    onPrendaVista(prenda);
    const tabla = tablas[claveParada] ?? borradorDeTallas(antes ?? prenda, coloresOrden, tallasDeLaCategoria(g), null);
    const ejes = (vs: PrendaRecepcion["variantes"], de: "tallaId" | "colorCodigo") => new Set(vs.map((v) => v[de] ?? ""));
    const nuevas = (de: "tallaId" | "colorCodigo") => [...ejes(prenda.variantes, de)].filter((x) => !ejes(antes?.variantes ?? [], de).has(x));
    setTablas((t) => ({ ...t, [claveParada]: { ...tabla, tallas: [...new Set([...tabla.tallas, ...nuevas("tallaId")])], colores: [...new Set([...tabla.colores, ...nuevas("colorCodigo")])] } }));
    setHoja(null);
  }

  const grupoDeHoja = hoja && hoja.tipo !== "agregar" ? (grupos.find((g) => g.clave === hoja.grupo) ?? null) : null;
  // La prenda de la hoja se guarda en la línea de la compra que la anotó (de ahí salen su precio sugerido y su costo).
  const lineaDeHoja =
    grupoDeHoja && hoja && hoja.tipo !== "agregar"
      ? lineaDeLaPrenda(grupoDeHoja, hoja.tipo === "crear" ? { descripcion: hoja.nueva.descripcion } : { productoId: hoja.original.productoId })
      : null;
  const categoriaDeHoja = grupoDeHoja?.principal.categoria ? (catalogo?.categorias.find((c) => c.id === grupoDeHoja.principal.categoria?.id) ?? null) : null;

  const hayModelos = cifras.tipos.restock.modelos + cifras.tipos.nuevo.modelos > 0;
  const tipoMarcado: TipoDeModelo | null = filtro.tipo ?? (parada ? tipoDeParada(parada) : null);
  const sepDeLaParada = parada ? prendaSeparada(parada) : undefined;
  const prendaDeLaParada = parada?.modelo?.productoId ? (prendas.get(parada.modelo.productoId) ?? null) : null;

  return (
    <div className="rc-conteo">
      {reabierto && (
        <Aviso tono="info" titulo="Reabriste el envío">
          Corrige lo que haga falta y vuelve a cerrarlo. Lo que ya entró al stock no se vuelve a contar ni se toca.
        </Aviso>
      )}
      {proveedorPorConfirmar && (
        <p className="nota-cayla text-sm">
          <b className="text-tinta">Proveedor por confirmar.</b> Cuenta igual: al cerrar eliges de quién llegó (pregúntale a Compras).
        </p>
      )}
      {/* Lo primero al entrar: sin un responsable la base rechaza todo guardado (ElegirQuienCuenta). */}
      {faltaQuien && <ElegirQuienCuenta responsable={responsable} sede={detalle.sede?.nombre ?? "esta sede"} />}
      {!sinAviso && hayModelos && <TiposDelEnvio tipos={cifras.tipos} marcado={tipoMarcado} filtrado={filtro.tipo} onElegir={(t) => cambiarFiltro({ ...filtro, tipo: filtro.tipo === t ? null : t, estado: null })} />}

      <div ref={mesa} className="rc-mesa">
        <ListaDelEnvio
          categorias={categorias}
          enFoco={parada}
          alternadas={alternadas}
          sinAviso={sinAviso}
          totalCategorias={todas.length}
          filtro={filtro}
          proveedores={opciones.proveedores}
          marcas={opciones.marcas}
          filtrarProveedor={opciones.hayQueFiltrarProveedor}
          filtrarMarca={opciones.hayQueFiltrarMarca}
          modelosTotales={paradasDelEnvio.length}
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
          onElegir={elegir}
          onElegirPrimero={() => {
            if (paradas[0]) elegir(paradas[0], true);
          }}
          onAgregar={() => setHoja({ tipo: "agregar" })}
          onFotos={(nuevas) => setFotos((f) => new Map([...f, ...nuevas]))}
        />

        <section className="rc-panel rc-placa" aria-label="Cuántas llegaron">
          {!grupo || !parada ? (
            <div className="rc-scroll">
              <Vacio
                icono={<PackageOpen />}
                titulo="¿Qué llegó?"
                acciones={
                  <Boton type="button" peso="primario" onClick={() => setHoja({ tipo: "agregar" })}>
                    {sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}
                  </Boton>
                }
              >
                Agrega la primera categoría y cuéntala. Una a la vez; después agregas las demás.
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
              modo={modoDe(parada)}
              abrirNumero={escribirEn === parada.clave}
              anterior={anterior}
              siguiente={siguiente}
              hayFiltroPuesto={hayFiltro(filtro)}
              puedeCerrar={puedeCerrar}
              motivoNoCierra={motivoNoCierra}
              otraCosaAbierta={otraCosa}
              filaSeguir={filaSeguir}
              onPoner={(n) => escribirEnParada(parada, n)}
              onAnterior={(e) => pasarA(anterior, e.timeStamp)}
              onSiguiente={(e) => pasarA(siguiente, e.timeStamp)}
              onEnter={() => {
                if (siguiente) elegir(siguiente, true);
                else requestAnimationFrame(() => filaSeguir.current?.querySelector<HTMLButtonElement>(".btn-primario:not(:disabled)")?.focus());
              }}
              onCerrar={onCerrar}
              onModo={(m) => elegirModo(parada, m)}
              onOtraCosa={() => setOtraCosa((v) => !v)}
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
              otraCosa={
                <PrendasDeLaPlaca
                  parada={parada}
                  abierta={otraCosa || !parada.modelo}
                  onSeparado={(s) => escribirSeparado(grupo, s)}
                  onPrendaDelCatalogo={(p) => llegoPrenda(grupo, p)}
                  onIrAModelo={irAlModelo}
                  onTextoNuevo={(t) => llegoNueva(grupo, t)}
                  onQuitarSueltas={() => aplicar(repartirTotal(grupo, minimoDelGrupo(grupo)))}
                />
              }
              tallas={
                parada.modelo && sepDeLaParada && modoDe(parada) === "ahora" ? (
                  <TallasDeLaPlaca
                    prenda={prendaDeLaParada}
                    cargar={async () => !!(await leerPrenda(grupo, sepDeLaParada.productoId, sepDeLaParada.nombre))}
                    tallasCategoria={tallasDeLaCategoria(grupo)}
                    coloresCatalogo={catalogo?.colores ?? []}
                    contadas={sepDeLaParada.cantidad}
                    traerALaVista={traerTallas}
                    borrador={prendaDeLaParada ? (tablas[parada.clave] ?? borradorDeTallas(prendaDeLaParada, coloresOrden, tallasDeLaCategoria(grupo), sepDeLaParada.variantes)) : null}
                    onCambiar={(t) => prendaDeLaParada && cambiarTabla(parada.clave, prendaDeLaParada, t)}
                    onDejarSuma={(n) => escribirEnParada(parada, n + (parada.modelo?.enStock ?? 0))}
                    onCrear={(pedidas) => setHoja({ tipo: "prenda", grupo: grupo.clave, original: sepDeLaParada, modo: "agregar", prenda: prendaDeLaParada, parada: parada.clave, tabla: true, pedidas })}
                    onCambiarPrenda={() => void cambiarDePrenda(parada, sepDeLaParada)}
                  />
                ) : null
              }
            />
          )}
        </section>

        <ResumenDelEnvio
          cifras={cifras}
          sinAviso={sinAviso}
          filtroEstado={filtro.estado}
          guia={guia}
          responsable={responsable}
          fotos={
            papeles.length > 0 ? (
              <div className="grid gap-1">
                <PapelesDeLaCompra papeles={papeles} alSubirFoto={alSubirFoto} enResumen />
                {papeles.some((p) => !p.fotoRuta) && <p className="rc-fotos-nota">No frena el cierre.</p>}
              </div>
            ) : undefined
          }
          sinGuardar={sinGuardar}
          onReintentar={onReintentar}
          alCerrar={onCerrar}
          textoAlCerrar={textoResumenDelCierre(resumenDelCierre(visibles))}
          puedeCerrar={puedeCerrar}
          motivoNoCierra={motivoNoCierra}
          onFiltroEstado={(e: EstadoDelResumen | null) => cambiarFiltro({ ...filtro, estado: e, tipo: null })}
        />
      </div>

      {hoja?.tipo === "agregar" && (
        <AgregarFueraDeGuia
          catalogo={catalogo}
          proveedores={proveedores}
          sinAviso={sinAviso}
          yaUsadas={yaUsadas}
          errorDelGuardado={errores["extra:0"] ?? null}
          onAgregar={async (nuevo) => {
            const clave = await onAgregar(nuevo);
            if (clave) {
              setAgregados((a) => new Set([...a, clave]));
              setFiltro(SIN_FILTRO);
              setFoco(`${clave}::*`);
            }
            return clave;
          }}
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

      {hoja?.tipo === "crear" && grupoDeHoja?.principal.categoria && lineaDeHoja && (
        <HojaPrenda
          // Lo que se describió al contar se ofrece como nombre, igual que con «Crear ahora» de «Para después».
          destino={{ ...destinoDe(detalle, lineaDeHoja, "nueva", null, proveedores.length), descripcionOrden: hoja.nueva.descripcion || (lineaDeHoja.linea?.descripcion ?? null) }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => prendaDeLaNueva(grupoDeHoja, hoja.parada, hoja.nueva.descripcion, prenda)}
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
          destino={{ ...destinoDe(detalle, lineaDeHoja, hoja.modo, hoja.prenda, proveedores.length), pedidas: hoja.pedidas }}
          categoria={categoriaDeHoja}
          colores={catalogo?.colores ?? []}
          responsable={responsable}
          onListo={(prenda) => {
            if (hoja.tabla) return volverATabla(hoja.parada, grupoDeHoja, hoja.prenda, prenda);
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
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}

/** Cómo va el guardado de lo que se cuenta: guardando si alguna de sus líneas guarda, con error si alguna falló, guardado si todas lo están. */
function estadoDelGrupo(lineas: readonly LineaParaContar[], guardados: Readonly<Record<string, EstadoGuardado>>): EstadoGuardado | null {
  const e = lineas.map((l) => guardados[l.clave]);
  if (e.includes("guardando")) return "guardando";
  if (e.includes("error")) return "error";
  return e.includes("guardado") ? "guardado" : null;
}

/** A dónde va la hoja de la prenda («Es nueva» / «+ talla o color») desde una línea del conteo. */
function destinoDe(detalle: DetalleEnvio, l: LineaParaContar, modo: "nueva" | "agregar", prenda: PrendaRecepcion | null, nProveedores: number): DestinoHoja {
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
    proveedorId: !l.linea && nProveedores >= 2 ? (l.proveedor?.id ?? null) : null,
  };
}
