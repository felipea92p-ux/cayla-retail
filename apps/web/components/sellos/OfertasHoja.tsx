"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, Camera, Check, CheckCheck, ChevronDown, LayoutGrid, Plus, Shirt, Tag, Undo2, X } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Aviso, AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { Boton, Campo, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Casilla } from "@/components/ui/Casilla";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { BotonVerMas } from "@/components/ui/VerMas";
import { Globito } from "@/components/ui/Globito";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { EscanerBusqueda, type RespuestaLectura } from "@/components/EscanerBusqueda";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { Volver } from "@/components/ui/Volver";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { irAlIdCampo } from "@/components/alta-producto/useGuiaAlta";
import { CategoriasDeCampana } from "@/components/campana-hoja/CategoriasDeCampana";
import { ChoquesDeOferta, useChoquesDeOferta } from "@/components/sellos/ChoquesDeOferta";
import type { CategoriaOpcion, Etiqueta } from "@/components/EtiquetasLista";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import type { CampoDeGuia } from "@/lib/guia-campos";
import type { InsigniaDeOferta } from "@/lib/campana-reglas";
import { alcanceCampana, avisoReimprimir, destinoReimprimir, nombreBajoCosto, prendasBajoCosto, prendasQueCambianDePrecioHoy, textoSedesDeCampana, type PrendaConCosto, type TiendaOpcion } from "@/lib/etiqueta-campana";
import { nombreSinSku, unSoloEnvio } from "@/lib/campana-hoja";
import { sumarDias } from "@/lib/fechas-lima";
import { compraDeEjemplo } from "@/lib/compra-de-ejemplo";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { loQueHace, opcionesDeQueLeDas } from "@/lib/oferta-que-le-das";
import { prendaDeCodigo, resumirNombres, sugerirModelos } from "@/lib/oferta-prendas-buscar";
import {
  agregarColorDeVariante,
  alternarColor,
  alternarVariante,
  elegidasDelModelo,
  fijarVariantesDelModelo,
  modelosDeLaSeleccion,
  porColor,
  resumenDeVariantes,
  variantesDichas,
  variantesPorModelo,
} from "@/lib/oferta-variantes";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import { leerPrendasBuscadas } from "@/lib/rebaja-rapida-reglas";
import { fechaCorta, repetirTemporada } from "@/lib/etiqueta-vigencia";
import {
  DIAS_SEMANA,
  FORMA_DE_FABRICA,
  LLEVA_MAX,
  LLEVA_MIN,
  MAX_ESCALONES,
  MAX_INSIGNIAS_SOLO,
  PORCENTAJES_RAPIDOS,
  PORCENTAJE_MAX,
  PORCENTAJE_MIN,
  PORCENTAJE_PASO,
  atajosDeFechas,
  contarPorCategoria,
  contarPrendas,
  cuentaDias,
  diaCorto,
  diasQueCaen,
  esDeGrupo,
  esNombreAutomatico,
  fraseDeOferta,
  problemasDeForma,
  titularDeOferta,
  lista,
  nombreAutomatico,
  nombreDeOferta,
  nombreDia,
  ofertaDesdeRegla,
  ofertaNueva,
  prendasQueAlcanza,
  problemasDeOferta,
  resumenAntes,
  choquesDeFilas,
  choquesSinResolver,
  cesionesQueQuedan,
  tituloDeChoque,
  vigenciaDeRegla,
  type CuerpoGuardarOferta,
  type EscalonDeMonto,
  type OfertaEnEdicion,
  type TipoOferta,
  type ReglaCampana,
  avisoDePorMonto,
  pctEquivalente,
} from "@/lib/campana-reglas";

/* ====================================================================
   «Tres preguntas» · las OFERTAS de una campaña (Felipe 2026-10-23, elegida entre cinco: docs/maquetas/ofertas-promociones-2026-10/formulario/)

   PROMETE: la hoja de UNA oferta de la campaña (ADR-0677, 7c), POR FASES (Felipe 2026-11-18: «ir por fases para que no quede muy extenso» y
   «las cosas muy pequeñas no funcionan»): una pregunta por vez —qué le das · en qué prendas · cuándo y dónde · revisar—, con sus números en
   grande; a la derecha, «En caja», la compra de ejemplo que cambia con cada respuesta. Se abre desde el panel de la campaña: «Nueva oferta»,
   o tocando el cartel de una oferta para editarla (`ofertaInicial`). Guardar, activar o retirar la cierran: lo que quedó se ve en su cartel.
   ASUME: las tiendas y las prendas de una oferta son un subconjunto de las de su campaña. Quien abre esta hoja tiene la llave de campañas y
   activa, cambia y retira sin esperar a un líder (ADR-0534; la base vuelve a exigir la llave). Guardar, activar y retirar van por
   /api/productos/campana-reglas; la base valida todo otra vez.
   NO HACE: no cambia precios por su cuenta ni toca el descuento de la campaña (tiene su cartel y su hoja, `HojaDeDescuento`).
   ==================================================================== */

type Guardando = "borrador" | "activar" | "cambios" | null;
/** El grupo entero que se está eligiendo bajo la lista de prendas: categorías o insignias; `null`, ninguno. */
type VistaPrendas = "cat" | "ins" | null;
/** Cuántas prendas de la oferta se ven sin abrir «Ver las N»: las últimas agregadas (dos filas de tres en escritorio). */
const PRENDAS_A_LA_VISTA = 6;
/** Las fases de la hoja: 1 qué le das · 2 en qué prendas · 3 cuándo y dónde · 4 revisar. */
type Paso = 1 | 2 | 3 | 4;
/** En qué fase se contesta cada cosa que puede faltar (los choques, junto a las tiendas). */
const pasoDeLoQueFalta = (id: string): Paso => (id === "que" ? 1 : id === "categorias" ? 2 : 3);


/** «26 oct» (sin el punto con que `fechaCorta` cierra la abreviatura: la frase pone el suyo). */
const sinPunto = (t: string) => t.replace(/\.$/, "");
const pct = (n: number) => String(n).replace(".", ",");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Un monto en soles de un escalón: se escribe como texto (la coma o el punto a medio escribir no se pierden) y avisa el número. */
function MontoDeEscalon({
  etiqueta,
  valor,
  onValor,
  error,
  onEscribe,
}: {
  etiqueta: string;
  valor: number;
  onValor: (n: number) => void;
  error: boolean;
  /** Entra o sale de la caja: lo mal escrito se dice al salir, no a la primera letra (ADR-0611, mejora 4). */
  onEscribe: (escribe: boolean) => void;
}) {
  const [texto, setTexto] = useState(valor ? String(valor) : "");
  // Si el número cambió desde afuera (se quitó un escalón, se eligió otra forma), el texto lo sigue.
  const [visto, setVisto] = useState(valor);
  if (valor !== visto) {
    setVisto(valor);
    if ((Number(texto.replace(",", ".")) || 0) !== valor) setTexto(valor ? String(valor) : "");
  }
  return (
    <CampoMonto
      etiqueta={etiqueta}
      etiquetaOculta
      sinPie
      className="of-monto-escalon"
      inputMode="decimal"
      value={texto}
      tono={error ? "error" : undefined}
      onFocus={() => onEscribe(true)}
      onBlur={() => onEscribe(false)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, "");
        setTexto(t);
        onValor(Math.round((Number(t.replace(",", ".")) || 0) * 100) / 100);
      }}
    />
  );
}

export function OfertasHoja({
  etiqueta,
  reglas,
  categorias,
  tiendas,
  sedeActualId,
  prendasConCosto,
  variantesManuales,
  insignias = [],
  hoy,
  alGuardarCampana,
  alReglas,
  onClose,
  ofertaInicial = null,
  fotos = null,
  porVariante = false,
}: {
  /** La campaña a la que se le registran las ofertas. */
  etiqueta: Etiqueta;
  /** Las ofertas de ESTA campaña (todas, también las retiradas: el historial se conserva). */
  reglas: ReglaCampana[];
  categorias: CategoriaOpcion[];
  tiendas: TiendaOpcion[];
  /** La sede de quien guarda: el aviso de «reimprime las etiquetas» lleva a imprimir las suyas (ADR-0180, ADR-0486). */
  sedeActualId: string | null;
  prendasConCosto: PrendaConCosto[];
  variantesManuales: string[];
  /** Las insignias que la oferta puede elegir (ADR-0655, por insignia); vacío = no se ofrece «Por insignia». */
  insignias?: InsigniaDeOferta[];
  hoy: string;
  /** La campaña se guardó desde adentro (fechas, categorías, tiendas, descuento): la pantalla actualiza su fila. */
  alGuardarCampana: (cambios: Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "categoriaIds" | "sedeIds">) => void;
  /** La lista fresca de TODAS las ofertas, tal como la devolvió la base tras guardar, activar o retirar. */
  alReglas: (todas: ReglaCampana[]) => void;
  onClose: () => void;
  /** La oferta que se tocó en su cartel (ADR-0677, 7c): la hoja empieza editándola. Sin ella, es una nueva. */
  ofertaInicial?: string | null;
  /** La foto, el color y la categoría de cada prenda (por su id), para dibujarla en «En caja»; sin ellos, la percha (ADR-0333). */
  fotos?: ReadonlyMap<string, { fotoUrl: string | null; colorHex: string | null; colorNombre?: string | null; categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null }> | null;
  /** La base ya guarda una oferta por talla y color (ADR-0682, 20261118232000): cada prenda de la oferta se abre para elegir sus colores y
   *  tallas. Sin ella la hoja no lo ofrece: la base ignoraría el dato y la oferta regiría en más prendas de las que dice. */
  porVariante?: boolean;
}) {
  const campDesde = etiqueta.vigenteDesde;
  const campHasta = etiqueta.vigenteHasta;
  const terminada = campHasta !== null && campHasta < hoy;
  const inicio = campDesde && campDesde > hoy ? campDesde : hoy;
  // Las tiendas donde puede regir una oferta son las de su campaña (ADR-0486). La oferta NO trae ninguna elegida: quien la arma marca las
  // tiendas una por una (si quiere todas, las marca todas). Con una sola tienda posible no hay nada que elegir y ya viene puesta.
  const tiendasDeLaCampana = useMemo(() => (etiqueta.sedeIds.length > 0 ? tiendas.filter((t) => etiqueta.sedeIds.includes(t.id)) : tiendas), [tiendas, etiqueta.sedeIds]);
  const idsDeTiendas = useMemo(() => tiendasDeLaCampana.map((t) => t.id), [tiendasDeLaCampana]);
  const nuevaOferta = (): OfertaEnEdicion => ({ ...ofertaNueva(inicio, campHasta ?? sumarDias(inicio, 6)), sedeIds: idsDeTiendas.length === 1 ? idsDeTiendas : [] });

  const nombreSede = useMemo(() => {
    const mapa = new Map(tiendas.map((t) => [t.id, t.nombre]));
    return (id: string) => mapa.get(id) ?? "";
  }, [tiendas]);
  // Nombra las categorías y también las insignias de la oferta (sus ids no se repiten): el nombre y la frase las dicen igual (`alcanceDicho`).
  const nombreCategoria = useMemo(() => {
    const mapa = new Map([...categorias.map((c) => [c.id, c.nombre] as const), ...insignias.map((i) => [i.id, i.nombre] as const)]);
    return (id: string) => mapa.get(id) ?? "";
  }, [categorias, insignias]);

  // ---- Lo que la campaña tiene: sus prendas a la venta y las categorías con prendas ---------------------------------------------
  const manuales = useMemo(() => new Set(variantesManuales), [variantesManuales]);
  const prendasCampana = useMemo(() => {
    const cats = new Set(etiqueta.categoriaIds);
    return prendasConCosto.filter((p) => (p.categoriaId !== null && cats.has(p.categoriaId)) || manuales.has(p.id));
  }, [prendasConCosto, etiqueta.categoriaIds, manuales]);
  // De qué modelo es cada talla, y las tallas y colores a la venta de cada modelo (ADR-0682): lo que se elige al abrir su ficha. El color
  // sale de la vitrina (`fotos`); la llave del color, de la clave «modelo·color» de la prenda.
  const productoDeVariante = useMemo(() => new Map(prendasConCosto.filter((p) => p.productoId).map((p) => [p.id, p.productoId as string])), [prendasConCosto]);
  const variantesDeModelo = useMemo(() => variantesPorModelo(prendasConCosto, (id) => fotos?.get(id)), [prendasConCosto, fotos]);
  const variantesDe = (id: string) => variantesDeModelo.get(id) ?? [];
  // Las tallas sueltas de una oferta, para su nombre y su frase: un solo modelo se nombra («Blusa Emma (Negro S y M)»), varios se cuentan.
  const nombreDeModelo = useMemo(() => new Map(prendasConCosto.filter((p) => p.productoId).map((p) => [p.productoId as string, p.referencia ?? p.nombre])), [prendasConCosto]);
  const sueltasDe = (variantes: readonly string[]) =>
    variantesDichas(variantes, { modeloDe: (id) => productoDeVariante.get(id), nombreDe: (id) => nombreDeModelo.get(id), variantesDe });
  // La oferta abierta desde su cartel (ADR-0677, 7c): la hoja empieza editándola, como si se hubiera tocado en la lista de antes.
  const reglaInicial = ofertaInicial ? (reglas.find((r) => r.id === ofertaInicial) ?? null) : null;
  const desdeRegla = (r: ReglaCampana): OfertaEnEdicion => ({
    ...ofertaDesdeRegla(r, esNombreAutomatico(r, nombreCategoria, nombreSede, sueltasDe(r.variantesSolo))),
    sedeIds: r.sedeIds.length > 0 ? r.sedeIds : idsDeTiendas,
  });
  const [o, setO] = useState<OfertaEnEdicion>(() => (reglaInicial ? desdeRegla(reglaInicial) : nuevaOferta()));
  // Los modelos que la oferta tiene prenda por prenda: enteros (`productosSolo`) o por sus tallas y colores sueltos (`variantesSolo`,
  // ADR-0682), en el orden en que entraron.
  const idsDeFichas = useMemo(() => modelosDeLaSeleccion(o, (id) => productoDeVariante.get(id)), [o, productoDeVariante]);
  // Cada categoría dice cuántas prendas a la venta trae, como en la hoja de la campaña: son las de TODO el catálogo porque una oferta puede
  // elegir categorías que la campaña no tiene. Una prenda es un modelo en su color (sus tallas cuentan una vez, ADR-0488) y las de Claurè
  // no cuentan salvo que la oferta las incluya a propósito, porque la base no se las baja.
  const cuentaCats = useMemo(() => contarPorCategoria(prendasConCosto, o.incluyeClaure), [prendasConCosto, o.incluyeClaure]);
  const catsCampana = useMemo(() => new Set(etiqueta.categoriaIds), [etiqueta.categoriaIds]);

  // ---- Las fases -------------------------------------------------------------------------------------------------------------------
  // Una pregunta por vez (Felipe 2026-11-18): la actividad 7b de ADR-0677 las había puesto una debajo de la otra y, con todo a la vista, los
  // números quedaban chicos y la hoja, larga. La barra de arriba dice dónde estás y deja saltar; el pie lleva «Siguiente» y, al final, guarda
  // o activa. Al editar se empieza en la primera, con todas abiertas.
  const [elegido, setElegido] = useState(reglaInicial !== null);
  const [paso, setPaso] = useState<Paso>(1);
  const [visitado, setVisitado] = useState<Record<Paso, boolean>>({ 1: false, 2: false, 3: false, 4: false });
  // La fase nueva sube 6 px una vez (ADR-0136); la primera, al abrir la hoja, entra con la cascada de la hoja y no se anima dos veces.
  const [navego, setNavego] = useState(false);
  // Cambiar de fase es otra vista, no un bloque que se encogió (ADR-0185): se suelta la reserva de <PaginaEstable> antes de pintar (su aire
  // al fondo subía el pie fijo a media hoja en el celular), la hoja vuelve arriba si la pregunta nueva quedó fuera de la vista y el foco
  // pasa a su título, sin mover nada.
  const asistente = useRef<HTMLElement | null>(null);
  // Lo único que se desliza desde 640 px: el contenido de la fase (la hoja es de alto fijo, con las fases arriba y el pie abajo siempre a la vista).
  const cuerpo = useRef<HTMLDivElement>(null);
  const pasoPintado = useRef(paso);
  useLayoutEffect(() => {
    if (pasoPintado.current === paso) return;
    pasoPintado.current = paso;
    soltarPaginaEstable();
    // La fase nueva empieza arriba, aunque la anterior se haya dejado a media lista.
    if (cuerpo.current) cuerpo.current.scrollTop = 0;
    const hoja = asistente.current?.closest<HTMLElement>('[role="dialog"]');
    if (!asistente.current || !hoja) return;
    const arriba = asistente.current.getBoundingClientRect().top - hoja.getBoundingClientRect().top;
    // En el celular se desliza la hoja entera. 28 px de aire: el asa tapa los primeros 24.
    if (arriba < 0) hoja.scrollTop += arriba - 28;
    asistente.current.querySelector<HTMLElement>("#oferta-pregunta h2")?.focus({ preventScroll: true });
  }, [paso]);
  // En el celular la hoja entera se desliza y su pie va pegado abajo. Si el contenido se acorta (de «Desde S/ 300» a «3 x 2», quitar un
  // escalón, plegar una familia), <PaginaEstable> reserva ese alto como RELLENO al fondo de la hoja, y el pie pegado se mide desde ese
  // relleno: quedaba flotando a media hoja, encima de los números (Felipe 2026-11-18). Esta hoja tiene un alto constante y no necesita la
  // reserva: se lo dice a <PaginaEstable> con la marca que ya lee (`data-sin-reserva`, como el ticket de Vender). Va al montarse la
  // sección y no en un efecto: la hoja se dibuja en un portal, un paso después que este componente.
  const alMontar = useCallback((el: HTMLElement | null) => {
    asistente.current = el;
    el?.closest('[role="dialog"]')?.setAttribute("data-sin-reserva", "");
  }, []);
  function ir(p: Paso) {
    if (p === paso) return;
    setNavego(true);
    setVisitado((v) => ({ ...v, [paso]: true }));
    setPaso(p);
  }
  // La persona tocó la grilla de categorías (aunque la dejó vacía: vacío es «ninguna», no «las de la campaña»).
  const [tocoCats, setTocoCats] = useState(
    () => reglaInicial !== null && reglaInicial.categoriasSolo.length === 0 && (reglaInicial.productosSolo.length > 0 || reglaInicial.insigniasSolo.length > 0 || reglaInicial.variantesSolo.length > 0),
  );
  // La otra forma de elegir que está abierta en la fase 2 (ADR-0655). En una oferta nueva, ninguna: lo primero es leer o escribir la prenda.
  // Al editar, llega abierta la que la oferta ya usa.
  const [vistaPrendas, setVistaPrendas] = useState<VistaPrendas>(() =>
    !reglaInicial ? null : reglaInicial.categoriasSolo.length > 0 ? "cat" : reglaInicial.insigniasSolo.length > 0 ? "ins" : null,
  );
  const [masQ3, setMasQ3] = useState(false);
  const [soloAlgunosDias, setSoloAlgunosDias] = useState(reglaInicial !== null && reglaInicial.dias.length < 7);
  const [escribeEscalon, setEscribeEscalon] = useState(false);
  const [guardando, setGuardando] = useState<Guardando>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  // Al preguntar «¿Retirar…?», el foco pasa a «No, dejarla» sin mover la hoja: con `autoFocus`, el navegador la desplazaba hasta abajo para
  // mostrar el botón del pie fijo (ADR-0185: la vista no se mueve sola).
  const pieConfirma = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (retirando) pieConfirma.current?.querySelector<HTMLButtonElement>("[data-foco-inicial]")?.focus({ preventScroll: true });
  }, [retirando]);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  // Lo poco que la campaña misma tiene aquí (su descuento de siempre y el límite de tiendas de antes) se toca con las mismas puertas de
  // siempre (`PATCH /api/productos/etiquetas`). Sus FECHAS ya no se cambian aquí sino en «Editar» de su pase (Felipe 2026-10-28). Todo lo
  // demás —cuánto baja, en qué prendas, en qué tiendas y cuándo— es de cada oferta.
  const router = useRouter();
  const repeticion = useMemo(() => repetirTemporada(campDesde, campHasta, hoy), [campDesde, campHasta, hoy]);
  const [guardandoCampana, setGuardandoCampana] = useState(false);
  async function guardarCampana(parche: Partial<Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "sedeIds">>, titulo: string) {
    setGuardandoCampana(true);
    const nueva = {
      descuentoPct: etiqueta.descuentoPct,
      vigenteDesde: etiqueta.vigenteDesde,
      vigenteHasta: etiqueta.vigenteHasta,
      categoriaIds: etiqueta.categoriaIds,
      sedeIds: etiqueta.sedeIds,
      ...parche,
    };
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_campana") },
        // Sin la lista de tiendas (una sola tienda, o la base sin ADR-0486) no se manda nada: no se toca lo que no se vio.
        body: JSON.stringify({ id: etiqueta.id, campana: { ...nueva, ...(tiendas.length > 1 ? {} : { sedeIds: undefined }) } }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar.error((datos as { error?: string }).error ?? "No se pudo guardar la campaña.");
        return;
      }
      // Si guardar cambió HOY el precio en caja de alguna prenda, su etiqueta de papel quedó vieja: el aviso lo dice y lleva a imprimir solo esas (ADR-0180).
      const cambian = prendasQueCambianDePrecioHoy(etiqueta, nueva, prendasConCosto, manuales, hoy, { tiendas, aqui: sedeActualId });
      const destino = destinoReimprimir(cambian, etiqueta.id);
      const reimprimir = avisoReimprimir(cambian, destino !== null);
      avisar.exito(titulo, reimprimir ? { detalle: reimprimir.detalle, accion: destino && reimprimir.boton ? { texto: reimprimir.boton, onClick: () => router.push(destino) } : undefined } : undefined);
      alGuardarCampana(nueva);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardandoCampana(false);
    }
  }

  const editada = o.id ? (reglas.find((r) => r.id === o.id) ?? null) : null;
  const grupo = esDeGrupo(o.tipo);
  // «Gastar un monto y ahorrar» (actividad 8): de toda la compra no elige prendas; de la campaña, sí (como las demás).
  const esMonto = o.tipo === "monto";
  const deTodaLaCompra = esMonto && o.cuenta !== "campana";
  /** Elegir qué le das: la rebaja o una forma de grupo, con lo de fábrica de esa forma (sin tocar el resto de la oferta). */
  const elegirForma = (tipo: TipoOferta) => {
    setElegido(true);
    setO((a) => (a.tipo === tipo ? a : { ...a, ...FORMA_DE_FABRICA[tipo] }));
  };
  const cambiar = (parche: Partial<OfertaEnEdicion>) => setO((a) => ({ ...a, ...parche }));

  // ---- Lo que la oferta alcanzaría y lo que avisa ---------------------------------------------------------------------------------
  const alcanzadas = useMemo(() => prendasQueAlcanza(prendasCampana, prendasConCosto, o), [prendasCampana, prendasConCosto, o]);
  // Bajo el costo, por prenda, en TODA forma (casuística 2026-11-16: antes solo con «un % menos», y un «10 x 1» o un «2 por S/ 10» no avisaban):
  // cada prenda con lo más que la oferta le quita si su grupo se arma con prendas como ella (`pctEquivalente`). Es un aviso: se puede guardar.
  const bajoCosto = useMemo(
    () => alcanzadas.flatMap((p) => prendasBajoCosto(pctEquivalente(o, p.precio), [p], new Set<string>(), new Set([p.id]))),
    [o, alcanzadas],
  );
  // Un «N por S/» con los precios de hoy: en cuántas no ahorra nada y en cuántas regalaría más del 70 % (Felipe 2026-11-16).
  const porMonto = useMemo(() => avisoDePorMonto(o, alcanzadas.map((p) => p.precio)), [o, alcanzadas]);
  const nAlcanza = contarPrendas(alcanzadas);
  // Por debajo del costo se cuenta como se cuentan las prendas (un modelo en su color) y se nombran dos, no dos tallas del mismo.
  const bajoPorModelo = useMemo(() => [...new Map(bajoCosto.map((p) => [p.modelo ?? p.id, p])).values()], [bajoCosto]);
  // La grilla de categorías: las marcadas son las de la oferta; sin ninguna elegida, las de la campaña (menos lo que una oferta vieja deja fuera).
  const categoriasPendientes = !deTodaLaCompra && tocoCats && o.categoriasSolo.length === 0 && o.productosSolo.length === 0 && o.insigniasSolo.length === 0 && o.variantesSolo.length === 0;
  const elegidasSolo = useMemo(
    () => (o.categoriasSolo.length > 0 ? new Set(o.categoriasSolo) : tocoCats ? new Set<string>() : new Set([...catsCampana].filter((id) => !o.categoriasFuera.includes(id)))),
    [o.categoriasSolo, o.categoriasFuera, tocoCats, catsCampana],
  );
  const hayClaure = o.incluyeClaure || prendasConCosto.some((p) => p.deClaure);
  // Las de Claurè que quedan fuera, dentro de lo que la oferta alcanzaría si las incluyera.
  const claureFuera = o.incluyeClaure ? 0 : contarPrendas(prendasQueAlcanza(prendasCampana, prendasConCosto, { ...o, incluyeClaure: true }).filter((p) => p.deClaure));
  const sinTiendas = idsDeTiendas.length === 0; // la lista no llegó (base sin ADR-0486): no hay nada que elegir ni exigir
  const tiendasPendientes = !sinTiendas && o.sedeIds.length === 0;
  // Marcarlas todas es «todas» (la base lo guarda como sin límite, así una tienda nueva no queda fuera): para el nombre y la frase no se nombran.
  const seleccionCompleta = !sinTiendas && idsDeTiendas.every((id) => o.sedeIds.includes(id));
  const sedesQueSeDicen = seleccionCompleta ? [] : o.sedeIds;
  const oDicha: OfertaEnEdicion = { ...o, sedeIds: sedesQueSeDicen };
  const problemas = problemasDeOferta(o, { campanaDesde: campDesde, campanaHasta: campHasta, hoy, original: editada ? { desde: editada.desde, hasta: editada.hasta } : null });
  const diasEnFechas = o.desde && o.hasta && o.desde <= o.hasta ? diasQueCaen(o.desde, o.hasta) : [];
  const diasSueltos = o.dias.length > 0 && o.dias.length < 7;
  const rige = o.desde && o.hasta && o.desde <= o.hasta ? cuentaDias(o.desde, o.hasta, o.dias) : null;
  const sueltas = sueltasDe(o.variantesSolo);
  const nombre = nombreDeOferta(oDicha, nombreCategoria, nombreSede, sueltas);
  const nombreManual = o.nombre.trim() !== "";

  const faltan: CampoDeGuia[] = [];
  // En el orden de los pasos (ADR-0655): qué le das, en qué prendas, y cuándo y dónde.
  const problemaForma = problemasDeForma(o)[0];
  if (!elegido) faltan.push({ id: "que", nombre: "Elegir qué le das al cliente", requerido: true, hecho: false, pendiente: "Elige qué le das al cliente." });
  else if (problemaForma) faltan.push({ id: "que", nombre: "Corregir lo que le das al cliente", requerido: true, hecho: false, pendiente: problemaForma });
  else if (categoriasPendientes) faltan.push({ id: "categorias", nombre: "Elegir las prendas", requerido: true, hecho: false, pendiente: "Agrega una prenda o marca una categoría." });
  else if (problemas.filter((x) => x !== problemaForma).length > 0) {
    const sinDias = /al menos un día de la semana/.test(problemas[0]);
    faltan.push({ id: "cuando", nombre: sinDias ? "Elegir al menos un día de la semana" : "Corregir lo de «¿Cuándo?»", requerido: true, hecho: false, pendiente: problemas.filter((x) => x !== problemaForma)[0] });
  } else if (tiendasPendientes) faltan.push({ id: "tiendas", nombre: "Elegir en qué tiendas rige", requerido: true, hecho: false, pendiente: "Marca al menos una tienda." });
  const puedeGuardar = elegido && !tiendasPendientes && !categoriasPendientes && problemas.length === 0 && !terminada;

  // Una prenda, una oferta por tienda y por día (ADR-0655): con qué choca lo dice la base. Un choque sin resolver no impide guardarla como
  // borrador (no rige), pero sí activarla o cambiar una que ya rige: la base la frenaría igual.
  const filasChoque = useChoquesDeOferta({
    activo: puedeGuardar,
    reglaId: o.id,
    etiquetaId: etiqueta.id,
    desde: o.desde,
    hasta: o.hasta,
    dias: o.dias,
    solo: o.categoriasSolo,
    fuera: o.categoriasFuera,
    productos: o.productosSolo,
    insignias: deTodaLaCompra ? [] : o.insigniasSolo,
    variantes: porVariante ? (deTodaLaCompra ? [] : o.variantesSolo) : null,
    claure: o.incluyeClaure,
    sedes: sedesQueSeDicen,
    monto: esMonto ? { cuenta: o.cuenta ?? "compra" } : null,
    version: reglas,
  });
  const choques = choquesDeFilas(filasChoque ?? [], editada?.ceden ?? []);
  const sinResolver = choquesSinResolver(choques, o.cedeA, esMonto && (o.cedeAOtras ?? false));
  const faltaChoque: CampoDeGuia | null =
    sinResolver.length > 0
      ? { id: "choques", nombre: `Resolver el choque con «${sinResolver[0].nombre}»`, requerido: true, hecho: false, pendiente: tituloDeChoque(sinResolver[0]) }
      : null;
  const cederA = (id: string, cede: boolean) => cambiar({ cedeA: cede ? [...o.cedeA, id] : o.cedeA.filter((x) => x !== id) });
  // La salida del choque de un monto (decisión 3 de Felipe): «que las prendas con otra oferta no cuenten».
  const salidaDelMonto = esMonto ? { cede: o.cedeAOtras ?? false, onCeder: (cede: boolean) => cambiar({ cedeAOtras: cede }) } : null;

  // Lo que se ve como botón siempre contesta: «Falta: …» y los botones que avanzan o guardan LLEVAN a la pieza que falta (la dejan a la vista, la
  // destellan y, si es una lista de opciones, le dan el foco) en vez de quedarse apagados sin decir por qué (ADR-0284; `Boton confirma`, ADR-0611).
  function llevarA(c: CampoDeGuia | undefined) {
    if (!c) return;
    // Un choque se resuelve donde se está si ya se ve (en «Cuándo y dónde» y en «Revisar»); lo demás, en su fase.
    const destino: Paso = c.id === "choques" && paso >= 3 ? paso : pasoDeLoQueFalta(c.id);
    // Lleva al campo: lo deja a la vista, lo destella y, si es la fila de opciones, le da el foco.
    const mover = () => {
      irAlIdCampo(`oferta-${c.id}`, { enModal: true });
      if (c.id === "que") document.querySelector<HTMLElement>('[data-campo="oferta-que"] button:not([aria-disabled="true"])')?.focus({ preventScroll: true });
    };
    if (destino !== paso) {
      ir(destino);
      window.setTimeout(mover, 150); // la fase nueva se dibuja en el siguiente cuadro
    } else mover();
  }
  const confirmaPaso = (puede: boolean) => ({ puedeConfirmar: puede, revisar: () => { llevarA(faltan[0]); return false; } });
  // Activar (o guardar una que ya rige) además pide que no quede un choque sin resolver.
  const confirmaRegir = (puede: boolean) => ({ puedeConfirmar: puede && !faltaChoque, revisar: () => { llevarA(faltan[0] ?? faltaChoque ?? undefined); return false; } });

  // ---- Lo que guarda ------------------------------------------------------------------------------------------------------------
  async function llamar(metodo: "POST" | "PATCH", cuerpo: unknown): Promise<{ ok: true; id: string | null } | { ok: false }> {
    try {
      const res = await fetch("/api/productos/campana-reglas", {
        method: metodo,
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_campana") },
        body: JSON.stringify(cuerpo),
      });
      const datos = (await res.json().catch(() => ({}))) as { error?: string; id?: string; reglas?: ReglaCampana[]; avisoLectura?: string | null };
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la oferta.");
        return { ok: false };
      }
      // Si la base guardó pero no pudo releer la lista, se conserva la que ya se veía y se dice.
      if (datos.avisoLectura) avisar.aviso("Se guardó, pero no se pudo actualizar la lista. Recarga la pantalla.");
      else if (datos.reglas) alReglas(datos.reglas);
      return { ok: true, id: datos.id ?? null };
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
      return { ok: false };
    }
  }

  // Guardar, activar o retirar cierran la hoja (ADR-0677, 7c): lo que quedó se ve en su cartel, en el panel de la campaña. Cada uno pasa por
  // un candado de un solo envío: tres clics en el mismo instante mandaban tres ofertas iguales, porque `guardando` aún no había apagado el
  // botón (chaos 2026-11-18; el mismo candado de la hoja de la campaña, `unSoloEnvio`).
  const [unaVez] = useState(unSoloEnvio);
  async function guardar(activar: boolean, cerrar: () => void) {
    if (!puedeGuardar || guardando) return;
    await unaVez(() => enviarOferta(activar, cerrar));
  }
  async function enviarOferta(activar: boolean, cerrar: () => void) {
    const cuerpo: CuerpoGuardarOferta = {
      id: o.id,
      etiquetaId: etiqueta.id,
      nombre,
      porcentaje: o.porcentaje,
      forma: {
        tipo: o.tipo,
        lleva: o.lleva,
        paga: o.paga,
        monto: o.monto,
        agrupa: o.agrupa,
        ...(esMonto ? { escalones: o.escalones ?? [], ahorroEn: o.ahorroEn ?? "soles", cuenta: o.cuenta ?? "compra", cedeAOtras: o.cedeAOtras ?? false } : {}),
      },
      // Una que tenía otra forma (de grupo o un monto) va por la función que guarda la forma, aunque vuelva a «un % menos».
      eraDeGrupo: editada ? editada.tipo !== "pct" : false,
      desde: o.desde,
      hasta: o.hasta,
      dias: o.dias,
      categoriasSolo: o.categoriasSolo,
      categoriasFuera: o.categoriasFuera,
      productosSolo: o.productosSolo,
      teniaModelos: (editada?.productosSolo.length ?? 0) > 0,
      // Un monto de toda la compra no elige prendas: la base le quita las insignias igual.
      insigniasSolo: deTodaLaCompra ? [] : o.insigniasSolo,
      teniaInsignias: (editada?.insigniasSolo.length ?? 0) > 0,
      // Las tallas y colores sueltos (ADR-0682): solo si la base ya los guarda; un monto de toda la compra no elige prendas.
      variantesSolo: porVariante && !deTodaLaCompra ? o.variantesSolo : [],
      teniaVariantes: (editada?.variantesSolo.length ?? 0) > 0,
      cedeA: cesionesQueQuedan(choques, o.cedeA),
      teniaCesiones: (editada?.ceden.length ?? 0) > 0,
      sedeIds: o.sedeIds,
      incluyeClaure: o.incluyeClaure,
      activar,
    };
    setGuardando(activar ? "activar" : o.id ? "cambios" : "borrador");
    const r = await llamar("POST", cuerpo);
    setGuardando(null);
    if (!r.ok) return;
    const cuando = o.desde > hoy ? `desde el ${sinPunto(fechaCorta(o.desde))}` : "desde ahora";
    if (activar) avisar.exito("Oferta activada", { detalle: `«${nombre}» rige ${cuando} en caja y en la tienda web.` });
    else if (o.id) avisar.exito("Cambios guardados", { detalle: "Valen desde ahora; lo que ya se vendió se queda como estaba." });
    else avisar.exito("Oferta guardada como borrador", { detalle: "Actívala cuando quieras que empiece a bajar el precio." });
    cerrar();
  }

  async function retirarRegla(r: ReglaCampana, cerrar: () => void) {
    await unaVez(async () => {
      setTrabajando(r.id);
      const res = await llamar("PATCH", { id: r.id, accion: "retirar" });
      setTrabajando(null);
      setRetirando(null);
      if (res.ok) {
        cerrar();
        avisar.exito("Oferta retirada", { detalle: `«${r.nombre}» deja de bajar el precio. Queda en el historial.` });
      }
    });
  }

  // ---- Piezas pequeñas --------------------------------------------------------------------------------------------------------------
  const alternarEn = (lista_: string[], id: string) => (lista_.includes(id) ? lista_.filter((x) => x !== id) : [...lista_, id]);
  // La selección de categorías de la hoja (la de producción). Si queda igual a las de la campaña es «las de la campaña» (sin lista: las que se
  // sumen después entran solas y las marcadas a mano también); si no, es una lista de la oferta. Sin ninguna es «ninguna», y no deja guardar.
  function fijarCategorias(siguiente: ReadonlySet<string>) {
    const comoLaCampana = o.productosSolo.length === 0 && o.insigniasSolo.length === 0 && o.variantesSolo.length === 0 && siguiente.size === catsCampana.size && [...siguiente].every((id) => catsCampana.has(id));
    cambiar({ categoriasSolo: comoLaCampana ? [] : [...siguiente], categoriasFuera: [] });
    setTocoCats(!comoLaCampana);
  }
  const alternarCategoria = (id: string) => {
    const siguiente = new Set(elegidasSolo);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    fijarCategorias(siguiente);
  };
  // Por insignia (ADR-0655): la oferta rige en las prendas que llevan la insignia. La primera, si nadie tocó las categorías, deja la oferta
  // solo en ella —no en «la insignia y todas las categorías de la campaña»—: lo que se ve marcado es lo que rige.
  const alternarInsignia = (id: string) => {
    const tiene = o.insigniasSolo.includes(id);
    const insigniasSolo = tiene ? o.insigniasSolo.filter((x) => x !== id) : [...o.insigniasSolo, id];
    if (!tiene && o.insigniasSolo.length === 0 && o.productosSolo.length === 0 && o.variantesSolo.length === 0 && o.categoriasSolo.length === 0 && !tocoCats) {
      cambiar({ insigniasSolo, categoriasSolo: [], categoriasFuera: [] });
      setTocoCats(true);
    } else cambiar({ insigniasSolo });
  };

  // La casilla de «toda la familia»: marca o quita sus categorías de un toque.
  const alternarFamilia = (ids: string[], marcar: boolean) => {
    const siguiente = new Set(elegidasSolo);
    for (const id of ids) {
      if (marcar) siguiente.add(id);
      else siguiente.delete(id);
    }
    fijarCategorias(siguiente);
  };

  // ---- Pregunta 1: «Qué le das» (ADR-0677, 7a) -------------------------------------------------------------------------------------
  // Las cinco formas en una fila, y el ejemplo ES la opción (`opcionesDeQueLeDas`); debajo, los números de la elegida, ahí mismo. «Regalo» y
  // «Club» salieron hasta que funcionen (Felipe 2026-11-17), y con ellos los «· pronto» y los párrafos de ayuda.
  function pregunta1() {
    return (
      <>
        <h2 tabIndex={-1}>¿Qué le das al cliente?</h2>
        <div className="of-tipos-caja">
        <div className="of-tipos" role="group" aria-label="Qué le das al cliente" data-campo="oferta-que">
          {opcionesDeQueLeDas(o, elegido).map((x) => (
            <button
              key={x.tipo}
              type="button"
              className="of-tipo"
              aria-pressed={x.elegida}
              onClick={() => elegirForma(x.tipo)}
              data-guia={x.tipo === "pct" ? "sellos.oferta-rebaja" : x.tipo === "nxm" ? "sellos.oferta-varias" : x.tipo === "monto" ? "sellos.oferta-monto" : undefined}
            >
              <span className="of-tipo-glifo">{x.glifo}</span>
              <span className="of-tipo-linea">{x.linea}</span>
            </button>
          ))}
        </div>
        </div>
        {/* El escenario (Felipe 2026-11-18: «muy plano» y «todo más centrado»): lo importante de la fase en una placa de vidrio al centro. Arriba
            los números; debajo, lo que hacen dicho como se lo dirías al cliente (`loQueHace`; calla si todavía no arman una oferta); y al pie,
            la caja cobrando una compra de ejemplo. */}
        {elegido && (
          <div className="of-escena">
            <div className="of-grupo">
              {o.tipo === "monto" ? formaDeMonto() : grupo ? formaDeGrupo() : formaDePct()}
              {!problemasDeForma(o)[0] && loQueHace(o) !== "" && (
                <p className="of-dice" aria-live="polite">
                  {loQueHace(o)}
                </p>
              )}
            </div>
            {enCaja()}
          </div>
        )}
      </>
    );
  }

  // ---- «Un % menos»: cuánto ----------------------------------------------------------------------------------------------------------
  function formaDePct() {
    return (
      <div>
        <Campo
          etiqueta="Cuánto menos"
          tono={bajoPorModelo.length > 0 ? "error" : "neutro"}
          sinPie={bajoPorModelo.length === 0}
          pie={
            bajoPorModelo.length > 0
              ? `Por debajo del costo: ${plural(bajoPorModelo.length, "prenda", "prendas")} (${bajoPorModelo.slice(0, 2).map(nombreBajoCosto).join(", ")}${bajoPorModelo.length > 2 ? "…" : ""}). Se puede guardar igual.`
              : undefined
          }
        >
          <div className="of-ctl">
            <PasoCantidad
              tamano="grande"
              sufijo="%"
              className="of-numero of-numero-pct"
              tono={bajoPorModelo.length > 0 ? "error" : undefined}
              menos={{ onClick: () => cambiar({ porcentaje: Math.max(PORCENTAJE_MIN, o.porcentaje - PORCENTAJE_PASO) }), deshabilitado: o.porcentaje <= PORCENTAJE_MIN, etiqueta: "Bajar el descuento" }}
              mas={{ onClick: () => cambiar({ porcentaje: Math.min(PORCENTAJE_MAX, o.porcentaje + PORCENTAJE_PASO) }), deshabilitado: o.porcentaje >= PORCENTAJE_MAX, etiqueta: "Subir el descuento" }}
              data-guia="sellos.oferta-pct"
            >
              {/* Sin el «−» delante: al lado del botón de restar se leía «− −20». Que es «menos» lo dice el nombre del campo. */}
              {pct(o.porcentaje)}
            </PasoCantidad>
            <div role="group" aria-label="Descuentos de siempre" className="of-opciones">
              {PORCENTAJES_RAPIDOS.map((v) => (
                <button key={v} type="button" className="pildora-cayla tabular-nums" aria-pressed={o.porcentaje === v} onClick={() => cambiar({ porcentaje: v })}>
                  {v} %
                </button>
              ))}
            </div>
          </div>
        </Campo>
      </div>
    );
  }

  // ---- «Llevar varias y pagar menos»: la forma y sus números (ADR-0655, actividad 6) -------------------------------------------------
  function formaDeGrupo() {
    const problema = problemasDeForma(o)[0];
    const n = (valor: number, cambiarA: (v: number) => void, min: number, max: number, que: string, guia?: string, sufijo?: string) => (
      <PasoCantidad
        tamano="grande"
        sufijo={sufijo}
        className="of-numero"
        tono={problema ? "error" : undefined}
        menos={{ onClick: () => cambiarA(Math.max(min, valor - 1)), deshabilitado: valor <= min, etiqueta: `Una ${que} menos` }}
        mas={{ onClick: () => cambiarA(Math.min(max, valor + 1)), deshabilitado: valor >= max, etiqueta: `Una ${que} más` }}
        data-guia={guia}
      >
        {valor}
      </PasoCantidad>
    );
    return (
      <>
        <div className="of-frase-campos of-frase-grande" data-campo="oferta-que" data-guia="sellos.oferta-forma">
          {o.tipo === "nxm" ? (
            <>
              {/* Cada palabra va con su número (`of-par`): si no caben los dos pares en un renglón, baja el par entero, nunca el número solo. */}
              <span className="of-par">
                <span>Lleva</span>
                {n(o.lleva, (v) => cambiar({ lleva: v, paga: Math.min(o.paga, v - 1) }), LLEVA_MIN, LLEVA_MAX, "prenda", "sellos.oferta-lleva")}
              </span>
              <span className="of-par">
                <span>y paga</span>
                {n(o.paga, (v) => cambiar({ paga: v }), 1, o.lleva - 1, "pagada")}
              </span>
            </>
          ) : o.tipo === "n_por_monto" ? (
            <>
              <span className="of-par">
                <span>Lleva</span>
                {n(o.lleva, (v) => cambiar({ lleva: v }), LLEVA_MIN, LLEVA_MAX, "prenda", "sellos.oferta-lleva")}
              </span>
              <span className="of-par">
              <span>por</span>
              <CampoMonto
                etiqueta="Precio del grupo"
                etiquetaOculta
                sinPie={!problema}
                pie={problema}
                className="of-monto"
                inputMode="decimal"
                value={o.monto ? String(o.monto) : ""}
                onChange={(e) => cambiar({ monto: Number(e.target.value.replace(",", ".")) || 0 })}
                tono={problema ? "error" : undefined}
              />
              </span>
            </>
          ) : (
            <>
              <span className="of-par">
                <span>La</span>
                {n(o.lleva, (v) => cambiar({ lleva: v }), LLEVA_MIN, LLEVA_MAX, "prenda", "sellos.oferta-lleva", ".ª")}
              </span>
              <span className="of-par">
              <span>prenda con</span>
              <PasoCantidad
                tamano="grande"
                sufijo="%"
                className="of-numero of-numero-pct"
                tono={problema ? "error" : undefined}
                menos={{ onClick: () => cambiar({ porcentaje: Math.max(PORCENTAJE_PASO, o.porcentaje - PORCENTAJE_PASO) }), deshabilitado: o.porcentaje <= PORCENTAJE_PASO, etiqueta: "Bajar el descuento" }}
                mas={{ onClick: () => cambiar({ porcentaje: Math.min(100, o.porcentaje + PORCENTAJE_PASO) }), deshabilitado: o.porcentaje >= 100, etiqueta: "Subir el descuento" }}
              >
                {pct(o.porcentaje)}
              </PasoCantidad>
              <span>menos</span>
              </span>
            </>
          )}
        </div>
      </>
    );
  }

  // ---- «Gastar un monto y ahorrar»: sus escalones (ADR-0655, actividad 8) -------------------------------------------------------------
  function formaDeMonto() {
    // Mientras se escribe en una caja no se dice el error (el «Falta:» del pie sí lo sabe y no deja seguir).
    const problema = escribeEscalon ? undefined : problemasDeForma(o)[0];
    const escalones = o.escalones ?? [];
    const en = o.ahorroEn ?? "soles";
    const fijar = (i: number, parche: Partial<EscalonDeMonto>) => cambiar({ escalones: escalones.map((e, j) => (j === i ? { ...e, ...parche } : e)) });
    // El escalón que sigue propone el doble del último (S/ 300 → 30 lleva a S/ 600 → 60): siempre más y ahorrando más.
    const otro = () => {
      const u = escalones.at(-1) ?? { desde: 150, ahorra: 15 };
      cambiar({ escalones: [...escalones, { desde: u.desde * 2, ahorra: en === "pct" ? Math.min(PORCENTAJE_MAX, u.ahorra + PORCENTAJE_PASO) : u.ahorra * 2 }] });
    };
    return (
      <>
        <div className="of-sub">
          <span className="of-lbl">Cuánto ahorra</span>
          <div className="of-opciones" role="group" aria-label="Cuánto ahorra">
            <button type="button" className="pildora-cayla" aria-pressed={en === "soles"} onClick={() => cambiar({ ahorroEn: "soles" })}>
              Soles menos
            </button>
            <button type="button" className="pildora-cayla" aria-pressed={en === "pct"} onClick={() => cambiar({ ahorroEn: "pct", escalones: escalones.map((e, i) => ({ ...e, ahorra: Math.min(PORCENTAJE_MAX, (i + 1) * 10) })) })}>
              Un % menos
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3" data-campo="oferta-que" data-guia="sellos.oferta-escalones">
          {escalones.map((e, i) => (
            <div key={i} className="of-frase-campos of-frase-media">
              <span>Desde</span>
              <MontoDeEscalon etiqueta={`Monto del escalón ${i + 1}`} valor={e.desde} onValor={(v) => fijar(i, { desde: v })} error={Boolean(problema)} onEscribe={setEscribeEscalon} />
              <span>ahorra</span>
              {en === "soles" ? (
                <MontoDeEscalon etiqueta={`Ahorro del escalón ${i + 1}`} valor={e.ahorra} onValor={(v) => fijar(i, { ahorra: v })} error={Boolean(problema)} onEscribe={setEscribeEscalon} />
              ) : (
                <PasoCantidad
                  tamano="grande"
                  sufijo="%"
                  className="of-numero of-numero-pct"
                  tono={problema ? "error" : undefined}
                  menos={{ onClick: () => fijar(i, { ahorra: Math.max(PORCENTAJE_PASO, e.ahorra - PORCENTAJE_PASO) }), deshabilitado: e.ahorra <= PORCENTAJE_PASO, etiqueta: "Bajar el descuento" }}
                  mas={{ onClick: () => fijar(i, { ahorra: Math.min(PORCENTAJE_MAX, e.ahorra + PORCENTAJE_PASO) }), deshabilitado: e.ahorra >= PORCENTAJE_MAX, etiqueta: "Subir el descuento" }}
                >
                  {pct(e.ahorra)}
                </PasoCantidad>
              )}
              {i > 0 && (
                <button type="button" className="btn-cayla btn-sutil btn-chico area-dedo" aria-label={`Quitar el escalón ${i + 1}`} onClick={() => cambiar({ escalones: escalones.filter((_, j) => j !== i) })}>
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {problema && (
            <Aviso tono="error" chico>
              {problema}
            </Aviso>
          )}
          {escalones.length < MAX_ESCALONES && (
            <span className="flex justify-center">
              <button type="button" className="btn-cayla btn-secundario" onClick={otro}>
                <Plus aria-hidden className="h-4 w-4" /> Otro escalón
              </button>
            </span>
          )}
        </div>
      </>
    );
  }

  // ---- Dónde rige (se contesta en «¿Cuándo y dónde?») ------------------------------------------------------------------------------
  const dondeRige = textoSedesDeCampana(etiqueta.sedeIds, tiendas) ?? "En todas las tiendas";
  // «Dónde rige», como en la hoja de la campaña: una pastilla por tienda. Aquí no hay «Todas las sedes» (Felipe 2026-10-23): quien la quiere
  // en todas las marca todas, y la oferta queda sin límite de tiendas.
  const chipsDeTiendas =
    tiendasDeLaCampana.length > 1 ? (
      <div className="of-opciones" role="group" aria-label="Tiendas donde rige la oferta" data-guia="sellos.oferta-tiendas">
        {tiendasDeLaCampana.map((t) => (
          <button key={t.id} type="button" className="pildora-cayla" aria-pressed={o.sedeIds.includes(t.id)} onClick={() => cambiar({ sedeIds: alternarEn(o.sedeIds, t.id) })}>
            {t.nombre}
          </button>
        ))}
      </div>
    ) : null;
  const textoDonde = sinTiendas
    ? `${dondeRige}.`
    : tiendasPendientes
      ? "Marca al menos una tienda."
      : seleccionCompleta
        ? "Rige en todas las tiendas."
        : `${textoSedesDeCampana(o.sedeIds, tiendas)}: en las demás tiendas se cobra el precio normal.`;

  // ---- Pregunta 2 · ¿Cuándo y dónde? --------------------------------------------------------------------------------------------------
  const atajos = useMemo(() => atajosDeFechas(inicio, campHasta, hoy), [inicio, campHasta, hoy]);
  const algunos = soloAlgunosDias || diasSueltos;
  const errorFechas = problemas.find((p) => /fecha|empieza|termina|inicio|campaña|año/i.test(p));

  function dias2() {
    return (
      <div className="of-sem" data-guia="sellos.oferta-dias">
        <div className="of-semf">
          <span className="of-lbl">Días</span>
          <button
            type="button"
            className="pildora-cayla"
            aria-pressed={!algunos}
            onClick={() => {
              cambiar({ dias: [...DIAS_SEMANA] });
              setSoloAlgunosDias(false);
            }}
          >
            Todos los días
          </button>
          <button
            type="button"
            className="pildora-cayla"
            aria-pressed={algunos}
            onClick={() => {
              setSoloAlgunosDias(true);
              // Venían todos marcados: se empieza de cero para que «solo martes y jueves» sea dos toques y no cinco.
              if (o.dias.length === 7) cambiar({ dias: [] });
            }}
          >
            Solo algunos días
          </button>
          {algunos && (
            <>
              <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => cambiar({ dias: [1, 2, 3, 4, 5] })}>
                Lun–vie
              </button>
              <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => cambiar({ dias: [6, 7] })}>
                Sáb y dom
              </button>
            </>
          )}
        </div>
        {algunos && (
          <>
            <div className="of-dias" role="group" aria-label="Días de la semana en que rige">
              {DIAS_SEMANA.map((d) => {
                const cae = diasEnFechas.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className="of-dia"
                    aria-pressed={o.dias.includes(d)}
                    data-fuera={cae ? undefined : ""}
                    title={`${nombreDia(d)}${cae ? "" : ": no cae en estas fechas"}`}
                    onClick={() => cambiar({ dias: alternarEn(o.dias.map(String), String(d)).map(Number).sort((a, b) => a - b) })}
                  >
                    {diaCorto(d)}
                  </button>
                );
              })}
            </div>
            {o.dias.length === 0 && <p className="of-pequeno mt-1.5">Toca los días en que rige.</p>}
          </>
        )}
      </div>
    );
  }

  function preguntaCuando() {
    return (
      <>
        <h2 tabIndex={-1}>¿Cuándo y dónde?</h2>
        <div className="of-escena">
        <div className="of-sub">
        <span className="of-lbl">Fechas</span>
        {atajos.length > 0 && (
          <div className="of-opciones" role="group" aria-label="Fechas de siempre">
            {atajos.map((a) => (
              <button key={a.texto} type="button" className="pildora-cayla" aria-pressed={o.desde === a.desde && o.hasta === a.hasta} onClick={() => cambiar({ desde: a.desde, hasta: a.hasta })}>
                {a.texto}
              </button>
            ))}
          </div>
        )}
        <div className="of-fechas" data-campo="oferta-cuando">
          <CampoFecha etiqueta="Desde" valor={o.desde} onValor={(v) => cambiar({ desde: v })} tono={errorFechas ? "error" : undefined} />
          <CampoFecha etiqueta="Hasta" valor={o.hasta} onValor={(v) => cambiar({ hasta: v })} tono={errorFechas ? "error" : undefined} pie={errorFechas} />
        </div>
        </div>
        {dias2()}
        <div className="of-donde" data-campo="oferta-tiendas">
          <span className="of-lbl">Dónde rige</span>
          {chipsDeTiendas}
          <p className="of-pequeno mt-1.5" aria-live="polite">
            {textoDonde} La tienda web cobra lo mismo y no se elige aparte.
          </p>
        </div>
        <div data-campo="oferta-choques" data-guia="sellos.oferta-choques">
          <ChoquesDeOferta choques={choques} leido={filasChoque !== null} cedeA={o.cedeA} onCeder={cederA} monto={salidaDelMonto} />
        </div>
        </div>
      </>
    );
  }

  // ---- Pregunta 3 · ¿En qué prendas? ----------------------------------------------------------------------------------------------------
  // La frase de producción bajo «Categorías»: «Alcanza a 47 prendas a la venta: 3 de 1 categoría y 44 marcadas a mano.»
  const alcanceTexto = (() => {
    if (categoriasPendientes) return "Agrega una prenda o marca una categoría.";
    const claure = claureFuera > 0 ? ` ${plural(claureFuera, "prenda", "prendas")} de Claurè ${claureFuera === 1 ? "queda" : "quedan"} fuera.` : "";
    const comoLaCampana = o.categoriasSolo.length === 0 && idsDeFichas.length === 0 && o.insigniasSolo.length === 0;
    if (comoLaCampana && prendasCampana.length === 0) return "La campaña todavía no tiene prendas: marca las categorías o las prendas de esta oferta.";
    if (idsDeFichas.length > 0 || o.insigniasSolo.length > 0) {
      const partes = [
        o.categoriasSolo.length > 0 ? plural(o.categoriasSolo.length, "categoría", "categorías") : "",
        idsDeFichas.length > 0 ? plural(idsDeFichas.length, "modelo elegido", "modelos elegidos") : "",
        o.insigniasSolo.length > 0 ? plural(o.insigniasSolo.length, "insignia", "insignias") : "",
      ].filter(Boolean);
      return `Alcanza a ${plural(nAlcanza, "prenda", "prendas")} a la venta: las de ${lista(partes)}.${claure}`;
    }
    const delCatalogo = prendasConCosto.filter((p) => o.incluyeClaure || !p.deClaure);
    const a = alcanceCampana(delCatalogo, elegidasSolo, comoLaCampana ? manuales : new Set<string>());
    const partes = [a.porCategoria > 0 ? `${a.porCategoria} de ${plural(elegidasSolo.size, "categoría", "categorías")}` : "", a.aMano > 0 ? `${plural(a.aMano, "marcada", "marcadas")} a mano` : ""].filter(Boolean);
    return `Alcanza a ${plural(nAlcanza, "prenda", "prendas")} a la venta${partes.length > 0 ? `: ${partes.join(" y ")}` : ""}.${claure}`;
  })();
  // Las insignias para elegir: las activas y aprobadas, más las ya elegidas que se desactivaron (para poder quitarlas). Cada una con cuántas
  // prendas a la venta lleva (un modelo en su color, sin Claurè salvo que la oferta lo incluya).
  const insigniasParaElegir = useMemo(
    () =>
      insignias
        .filter((i) => i.activa || o.insigniasSolo.includes(i.id))
        .map((i) => ({ ...i, prendas: contarPrendas(prendasConCosto.filter((p) => (o.incluyeClaure || !p.deClaure) && (p.insignias ?? []).includes(i.id))) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [insignias, prendasConCosto, o.insigniasSolo, o.incluyeClaure],
  );

  // Los modelos que se pueden elegir uno por uno: cada producto con todas sus tallas y colores, de todo el catálogo a la venta (ADR-0655).
  // `prendaId` es una de sus tallas: con ella se busca su foto.
  const modelos = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; categoriaId: string | null; precio: number; colores: Set<string>; deClaure: boolean; prendaId: string }>();
    for (const p of prendasConCosto) {
      if (!p.productoId) continue;
      const x = m.get(p.productoId) ?? { id: p.productoId, nombre: p.referencia ?? p.nombre, categoriaId: p.categoriaId, precio: p.precio, colores: new Set<string>(), deClaure: Boolean(p.deClaure), prendaId: p.id };
      x.precio = Math.min(x.precio, p.precio);
      x.colores.add(p.modelo ?? p.id);
      m.set(p.productoId, x);
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [prendasConCosto]);
  const modeloDe = useMemo(() => new Map(modelos.map((m) => [m.id, m])), [modelos]);
  // La prenda abierta para elegir sus colores y tallas (una a la vez, bajo el mosaico).
  const [abierta, setAbierta] = useState<string | null>(null);
  const miniaturaDe = (prendaId: string | undefined, tamano: "sm" | "md" = "md") => {
    const f = prendaId ? fotos?.get(prendaId) : undefined;
    return <MiniaturaPrenda fotoUrl={f?.fotoUrl ?? null} colorHex={f?.colorHex ?? null} tamano={tamano} prefijo={f?.categoria?.prefijo} familia={f?.categoria?.familia} categoria={f?.categoria?.nombre} />;
  };

  // ---- Agregar una prenda leyéndola o escribiéndola (Felipe 2026-11-18) ---------------------------------------------------------------
  // En tienda una prenda se agrega, primero, leyendo su etiqueta —con la pistola (escribe el código y Enter) o con la cámara del teléfono— y,
  // después, por su nombre. Por eso es lo primero y lo más grande de la fase; las categorías y las insignias quedan a un toque, debajo. Por
  // su nombre entra el MODELO, con todas sus tallas y colores (ADR-0655); por su etiqueta, ESE COLOR con todas sus tallas (ADR-0682). Una
  // talla suelta se elige abriendo la ficha de la prenda.
  const idSugeridas = useId();
  const buscadorDePrendas = useRef<HTMLInputElement>(null);
  const [qPrenda, setQPrenda] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  // `deshacer`: la prenda recién agregada y las tallas que tenía antes (ninguna si no estaba), para devolverla a como estaba.
  const [ultimaLeida, setUltimaLeida] = useState<{ tono: "verde" | "ambar"; texto: string; deshacer?: { id: string; antes: string[] } } | null>(null);
  // La prenda recién agregada: su fila se marca en la lista para que se vea dónde quedó.
  const [recien, setRecien] = useState<string | null>(null);
  const [verTodasLasElegidas, setVerTodasLasElegidas] = useState(false);
  // Las prendas marcadas para quitarlas juntas (se toca su ficha). Solo cuentan las que siguen en la oferta.
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const marcadasAhora = idsDeFichas.filter((id) => marcadas.has(id));
  const alternarMarcada = (id: string) =>
    setMarcadas((a) => {
      const b = new Set(a);
      if (!b.delete(id)) b.add(id);
      return b;
    });
  const [camara, setCamara] = useState(false);
  const [respuestaCam, setRespuestaCam] = useState<RespuestaLectura | null>(null);
  const [agregadasCam, setAgregadasCam] = useState(0);
  const lecturas = useRef(0);
  const sugeridas = useMemo(() => sugerirModelos(modelos, qPrenda, nombreCategoria), [modelos, qPrenda, nombreCategoria]);
  const entraPorCategoria = (m: { categoriaId: string | null }) => m.categoriaId !== null && elegidasSolo.has(m.categoriaId);
  // La sugerencia que toma el Enter: la primera que todavía NO está en la oferta. Sobre una que ya está, «Enter» junto a «Quitar» se leía
  // como que Enter la quitaba; quitar es solo con el mouse o el dedo.
  const sugeridaActiva = (() => {
    const i = sugeridas.findIndex((m) => !idsDeFichas.includes(m.id) && !entraPorCategoria(m));
    return i < 0 ? null : i;
  })();

  // La oferta tal como va, también entre un render y el siguiente: la pistola lee más rápido de lo que la base contesta, y cada lectura
  // tiene que sumarse a la anterior, no a la foto del momento en que se leyó (probado: la segunda prenda pisaba a la primera).
  const vivo = useRef({ o, tocoCats });
  useLayoutEffect(() => {
    vivo.current = { o, tocoCats };
  });
  type Leida = { tono: "verde" | "ambar"; estado: string; titulo: string; agregada?: { id: string; antes: string[] }; porColor?: boolean };
  /**
   * Suma la prenda a la oferta y dice qué pasó. Por su nombre entra el MODELO, con todas sus tallas y colores; por su etiqueta (`leida`, la
   * talla y color que se leyó) entra ESE COLOR con todas sus tallas (Felipe 2026-11-18, ADR-0682): quien lee tiene en la mano una prenda de
   * un color. La regla (ADR-0655): elegir la primera prenda deja la oferta en lo que se marca —las categorías que se veían y esa prenda—,
   * ya no en «todas las de la campaña» (la base no puede sumar las dos cosas). Por eso, si nadie tocó las categorías, se fijan las que se veían.
   */
  function agregarModelo(id: string, leida: string | null = null): Leida {
    const { o: a, tocoCats: toco } = vivo.current;
    const m = modeloDe.get(id);
    if (!m) return { tono: "ambar", estado: "No está a la venta", titulo: "Esa prenda no está a la venta" };
    const marcadas = a.categoriasSolo.length > 0 ? a.categoriasSolo : toco ? [] : [...catsCampana].filter((c) => !a.categoriasFuera.includes(c));
    if (m.categoriaId !== null && marcadas.includes(m.categoriaId)) return { tono: "verde", estado: "Ya entra por su categoría", titulo: m.nombre };
    const variantes = variantesDe(id);
    const antes = [...elegidasDelModelo(a, id, variantes)];
    // Solo hay «ese color» si la base ya guarda tallas sueltas, la etiqueta es de una talla que la hoja conoce y el modelo tiene más de un color.
    const delColor = porVariante && leida !== null && variantes.some((v) => v.id === leida) && new Set(variantes.map((v) => v.colorClave)).size > 1;
    const conColor = delColor ? agregarColorDeVariante(a, id, variantes, leida) : null;
    const color = delColor ? (variantes.find((v) => v.id === leida)?.color ?? null) : null;
    const titulo = color ? `${m.nombre} · ${color}` : m.nombre;
    const yaEstaba = conColor ? !conColor.cambio : a.productosSolo.includes(id) || a.variantesSolo.some((v) => productoDeVariante.get(v) === id);
    if (yaEstaba) return { tono: "verde", estado: "Ya estaba", titulo, porColor: delColor };
    const primera = a.productosSolo.length === 0 && a.variantesSolo.length === 0 && a.categoriasSolo.length === 0 && !toco;
    const seleccion = conColor ? { productosSolo: conColor.productosSolo, variantesSolo: conColor.variantesSolo } : { productosSolo: [...a.productosSolo, id] };
    const parche = primera ? { ...seleccion, categoriasSolo: marcadas, categoriasFuera: [] } : seleccion;
    vivo.current = { o: { ...a, ...parche }, tocoCats: toco || primera };
    cambiar(parche);
    if (primera) setTocoCats(true);
    setRecien(id);
    return { tono: "verde", estado: "Agregada", titulo, agregada: { id, antes }, porColor: delColor };
  }
  /** «Deshacer» de lo recién agregado: la prenda vuelve a las tallas que tenía; si no tenía ninguna, sale de la oferta. */
  function deshacerLeida(d: { id: string; antes: string[] }) {
    const variantes = variantesDe(d.id);
    if (d.antes.length === 0 || variantes.length === 0) return quitarProductos([d.id]);
    fijarSeleccion(d.id, fijarVariantesDelModelo(vivo.current.o, d.id, variantes, new Set(d.antes)));
  }
  /** Saca prendas de la oferta: una (su botón «Quitar», o «Deshacer» recién agregada) o todas. */
  function quitarProductos(ids: readonly string[]) {
    const fuera = new Set(ids);
    const a = vivo.current.o;
    const productosSolo = a.productosSolo.filter((x) => !fuera.has(x));
    // Con el modelo se van también sus tallas y colores sueltos.
    const variantesSolo = a.variantesSolo.filter((v) => !fuera.has(productoDeVariante.get(v) ?? ""));
    vivo.current = { ...vivo.current, o: { ...a, productosSolo, variantesSolo } };
    cambiar({ productosSolo, variantesSolo });
    if (abierta && fuera.has(abierta)) setAbierta(null);
    setUltimaLeida(null);
    setMarcadas((m) => new Set([...m].filter((x) => !fuera.has(x))));
    if (recien && fuera.has(recien)) setRecien(null);
  }
  /** Al tocar un color o una talla de la prenda abierta: queda entera, por sus variantes o fuera de la oferta (`lib/oferta-variantes.ts`). */
  function fijarSeleccion(productoId: string, s: { productosSolo: string[]; variantesSolo: string[] }) {
    vivo.current = { ...vivo.current, o: { ...vivo.current.o, ...s } };
    cambiar(s);
    setUltimaLeida(null);
    // Sin ninguna talla, la prenda salió de la oferta: su panel se cierra con ella.
    if (!s.productosSolo.includes(productoId) && !s.variantesSolo.some((v) => productoDeVariante.get(v) === productoId)) setAbierta(null);
  }
  /** Lo leído por la pistola o la cámara: primero entre las prendas que la hoja ya tiene; si no, la base (el código de fábrica, la etiqueta). */
  async function leerCodigo(texto: string): Promise<Leida> {
    const codigo = texto.trim();
    let prenda = prendaDeCodigo(prendasConCosto, codigo);
    if (!prenda && sedeActualId) {
      const { data, error } = await rpcRebaja("buscar_prenda_para_rebaja", { p_texto: codigo, p_ubicacion_id: sedeActualId });
      // Un código que la base reconoce en UNA talla es su etiqueta; uno que comparten varias (el de fábrica del modelo) es el modelo entero.
      const exactas = error ? [] : leerPrendasBuscadas(data).filter((f) => f.exacta);
      if (exactas.length > 0) prenda = { productoId: exactas[0].productoId, varianteId: exactas.length === 1 ? exactas[0].varianteId : "" };
    }
    return prenda ? agregarModelo(prenda.productoId, prenda.varianteId || null) : { tono: "ambar", estado: "No es de ninguna prenda", titulo: codigo };
  }
  const decir = (r: Leida) =>
    setUltimaLeida({ tono: r.tono, texto: r.tono === "verde" ? `${r.titulo} · ${r.estado.toLowerCase()}` : `${r.estado}: ${r.titulo}`, deshacer: r.agregada });
  function agregarSugerida(i: number) {
    const m = sugeridas[i];
    if (!m) return;
    decir(agregarModelo(m.id));
    setQPrenda("");
    buscadorDePrendas.current?.focus();
  }
  /** Con el mouse: la sugerencia de una prenda que YA está en la oferta la saca (así se encuentra y se quita una entre muchas, buscándola).
   *  Con Enter no: quien escribe y da Enter quiere agregar, y solo se le dice que ya estaba. */
  function elegirSugerida(i: number) {
    const m = sugeridas[i];
    if (!m) return;
    if (!idsDeFichas.includes(m.id)) return agregarSugerida(i);
    quitarProductos([m.id]);
    setUltimaLeida({ tono: "verde", texto: `${m.nombre} · quitada` });
    setQPrenda("");
    buscadorDePrendas.current?.focus();
  }
  // Las lecturas hacen cola: el buscador se vacía al instante para la siguiente etiqueta y cada una se resuelve en su turno. Sin la cola,
  // una lectura que llegaba mientras la anterior seguía buscándose se perdía (probado escribiendo dos códigos seguidos).
  const cola = useRef<Promise<void>>(Promise.resolve());
  const enCola = useRef(0);
  function alEnterDePrendas() {
    const texto = qPrenda.trim();
    if (texto.length < 2) return;
    // Un código exacto de lo que está en pantalla gana; si no, lo escrito es un nombre y Enter toma la primera sugerencia; si no hay, la base.
    const local = prendaDeCodigo(prendasConCosto, texto);
    if (!local && sugeridas.length > 0) {
      if (sugeridaActiva !== null) return agregarSugerida(sugeridaActiva);
      // Todo lo sugerido ya está en la oferta: se dice, y no se quita nada.
      setUltimaLeida({ tono: "verde", texto: `${sugeridas[0].nombre} · ya estaba` });
      setQPrenda("");
      return;
    }
    // El foco se queda en el buscador: la pistola lee la siguiente sin tocar la pantalla.
    setQPrenda("");
    enCola.current += 1;
    setLeyendo(true);
    cola.current = cola.current.then(async () => {
      decir(local ? agregarModelo(local.productoId, local.varianteId) : await leerCodigo(texto));
      enCola.current -= 1;
      if (enCola.current === 0) setLeyendo(false);
    });
  }
  async function leerConCamara(codigo: string) {
    const clave = ++lecturas.current;
    const r = await leerCodigo(codigo);
    if (clave !== lecturas.current) return;
    if (r.estado === "Agregada") setAgregadasCam((n) => n + 1);
    setRespuestaCam({ clave, tono: r.tono, estado: r.estado, titulo: r.titulo, detalle: r.tono !== "verde" ? "Prueba con otra etiqueta." : r.porColor ? "Entra ese color, con todas sus tallas." : "Entra con todas sus tallas y colores." });
  }

  // Los grupos enteros (categorías, insignias): se abre uno a la vez, bajo su fila. Al editar, el que la oferta ya usa llega abierto.
  const alternarPanel = (v: VistaPrendas) => setVistaPrendas((a) => (a === v ? null : v));
  // Las prendas agregadas, la última arriba: quien escanea ve la que acaba de entrar sin bajar.
  const enOrden = [...idsDeFichas].reverse();
  // Las categorías en una línea: las elegidas (primero las que tienen prendas), las de la campaña si nadie eligió, o ninguna.
  const resumenDeCategorias = (() => {
    if (o.categoriasSolo.length === 0) return !tocoCats && catsCampana.size > 0 ? `Las ${catsCampana.size} de la campaña` : "Ninguna";
    const nombres = [...o.categoriasSolo].sort((a, b) => (cuentaCats.get(b) ?? 0) - (cuentaCats.get(a) ?? 0)).map(nombreCategoria).filter(Boolean);
    return resumirNombres(nombres);
  })();

  /** Los colores y tallas de la prenda abierta (ADR-0682): «Todo el modelo», cada color (entra o sale entero) y cada talla suelta. */
  function tallasDe(id: string) {
    const m = modeloDe.get(id);
    const variantes = variantesDe(id);
    const elegidas = elegidasDelModelo(o, id, variantes);
    const entero = variantes.length > 0 && elegidas.size === variantes.length;
    const sel = () => vivo.current.o;
    return (
      <div className="of-tallas" role="group" aria-label={`Colores y tallas de ${m?.nombre ?? "la prenda"}`} data-guia="sellos.oferta-tallas">
        <div className="of-tallas-cab">
          <span className="of-lbl">{m?.nombre ?? "Prenda"}</span>
          <button type="button" className="pildora-cayla" aria-pressed={entero} onClick={() => fijarSeleccion(id, fijarVariantesDelModelo(sel(), id, variantes, new Set(variantes.map((v) => v.id))))}>
            Todo el modelo
          </button>
        </div>
        {porColor(variantes).map((g) => {
          const delColor = g.variantes.filter((v) => elegidas.has(v.id)).length;
          return (
            <div key={g.clave} className="of-tallas-color">
              <button
                type="button"
                className="pildora-cayla of-tallas-nombre"
                aria-pressed={delColor === g.variantes.length ? true : delColor > 0 ? "mixed" : false}
                onClick={() => fijarSeleccion(id, alternarColor(sel(), id, variantes, g.clave))}
                title={delColor === g.variantes.length ? `Quitar ${g.color ?? "todas"}` : `Todas las tallas de ${g.color ?? "la prenda"}`}
              >
                {g.colorHex && <span aria-hidden data-color-dato className="of-tallas-muestra" style={{ background: g.colorHex }} />}
                {g.color ?? "Tallas"}
              </button>
              <span className="of-tallas-lista">
                {g.variantes.map((v) => (
                  <button key={v.id} type="button" className="of-talla" aria-pressed={elegidas.has(v.id)} aria-label={`${g.color ?? ""} ${v.talla ?? "talla única"}`.trim()} onClick={() => fijarSeleccion(id, alternarVariante(sel(), id, variantes, v.id))}>
                    {v.talla ?? "Única"}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function preguntaPrendas() {
    return (
      <>
        <h2 tabIndex={-1}>{esMonto ? "¿Qué cuenta para llegar al monto?" : grupo ? `¿Con qué prendas se arma el ${titularDeOferta(o).replace(/^La /, "grupo de la ")}?` : "¿En qué prendas?"}</h2>
        <div className="of-escena">
          {esMonto && (
            <div className="of-sub" data-guia="sellos.oferta-cuenta">
              <span className="of-lbl">Qué cuenta</span>
              <div className="of-opciones" role="group" aria-label="Qué cuenta para llegar al monto">
                <button type="button" className="pildora-cayla" aria-pressed={deTodaLaCompra} onClick={() => cambiar({ cuenta: "compra" })}>
                  Toda la compra
                </button>
                <button type="button" className="pildora-cayla" aria-pressed={!deTodaLaCompra} onClick={() => cambiar({ cuenta: "campana" })}>
                  Solo prendas de la campaña
                </button>
              </div>
            </div>
          )}
          {deTodaLaCompra ? (
            <div className="of-sub" data-campo="oferta-categorias">
              <p className="of-pequeno" aria-live="polite">
                Cuenta todo el catálogo: {plural(nAlcanza, "prenda", "prendas")} a la venta.
                {claureFuera > 0 ? ` ${plural(claureFuera, "prenda", "prendas")} de Claurè ${claureFuera === 1 ? "queda" : "quedan"} fuera.` : ""}
              </p>
            </div>
          ) : (
            <>
              {/* 1 · Leerla o escribirla: lo primero y lo más grande. */}
              <div className="of-sub of-agregar" data-campo="oferta-categorias" data-guia="sellos.oferta-escanear">
                <span className="of-lbl">Agrega una prenda</span>
                <div className="of-agregar-fila">
                  <Buscador
                    ref={buscadorDePrendas}
                    tamano="mostrador"
                    icono="barras"
                    valor={qPrenda}
                    onCambio={(v) => {
                      setQPrenda(v);
                      if (v) setUltimaLeida(null);
                    }}
                    buscando={leyendo}
                    etiqueta="Agregar una prenda a la oferta por su código o su nombre"
                    placeholder="Escanea o escribe el nombre" // sugerir-fijo: dice las dos formas de agregar; no depende de lo elegido antes (y cabe a 375 px)
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        alEnterDePrendas();
                      } else if (e.key === "Escape" && qPrenda) {
                        e.stopPropagation();
                        setQPrenda("");
                      }
                    }}
                    {...ariaDelBuscador(idSugeridas, sugeridas.length > 0, sugeridaActiva)}
                  />
                  <Boton
                    peso="primario"
                    className="of-agregar-camara"
                    onClick={() => {
                      setRespuestaCam(null);
                      setAgregadasCam(0);
                      setCamara(true);
                    }}
                  >
                    <Camera aria-hidden className="mr-2 inline h-5 w-5" />
                    Con la cámara
                  </Boton>
                </div>
                {sugeridas.length > 0 && (
                  <ListaSugerencias
                    id={idSugeridas}
                    etiqueta="Prendas que coinciden"
                    enLinea
                    activa={sugeridaActiva}
                    className="of-agregar-lista"
                    sugerencias={sugeridas.map((m) => ({
                      clave: m.id,
                      miniatura: miniaturaDe(m.prendaId),
                      titulo: m.nombre,
                      // Una que ya está lo dice en su línea y ofrece quitarla (corto: a 375 px un texto largo a la derecha dejaba el nombre en una letra).
                      detalle: idsDeFichas.includes(m.id)
                        ? "Ya está en la oferta"
                        : entraPorCategoria(m)
                          ? "Ya entra por su categoría"
                          : [nombreCategoria(m.categoriaId ?? ""), m.colores.size > 1 ? `${m.colores.size} colores` : ""].filter(Boolean).join(" · ") || undefined,
                      derecha: idsDeFichas.includes(m.id) ? "Quitar" : entraPorCategoria(m) ? undefined : `S/ ${m.precio.toFixed(2)}`,
                    }))}
                    onElegir={elegirSugerida}
                  />
                )}
                <p className="of-leida" data-tono={ultimaLeida?.tono} role="status">
                  {ultimaLeida && (
                    <>
                      {ultimaLeida.tono === "verde" && <Check aria-hidden className="h-4 w-4" />}
                      {ultimaLeida.texto}
                      {ultimaLeida.deshacer && <BotonDeshacer className="ml-2" onClick={() => deshacerLeida(ultimaLeida.deshacer as { id: string; antes: string[] })} />}
                    </>
                  )}
                </p>
              </div>

              {/* 2 · Las prendas que ya entraron: un mosaico compacto (tres por fila en escritorio), la última primero. Con muchas no crece: se
                  ven dos filas y «Ver las N» abre un cuadro que se desliza por dentro. Cada ficha se toca para marcarla y tiene su ✕. */}
              <div className="of-sub" data-guia="sellos.oferta-prendas">
                <div className="of-lista-cab">
                  <span className="of-lbl">
                    Prendas de la oferta
                    {idsDeFichas.length > 0 && <Globito n={idsDeFichas.length} etiqueta={plural(idsDeFichas.length, "prenda agregada", "prendas agregadas")} className="ml-2" />}
                  </span>
                  {marcadasAhora.length > 0 ? (
                    <span className="of-lista-acciones">
                      <button type="button" className="btn-cayla btn-secundario" onClick={() => quitarProductos(marcadasAhora)}>
                        <X aria-hidden className="mr-1.5 inline h-4 w-4" />
                        {`Quitar ${marcadasAhora.length} ${marcadasAhora.length === 1 ? "marcada" : "marcadas"}`}
                      </button>
                      <button type="button" className="btn-cayla btn-enlace" onClick={() => setMarcadas(new Set())}>
                        Desmarcar
                      </button>
                    </span>
                  ) : (
                    idsDeFichas.length > 1 && (
                      <button type="button" className="btn-cayla btn-secundario" onClick={() => quitarProductos(idsDeFichas)}>
                        <X aria-hidden className="mr-1.5 inline h-4 w-4" />
                        Quitar todas
                      </button>
                    )
                  )}
                </div>
                {idsDeFichas.length === 0 ? (
                  <p className="of-pequeno">Ninguna todavía.</p>
                ) : (
                  <>
                    <ul className="of-mosaico" data-todas={verTodasLasElegidas ? "" : undefined} aria-label="Prendas de la oferta">
                      {(verTodasLasElegidas ? enOrden : enOrden.slice(0, PRENDAS_A_LA_VISTA)).map((id) => {
                        const m = modeloDe.get(id);
                        const nombreM = m?.nombre ?? "Prenda que ya no está a la venta";
                        const marcada = marcadas.has(id);
                        return (
                          <li key={id} className="of-ficha" data-recien={id === recien ? "" : undefined} data-marcada={marcada ? "" : undefined}>
                            <button type="button" className="of-ficha-cuerpo" aria-pressed={marcada} onClick={() => alternarMarcada(id)} title={marcada ? `Desmarcar ${nombreM}` : `Marcar ${nombreM} para quitarla`}>
                              <span className="of-ficha-foto">
                                {miniaturaDe(m?.prendaId, "sm")}
                                {marcada && (
                                  <span className="of-ficha-marca" aria-hidden>
                                    <Check strokeWidth={3} /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3 */ />
                                  </span>
                                )}
                              </span>
                              <span className="of-fila-texto">
                                <span className="of-fila-nombre">{nombreM}</span>
                                {m && (
                                  <span className="of-fila-dato">
                                    {[porVariante ? resumenDeVariantes(variantesDe(id), elegidasDelModelo(o, id, variantesDe(id))) : "", `S/ ${m.precio.toFixed(2)}`, !porVariante && m.colores.size > 1 ? `${m.colores.size} colores` : "", m.deClaure ? "Claurè" : ""]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                              </span>
                            </button>
                            {porVariante && variantesDe(id).length > 1 && (
                              <button
                                type="button"
                                className="of-ficha-abrir"
                                aria-expanded={abierta === id}
                                onClick={() => setAbierta((a) => (a === id ? null : id))}
                                aria-label={`Elegir colores y tallas de ${nombreM}`}
                                title="Colores y tallas"
                              >
                                <ChevronDown aria-hidden className="h-4 w-4" />
                              </button>
                            )}
                            <button type="button" className="of-ficha-quitar" onClick={() => quitarProductos([id])} aria-label={`Quitar ${nombreM}`} title={`Quitar ${nombreM}`}>
                              <X aria-hidden className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {enOrden.length > PRENDAS_A_LA_VISTA && (
                      <BotonVerMas abierto={verTodasLasElegidas} onCambiar={setVerTodasLasElegidas} texto={`Ver las ${enOrden.length}`} forma="enlace" />
                    )}
                    {porVariante && abierta && idsDeFichas.includes(abierta) && tallasDe(abierta)}
                  </>
                )}
              </div>

              {/* 3 · Grupos enteros: dos tarjetas lado a lado que se tocan enteras (categorías · insignias); la lista de la elegida se abre debajo. */}
              <div className="of-sub" data-guia="sellos.oferta-una-por-una">
                <span className="of-lbl">O una categoría o insignia entera</span>
                <div className="of-grupos">
                  <button type="button" className="of-grupo" aria-expanded={vistaPrendas === "cat"} onClick={() => alternarPanel("cat")}>
                    <span className="of-grupo-icono" aria-hidden>
                      <LayoutGrid className="h-5 w-5" />
                    </span>
                    <span className="of-fila-texto">
                      <span className="of-grupo-nombre">Categorías</span>
                      <span className="of-fila-dato">{resumenDeCategorias}</span>
                    </span>
                    <span className="of-grupo-accion">{vistaPrendas === "cat" ? "Listo" : o.categoriasSolo.length > 0 ? "Cambiar" : "Elegir"}</span>
                  </button>
                  {insignias.length > 0 && (
                    <button type="button" className="of-grupo" aria-expanded={vistaPrendas === "ins"} onClick={() => alternarPanel("ins")}>
                      <span className="of-grupo-icono" aria-hidden>
                        <Award className="h-5 w-5" />
                      </span>
                      <span className="of-fila-texto">
                        <span className="of-grupo-nombre">Insignias</span>
                        <span className="of-fila-dato">{resumirNombres(o.insigniasSolo.map(nombreCategoria).filter(Boolean)) || "Ninguna"}</span>
                      </span>
                      <span className="of-grupo-accion">{vistaPrendas === "ins" ? "Listo" : o.insigniasSolo.length > 0 ? "Cambiar" : "Elegir"}</span>
                    </button>
                  )}
                </div>
                {vistaPrendas === "cat" && (
                  <div className="of-panel">
                    {/* Marcan varias de un toque. Van como botones con su borde (Felipe 2026-11-18: en plano «parecen solo texto») y los dos
                        siempre están: si aparecieran al marcar, la lista saltaría bajo el mouse (ADR-0185). */}
                    <div className="of-panel-acciones">
                      <button type="button" className="btn-cayla btn-secundario" disabled={elegidasSolo.size >= categorias.length} onClick={() => fijarCategorias(new Set(categorias.map((c) => c.id)))}>
                        <CheckCheck aria-hidden className="mr-1.5 inline h-4 w-4" />
                        Elegir todas
                      </button>
                      <button type="button" className="btn-cayla btn-secundario" disabled={elegidasSolo.size === 0} onClick={() => fijarCategorias(new Set())}>
                        <X aria-hidden className="mr-1.5 inline h-4 w-4" />
                        Quitar todas
                      </button>
                    </div>
                    {/* Sin plegar: el panel ya se abre a pedido, así que sus familias llegan con las categorías a la vista. */}
                    <CategoriasDeCampana categorias={categorias} prendasDe={cuentaCats} elegidas={elegidasSolo} onAlternar={alternarCategoria} onFamilia={alternarFamilia} />
                  </div>
                )}
                {vistaPrendas === "ins" && (
                  <div className="of-panel">
                    {insigniasParaElegir.length === 0 ? (
                      <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Award />}>
                        Todavía no hay insignias activas.
                      </Vacio>
                    ) : (
                      <ul className="of-modelos" aria-label="Insignias para elegir">
                        {insigniasParaElegir.map((i) => {
                          const elegida = o.insigniasSolo.includes(i.id);
                          return (
                            <li key={i.id} className="of-modelo">
                              <span className="of-modelo-nombre">
                                <Casilla marcada={elegida} disabled={!elegida && o.insigniasSolo.length >= MAX_INSIGNIAS_SOLO} onCambio={() => alternarInsignia(i.id)} etiqueta={i.nombre} />
                                <span aria-hidden>{i.nombre}</span>
                              </span>
                              <span className="of-pequeno">
                                {plural(i.prendas, "prenda", "prendas")}
                                {i.activa ? "" : " · desactivada"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
                {/* El total, en una línea: lo que alcanza la oferta sumando prendas, categorías e insignias. */}
                <p className="of-alcance" aria-live="polite">
                  {alcanceTexto}
                </p>
              </div>
            </>
          )}

          {grupo && (
            <div className="of-sub" data-guia="sellos.oferta-mezclar">
              <span className="of-lbl">¿Se pueden mezclar?</span>
              <div className="of-opciones" role="group" aria-label="¿Se pueden mezclar?">
                <button type="button" className="pildora-cayla" aria-pressed={o.agrupa === "campana"} onClick={() => cambiar({ agrupa: "campana" })}>
                  Sí, cualquiera de estas
                </button>
                <button type="button" className="pildora-cayla" aria-pressed={o.agrupa === "modelo"} onClick={() => cambiar({ agrupa: "modelo" })}>
                  Solo del mismo modelo
                </button>
              </div>
            </div>
          )}
          {hayClaure && (
            <div className="of-sub">
              <span className="of-lbl">Prendas de Claurè</span>
              <p className="of-pequeno">Es otra empresa: quedan fuera, salvo que las pongas a propósito.</p>
              <div className="of-opciones">
                <button type="button" className="pildora-cayla" aria-pressed={o.incluyeClaure} onClick={() => cambiar({ incluyeClaure: !o.incluyeClaure })}>
                  Incluir las de Claurè
                </button>
              </div>
            </div>
          )}
        </div>
        {camara && (
          <EscanerBusqueda
            titulo="Escanear prendas para la oferta"
            pista="Centra la etiqueta de la prenda"
            continuo={{
              respuesta: respuestaCam,
              resumen: `${agregadasCam} ${agregadasCam === 1 ? "agregada" : "agregadas"}`,
              vacio: "Escanea una prenda: entra con todas sus tallas y colores.",
            }}
            onCodigo={(codigo) => void leerConCamara(codigo)}
            onEscribir={() => {
              setCamara(false);
              buscadorDePrendas.current?.focus();
            }}
            onClose={() => setCamara(false)}
          />
        )}
      </>
    );
  }

  // ---- Paso 4 · Revisa y activa (ADR-0655: un paso propio, no el pie de las prendas) ------------------------------------------------
  function preguntaRevisar() {
    const oracion = fraseDeOferta(oDicha, nombreCategoria, nombreSede, sueltas);
    return (
      <>
        <h2 tabIndex={-1}>{editada?.estado === "activa" ? "Revisa y guarda" : "Revisa y activa"}</h2>
        <div className="of-escena of-rev" data-guia="sellos.oferta-revision">
          <div className="of-grupo">
          <p className="of-oracion">{oracion}</p>
          {/* El historial de la oferta abierta (lo decía la lista de «Ya registradas», que se fue con ADR-0677, 7c). */}
          {editada && editada.cambios > 0 && (
            <p className="of-pequeno of-hist">
              <Undo2 aria-hidden className="h-3.5 w-3.5" />
              {plural(editada.cambios, "cambio", "cambios")}
              {resumenAntes(editada.ultimoCambio, editada) ? ` · antes: ${resumenAntes(editada.ultimoCambio, editada)}` : ""}
            </p>
          )}
          {rige && diasSueltos && rige.rige > 0 && (
            <p className="of-pequeno">
              Rige {rige.rige} de {rige.total} días de esas fechas.
            </p>
          )}
          </div>
          {enCaja()}
          <div className="of-avisos">
            {problemas
              // «Elige al menos un día» ya lo dice la pista de los días y el «Falta:» del pie: no se repite en ámbar.
              .filter((p) => p !== errorFechas && !/al menos un día de la semana/.test(p))
              .map((p) => (
                <Aviso key={p} tono="atencion">
                  {p}
                </Aviso>
              ))}
            {nAlcanza === 0 && (
              <Aviso tono="atencion" titulo="Todavía no alcanza ninguna prenda">
                Márcalas en «Prendas», en la tarjeta de la campaña, o elige otras categorías.
              </Aviso>
            )}
            {porMonto.noAhorra > 0 && (
              <Aviso tono="atencion" titulo={`No ahorra en ${plural(porMonto.noAhorra, "prenda", "prendas")}`}>
                Con sus precios de hoy, el grupo cuesta lo mismo o menos sin la oferta.
              </Aviso>
            )}
            {porMonto.pasaTope > 0 && (
              <Aviso tono="atencion" titulo={`Regala más del ${PORCENTAJE_MAX} % en ${plural(porMonto.pasaTope, "prenda", "prendas")}`}>
                Revisa el precio del grupo: es más de lo que regala cualquier otra oferta.
              </Aviso>
            )}
            {bajoPorModelo.length > 0 && (
              <Aviso tono="atencion" titulo={`Queda por debajo del costo: ${plural(bajoPorModelo.length, "prenda", "prendas")}`}>
                {bajoPorModelo.slice(0, 2).map(nombreBajoCosto).join(", ")}
                {bajoPorModelo.length > 2 ? "…" : ""}. No se bloquea, pero pierdes plata en cada una: avísale al contador.
              </Aviso>
            )}
            {o.incluyeClaure && (
              <Aviso tono="atencion" titulo="Entran las prendas de Claurè">
                Es otra empresa: confirma con su dueña que acepta el descuento.
              </Aviso>
            )}
            {diasSueltos && rige && rige.rige > 0 && (
              <Aviso tono="info" titulo="El papel colgado no cambia cada día">
                Antes de activarla, decide qué dirá la etiqueta de precio.
              </Aviso>
            )}
          </div>
          <div data-campo="oferta-choques">
            <ChoquesDeOferta choques={choques} leido={filasChoque !== null} cedeA={o.cedeA} onCeder={cederA} monto={salidaDelMonto} />
          </div>
          <div className="of-grupo">
          <div className="of-fin">
            <span className="of-pequeno">Se llamará «{nombre}»</span>
            <button type="button" className="btn-cayla btn-enlace ml-auto text-sm" onClick={() => setMasQ3((v) => !v)}>
              {masQ3 ? "Menos opciones" : "Más opciones"}
            </button>
          </div>
          {masQ3 && (
            <div className="of-mas">
              <CampoTexto
                etiqueta="Nombre"
                ayuda="Se arma solo; cámbialo si quieres."
                value={o.nombre}
                placeholder={nombreAutomatico(oDicha, nombreCategoria, nombreSede, sueltas)}
                onChange={(e) => cambiar({ nombre: e.target.value })}
                maxLength={80}
                caja
              />
              {nombreManual && (
                <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => cambiar({ nombre: "" })}>
                  Usar el nombre automático
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </>
    );
  }

  // ---- «En caja»: una compra de ejemplo, cobrada con la cuenta de la caja (ADR-0677, actividad 8; lib/compra-de-ejemplo.ts) -----------
  // Responde «¿cuánto paga el cliente?» con prendas de verdad, en vivo. Va al pie del escenario donde esa pregunta importa: bajo los números
  // («Qué le das») y bajo la frase de «Revisar». En las fases de prendas y de fechas no se dibuja: ahí no cambia lo que se cobra por prenda.
  const compra = useMemo(
    () => {
      // Una talla suelta de la oferta se nombra con su color y su talla («Blusa Emma · Negro M»): es lo que la caja va a rebajar, no el modelo.
      const sueltasDeLaOferta = new Set(o.variantesSolo);
      const conTalla = (p: PrendaConCosto) => {
        const v = p.productoId && sueltasDeLaOferta.has(p.id) ? variantesDeModelo.get(p.productoId)?.find((x) => x.id === p.id) : undefined;
        const detalle = v ? [v.color, v.talla].filter(Boolean).join(" ") : "";
        const base = p.referencia ?? nombreSinSku(p.nombre);
        return detalle ? `${base} · ${detalle}` : base;
      };
      return compraDeEjemplo(o, elegido, alcanzadas.map((p) => ({ id: p.id, nombre: conTalla(p), precio: p.precio, productoId: p.productoId })));
    },
    [o, elegido, alcanzadas, variantesDeModelo],
  );
  function enCaja() {
    const S = (n: number) => `S/\u00a0${n.toFixed(2)}`;
    return (
      <aside className="of-caja" aria-label="Así se cobra en caja" data-guia="sellos.oferta-ejemplo">
        <span className="of-lbl">En caja</span>
        {compra.estado === "elige" ? (
          <Vacio tamano="chico" icono={<Tag />}>
            Elige qué le das
          </Vacio>
        ) : compra.estado === "sin-prendas" ? (
          <Vacio tamano="chico" icono={<Shirt />}>
            Todavía no alcanza ninguna prenda
          </Vacio>
        ) : (
          <>
            <ul className="of-caja-lineas">
              {compra.lineas.map((l, i) => {
                const f = l.id ? fotos?.get(l.id) : undefined;
                return (
                  <li key={`${l.id ?? l.nombre}-${i}`}>
                    <MiniaturaPrenda
                      fotoUrl={f?.fotoUrl ?? null}
                      colorHex={f?.colorHex ?? null}
                      prefijo={f?.categoria?.prefijo}
                      familia={f?.categoria?.familia}
                      categoria={f?.categoria?.nombre}
                    />
                    <span className="of-caja-nombre">{l.nombre}</span>
                    <span className="of-caja-precio">
                      {l.paga < l.precio && <s>{S(l.precio)}</s>}
                      <b>{S(l.paga)}</b>
                    </span>
                  </li>
                );
              })}
              {compra.monto && (
                <li className="of-caja-monto">
                  <span>{compra.monto.llega ? `Desde ${S(compra.monto.desde)}` : `Falta ${S(compra.monto.falta)} para ${S(compra.monto.desde)}`}</span>
                  {compra.monto.llega && <b className="of-caja-precio">−{S(compra.monto.ahorro)}</b>}
                </li>
              )}
            </ul>
            <p className="of-caja-total" aria-live="polite" aria-atomic="true">
              <span>Paga</span>
              <b>{S(compra.paga)}</b>
            </p>
            {compra.ahorro > 0 && <p className="of-caja-ahorra">Ahorra {S(compra.ahorro)}</p>}
          </>
        )}
      </aside>
    );
  }

  // ---- Las fases, arriba: dónde estás y adónde puedes saltar -------------------------------------------------------------------------
  // Sin elegir qué le das no hay nada que contestar en las demás: se ven apagadas. Una fase lleva su ✓ solo si se visitó y quedó sin
  // pendientes (ADR-0284: lo que viene armado no se da por revisado).
  function fases() {
    const d = (n: Paso, texto: string) => {
      const apagado = !elegido && n > 1;
      const hecho = n < 4 && n !== paso && visitado[n] && elegido && (n !== 1 || !problemaForma) && (n !== 2 || !categoriasPendientes) && (n !== 3 || (!tiendasPendientes && problemas.length === 0));
      return (
        <li key={n}>
          <button
            type="button"
            className="of-fase"
            aria-current={paso === n ? "step" : undefined}
            aria-disabled={apagado || undefined}
            data-hecho={hecho ? "" : undefined}
            data-guia={`sellos.oferta-paso-${n}`}
            onClick={() => !apagado && ir(n)}
          >
            <i aria-hidden>{hecho ? <Check strokeWidth={3} /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3 */ /> : n}</i>
            <span>{texto}</span>
            <span className="sr-only">{hecho ? ", lista" : paso === n ? ", aquí estás" : ""}</span>
          </button>
        </li>
      );
    };
    return (
      <nav className="of-fases-caja" aria-label="Fases de la oferta" data-guia="sellos.oferta-pasos">
        <ol className="of-fases">
          {d(1, "Qué le das")}
          {d(2, "En qué prendas")}
          {d(3, "Cuándo y dónde")}
          {d(4, "Revisar")}
        </ol>
      </nav>
    );
  }

  // ---- El pie: en cada fase, «Siguiente»; en la última, guarda o activa --------------------------------------------------------------
  function pie(cerrar: () => void) {
    const edita = o.id !== null;
    const estadoEdita = editada?.estado ?? null;
    const guardandoAlgo = guardando !== null;
    const cuando = o.desde > hoy ? `desde el ${sinPunto(fechaCorta(o.desde))}` : "desde ahora";
    let falta: ReactNode = null;
    let derecha: ReactNode = null;

    // «Falta: …» dice solo lo de esta fase o de las de antes: en «Qué le das» no se piden todavía las tiendas.
    const faltaAqui = faltan.filter((c) => paso === 4 || pasoDeLoQueFalta(c.id) <= paso);
    if (faltaAqui.length > 0) {
      falta = (
        <div className="of-pie-pide">
          <FaltanDelPaso faltan={faltaAqui} ahora={faltaAqui[0].id} onIr={llevarA} />
        </div>
      );
    }
    if (paso < 4) {
      const puedeSeguir = paso === 1 ? elegido && !problemaForma : paso === 2 ? !categoriasPendientes : faltan.length === 0;
      derecha = (
        <>
          {/* Al editar, lo que se cambió se guarda desde cualquier fase: no hay que recorrer las cuatro para corregir un número. */}
          {edita && (
            <Boton
              peso="fantasma"
              className="of-atajo"
              confirma={estadoEdita === "activa" ? confirmaRegir(puedeGuardar) : confirmaPaso(puedeGuardar)}
              disabled={guardandoAlgo}
              cargando={guardando === "cambios"}
              onClick={() => guardar(false, cerrar)}
            >
              Guardar cambios
            </Boton>
          )}
          <Boton peso="primario" className="of-siguiente" confirma={confirmaPaso(puedeSeguir)} disabled={guardandoAlgo} onClick={() => ir((paso + 1) as Paso)}>
            Siguiente
            <ArrowRight aria-hidden className="ml-1.5 inline h-4 w-4" />
          </Boton>
        </>
      );
    } else {
      const ok = puedeGuardar;
      // Un choque no frena el borrador, solo activarla: el pie lo dice antes de pedir nada («Para activarla» solo se leía como un candado,
      // prueba ciega de Formidable 2026-11-18). Una oferta activa que se edita sí debe resolverlo para guardar.
      if (ok && faltaChoque) {
        falta = (
          <div className="of-pie-pide">
            <FaltanDelPaso faltan={[faltaChoque]} ahora={faltaChoque.id} onIr={llevarA} rotulo={estadoEdita === "activa" ? "Para guardar" : "Puedes guardarla como borrador. Para activarla"} />
          </div>
        );
      } else if (ok) {
        falta = (
          <span className="of-falta">
            {edita && estadoEdita === "activa"
              ? "Vale desde ahora; lo que ya se vendió se queda como estaba."
              : `Todo listo: actívala (cambia el precio ${cuando}) o déjala como borrador.`}
          </span>
        );
      }
      const activa = edita && estadoEdita === "activa";
      derecha = activa ? (
        <Boton peso="primario" confirma={confirmaRegir(ok)} disabled={guardandoAlgo} cargando={guardando === "cambios"} onClick={() => guardar(false, cerrar)}>
          Guardar cambios
        </Boton>
      ) : (
        <>
          <Boton peso="fantasma" className="of-borrador" confirma={confirmaPaso(ok)} disabled={guardandoAlgo} cargando={guardando === "borrador" || guardando === "cambios"} onClick={() => guardar(false, cerrar)}>
            {edita ? "Guardar cambios" : "Guardar como borrador"}
          </Boton>
          <Boton peso="primario" confirma={confirmaRegir(ok)} disabled={guardandoAlgo} cargando={guardando === "activar"} textoCargando="Activando…" onClick={() => guardar(true, cerrar)} data-guia="sellos.oferta-activar">
            <Check aria-hidden className="mr-1 inline h-4 w-4" />
            Activar
          </Boton>
        </>
      );
    }

    // Retirar va en la hoja de la oferta abierta (ADR-0677, 7c: la lista de «Ya registradas» se fue), a la izquierda del pie. Al tocarlo, el pie
    // entero pasa a preguntar, con la oferta nombrada y su «No se puede deshacer»: un «Sí, retirar» que aparecía en el lugar del botón no se veía
    // (prueba ciega de Formidable 2026-11-18: «no pareció hacer nada»). Retirar no se deshace: la base no reactiva una oferta retirada.
    const viva = editada && editada.estado !== "desactivada" && vigenciaDeRegla(editada, hoy) !== "terminada" ? editada : null;
    if (viva && retirando === viva.id) {
      const ocupado = trabajando === viva.id;
      return (
        <div ref={pieConfirma} className="of-pie of-pie-confirma pie-hoja-fijo" role="group" aria-label={`Retirar la oferta «${titularDeOferta(viva)}»`}>
          <AvisoNoSeDeshace className="of-confirma-aviso" />
          <p className="of-confirma">
            <b>¿Retirar la oferta «{titularDeOferta(viva).replace(/ %/g, "\u00a0%")}»?</b> {viva.estado === "borrador" ? "Se descarta el borrador." : "Deja de bajar el precio ya."}
          </p>
          <Boton peso="fantasma" data-foco-inicial disabled={ocupado} onClick={() => setRetirando(null)}>
            No, dejarla
          </Boton>
          <Boton peso="primario" cargando={ocupado} textoCargando="Retirando…" onClick={() => retirarRegla(viva, cerrar)}>
            Sí, retirar
          </Boton>
        </div>
      );
    }
    const retirar = viva ? (
      <Boton peso="peligro" className="of-pie-retirar" disabled={guardandoAlgo} onClick={() => setRetirando(viva.id)}>
        Retirar
      </Boton>
    ) : null;
    return (
      <div className="of-pie pie-hoja-fijo">
        {/* La vuelta a la fase anterior: la flecha de todo paso a paso (ADR-0358); en la primera no se dibuja y su lugar se guarda. */}
        <span className={paso === 1 ? "of-vuelta-oculta" : undefined}>
          <Volver onClick={() => ir((paso - 1) as Paso)} a="la fase anterior" deshabilitado={paso === 1} />
        </span>
        {retirar}
        <Boton peso="fantasma" onClick={cerrar} disabled={guardandoAlgo}>
          Cancelar
        </Boton>
        {falta ?? <span className="of-falta" />}
        {derecha}
      </div>
    );
  }

  // ---- La hoja --------------------------------------------------------------------------------------------------------------------
  return (
    <Modal
      titulo={o.id ? "Editar la oferta" : "Nueva oferta"}
      subtitulo={etiqueta.nombre}
      ancho="max-w-[62rem]" /* unificar-fijo: la hoja de una oferta es de diseño propio (por fases y al centro, ADR-0677 act. 2026-11-18 b): 62 rem dejan la columna de 54 rem con las cinco formas de «Qué le das» en una fila */
      /* La hoja no se desliza (desde 640 px): su alto es siempre el mismo y lo reparten las fases, el contenido —lo único que corre— y el pie. */
      altoFijo
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="of-raiz mt-4 space-y-4" data-guia="sellos.ofertas">
          {etiqueta.sedeIds.length > 0 && (
            <div className="of-camp">
              <Chip tono="pizarra" versalitas={false} title="La campaña de antes solo regía en esas tiendas: una oferta no puede salirse de ellas.">
                {textoSedesDeCampana(etiqueta.sedeIds, tiendas)}
              </Chip>
              <button type="button" className="btn-cayla btn-enlace text-xs" disabled={guardandoCampana} onClick={() => guardarCampana({ sedeIds: [] }, "La campaña rige en todas las tiendas")}>
                Quitar el límite
              </button>
            </div>
          )}

          {terminada && (
            <Aviso tono="atencion" titulo="Esta campaña ya terminó">
              {repeticion ? `Para ponerle ofertas, repítela en ${repeticion.anio} desde «Editar» en su pase: ahí se le pasan las fechas al año que viene.` : "Para ponerle ofertas, primero cámbiale las fechas desde «Editar» en su pase."}
            </Aviso>
          )}

          <div className="of-hoja">
            {!terminada && (
              <section ref={alMontar} className="of-wz" aria-label={o.id ? "Editar la oferta" : "Nueva oferta"}>
                {fases()}
                {/* `data-sin-reserva`: si su contenido se acorta, se recoge con él; el aire que <PaginaEstable> dejaría al fondo escondía los números. */}
                <div ref={cuerpo} className="of-cols scroll-cayla" data-sin-reserva="">
                  <div className="of-q" key={paso} data-entra={navego ? "" : undefined} id="oferta-pregunta">
                    {paso === 1 ? pregunta1() : paso === 2 ? preguntaPrendas() : paso === 3 ? preguntaCuando() : preguntaRevisar()}
                  </div>
                </div>
              </section>
            )}
          </div>

          {!terminada && pie(cerrar)}
        </div>
      )}
    </Modal>
  );
}
