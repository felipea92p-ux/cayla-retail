"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { campanaValida, camposDeCampana } from "@/lib/etiqueta-campana-guia";
import {
  BarraAtributos,
  BotonesPendiente,
  BotonReactivar,
  DesactivarTarjeta,
  PieTarjeta,
  SinCoincidencias,
  TarjetaAtributo,
  TituloGrupo,
} from "@/components/atributos/kit";
import { MuestraEtiqueta } from "@/components/MuestraEtiqueta";
import { PrendasDeEtiquetaModal } from "@/components/PrendasDeEtiquetaModal";
import { AYUDA_COMENTARIO_APROBAR, avisoEtiquetaAgregada, cuerpoAprobarEtiqueta, verboAprobacion } from "@/lib/etiqueta-aprobacion-reglas";
import {
  alcanceCampana,
  avisoReimprimir,
  chipDeTarjeta,
  destinoReimprimir,
  conteoDeTarjeta,
  DESCUENTOS_RAPIDOS,
  nombreBajoCosto,
  objecionVigencia,
  parsearDescuento,
  parsearFecha,
  prendasBajoCosto,
  prendasPorCategoria,
  prendasQueCambianDePrecioHoy,
  textoConteoTarjeta,
  type ConteoTarjeta,
  type PrendaConCosto,
} from "@/lib/etiqueta-campana";
import { avisoDiaDeSemana, ordenarPorTemporada, repetirTemporada, textoRango, vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";
import { hoyLima } from "@/lib/fechas-lima";
import { notaSinRegistrar, rotacionDeEtiqueta, textoRotacion, type LecturaRotacion } from "@/lib/etiqueta-rotacion";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { GRUPOS_ETIQUETA, ORDEN_GRUPOS_ETIQUETA, type EstiloEtiqueta } from "@/lib/etiqueta-grupos";
import { normalizarNombre } from "@/lib/patron-visual";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { campanasPorTramo, ESTILO_AL_CREAR, TEXTOS_MODO, TITULO_TRAMO, type ModoEtiquetas } from "@/lib/sellos-campanas";

/**
 * Vocabulario cerrado de etiquetas de catálogo (folksonomy: "Oferta",
 * "Verano 2026") — distinto de la etiqueta física de código de barras que
 * ya existe en Inventario/Movimientos. Mismo mecanismo propone/aprueba/
 * rechaza que colores/tejidos/patrones.
 *
 * Sin restricción por sede a propósito (Felipe, 2026-09-18): "empresa
 * uniforme" — toda etiqueta aplica igual en todas las sedes. La columna
 * `sedes_permitidas` sigue en el esquema (dormida, sin UI) por si algún
 * día hace falta de verdad; no se dropeó porque revivirla no pide
 * migración nueva. Ver 20260918020000_para_liquidar_global_no_por_sede.sql
 * para el porqué: no es cosmética, bloquea venta/traslado de verdad.
 *
 * Aplicar/quitar una etiqueta de una VARIANTE puntual no vive acá — es
 * edición normal de producto (`variantes_write_lider`, ya conectado en
 * ProductoForm.tsx — ese selector solo ofrece las que están vigentes hoy).
 *
 * Configurar campaña (2026-09-18): un Líder le pone a una etiqueta un % de
 * descuento, fechas y, si quiere, las categorías donde rige. SIN categorías
 * la etiqueta solo alcanza a las prendas que alguien etiquetó a mano; CON
 * categorías, a todas las de esas categorías. Esta pantalla GUARDA la
 * configuración y Vender la aplica sola (una prenda con varias campañas recibe
 * solo el mayor). Ver 20260918160000_etiquetas_descuento_y_categorias.sql y
 * 20260918170000_venta_aplica_descuento_de_campana.sql.
 *
 * `estilo` agrupa visualmente en 3 familias + "General" — paleta cerrada
 * a propósito (Felipe: "colores suaves dentro de nuestra paleta", nunca
 * libre), sin usar rojo (acento sagrado, máx. 2 usos por pantalla — un
 * badge por cada una de 20 tarjetas lo rompería). Ver
 * 20260918060000_etiquetas_estilo_visual.sql.
 */

// Los grupos (nombre, color del punto y orden) los comparte el campo «Etiquetas» de Nuevo producto: `lib/etiqueta-grupos.ts`.
type Estilo = EstiloEtiqueta;
const ESTILOS = GRUPOS_ETIQUETA;
const ORDEN_GRUPOS = ORDEN_GRUPOS_ETIQUETA;

/** La grilla de Etiquetas no es la de Colores o Tallas (`GRILLA_ATRIBUTOS`, 2 a 5 columnas fijas): su tarjeta lleva chips, fechas,
 *  descuento, rotación y hasta tres botones, y a 5 columnas medía ~120 px («Imprimir etiquetas de precio» se salía por el costado).
 *  Aquí caben tantas columnas como tarjetas de 13 rem entren: una sola a 375 px, tres a 1024, cinco o seis a 1920. */
const GRILLA_ETIQUETAS = "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]";

type Etiqueta = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  estilo: Estilo;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  descuentoPct: number | null;
  categoriaIds: string[];
};

type CategoriaOpcion = { id: string; nombre: string; familia: string };

// `true` desde que `registrar_venta` lee `etiquetas.descuento_pct`
// (20260918170000_venta_aplica_descuento_de_campana.sql, paso 3 de ADR-0107). Vuelve a
// `false` solo si ese SQL no está en producción: sin él, la pantalla prometería un
// descuento que la caja no cobra. Con `false` avisa que se guarda pero no se cobra.
const DESCUENTO_YA_SE_APLICA = true;

/** 20 → "20", 12.5 → "12.5": sin ceros de más (el decimal peruano es el punto). */
const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

function ordenar(lista: Etiqueta[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** «Configurar», o «Repetir» si su temporada ya pasó. Decía «Campaña» hasta el 2026-10-21, pero la hoja la usa toda etiqueta
 *  (también Nuevo o Hecho a mano), no solo una campaña. El año va en el `title` y en el título de la hoja: «Repetir en 2027» no
 *  cabe en el pie de la tarjeta a 1024 px (101 px de texto en 86). */
const botonCampana = (e: Etiqueta, hoy: string) => {
  const r = repetirTemporada(e.vigenteDesde, e.vigenteHasta, hoy);
  return r
    ? { texto: "Repetir", title: `Repetir en ${r.anio}: abre la campaña con las fechas de ${r.anio}` }
    : { texto: "Configurar", title: "Su descuento, sus fechas y sus categorías" };
};

function TarjetaEtiqueta({
  e,
  vigencia,
  hoy,
  apagada = false,
  conteo = null,
  rotacion = null,
  disenoHref = null,
  children,
}: {
  e: Etiqueta;
  vigencia: Vigencia | null;
  hoy: string;
  apagada?: boolean;
  /** A cuántas prendas a la venta llega, con la regla de su hoja (`conteoDeTarjeta`); `null` = quien mira no lo ve. */
  conteo?: ConteoTarjeta | null;
  /** Rotación: lo que dicen los datos («Quedan 1 unidad · 2 vendidas en 30 días»), `textoRotacion`. */
  rotacion?: string | null;
  /** Su diseño en la tienda online (Tienda web ▸ Campañas, ADR-0471), para quien ve ese módulo; `null`, sin el enlace. */
  disenoHref?: string | null;
  children?: ReactNode;
}) {
  const rango = textoRango(e.vigenteDesde, e.vigenteHasta);
  // Lo que dice su temporada (un chip que se lee sin abrir nada) y, si se ve el conteo, si de verdad llega a alguna prenda.
  const chip = chipDeTarjeta(vigencia, conteo?.total ?? null, hoy);
  const textos = conteo ? textoConteoTarjeta(conteo) : null;
  return (
    <TarjetaAtributo
      // Con la tarjeta a todo lo ancho (una columna en el celular) la franja 3:1 llegaba a ~115 px de alto: se topa en 80 y el
      // dibujo se recorta arriba y abajo (`slice`), sin deformarse.
      muestra={<MuestraEtiqueta nombre={e.nombre} estilo={e.estilo} className="aspect-[3/1] max-h-20 w-full" />}
      nombre={e.nombre}
      notas={e.estado !== "rechazado" ? e.notas : null}
      insignia={e.estado === "pendiente" ? "Pendiente" : e.estado === "rechazado" ? "Rechazada" : null}
      apagada={apagada}
      detalle={
        <>
          {(vigencia || rango) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {chip && (
                <Chip tono={chip.tono} title={chip.title}>
                  {chip.texto}
                </Chip>
              )}
              {chip?.alerta && (
                <Chip tono="ambar" title={chip.title}>
                  {chip.alerta}
                </Chip>
              )}
              {rango && <p className="text-[11px] tabular-nums text-tinta/60">{rango}</p>}
            </div>
          )}
          {e.descuentoPct !== null && (
            <p className="text-[11px] text-tinta/75">
              <span className="font-medium tabular-nums text-tinta">{textoPct(e.descuentoPct)} % de descuento</span>
              {" · "}
              {e.categoriaIds.length === 0
                ? "solo en las prendas etiquetadas"
                : `${e.categoriaIds.length} categoría${e.categoriaIds.length === 1 ? "" : "s"}`}
            </p>
          )}
          {textos && (
            <p className="text-[11px] tabular-nums text-tinta/60">
              {textos.texto}
              {textos.fuera && <span className="block text-tinta/45">{textos.fuera}</span>}
            </p>
          )}
          {rotacion && <p className="text-[11px] tabular-nums text-tinta/75">{rotacion}</p>}
          {e.descuentoPct !== null && !DESCUENTO_YA_SE_APLICA && <p className="text-[10.5px] text-tinta/50">Aún no se aplica en Vender</p>} {/* unificar-fijo: dice el estado del descuento, no que falte algo */}
          {/* ADR-0180 paso 2: con la campaña vigente se imprimen sus etiquetas (precio rebajado); al terminar, las mismas
              prendas vuelven al precio normal. Antes de empezar no hay nada que imprimir: la etiqueta diría el precio de hoy. */}
          {/* A lo ancho de la tarjeta, como «Prendas» y «Configurar», y con el texto que baja de renglón: la tarjeta mide ~130 px
              a 375 px y ~88 px a 1024 (5 columnas), y en una sola línea el botón se salía por el costado. */}
          {e.descuentoPct !== null && e.estado === "aprobado" && !apagada && vigencia?.estado !== "proxima" && (
            <BotonImprimir href={urlEtiquetasDePrecio({ campana: e.id })} chico className="mt-0.5 w-full whitespace-normal text-balance text-center leading-tight">
              {vigencia?.estado === "terminada" ? "Imprimir con el precio normal" : "Imprimir etiquetas de precio"}
            </BotonImprimir>
          )}
          {disenoHref && (
            <BotonVer href={disenoHref} chico className="mt-0.5 self-start">
              Diseño en la tienda web
            </BotonVer>
          )}
        </>
      }
    >
      {children}
    </TarjetaAtributo>
  );
}

export function EtiquetasLista({
  modo,
  etiquetasIniciales,
  categorias,
  prendasConCosto,
  variantesManuales,
  rotacion = null,
  puedeEditar,
  puedeDarDescuento = false,
  disenoWeb = false,
}: {
  /** Qué pantalla es (ADR-0473): Atributos ▸ Sellos o Catálogo ▸ Campañas. Las filas ya llegan filtradas (`esDelModo`). */
  modo: ModoEtiquetas;
  etiquetasIniciales: Etiqueta[];
  categorias: CategoriaOpcion[];
  /** Las prendas con su precio para elegirlas y avisar cuáles quedarían bajo su costo. El costo solo llega a quien tiene permiso de dinero (en los demás es 0 y no avisa). */
  prendasConCosto: PrendaConCosto[];
  /** etiqueta_id → variantes etiquetadas a mano con ella. */
  variantesManuales: Record<string, string[]>;
  /** Unidades y ventas de 30 días por talla, de todas las tiendas (actividad 6): solo para quien puede analizar; `null`, sin la línea. */
  rotacion?: LecturaRotacion | null;
  /** Crear, editar, aprobar y archivar etiquetas: el líder o un rol con el módulo Etiquetas. */
  puedeEditar: boolean;
  /** Tocar una etiqueta CON descuento o ponerle uno: el líder o un rol con el módulo Etiquetas, igual que `puedeEditar` (ADR-0293; la base lo vuelve a exigir). */
  puedeDarDescuento?: boolean;
  /** Campañas: la cuenta ve Tienda web ▸ Campañas y cada tarjeta enlaza a su diseño (solo las que la tienda muestra: aprobadas,
   *  activas y con descuento, la misma regla de `fn_campana_diseno`). */
  disenoWeb?: boolean;
}) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  // «Prendas» abre su propio modal con su propio combo (`PrendasDeEtiquetaModal`).
  const responsable = useResponsable();
  const T = TEXTOS_MODO[modo];
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [etiquetas, setEtiquetas] = useState(() => ordenar(etiquetasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Aprobar (y reactivar una rechazada) pide un comentario: la base lo exige en toda transición a «aprobado»
  // (`lib/etiqueta-aprobacion-reglas.ts`). Mismo patrón que Tallas: una ventana con el comentario, sin responsable (Felipe, 2026-09-29).
  const [aprobandoAbierto, setAprobandoAbierto] = useState<string | null>(null);
  const [comentarioAprobar, setComentarioAprobar] = useState("");
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState<Etiqueta | null>(null);
  const [etiquetando, setEtiquetando] = useState<Etiqueta | null>(null);
  // Copia local de `variantesManuales`: al etiquetar desde el modal de prendas se
  // actualiza aquí (contador de la tarjeta y aviso de costo del modal de campaña) sin
  // recargar la página.
  const [manuales, setManuales] = useState(variantesManuales);
  const [busqueda, setBusqueda] = useState("");
  const [grupo, setGrupo] = useState<Estilo | "todas">("todas");
  const [soloVigentes, setSoloVigentes] = useState(false);
  // El grid solo se re-asienta cuando la persona cambia un filtro, nunca al
  // cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [animar, setAnimar] = useState(false);

  const hoy = hoyLima();
  const vigenciaEn = (e: Etiqueta) => vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
  // Rotación (Nuevo, Top ventas, Últimas unidades, Para liquidar): al lado de lo marcado, lo que dicen los datos, en unidades.
  const porTalla = useMemo(() => new Map(Object.entries(rotacion?.porTalla ?? {})), [rotacion]);
  const lineaRotacion = (e: Etiqueta) =>
    rotacion && e.estilo === "urgencia" ? textoRotacion(rotacionDeEtiqueta(prendasConCosto, new Set(e.categoriaIds), new Set(manuales[e.id] ?? []), porTalla)) : null;
  const notaRotacion = rotacion ? notaSinRegistrar(rotacion.registradas, rotacion.sinRegistrar) : null;
  const q = normalizarNombre(busqueda);
  const pasaFiltros = (e: Etiqueta) =>
    (grupo === "todas" || e.estilo === grupo) &&
    (!soloVigentes || vigenciaEn(e)?.estado === "vigente") &&
    (!q || normalizarNombre(e.nombre).includes(q));
  const hayFiltros = grupo !== "todas" || soloVigentes || q !== "";
  const quitarFiltros = () => {
    setGrupo("todas");
    setSoloVigentes(false);
    setBusqueda("");
    setAnimar(true);
  };

  const activas = etiquetas.filter((e) => e.activo);
  const desactivadas = etiquetas.filter((e) => !e.activo);
  const rechazandoEtiqueta = etiquetas.find((e) => e.id === rechazandoAbierto) ?? null;
  const aprobandoEtiqueta = etiquetas.find((e) => e.id === aprobandoAbierto) ?? null;
  const gruposConEtiquetas = ORDEN_GRUPOS.filter((g) => activas.some((e) => e.estilo === g));
  const vigentesHoy = activas.filter((e) => vigenciaEn(e)?.estado === "vigente").length;
  const activasVisibles = activas.filter(pasaFiltros);
  const desactivadasVisibles = desactivadas.filter(pasaFiltros);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre, estilo: ESTILO_AL_CREAR[modo] }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo agregar ${T.la} ${T.uno}.`);
        return;
      }
      setEtiquetas((actual) =>
        ordenar([
          ...actual,
          {
            id: datos.etiqueta.id,
            nombre: datos.etiqueta.nombre,
            activo: true,
            notas: datos.etiqueta.notas,
            estado: datos.etiqueta.estado,
            estilo: ESTILO_AL_CREAR[modo],
            vigenteDesde: null,
            vigenteHasta: null,
            descuentoPct: null,
            categoriaIds: [],
          },
        ])
      );
      responsable.despues(null);
      // Una propuesta pendiente NO se puede usar todavía (el alta de producto y «Prendas» solo aceptan aprobadas): el aviso
      // ya no promete lo contrario. Los textos viven en `lib/etiqueta-aprobacion-reglas.ts`.
      const { titulo, detalle } = avisoEtiquetaAgregada(datos.etiqueta.nombre, datos.etiqueta.estado, modo);
      avisar.exito(titulo, detalle ? { detalle } : undefined);
      setAgregando(false);
      setNombre("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Aprobar una pendiente o reactivar una rechazada es la MISMA transición para la base (estado → 'aprobado') y las dos exigen
  // el comentario. Si llegara vacío, no se manda nada: el botón de la ventana ya está apagado, esto solo cierra la puerta.
  function abrirAprobacion(e: Etiqueta) {
    setAprobandoAbierto(e.id);
    setComentarioAprobar("");
  }

  async function aprobar(e: Etiqueta) {
    const cuerpo = cuerpoAprobarEtiqueta(e.id, comentarioAprobar);
    if (!cuerpo) return;
    const verbo = verboAprobacion(e.estado);
    setAprobandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_estado") },
        body: JSON.stringify(cuerpo),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${verbo.toLowerCase()} ${T.la} ${T.uno}.`);
        return;
      }
      // `notas` vuelve del servidor: es el comentario que se muestra como ayuda junto al nombre de la etiqueta.
      setEtiquetas((actual) =>
        ordenar(actual.map((x) => (x.id === e.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.etiqueta.notas } : x)))
      );
      avisar.exito(e.estado === "rechazado" ? `${e.nombre} reactivad${T.o}` : `${e.nombre} aprobad${T.o}`, e.estado === "rechazado" ? { detalle: `Vuelve a aparecer al elegir ${T.varios} de una prenda.` } : undefined);
      setAprobandoAbierto(null);
      setComentarioAprobar("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(e: Etiqueta) {
    setRechazandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_rechazar") },
        body: JSON.stringify({ id: e.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo rechazar ${T.la} ${T.uno}.`);
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${e.nombre} rechazad${T.o}`, { detalle: `Cae a Desactivad${T.o}s. Se puede reactivar después si hace falta.` });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  // Solo para una etiqueta aprobada que alguien desactivó: no cambia su estado, así que no lleva comentario. Una RECHAZADA se
  // reactiva por `abrirAprobacion`/`aprobar` (pasa a 'aprobado' y ahí la base sí pide el comentario).
  async function reactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: e.id, activo: true }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo reactivar ${T.la} ${T.uno}.`);
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${e.nombre} reactivad${T.o}`, { detalle: `Vuelve a aparecer al elegir ${T.varios} de una prenda.` });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  async function desactivar(e: Etiqueta) {
    setCambiandoId(e.id);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: e.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo desactivar ${T.la} ${T.uno}.`);
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false } : x))));
      avisar.exito(`${e.nombre} desactivad${T.o}`, { detalle: `Deja de aparecer al elegir ${T.varios} de una prenda nueva; el historial se conserva.` });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta={T.filtrar}
        filtros={
          <>
            <BotonFiltro activo={grupo === "todas"} onClick={() => { setGrupo("todas"); setAnimar(true); }} cuenta={activas.length}>
              Todas
            </BotonFiltro>
            {/* En Campañas todas son del mismo grupo: no hay nada que separar por estilo (ADR-0473). */}
            {modo === "sellos" && gruposConEtiquetas.map((g) => (
              <BotonFiltro
                key={g}
                activo={grupo === g}
                onClick={() => { setGrupo(grupo === g ? "todas" : g); setAnimar(true); }}
                cuenta={activas.filter((e) => e.estilo === g).length}
              >
                {ESTILOS[g].grupo}
              </BotonFiltro>
            ))}
            {vigentesHoy > 0 && (
              <>
                <span aria-hidden className="mx-1 hidden h-4 w-px bg-tinta/15 sm:block" />
                <BotonFiltro
                  activo={soloVigentes}
                  onClick={() => { setSoloVigentes((v) => !v); setAnimar(true); }}
                  cuenta={vigentesHoy}
                  punto="bg-verde"
                >
                  Vigentes hoy
                </BotonFiltro>
              </>
            )}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: `Buscar ${T.uno}`, placeholder: `Buscar ${T.uno}` }}
        agregar={{ texto: `+ Agregar ${T.uno}`, onClick: () => setAgregando(true) }}
      />

      {hayFiltros && activasVisibles.length + desactivadasVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {q ? <>Ningun{T.o === "o" ? "" : "a"} {T.uno} coincide con «{busqueda.trim()}» con los filtros actuales.</> : `Ningun${T.o === "o" ? "" : "a"} ${T.uno} cumple estos filtros.`}
        </SinCoincidencias>
      )}

      <div key={`${grupo}-${soloVigentes}`} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {/* Sellos: por grupo de estilo. Campañas: por su fecha (rigen hoy, próximas, sin fechas, ya pasaron), ADR-0473. */}
        {(modo === "campanas"
          ? campanasPorTramo(activasVisibles, hoy).map((t) => ({ clave: t.tramo, titulo: TITULO_TRAMO[t.tramo], punto: t.tramo === "ahora" ? "bg-verde" : undefined, lista: t.campanas }))
          : ORDEN_GRUPOS.map((clave) => ({
              clave,
              titulo: ESTILOS[clave].grupo,
              punto: ESTILOS[clave].dot,
              // Dentro del grupo, por temporada (lo que rige, lo que viene, lo que pasó); las que no tienen fechas, por nombre.
              lista: ordenarPorTemporada(activasVisibles.filter((e) => e.estilo === clave), hoy),
            }))
        ).map(({ clave, titulo, punto, lista }) => {
          if (lista.length === 0) return null;
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={punto} cuenta={lista.length}>
                {titulo}
              </TituloGrupo>
              {/* Con cuántos datos se juzga: si buena parte de lo vendido no dice qué prenda fue, las cifras de Rotación miran solo una parte. */}
              {clave === "urgencia" && notaRotacion && <p className="nota-cayla text-xs">{notaRotacion}</p>}
              <div className={GRILLA_ETIQUETAS}>
                {lista.map((e) => (
                  <TarjetaEtiqueta
                    key={e.id}
                    e={e}
                    vigencia={vigenciaEn(e)}
                    hoy={hoy}
                    conteo={puedeEditar ? conteoDeTarjeta(prendasConCosto, new Set(e.categoriaIds), manuales[e.id] ?? []) : null}
                    rotacion={lineaRotacion(e)}
                    disenoHref={modo === "campanas" && disenoWeb && e.estado === "aprobado" && e.descuentoPct !== null ? `/tienda-web/campanas/${e.id}` : null}
                  >
                    {/* Una etiqueta CON descuento cambia el precio en caja; quien tiene el módulo Etiquetas también la configura (ADR-0293). */}
                    {puedeEditar && (e.descuentoPct === null || puedeDarDescuento) &&
                      (e.estado === "pendiente" ? (
                        <BotonesPendiente
                          onAprobar={() => abrirAprobacion(e)}
                          onRechazar={() => {
                            setRechazandoAbierto(e.id);
                            setMotivoRechazo("");
                          }}
                        />
                      ) : (
                        <PieTarjeta>
                          {/* Los botones chicos del sistema (ADR-0358), a lo ancho de la tarjeta como «Reactivar»: a 1024 px el pie
                              mide 88 px y dos lado a lado no caben (ni un ícono al lado del texto). Cambian varias cosas de un toque: no son enlaces. */}
                          <div className="grid w-full gap-1.5">
                            <button type="button" onClick={() => setEtiquetando(e)} data-guia="atributos.prendas" className="btn-cayla btn-sutil btn-chico w-full whitespace-nowrap">
                              Prendas
                            </button>
                            {/* Una campaña que ya pasó se abre para repetirla: la misma hoja, con las fechas del año que viene. */}
                            <button
                              type="button"
                              onClick={() => setConfigurando(e)}
                              title={botonCampana(e, hoy).title}
                              data-guia="atributos.campana"
                              className="btn-cayla btn-sutil btn-chico w-full whitespace-nowrap"
                            >
                              {botonCampana(e, hoy).texto}
                            </button>
                          </div>
                          <DesactivarTarjeta
                            cambiando={cambiandoId === e.id}
                            onClick={() => setConfirmando(confirmacionCatalogo("desactivar", e.nombre, () => desactivar(e)))}
                          />
                        </PieTarjeta>
                      ))}
                  </TarjetaEtiqueta>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {desactivadasVisibles.length > 0 && (
        <section className="space-y-3">
          <TituloGrupo cuenta={desactivadasVisibles.length}>{`Desactivad${T.o}s — ya no se pueden poner en una prenda nueva`}</TituloGrupo>
          <div className={GRILLA_ETIQUETAS}>
            {desactivadasVisibles.map((e) => (
              <TarjetaEtiqueta key={e.id} e={e} vigencia={null} hoy={hoy} apagada>
                {puedeEditar && (e.descuentoPct === null || puedeDarDescuento) && (
                  <BotonReactivar
                    cambiando={cambiandoId === e.id}
                    onClick={() => (e.estado === "rechazado" ? abrirAprobacion(e) : setConfirmando(confirmacionCatalogo("reactivar", e.nombre, () => reactivar(e))))}
                  />
                )}
              </TarjetaEtiqueta>
            ))}
          </div>
        </section>
      )}

      {agregando && (
        <NuevaEtiquetaModal modo={modo} nombre={nombre} onNombre={setNombre} responsable={responsable} guardando={guardando} onGuardar={guardar} onClose={() => setAgregando(false)} />
      )}

      {etiquetando && (
        <PrendasDeEtiquetaModal
          etiqueta={etiquetando}
          prendasConCosto={prendasConCosto}
          marcasManuales={manuales[etiquetando.id] ?? []}
          onClose={() => setEtiquetando(null)}
          onAplicado={(finales) => {
            setManuales((actual) => ({ ...actual, [etiquetando.id]: finales }));
            setEtiquetando(null);
          }}
        />
      )}

      {configurando && (
        <CampanaModal
          modo={modo}
          etiqueta={configurando}
          puedeDarDescuento={puedeDarDescuento}
          categorias={categorias}
          prendasConCosto={prendasConCosto}
          variantesManuales={manuales[configurando.id] ?? []}
          onClose={() => setConfigurando(null)}
          onGuardado={(cambios) => {
            setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === configurando.id ? { ...x, ...cambios } : x))));
            setConfigurando(null);
          }}
        />
      )}

      {aprobandoEtiqueta && (
        <Modal
          titulo={`${verboAprobacion(aprobandoEtiqueta.estado)} «${aprobandoEtiqueta.nombre}»`}
          subtitulo={AYUDA_COMENTARIO_APROBAR}
          onClose={() => setAprobandoAbierto(null)}
        >
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Comentario (obligatorio)" value={comentarioAprobar} onChange={(e) => setComentarioAprobar(e.target.value)} autoFocus />
              <div className="pie-acciones">
                <Boton peso="fantasma" onClick={cerrar} disabled={aprobandoId === aprobandoEtiqueta.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                 
                  cargando={aprobandoId === aprobandoEtiqueta.id}
                  disabled={!comentarioAprobar.trim()}
                  onClick={() => aprobar(aprobandoEtiqueta)}
                >
                  {aprobandoEtiqueta.estado === "rechazado" ? "Confirmar reactivación" : "Confirmar aprobación"}
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {rechazandoEtiqueta && (
        <Modal titulo={`Rechazar «${rechazandoEtiqueta.nombre}»`} onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="pie-acciones">
                <Boton peso="fantasma" onClick={cerrar} disabled={rechazandoId === rechazandoEtiqueta.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                 
                  cargando={rechazandoId === rechazandoEtiqueta.id}
                  onClick={() => rechazar(rechazandoEtiqueta)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

/**
 * UNA campaña, con la misma tarjeta, los mismos botones («Prendas», «Configurar» o «Repetir») y las mismas hojas que en
 * Catálogo ▸ Campañas. La monta la ficha de Tienda web ▸ Campañas (pestaña «Datos y prendas»): Felipe, 2026-10-22, «que se pueda
 * editar, agregar prendas y demás cosas a las campañas desde ambos módulos» y «mismas piezas dentro» (ADR-0473). Guarda por las
 * mismas rutas; la base decide quién puede (`fn_puede_campanas`).
 */
export function TarjetaDeCampana({
  campana,
  categorias,
  prendasConCosto,
  variantesManuales,
}: {
  campana: Etiqueta;
  categorias: CategoriaOpcion[];
  prendasConCosto: PrendaConCosto[];
  /** Las prendas puestas a mano en ESTA campaña. */
  variantesManuales: string[];
}) {
  const [e, setE] = useState(campana);
  const [manuales, setManuales] = useState(variantesManuales);
  const [configurando, setConfigurando] = useState(false);
  const [etiquetando, setEtiquetando] = useState(false);
  const hoy = hoyLima();
  const editable = e.estado === "aprobado" && e.activo;
  return (
    <div className="max-w-xs">
      <TarjetaEtiqueta
        e={e}
        vigencia={vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy)}
        hoy={hoy}
        apagada={!e.activo}
        conteo={conteoDeTarjeta(prendasConCosto, new Set(e.categoriaIds), manuales)}
      >
        {editable && (
          <PieTarjeta>
            <div className="grid w-full gap-1.5">
              <button type="button" onClick={() => setEtiquetando(true)} data-guia="campana-web.prendas" className="btn-cayla btn-sutil btn-chico w-full whitespace-nowrap">
                Prendas
              </button>
              <button
                type="button"
                onClick={() => setConfigurando(true)}
                title={botonCampana(e, hoy).title}
                data-guia="campana-web.configurar"
                className="btn-cayla btn-sutil btn-chico w-full whitespace-nowrap"
              >
                {botonCampana(e, hoy).texto}
              </button>
            </div>
          </PieTarjeta>
        )}
      </TarjetaEtiqueta>
      {!editable && (
        <p className="nota-cayla mt-3 text-xs">Esta campaña está desactivada o pendiente de aprobar: se cambia en Catálogo ▸ Campañas.</p>
      )}
      {etiquetando && (
        <PrendasDeEtiquetaModal
          etiqueta={e}
          prendasConCosto={prendasConCosto}
          marcasManuales={manuales}
          onClose={() => setEtiquetando(false)}
          onAplicado={(finales) => {
            setManuales(finales);
            setEtiquetando(false);
          }}
        />
      )}
      {configurando && (
        <CampanaModal
          modo="campanas"
          etiqueta={e}
          puedeDarDescuento
          categorias={categorias}
          prendasConCosto={prendasConCosto}
          variantesManuales={manuales}
          onClose={() => setConfigurando(false)}
          onGuardado={(cambios) => {
            setE((actual) => ({ ...actual, ...cambios }));
            setConfigurando(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configurar campaña: descuento, fechas y categorías, guardados juntos por el
// RPC `actualizar_campana_etiqueta` (todo o nada). Las categorías son
// opcionales a propósito: sin ninguna, la etiqueta rige solo en las prendas
// que alguien etiquetó a mano. Si hay varias etiquetas con descuento en una
// misma prenda, Vender aplicará solo el mayor (paso aparte, aún sin construir).
// ---------------------------------------------------------------------------
function CampanaModal({
  modo,
  etiqueta,
  puedeDarDescuento,
  categorias,
  prendasConCosto,
  variantesManuales,
  onClose,
  onGuardado,
}: {
  modo: ModoEtiquetas;
  etiqueta: Etiqueta;
  /** Sin esto (un rol con Etiquetas que no es líder), la campaña se configura SIN descuento: fechas y categorías. */
  puedeDarDescuento: boolean;
  categorias: CategoriaOpcion[];
  prendasConCosto: PrendaConCosto[];
  variantesManuales: string[];
  onClose: () => void;
  onGuardado: (cambios: Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "categoriaIds">) => void;
}) {
  // Si su temporada ya pasó, la hoja abre para repetirla: las mismas fechas, un año después (se guardan solo con «Guardar»).
  const T = TEXTOS_MODO[modo];
  const [repetir] = useState(() => repetirTemporada(etiqueta.vigenteDesde, etiqueta.vigenteHasta, hoyLima()));
  const [descuento, setDescuento] = useState(etiqueta.descuentoPct === null ? "" : String(etiqueta.descuentoPct));
  const [desde, setDesde] = useState((repetir ? repetir.desde : etiqueta.vigenteDesde) ?? "");
  const [hasta, setHasta] = useState((repetir ? repetir.hasta : etiqueta.vigenteHasta) ?? "");
  const avisoDia = repetir ? avisoDiaDeSemana(repetir, { desde, hasta }) : null;
  const [elegidas, setElegidas] = useState(() => new Set(etiqueta.categoriaIds));
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  // Guía de foco: sale de la misma regla que apaga «Guardar» (`campanaValida`, y su prueba exige que coincidan); todo es opcional,
  // así que solo «sigue» lo mal escrito.
  const guia = useGuiaCampos(camposDeCampana({ descuento, desde, hasta, categorias: elegidas.size, puedeDarDescuento }));

  const pct = parsearDescuento(descuento);
  const fDesde = parsearFecha(desde);
  const fHasta = parsearFecha(hasta);
  const objecion = fDesde.ok && fHasta.ok ? objecionVigencia(fDesde.valor, fHasta.valor) : null;
  const valido = campanaValida({ descuento, desde, hasta });
  // La campaña no se bloquea por bajar del costo (puede ser una liquidación a propósito),
  // pero quien la configura se entera: número en rojo y cuántas prendas serían.
  const bajoCosto = prendasBajoCosto(pct.ok ? pct.valor : null, prendasConCosto, elegidas, new Set(variantesManuales));

  // Cada categoría dice cuántas prendas a la venta trae, y la hoja dice a cuántas llega la campaña antes de guardar. Las categorías
  // sin prendas van juntas al final: se pueden elegir (pueden recibir prendas después), pero no compiten con las que sí venden.
  const prendasDe = prendasPorCategoria(prendasConCosto);
  const alcance = alcanceCampana(prendasConCosto, elegidas, new Set(variantesManuales));
  const porFamilia = new Map<string, CategoriaOpcion[]>();
  const sinPrendas: CategoriaOpcion[] = [];
  for (const c of categorias) {
    if (!prendasDe.get(c.id)) sinPrendas.push(c);
    else porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c]);
  }
  // Plegadas por defecto: son muchas y hoy no mueven ninguna prenda. Se abren solas si ya hay una elegida ahí, para que no quede escondida.
  const sinPrendasElegida = sinPrendas.some((c) => elegidas.has(c.id));

  const alternar = (id: string) =>
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  async function guardar() {
    if (!pct.ok || !fDesde.ok || !fHasta.ok) return;
    setGuardando(true);
    try {
      const categoriaIds = [...elegidas];
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_campana") },
        body: JSON.stringify({
          id: etiqueta.id,
          campana: { descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds },
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la campaña.");
        return;
      }
      // Si guardar cambió HOY el precio en caja de alguna prenda (otro %, fechas que la hacen regir o dejar de regir, categorías
      // que entran o salen), su etiqueta de papel quedó vieja: el aviso lo dice y lleva a imprimir solo esas (ADR-0180).
      const cambian = prendasQueCambianDePrecioHoy(
        etiqueta,
        { descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds },
        prendasConCosto,
        new Set(variantesManuales),
        hoyLima(),
      );
      const destino = destinoReimprimir(cambian, etiqueta.id);
      const reimprimir = avisoReimprimir(cambian.quedan.length + cambian.salen.length, destino !== null);
      avisar.exito(
        `${etiqueta.nombre} actualizad${T.o}`,
        reimprimir
          ? { detalle: reimprimir.detalle, accion: destino && reimprimir.boton ? { texto: reimprimir.boton, onClick: () => router.push(destino) } : undefined }
          : undefined,
      );
      onGuardado({ descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={repetir ? `Repetir «${etiqueta.nombre}» en ${repetir.anio}` : `Configuración «${etiqueta.nombre}»`}
      subtitulo={
        repetir
          ? `Las fechas son las de ${etiqueta.vigenteHasta?.slice(0, 4)}, pasadas a ${repetir.anio}. Revisa el descuento y las categorías, y guarda.`
          : "Cuánto baja, cuándo rige y en qué categorías. Las prendas sueltas se eligen en «Prendas»."
      }
      tamano="ancha"
      onClose={onClose}
    >
      {(cerrar) => (
        <div data-guia="atributos.campana-form" className="mt-5 space-y-5">
          {/* Dos columnas desde tablet: a la izquierda cuánto y cuándo, a la derecha las categorías completas. En una hoja angosta
              Desde y Hasta no cabían juntos y las categorías vivían en una caja con su propio scroll dentro de la hoja. */}
          <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div className="space-y-5">
              <CampoGuiado id="descuento" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("descuento", "Descuento (%)")}
                  mono
                  inputMode="decimal"
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  disabled={!puedeDarDescuento}
                  placeholder={puedeDarDescuento ? "Escribe otro %" : "Tu rol no pone descuento"}
                  tono={!pct.ok || bajoCosto.length > 0 ? "error" : undefined}
                  className={bajoCosto.length > 0 ? "!text-rojo-profundo" : ""}
                  pie={
                    !pct.ok
                      ? pct.error
                      : bajoCosto.length > 0
                        ? `Por debajo del costo: ${bajoCosto.length} prenda${bajoCosto.length === 1 ? "" : "s"} (${bajoCosto
                            .slice(0, 2)
                            .map(nombreBajoCosto)
                            .join(", ")}${bajoCosto.length > 2 ? "…" : ""}). Se puede guardar igual.`
                        : pct.valor === null
                          ? `Vacío: ${T.la} ${T.uno} solo marca prendas y no cambia precios.`
                          : `Baja ${textoPct(pct.valor)} % el precio en Vender, sin pedir código.`
                  }
                  autoComplete="off"
                />
                {puedeDarDescuento && (
                  <div role="group" aria-label="Descuentos de siempre" className="mt-1 flex flex-wrap gap-1.5">
                    <button type="button" className="pildora-cayla" aria-pressed={pct.ok && pct.valor === null} onClick={() => setDescuento("")}>
                      Sin descuento
                    </button>
                    {DESCUENTOS_RAPIDOS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="pildora-cayla tabular-nums"
                        aria-pressed={pct.ok && pct.valor === v}
                        onClick={() => setDescuento(String(v))}
                      >
                        {v} %
                      </button>
                    ))}
                  </div>
                )}
              </CampoGuiado>

              {/* El título del grupo va FUERA de la grilla: dentro, ocupaba la primera celda y partía Desde y Hasta en dos filas. */}
              <CampoGuiado id="vigencia" guia={guia} titulo="Cuándo rige" ayuda="Opcional: sin fechas, rige siempre.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoFecha etiqueta="Desde" valor={desde} onValor={setDesde} tono={fDesde.ok ? undefined : "error"} />
                  <CampoFecha
                    etiqueta="Hasta"
                    valor={hasta}
                    onValor={setHasta}
                    tono={fHasta.ok && !objecion ? undefined : "error"}
                    pie={objecion ?? undefined}
                  />
                </div>
                {/* Al repetir: sumar un año cambia el día de la semana. Si la fiesta va por día (el 2.º domingo de mayo), un toque
                    corre la temporada entera; si va por fecha (el 25 de diciembre), se deja como está. */}
                {avisoDia && repetir?.mismoDia && (
                  // El botón va debajo de la frase, no a su lado: en la columna angosta le quitaba el ancho y la frase se partía en 9 líneas.
                  <Aviso tono="info" className="mt-3" titulo={avisoDia.titulo}>
                    <p>{avisoDia.detalle}</p>
                    {avisoDia.modo === "sumando-un-anio" ? (
                      <button
                        type="button"
                        className="btn-cayla btn-sutil btn-chico mt-2"
                        onClick={() => {
                          setDesde(repetir.mismoDia?.desde ?? "");
                          setHasta(repetir.mismoDia?.hasta ?? "");
                        }}
                      >
                        {avisoDia.boton}
                      </button>
                    ) : (
                      <BotonDeshacer
                        className="mt-1"
                        onClick={() => {
                          setDesde(repetir.desde ?? "");
                          setHasta(repetir.hasta ?? "");
                        }}
                      />
                    )}
                  </Aviso>
                )}
              </CampoGuiado>
            </div>

            <CampoGuiado id="categorias" guia={guia} retiene="fila">
              <div className="flex items-baseline justify-between gap-3">
                <p className="label-cayla text-[11px] text-tinta/65">
                  {guia.etiqueta("categorias", "Categorías")} <span className="font-normal normal-case text-tinta/45">· opcional</span>
                </p>
                {elegidas.size > 0 && (
                  <button type="button" onClick={() => setElegidas(new Set())} className="btn-cayla btn-enlace text-xs">
                    Quitar todas
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-tinta/65" aria-live="polite">
                {elegidas.size === 0
                  ? `Sin categorías, la campaña solo alcanza a las prendas marcadas a mano${alcance.aMano ? ` (${alcance.aMano})` : ": hoy ninguna"}.`
                  : `Alcanza a ${alcance.total} prenda${alcance.total === 1 ? "" : "s"} a la venta: ${alcance.porCategoria} de ${elegidas.size} categoría${elegidas.size === 1 ? "" : "s"}${alcance.aMano ? ` y ${alcance.aMano} marcada${alcance.aMano === 1 ? "" : "s"} a mano` : ""}.`}
              </p>
              <div className="mt-3 space-y-3">
                {[...porFamilia.entries()].map(([familia, lista]) => (
                  <div key={familia}>
                    <p className="text-[11px] text-tinta/60">{familia}</p>
                    <ChipsCategorias lista={lista} elegidas={elegidas} prendasDe={prendasDe} onAlternar={alternar} />
                  </div>
                ))}
                {sinPrendas.length > 0 && (
                  <details open={sinPrendasElegida || undefined} className="border-t border-sand pt-2">
                    <summary className="cursor-pointer text-[11px] text-tinta/60">
                      Sin prendas todavía · {sinPrendas.length} categoría{sinPrendas.length === 1 ? "" : "s"}
                    </summary>
                    <ChipsCategorias lista={sinPrendas} elegidas={elegidas} prendasDe={prendasDe} onAlternar={alternar} />
                  </details>
                )}
              </div>
            </CampoGuiado>
          </div>

          <p className="nota-cayla text-xs">
            {DESCUENTO_YA_SE_APLICA
              ? `En Vender, las prendas con est${T.o === "o" ? "e" : "a"} ${T.uno} llevan el descuento solas, dentro de las fechas. Si una prenda tiene varias campañas, se aplica solo la de mayor descuento.`
              : "Esto guarda la configuración. Todavía no cambia el precio en Vender."}
          </p>

          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div data-guia="atributos.campana-pie" className="pie-acciones pt-1">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!valido} title={guia.frase ?? undefined}>
              Guardar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Las categorías de un grupo como píldoras que se eligen, cada una con cuántas prendas a la venta trae. */
function ChipsCategorias({
  lista,
  elegidas,
  prendasDe,
  onAlternar,
}: {
  lista: CategoriaOpcion[];
  elegidas: ReadonlySet<string>;
  prendasDe: ReadonlyMap<string, number>;
  onAlternar: (id: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {lista.map((c) => (
        <button key={c.id} type="button" aria-pressed={elegidas.has(c.id)} onClick={() => onAlternar(c.id)} className="pildora-cayla">
          {c.nombre}
          <span className="text-[11px] font-normal tabular-nums opacity-70">{prendasDe.get(c.id) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * La ventana de agregar una etiqueta. Su guía de foco (CLAUDE.md «Guía de foco») sale de lo que ya apaga el botón: un nombre y
 * alguien que firma. Vive en su propio componente para que la guía nazca y muera con la ventana.
 */
function NuevaEtiquetaModal({
  modo,
  nombre,
  onNombre,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  modo: ModoEtiquetas;
  nombre: string;
  onNombre: (v: string) => void;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: () => void;
  onClose: () => void;
}) {
  const T = TEXTOS_MODO[modo];
  const delUno = `${T.la === "el" ? "del" : "de la"} ${T.uno}`;
  const guia = useGuiaCampos([
    { id: "nombre", nombre: `Nombre ${delUno}`, requerido: true, hecho: nombre.trim() !== "", pendiente: `Escribe el nombre ${delUno}.` },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo={T.nuevo} subtitulo={T.agregarDetalle} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("nombre", `Nombre ${delUno}`)} value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder={T.ejemplo} autoFocus />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={onGuardar}
              cargando={guardando}
              disabled={!nombre.trim() || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar {T.uno}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
