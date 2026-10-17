"use client";

import { useState, type ReactNode } from "react";
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
  GRILLA_ATRIBUTOS,
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
  chipDeTarjeta,
  conteoDeTarjeta,
  DESCUENTOS_RAPIDOS,
  nombreBajoCosto,
  objecionVigencia,
  parsearDescuento,
  parsearFecha,
  prendasBajoCosto,
  prendasPorCategoria,
  textoConteoTarjeta,
  type ConteoTarjeta,
  type PrendaConCosto,
} from "@/lib/etiqueta-campana";
import { textoRango, vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";
import { hoyLima } from "@/lib/fechas-lima";
import { GRUPOS_ETIQUETA, ORDEN_GRUPOS_ETIQUETA, type EstiloEtiqueta } from "@/lib/etiqueta-grupos";
import { normalizarNombre } from "@/lib/patron-visual";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { BotonImprimir } from "@/components/ui/BotonImprimir";

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

function TarjetaEtiqueta({
  e,
  vigencia,
  apagada = false,
  conteo = null,
  children,
}: {
  e: Etiqueta;
  vigencia: Vigencia | null;
  apagada?: boolean;
  /** A cuántas prendas a la venta llega, con la regla de su hoja (`conteoDeTarjeta`); `null` = quien mira no lo ve. */
  conteo?: ConteoTarjeta | null;
  children?: ReactNode;
}) {
  const rango = textoRango(e.vigenteDesde, e.vigenteHasta);
  // Lo que dice su temporada (un chip que se lee sin abrir nada) y, si se ve el conteo, si de verdad llega a alguna prenda.
  const chip = chipDeTarjeta(vigencia, conteo?.total ?? null);
  const textos = conteo ? textoConteoTarjeta(conteo) : null;
  return (
    <TarjetaAtributo
      muestra={<MuestraEtiqueta nombre={e.nombre} estilo={e.estilo} />}
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
          {e.descuentoPct !== null && !DESCUENTO_YA_SE_APLICA && <p className="text-[10.5px] text-tinta/50">Aún no se aplica en Vender</p>} {/* unificar-fijo: dice el estado del descuento, no que falte algo */}
          {/* ADR-0180 paso 2: con la campaña vigente se imprimen sus etiquetas (precio rebajado); al terminar, las mismas
              prendas vuelven al precio normal. Antes de empezar no hay nada que imprimir: la etiqueta diría el precio de hoy. */}
          {e.descuentoPct !== null && e.estado === "aprobado" && !apagada && vigencia?.estado !== "proxima" && (
            <BotonImprimir href={urlEtiquetasDePrecio({ campana: e.id })} chico className="mt-0.5 self-start">
              {vigencia?.estado === "terminada" ? "Imprimir con el precio normal" : "Imprimir etiquetas de precio"}
            </BotonImprimir>
          )}
        </>
      }
    >
      {children}
    </TarjetaAtributo>
  );
}

export function EtiquetasLista({
  etiquetasIniciales,
  categorias,
  prendasConCosto,
  variantesManuales,
  puedeEditar,
  puedeDarDescuento = false,
}: {
  etiquetasIniciales: Etiqueta[];
  categorias: CategoriaOpcion[];
  /** Las prendas con su precio para elegirlas y avisar cuáles quedarían bajo su costo. El costo solo llega a quien tiene permiso de dinero (en los demás es 0 y no avisa). */
  prendasConCosto: PrendaConCosto[];
  /** etiqueta_id → variantes etiquetadas a mano con ella. */
  variantesManuales: Record<string, string[]>;
  /** Crear, editar, aprobar y archivar etiquetas: el líder o un rol con el módulo Etiquetas. */
  puedeEditar: boolean;
  /** Tocar una etiqueta CON descuento o ponerle uno: el líder o un rol con el módulo Etiquetas, igual que `puedeEditar` (ADR-0293; la base lo vuelve a exigir). */
  puedeDarDescuento?: boolean;
}) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  // «Prendas» abre su propio modal con su propio combo (`PrendasDeEtiquetaModal`).
  const responsable = useResponsable();
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
        body: JSON.stringify({ nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la etiqueta.");
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
            estilo: "neutral",
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
      const { titulo, detalle } = avisoEtiquetaAgregada(datos.etiqueta.nombre, datos.etiqueta.estado);
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
        avisar.error(datos.error ?? `No se pudo ${verbo.toLowerCase()} la etiqueta.`);
        return;
      }
      // `notas` vuelve del servidor: es el comentario que se muestra como ayuda junto al nombre de la etiqueta.
      setEtiquetas((actual) =>
        ordenar(actual.map((x) => (x.id === e.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.etiqueta.notas } : x)))
      );
      avisar.exito(e.estado === "rechazado" ? `${e.nombre} reactivada` : `${e.nombre} aprobada`, e.estado === "rechazado" ? { detalle: "Vuelve a aparecer al etiquetar una variante." } : undefined);
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
        avisar.error(datos.error ?? "No se pudo rechazar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${e.nombre} rechazada`, { detalle: "Cae a Desactivadas. Se puede reactivar después si hace falta." });
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
        avisar.error(datos.error ?? "No se pudo reactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: true, estado: "aprobado" as const } : x))));
      avisar.exito(`${e.nombre} reactivada`, { detalle: "Vuelve a aparecer al etiquetar una variante." });
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
        avisar.error(datos.error ?? "No se pudo desactivar la etiqueta.");
        return;
      }
      setEtiquetas((actual) => ordenar(actual.map((x) => (x.id === e.id ? { ...x, activo: false } : x))));
      avisar.exito(`${e.nombre} desactivada`, { detalle: "Deja de aparecer al etiquetar una variante nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar etiquetas"
        filtros={
          <>
            <BotonFiltro activo={grupo === "todas"} onClick={() => { setGrupo("todas"); setAnimar(true); }} cuenta={activas.length}>
              Todas
            </BotonFiltro>
            {gruposConEtiquetas.map((g) => (
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
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar etiqueta", placeholder: "Buscar etiqueta" }}
        agregar={{ texto: "+ Agregar etiqueta", onClick: () => setAgregando(true) }}
      />

      {hayFiltros && activasVisibles.length + desactivadasVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {q ? <>Ninguna etiqueta coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna etiqueta cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={`${grupo}-${soloVigentes}`} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_GRUPOS.map((clave) => {
          const delGrupo = activasVisibles.filter((e) => e.estilo === clave);
          if (delGrupo.length === 0) return null;
          const { grupo: nombreGrupo, dot } = ESTILOS[clave];
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={dot} cuenta={delGrupo.length}>
                {nombreGrupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delGrupo.map((e) => (
                  <TarjetaEtiqueta
                    key={e.id}
                    e={e}
                    vigencia={vigenciaEn(e)}
                    conteo={puedeEditar ? conteoDeTarjeta(prendasConCosto, new Set(e.categoriaIds), manuales[e.id] ?? []) : null}
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
                            <button type="button" onClick={() => setConfigurando(e)} data-guia="atributos.campana" className="btn-cayla btn-sutil btn-chico w-full whitespace-nowrap">
                              Campaña
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
          <TituloGrupo cuenta={desactivadasVisibles.length}>Desactivadas — ya no se pueden aplicar a una variante nueva</TituloGrupo>
          <div className={GRILLA_ATRIBUTOS}>
            {desactivadasVisibles.map((e) => (
              <TarjetaEtiqueta key={e.id} e={e} vigencia={null} apagada>
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
        <NuevaEtiquetaModal nombre={nombre} onNombre={setNombre} responsable={responsable} guardando={guardando} onGuardar={guardar} onClose={() => setAgregando(false)} />
      )}

      {etiquetando && (
        <PrendasDeEtiquetaModal
          etiqueta={etiquetando}
          prendasConCosto={prendasConCosto}
          onClose={() => setEtiquetando(null)}
          onAplicado={(finales) => {
            setManuales((actual) => ({ ...actual, [etiquetando.id]: finales }));
            setEtiquetando(null);
          }}
        />
      )}

      {configurando && (
        <CampanaModal
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

// ---------------------------------------------------------------------------
// Configurar campaña: descuento, fechas y categorías, guardados juntos por el
// RPC `actualizar_campana_etiqueta` (todo o nada). Las categorías son
// opcionales a propósito: sin ninguna, la etiqueta rige solo en las prendas
// que alguien etiquetó a mano. Si hay varias etiquetas con descuento en una
// misma prenda, Vender aplicará solo el mayor (paso aparte, aún sin construir).
// ---------------------------------------------------------------------------
function CampanaModal({
  etiqueta,
  puedeDarDescuento,
  categorias,
  prendasConCosto,
  variantesManuales,
  onClose,
  onGuardado,
}: {
  etiqueta: Etiqueta;
  /** Sin esto (un rol con Etiquetas que no es líder), la campaña se configura SIN descuento: fechas y categorías. */
  puedeDarDescuento: boolean;
  categorias: CategoriaOpcion[];
  prendasConCosto: PrendaConCosto[];
  variantesManuales: string[];
  onClose: () => void;
  onGuardado: (cambios: Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "categoriaIds">) => void;
}) {
  const [descuento, setDescuento] = useState(etiqueta.descuentoPct === null ? "" : String(etiqueta.descuentoPct));
  const [desde, setDesde] = useState(etiqueta.vigenteDesde ?? "");
  const [hasta, setHasta] = useState(etiqueta.vigenteHasta ?? "");
  const [elegidas, setElegidas] = useState(() => new Set(etiqueta.categoriaIds));
  const [guardando, setGuardando] = useState(false);

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
      avisar.exito(`${etiqueta.nombre} actualizada`);
      onGuardado({ descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={`Campaña «${etiqueta.nombre}»`}
      subtitulo="Cuánto baja, cuándo rige y en qué categorías. Las prendas sueltas se eligen en «Prendas»."
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
                          ? "Vacío: la etiqueta solo marca prendas y no cambia precios."
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
              ? "En Vender, las prendas con esta etiqueta llevan el descuento solas, dentro de las fechas. Si una prenda tiene varias campañas, se aplica solo la de mayor descuento."
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
  nombre,
  onNombre,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  nombre: string;
  onNombre: (v: string) => void;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: () => void;
  onClose: () => void;
}) {
  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre de la etiqueta", requerido: true, hecho: nombre.trim() !== "", pendiente: "Escribe el nombre de la etiqueta." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo="Nueva etiqueta" subtitulo="Queda disponible de inmediato para cualquier variante." onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre de la etiqueta")} value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder="Ej. Oferta, Verano 2026" autoFocus />
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
              Guardar etiqueta
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
