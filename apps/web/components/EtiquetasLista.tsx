"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import type { ControlResponsable } from "@/lib/useResponsable";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { ElegirDibujoDeInsignia } from "@/components/sellos/ElegirDibujoDeInsignia";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { campanaValida, camposDeCampana } from "@/lib/etiqueta-campana-guia";
import { PieTarjeta, TarjetaAtributo } from "@/components/atributos/kit";
import type { DibujoDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { eleccionEfectiva, type EleccionDeDibujo } from "@/lib/eleccion-de-dibujo";
import { MuestraEtiqueta } from "@/components/MuestraEtiqueta";
import { PrendasDeEtiquetaModal } from "@/components/PrendasDeEtiquetaModal";
import {
  alcanceCampana,
  alternarSede,
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
  textoSedesDeCampana,
  type ConteoTarjeta,
  type PrendaConCosto,
  type TiendaOpcion,
} from "@/lib/etiqueta-campana";
import { avisoDiaDeSemana, fechaCorta, repetirTemporada, textoRango, vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";
import { hoyLima } from "@/lib/fechas-lima";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import type { EstiloEtiqueta } from "@/lib/etiqueta-grupos";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { EtiquetaDeCampana } from "@/components/campana-hoja/EtiquetaDeCampana";
import { CategoriasDeCampana } from "@/components/campana-hoja/CategoriasDeCampana";
import { PASO_DESCUENTO as PASO, ejemplosDeCaja, pasoDeDescuento, piezasDelMosaico, textoDuracion, unSoloEnvio } from "@/lib/campana-hoja";
import { sinMovimiento } from "@/components/etiqueta-prendas/vuelo";
import { avanceDeCampana } from "@/lib/sellos-pases";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { TEXTOS_MODO, type ModoEtiquetas } from "@/lib/sellos-campanas";

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

// Desde el 2026-10-22 la lista de tarjetas ya no vive aquí: Catálogo ▸ Insignias es una billetera de pases
// (`components/sellos/SellosPantalla.tsx`). Este archivo guarda lo que esa pantalla y Tienda web ▸ Campañas comparten: la fila, la
// tarjeta de UNA campaña (`TarjetaDeCampana`) y las hojas que guardan (`CampanaModal`, `NuevaEtiquetaModal`).
export type Etiqueta = {
  id: string;
  nombre: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  estilo: Estilo;
  /** El dibujo de la lista que se eligió al crearla (ADR-0490); `null` = el de su nombre (o su imagen propia, si tiene). */
  icono: DibujoDeInsignia | null;
  /** La ruta de su imagen propia en el almacén `retail-insignias` (ADR-0490); `null` = no tiene. No convive con `icono`. */
  imagen: string | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  descuentoPct: number | null;
  categoriaIds: string[];
  /** Las tiendas donde rige el descuento (ADR-0486). Vacío = todas las sedes. */
  sedeIds: string[];
};

export type CategoriaOpcion = {
  id: string;
  nombre: string;
  familia: string;
  /** Para el ícono de la categoría en la etiqueta de la hoja (`SinFoto`, ADR-0333): su prefijo y el código de su familia. */
  prefijo?: string | null;
  familiaCodigo?: string | null;
};

// `true` desde que `registrar_venta` lee `etiquetas.descuento_pct`
// (20260918170000_venta_aplica_descuento_de_campana.sql, paso 3 de ADR-0107). Vuelve a
// `false` solo si ese SQL no está en producción: sin él, la pantalla prometería un
// descuento que la caja no cobra. Con `false` avisa que se guarda pero no se cobra.
const DESCUENTO_YA_SE_APLICA = true;

/** 20 → "20", 12.5 → "12.5": sin ceros de más (el decimal peruano es el punto). */
const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

export function ordenarEtiquetas(lista: Etiqueta[]) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** «Configurar», o «Repetir» si su temporada ya pasó. Decía «Campaña» hasta el 2026-10-21, pero la hoja la usa toda etiqueta
 *  (también Nuevo o Hecho a mano), no solo una campaña. El año va en el `title` y en el título de la hoja: «Repetir en 2027» no
 *  cabe en el pie de la tarjeta a 1024 px (101 px de texto en 86). */
export const botonCampana = (e: Etiqueta, hoy: string) => {
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
  tiendas = [],
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
  /** Las tiendas del ERP, para decir en cuáles rige una campaña limitada (ADR-0486). */
  tiendas?: TiendaOpcion[];
  children?: ReactNode;
}) {
  const rango = textoRango(e.vigenteDesde, e.vigenteHasta);
  const dondeRige = e.descuentoPct !== null ? textoSedesDeCampana(e.sedeIds, tiendas) : null;
  // Lo que dice su temporada (un chip que se lee sin abrir nada) y, si se ve el conteo, si de verdad llega a alguna prenda.
  const chip = chipDeTarjeta(vigencia, conteo?.total ?? null, hoy);
  const textos = conteo ? textoConteoTarjeta(conteo) : null;
  return (
    <TarjetaAtributo
      // Con la tarjeta a todo lo ancho (una columna en el celular) la franja 3:1 llegaba a ~115 px de alto: se topa en 80 y el
      // dibujo se recorta arriba y abajo (`slice`), sin deformarse.
      muestra={<MuestraEtiqueta nombre={e.nombre} icono={e.icono} imagen={e.imagen} estilo={e.estilo} className="aspect-[3/1] max-h-20 w-full" />}
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
          {dondeRige && (
            <div>
              <Chip tono="pizarra" versalitas={false} title="Solo en esa tienda se cobra el descuento; en las demás, el precio normal.">
                {dondeRige}
              </Chip>
            </div>
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

/**
 * UNA campaña, con la misma tarjeta, los mismos botones («Prendas», «Configurar» o «Repetir») y las mismas hojas que en
 * Catálogo ▸ Insignias. La monta la ficha de Tienda web ▸ Campañas (pestaña «Datos y prendas»): Felipe, 2026-10-22, «que se pueda
 * editar, agregar prendas y demás cosas a las campañas desde ambos módulos» y «mismas piezas dentro» (ADR-0473). Guarda por las
 * mismas rutas; la base decide quién puede (`fn_puede_campanas`).
 */
export function TarjetaDeCampana({
  campana,
  categorias,
  tiendas = [],
  sedeActualId = null,
  prendasConCosto,
  variantesManuales,
}: {
  campana: Etiqueta;
  categorias: CategoriaOpcion[];
  /** Las tiendas del ERP (ADR-0486). Vacío: la hoja de Configurar no ofrece elegir sedes. */
  tiendas?: TiendaOpcion[];
  /** La sede de la cabecera: con su precio sale la impresión que ofrece el aviso de reimprimir. */
  sedeActualId?: string | null;
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
        tiendas={tiendas}
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
        <p className="nota-cayla mt-3 text-xs">Esta campaña está desactivada o pendiente de aprobar: se cambia en Catálogo ▸ Insignias.</p>
      )}
      {etiquetando && (
        <PrendasDeEtiquetaModal
          etiqueta={e}
          prendasConCosto={prendasConCosto}
          marcasManuales={manuales}
          tiendas={tiendas}
          sedeActualId={sedeActualId}
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
          tiendas={tiendas}
          sedeActualId={sedeActualId}
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
export function CampanaModal({
  modo,
  etiqueta,
  puedeDarDescuento,
  categorias,
  tiendas = [],
  sedeActualId = null,
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
  /** Las tiendas donde se puede limitar el descuento (ADR-0486). Con menos de dos (o la base sin la migración) no hay nada que elegir. */
  tiendas?: TiendaOpcion[];
  /** La sede de la cabecera (`persona.ubicacionId`): la impresión de etiquetas sale con su precio, así que el aviso de reimprimir
   *  ofrece el botón solo si el papel de ESTA sede quedó viejo. */
  sedeActualId?: string | null;
  prendasConCosto: PrendaConCosto[];
  variantesManuales: string[];
  onClose: () => void;
  onGuardado: (cambios: Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "categoriaIds" | "sedeIds">) => void;
}) {
  // Si su temporada ya pasó, la hoja abre para repetirla: las mismas fechas, un año después (se guardan solo con «Guardar»).
  const T = TEXTOS_MODO[modo];
  const [repetir] = useState(() => repetirTemporada(etiqueta.vigenteDesde, etiqueta.vigenteHasta, hoyLima()));
  const [descuento, setDescuento] = useState(etiqueta.descuentoPct === null ? "" : String(etiqueta.descuentoPct));
  const [desde, setDesde] = useState((repetir ? repetir.desde : etiqueta.vigenteDesde) ?? "");
  const [hasta, setHasta] = useState((repetir ? repetir.hasta : etiqueta.vigenteHasta) ?? "");
  const avisoDia = repetir ? avisoDiaDeSemana(repetir, { desde, hasta }) : null;
  const [elegidas, setElegidas] = useState(() => new Set(etiqueta.categoriaIds));
  // Dónde rige el descuento (ADR-0486): vacío = todas las sedes. Solo se ofrece con dos tiendas o más.
  const [sedesElegidas, setSedesElegidas] = useState(() => new Set(etiqueta.sedeIds));
  const ofreceSedes = tiendas.length > 1;
  const [guardando, setGuardando] = useState(false);
  // Tres clics en el mismo instante mandaban tres pedidos iguales (/chaos 2026-10-23): el candado deja pasar solo el primero.
  const [unaVez] = useState(unSoloEnvio);
  // Al guardar, el sello de la campaña se estampa en la etiqueta y la hoja se cierra cuando terminó de estamparse.
  const [sellada, setSellada] = useState(false);
  const router = useRouter();
  const [hoy] = useState(hoyLima);
  const idDescuento = useId();

  // La hoja mide del alto de la pantalla, como «Prendas» (`.eqp-hoja`, etiqueta-prendas.css): lo que ocupan su título y su frase se
  // descuenta del alto, y solo el formulario corre por dentro. Ref de función (no efecto) y `offsetTop` (no getBoundingClientRect): el
  // contenido de `<Modal>` llega por el portal un render después y entra con un `transform` que movería la medida.
  const hoja = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    let cuadro = 0;
    const medir = () => {
      const panel = el.offsetParent as HTMLElement | null;
      if (!panel) {
        cuadro = requestAnimationFrame(medir);
        return;
      }
      const abajo = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
      el.style.setProperty("--eqp-encima", `${el.offsetTop + abajo + 2}px`);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", medir);
    };
  }, []);

  // Cada categoría dice cuántas prendas a la venta trae, y la hoja dice a cuántas llega la campaña antes de guardar.
  const prendasDe = prendasPorCategoria(prendasConCosto);
  const alcance = alcanceCampana(prendasConCosto, elegidas, new Set(variantesManuales));

  // Guía de foco: sale de la misma regla que apaga «Guardar» (`campanaValida`, y su prueba exige que coincidan); todo es opcional,
  // así que solo «sigue» lo mal escrito.
  const guia = useGuiaCampos(
    camposDeCampana({ descuento, desde, hasta, categorias: elegidas.size, puedeDarDescuento, sedes: ofreceSedes ? sedesElegidas.size : undefined, alcance: alcance.total }),
  );

  const pct = parsearDescuento(descuento);
  const fDesde = parsearFecha(desde);
  const fHasta = parsearFecha(hasta);
  const objecion = fDesde.ok && fHasta.ok ? objecionVigencia(fDesde.valor, fHasta.valor) : null;
  const valido = campanaValida({ descuento, desde, hasta });
  // La temporada como la dice su pase en Insignias (cuánto lleva, si rige hoy) y su duración en una frase.
  const fechasBien = fDesde.ok && fHasta.ok && !objecion;
  const rangoElegido = { desde: fDesde.ok ? fDesde.valor : null, hasta: fHasta.ok ? fHasta.valor : null };
  const avance = fechasBien ? avanceDeCampana(rangoElegido.desde, rangoElegido.hasta, hoy) : null;
  const duracion = fechasBien ? textoDuracion(rangoElegido.desde, rangoElegido.hasta) : null;
  // La campaña no se bloquea por bajar del costo (puede ser una liquidación a propósito),
  // pero quien la configura se entera: número en rojo y cuántas prendas serían.
  const bajoCosto = prendasBajoCosto(pct.ok ? pct.valor : null, prendasConCosto, elegidas, new Set(variantesManuales));

  // La etiqueta viva: sus categorías en el mosaico y lo que cobra la caja por prendas reales que alcanzaría.
  const mosaico = piezasDelMosaico(categorias, elegidas, prendasDe);
  const ejemplos = ejemplosDeCaja(prendasConCosto, elegidas, new Set(variantesManuales), prendasDe, pct.ok ? pct.valor : null);

  // La categoría recién marcada vuela de su casilla a su pieza en la etiqueta (`EtiquetaDeCampana`).
  const vuelo = useRef<string | null>(null);
  const alternar = (id: string) => {
    if (!elegidas.has(id)) vuelo.current = id;
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };
  // La casilla de «toda la familia»: marca o quita sus categorías de un toque.
  const alternarFamilia = (ids: string[], marcar: boolean) =>
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      for (const id of ids) {
        if (marcar) nuevo.add(id);
        else nuevo.delete(id);
      }
      return nuevo;
    });

  async function guardar() {
    if (!pct.ok || !fDesde.ok || !fHasta.ok) return;
    setGuardando(true);
    try {
      const categoriaIds = [...elegidas];
      const sedeIds = [...sedesElegidas];
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_campana") },
        body: JSON.stringify({
          id: etiqueta.id,
          // Sin la hoja de sedes (una sola tienda, o la base sin la migración) no se manda nada: no se toca lo que no se vio.
          campana: { descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds, ...(ofreceSedes ? { sedeIds } : {}) },
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo guardar la campaña.");
        return;
      }
      const sedeIdsGuardadas = ofreceSedes ? sedeIds : etiqueta.sedeIds;
      // Si guardar cambió HOY el precio en caja de alguna prenda en alguna tienda (otro %, fechas que la hacen regir o dejar de
      // regir, categorías o tiendas que entran o salen), su etiqueta de papel quedó vieja: el aviso lo dice, nombra las tiendas si no
      // es en todas, y lleva a imprimir las de esta sede, que es con cuyo precio sale la impresión (ADR-0180, ADR-0486).
      const cambian = prendasQueCambianDePrecioHoy(
        etiqueta,
        { descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds, sedeIds: sedeIdsGuardadas },
        prendasConCosto,
        new Set(variantesManuales),
        hoyLima(),
        { tiendas, aqui: sedeActualId },
      );
      const destino = destinoReimprimir(cambian, etiqueta.id);
      const reimprimir = avisoReimprimir(cambian, destino !== null);
      // Ya guardó: el sello se estampa (700 ms, una vez) y recién entonces la hoja se cierra y sale el aviso. Sin movimiento, al instante.
      setSellada(true);
      if (!sinMovimiento()) await new Promise((listo) => setTimeout(listo, 750));
      avisar.exito(
        `${etiqueta.nombre} actualizad${T.o}`,
        reimprimir
          ? { detalle: reimprimir.detalle, accion: destino && reimprimir.boton ? { texto: reimprimir.boton, onClick: () => router.push(destino) } : undefined }
          : undefined,
      );
      onGuardado({ descuentoPct: pct.valor, vigenteDesde: fDesde.valor, vigenteHasta: fHasta.valor, categoriaIds, sedeIds: sedeIdsGuardadas });
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
          : "Cuánto baja, cuándo rige y en qué categorías."
      }
      ancho="max-w-[69rem]" /* unificar-fijo: la etiqueta viva es de diseño propio, como «Prendas» (la II de la maqueta, elegida por Felipe 2026-10-23, ADR-0488) */
      onClose={onClose}
    >
      {(cerrar) => (
        <div ref={hoja} className="eqp-hoja cph-hoja mt-4">
          {/* ---- El formulario, a la izquierda: lo único que corre ---- */}
          <div data-guia="atributos.campana-form" className="eqp-lista cph-form scroll-cayla">
          {/* Una columna: cuánto, cuándo, dónde y las categorías, de arriba abajo (al lado va la etiqueta). */}
          <div className="space-y-6">
            <div className="space-y-5">
              <CampoGuiado id="descuento" guia={guia}>
                <Campo
                  etiqueta={guia.etiqueta("descuento", "Cuánto baja")}
                  htmlFor={idDescuento}
                  tono={!pct.ok || bajoCosto.length > 0 ? "error" : "neutro"}
                  pie={
                    !puedeDarDescuento
                      ? "Tu rol no pone descuento: la campaña se configura con sus fechas y sus categorías."
                      : !pct.ok
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
                >
                  {/* La caja con − y + adentro y, a su lado, los descuentos de siempre en dos filas del MISMO alto (Felipe 2026-10-23):
                      un solo bloque, sin espacio libre a la derecha. En el celular las opciones bajan enteras bajo la caja. */}
                  <div className="cph-paso-fila">
                    <PasoCantidad
                      tamano="grande"
                      sufijo="%"
                      className="cph-paso"
                      tono={!pct.ok || bajoCosto.length > 0 ? "error" : undefined}
                      menos={{
                        onClick: () => setDescuento((d) => pasoDeDescuento(d, -PASO)),
                        deshabilitado: !puedeDarDescuento || !(pct.ok && pct.valor),
                        etiqueta: `Bajar ${PASO} % el descuento`,
                      }}
                      mas={{
                        onClick: () => setDescuento((d) => pasoDeDescuento(d, PASO)),
                        deshabilitado: !puedeDarDescuento || (pct.ok && (pct.valor ?? 0) >= 100),
                        etiqueta: `Subir ${PASO} % el descuento`,
                      }}
                      campo={{
                        id: idDescuento,
                        inputMode: "decimal",
                        value: descuento,
                        onChange: (e) => setDescuento(e.target.value),
                        disabled: !puedeDarDescuento,
                        placeholder: "0", // sugerir-fijo: el cero es «sin descuento», no un ejemplo que dependa de lo elegido
                        "aria-label": "Descuento en porcentaje",
                        autoComplete: "off",
                        // El ancho de lo escrito: así el número y su «%» quedan al centro de la caja.
                        style: { width: `${Math.max(1, (descuento || "0").length)}ch` },
                      }}
                    />
                    {puedeDarDescuento && (
                      <div role="group" aria-label="Descuentos de siempre" className="cph-rapidos">
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
                  </div>
                </Campo>
              </CampoGuiado>

              {/* El título del grupo va FUERA de la grilla: dentro, ocupaba la primera celda y partía Desde y Hasta en dos filas. */}
              {/* «Opcional: sin fechas…» solo con las fechas vacías: con fechas puestas, junto al ✓ invitaba a borrarlas (/formidable 2026-10-23). */}
              <CampoGuiado id="vigencia" guia={guia} titulo="Cuándo rige" ayuda={desde.trim() || hasta.trim() ? undefined : "Opcional: sin fechas, rige siempre."}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Cada calendario pinta la temporada entera: se elige una punta viendo dónde está la otra. */}
                  <CampoFecha etiqueta="Desde" valor={desde} onValor={setDesde} tono={fDesde.ok ? undefined : "error"} rango={rangoElegido} />
                  <CampoFecha
                    etiqueta="Hasta"
                    valor={hasta}
                    onValor={setHasta}
                    tono={fHasta.ok && !objecion ? undefined : "error"}
                    pie={objecion ?? undefined}
                    rango={rangoElegido}
                  />
                </div>
                {/* Si rige hoy, cuánto lleva (la misma barra de su pase en Insignias); y siempre que haya dos fechas, cuánto dura. */}
                {avance && rangoElegido.desde && rangoElegido.hasta && (
                  <div className="mt-3">
                    <BarraAvance pct={avance.pct} alto="fina" tono="tinta" etiqueta={`Lo que lleva ${etiqueta.nombre}`} texto={`Día ${avance.dia} de ${avance.total}`} />
                    <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-tinta/65">
                      <span>{fechaCorta(rangoElegido.desde)}</span>
                      <span>
                        hoy, día {avance.dia} de {avance.total}
                      </span>
                      <span>{fechaCorta(rangoElegido.hasta)}</span>
                    </div>
                  </div>
                )}
                {duracion && <p className="mt-2 text-xs text-tinta/65">{duracion}</p>}
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

              {/* ADR-0486: dónde rige el descuento. «Todas las sedes» es lo de siempre; elegir una o más tiendas limita el descuento
                  a ellas (en las demás se cobra el precio normal). Marcar todas las tiendas vuelve a «Todas las sedes». */}
              {ofreceSedes && (
                <CampoGuiado
                  id="sedes"
                  guia={guia}
                  titulo="Dónde rige"
                  ayuda="Opcional: sin elegir, rige en todas las sedes."
                  retiene="fila"
                  className="mt-0"
                >
                  <div data-guia="atributos.campana-sedes" role="group" aria-label="Sedes donde rige el descuento" className="flex flex-wrap gap-1.5">
                    <button type="button" className="pildora-cayla" aria-pressed={sedesElegidas.size === 0} onClick={() => setSedesElegidas(new Set())}>
                      Todas las sedes
                    </button>
                    {tiendas.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="pildora-cayla"
                        aria-pressed={sedesElegidas.has(t.id)}
                        onClick={() => setSedesElegidas((actual) => alternarSede(actual, t.id, tiendas))}
                      >
                        {t.nombre}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-tinta/65" aria-live="polite">
                    {sedesElegidas.size === 0
                      ? "El descuento se cobra en todas las tiendas."
                      : `${textoSedesDeCampana([...sedesElegidas], tiendas)}: en las demás tiendas se cobra el precio normal.`}
                  </p>
                </CampoGuiado>
              )}
            </div>

            <CampoGuiado id="categorias" guia={guia} retiene="fila">
              <div className="flex items-center justify-between gap-3">
                <p className="label-cayla text-[11px] text-tinta/65">
                  {guia.etiqueta("categorias", "Categorías")}
                  {/* «· opcional» solo cuando la guía también lo dice: con un descuento que no llega a ninguna prenda, Categorías es
                      «sugerido» y las dos señales juntas se contradecían (/formidable 2026-10-23). */}
                  {guia.estado("categorias") === "opcional" && <span className="font-normal normal-case text-tinta/45"> · opcional</span>}
                </p>
                {/* Marcan varias de un toque: el botón chico sutil, no el enlace (ADR-0358, ronda 9). */}
                <div className="flex items-center gap-2">
                  {elegidas.size < categorias.length && (
                    <button type="button" onClick={() => setElegidas(new Set(categorias.map((c) => c.id)))} className="btn-cayla btn-sutil btn-chico">
                      Elegir todas
                    </button>
                  )}
                  {elegidas.size > 0 && (
                    <button type="button" onClick={() => setElegidas(new Set())} className="btn-cayla btn-sutil btn-chico">
                      Quitar todas
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-tinta/65" aria-live="polite">
                {elegidas.size === 0
                  ? `Sin categorías, la campaña solo alcanza a las prendas marcadas a mano${alcance.aMano ? ` (${alcance.aMano})` : ": hoy ninguna"}.`
                  : `Alcanza a ${alcance.total} prenda${alcance.total === 1 ? "" : "s"} a la venta: ${alcance.porCategoria} de ${elegidas.size} categoría${elegidas.size === 1 ? "" : "s"}${alcance.aMano ? ` y ${alcance.aMano} marcada${alcance.aMano === 1 ? "" : "s"} a mano` : ""}.`}
              </p>
              <div className="mt-3">
                <CategoriasDeCampana categorias={categorias} prendasDe={prendasDe} elegidas={elegidas} onAlternar={alternar} onFamilia={alternarFamilia} />
              </div>
            </CampoGuiado>
          </div>

          <p className="nota-cayla text-xs">
            {DESCUENTO_YA_SE_APLICA
              ? `En Vender, las prendas con est${T.o === "o" ? "e" : "a"} ${T.uno} llevan el descuento solas, dentro de las fechas. Si una prenda tiene varias campañas, se aplica solo la de mayor descuento.`
              : "Esto guarda la configuración. Todavía no cambia el precio en Vender."}
          </p>
          </div>

          {/* ---- La etiqueta, a la derecha: dice lo que se va a guardar mientras se llena ---- */}
          <aside data-guia="atributos.campana-etiqueta" className="eqp-lado" aria-label={`La etiqueta «${etiqueta.nombre}»`}>
            <EtiquetaDeCampana
              nombre={etiqueta.nombre}
              descuento={pct.ok ? pct.valor : "mal"}
              rango={!fDesde.ok || !fHasta.ok || objecion ? "Revisa las fechas" : (textoRango(fDesde.valor, fHasta.valor) ?? "Sin fechas: rige siempre")}
              chip={fDesde.ok && fHasta.ok && !objecion ? chipDeTarjeta(vigenciaDe(fDesde.valor, fHasta.valor, hoy), alcance.total, hoy) : null}
              total={alcance.total}
              piezas={mosaico.piezas.map((c) => ({ id: c.id, nombre: c.nombre, prefijo: c.prefijo, familiaCodigo: c.familiaCodigo, prendas: c.prendas }))}
              mas={mosaico.mas}
              ejemplos={ejemplos}
              categoriaDe={(id) => {
                const c = id ? categorias.find((x) => x.id === id) : undefined;
                return c && { id: c.id, nombre: c.nombre, prefijo: c.prefijo, familiaCodigo: c.familiaCodigo, prendas: prendasDe.get(c.id) ?? 0 };
              }}
              vueloRef={vuelo}
              sello={sellada ? { estilo: etiqueta.estilo, anio: (rangoElegido.desde ?? rangoElegido.hasta)?.slice(0, 4) ?? null } : null}
            />
          </aside>

          {/* ---- Lo que falta y los dos botones, siempre a la vista bajo la etiqueta (mitad y mitad: Felipe 2026-10-23) ---- */}
          <div className="eqp-pie space-y-2.5">
            {/* Con su frase a la vista: el porqué de lo que falta o se sugiere no puede vivir solo al pasar el mouse (ley 6). */}
            <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
            <div data-guia="atributos.campana-pie" className="pie-acciones pie-parejo">
              <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton peso="primario" onClick={() => unaVez(guardar)} cargando={guardando} disabled={!valido} title={guia.frase ?? undefined}>
                Guardar
              </Boton>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * La ventana de agregar una etiqueta. Su guía de foco (CLAUDE.md «Guía de foco») sale de lo que ya apaga el botón: un nombre y
 * alguien que firma. Vive en su propio componente para que la guía nazca y muera con la ventana.
 */
export function NuevaEtiquetaModal({
  modo,
  nombre,
  onNombre,
  eleccion,
  onEleccion,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  modo: ModoEtiquetas;
  nombre: string;
  onNombre: (v: string) => void;
  /** Lo que eligió como dibujo (ADR-0490: uno de la lista o su imagen propia); `null` = todavía nada: se ve marcado el que sugiere el nombre. Nunca bloquea guardar. */
  eleccion: EleccionDeDibujo | null;
  onEleccion: (v: EleccionDeDibujo) => void;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: () => void;
  onClose: () => void;
}) {
  const T = TEXTOS_MODO[modo];
  const delUno = `${T.la === "el" ? "del" : "de la"} ${T.uno}`;
  const guia = useGuiaCampos([
    { id: "nombre", nombre: `Nombre ${delUno}`, requerido: true, hecho: nombre.trim() !== "", pendiente: `Escribe el nombre ${delUno}.` },
    // Opcional de verdad: sin elegir, se queda el dibujo que sugiere el nombre. Se cuenta como hecho cuando se eligió uno.
    { id: "dibujo", nombre: "Dibujo", requerido: false, hecho: eleccion !== null, pendiente: "Elige un dibujo o sube tu imagen, o deja el que sugiere el nombre." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo={T.nuevo} subtitulo={T.agregarDetalle} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("nombre", `Nombre ${delUno}`)} value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder={T.ejemplo} autoFocus />
          </CampoGuiado>
          <CampoGuiado id="dibujo" guia={guia}>
            <Campo etiqueta={guia.etiqueta("dibujo", "Dibujo")} idEtiqueta="dibujo-nuevo" sinPie>
              <ElegirDibujoDeInsignia valor={eleccionEfectiva(eleccion, nombre)} yaElegido={eleccion !== null} onValor={onEleccion} idEtiqueta="dibujo-nuevo" deshabilitado={guardando} />
            </Campo>
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
