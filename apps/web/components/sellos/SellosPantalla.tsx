"use client";

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Award, CalendarHeart, HandHeart, RefreshCw, Shirt } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import { Pestanas } from "@/components/ui/Pestanas";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { Vacio } from "@/components/ui/Vacio";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { PrendasDeEtiquetaModal } from "@/components/PrendasDeEtiquetaModal";
import { BotonesPendiente, BotonReactivar } from "@/components/atributos/kit";
import { CampanaModal, NuevaEtiquetaModal, botonCampana, ordenarEtiquetas, type CategoriaOpcion, type Etiqueta } from "@/components/EtiquetasLista";
import { SelloTinta } from "@/components/sellos/SelloTinta";
import { OfertasHoja } from "@/components/sellos/OfertasHoja";
import { useColumnasDeLaBilletera, useCupoDelLookbook } from "@/components/sellos/useMedidasDeSellos";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable } from "@/lib/useResponsable";
import { AYUDA_COMENTARIO_APROBAR, avisoEtiquetaAgregada, cuerpoAprobarEtiqueta, verboAprobacion } from "@/lib/etiqueta-aprobacion-reglas";
import { chipDeTarjeta, textoSedesDeCampana, type PrendaConCosto, type TiendaOpcion } from "@/lib/etiqueta-campana";
import { vigenciaDe } from "@/lib/etiqueta-vigencia";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { notaSinRegistrar, type LecturaRotacion } from "@/lib/etiqueta-rotacion";
import { hoyLima } from "@/lib/fechas-lima";
import { reglasDeCampana, reglasVivas, vigenciaDeRegla, type ReglaCampana } from "@/lib/campana-reglas";
import { tramoDeCampana, TEXTOS_MODO } from "@/lib/sellos-campanas";
import {
  ESTILO_DE_VISTA,
  TEXTOS_VISTA,
  avanceDeCampana,
  bajadaDelPase,
  diasEntre,
  fechaCorta,
  fechaLarga,
  loQueTiene,
  lookbookVisible,
  marcaDelPase,
  paseInicial,
  pilasDeLaVista,
  prendasDelSello,
  vistaDeEstilo,
  type PrendasDelSello,
  type TallaVitrina,
  type TonoPase,
  type VistaSellos,
} from "@/lib/sellos-pases";

/* ====================================================================
   Catálogo ▸ Insignias · la billetera de pases (Felipe 2026-10-22: eligió la «II · Pases» de docs/maquetas/sellos-2026-10/)

   Los sellos dejaron de ser una pestaña de Atributos y Campañas dejó de ser una fila aparte: es la primera vista, y las pestañas
   (las de vidrio, que Felipe eligió de la «A») pasan a Rotación, Artesanal y General. Desde el 2026-10-23 se llaman «Insignias» en
   pantalla (en el código siguen siendo `sellos`/`etiquetas`: la clave no se renombra). Cada insignia es un pase; se apilan por pila y se
   abre uno a la vez, y al lado se ve en grande con sus prendas reales (su foto o, sin foto, su categoría sobre su color).
   Lo que guarda es lo mismo de siempre y por las mismas puertas (`/api/productos/etiquetas` y las hojas de `EtiquetasLista.tsx`):
   crear (desde cada vista nace con su grupo), aprobar, rechazar, configurar o repetir, poner prendas, desactivar y reactivar.
   ==================================================================== */

const ICONO_VISTA: Record<VistaSellos, ReactNode> = {
  campanas: <CalendarHeart aria-hidden className="h-4 w-4" />,
  rotacion: <RefreshCw aria-hidden className="h-4 w-4" />,
  artesanal: <HandHeart aria-hidden className="h-4 w-4" />,
  general: <Award aria-hidden className="h-4 w-4" />,
};


export function SellosPantalla({
  sede,
  etiquetasIniciales,
  categorias,
  tiendas,
  sedeActualId,
  prendasConCosto,
  variantesManuales,
  prendasVitrina,
  rotacion,
  vistas,
  vistaInicial,
  puedeEditarSellos,
  puedeEditarCampanas,
  disenoWeb,
  reglas: reglasIniciales,
  reglasDisponibles,
  esLider,
}: {
  sede: string;
  etiquetasIniciales: Etiqueta[];
  categorias: CategoriaOpcion[];
  /** Las tiendas donde se puede limitar el descuento de una campaña (ADR-0486); vacío = la hoja de Configurar no ofrece sedes. */
  tiendas: TiendaOpcion[];
  /** La sede de la cabecera: con su precio sale la impresión que ofrece el aviso de reimprimir al guardar una campaña. */
  sedeActualId: string;
  prendasConCosto: PrendaConCosto[];
  variantesManuales: Record<string, string[]>;
  /** Modelo, color, categoría y foto de cada prenda a la venta; `null` si no se pudieron leer (la vitrina no se dibuja). */
  prendasVitrina: TallaVitrina[] | null;
  /** Unidades y ventas de 30 días por talla: solo quien puede analizar; `null`, sin esas cifras. */
  rotacion: LecturaRotacion | null;
  /** Las vistas que la cuenta ve (Campañas con Insignias o Campañas; las otras tres, con Insignias). */
  vistas: VistaSellos[];
  vistaInicial: VistaSellos;
  /** Crear, configurar y poner prendas a una insignia (líder o un rol con Insignias; la base lo vuelve a exigir). */
  puedeEditarSellos: boolean;
  /** Lo mismo con una campaña: líder, Insignias, Campañas o Campañas de la tienda web (`fn_puede_campanas`). */
  puedeEditarCampanas: boolean;
  /** La cuenta ve Tienda web ▸ Campañas: el pase de una campaña con descuento lleva a su diseño en la tienda online. */
  disenoWeb: boolean;
  /** Las ofertas de todas las campañas («Tres preguntas», 2026-10-23); vacío si la base aún no las tiene o la cuenta no las ve. */
  reglas: ReglaCampana[];
  /** La base responde por las ofertas: si no, «Configurar» abre la hoja de siempre. */
  reglasDisponibles: boolean;
  /** Un líder activa y retira lo que ya rige; los demás dejan borradores. */
  esLider: boolean;
}) {
  const hoy = hoyLima();
  const responsable = useResponsable();
  const [vista, setVista] = useState<VistaSellos>(vistaInicial);
  const [etiquetas, setEtiquetas] = useState(() => ordenarEtiquetas(etiquetasIniciales));
  const [manuales, setManuales] = useState(variantesManuales);
  const [abiertoPorVista, setAbiertoPorVista] = useState<Partial<Record<VistaSellos, string>>>({});
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aprobandoAbierto, setAprobandoAbierto] = useState<string | null>(null);
  const [comentarioAprobar, setComentarioAprobar] = useState("");
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState<Etiqueta | null>(null);
  // Las ofertas de las campañas viven aquí: la hoja las guarda y devuelve la lista entera tal como quedó en la base.
  const [reglas, setReglas] = useState(reglasIniciales);
  const [ofertandoId, setOfertandoId] = useState<string | null>(null);
  const [etiquetando, setEtiquetando] = useState<Etiqueta | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  // La billetera tiene dos columnas (la pila y el pase en grande) o una, según su ancho (una consulta de contenedor en sellos.css). Con
  // una, el pase en grande va justo debajo del pase abierto: en el celular no queda al final de toda la pila, lejos de lo que tocaste.
  const [refBilletera, columnasBilletera] = useColumnasDeLaBilletera();
  const enLinea = columnasBilletera < 2;
  // El lookbook muestra dos filas: las columnas las pone el ancho, y la última casilla dice cuántas faltan (`lookbookVisible`).
  const [refLookbook, columnasLookbook] = useCupoDelLookbook();

  const esCampanas = vista === "campanas";
  const T = TEXTOS_MODO[esCampanas ? "campanas" : "sellos"];
  const puedeEditar = (e: Etiqueta) => (e.estilo === "campana" ? puedeEditarCampanas : puedeEditarSellos);
  const porTalla = useMemo(() => (rotacion ? new Map(Object.entries(rotacion.porTalla)) : null), [rotacion]);
  const nombreCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);
  const prendasDe = (e: Etiqueta): PrendasDelSello =>
    prendasVitrina ? prendasDelSello(prendasVitrina, new Set(e.categoriaIds), new Set(manuales[e.id] ?? []), porTalla) : { modelos: [], aMano: 0, unidades: null, vendidas: null };
  const categoriasDe = (e: Etiqueta) => e.categoriaIds.map((id) => nombreCategoria.get(id)).filter((n): n is string => Boolean(n));

  const pilas = pilasDeLaVista(etiquetas, vista, hoy);
  const abiertoId = abiertoPorVista[vista] ?? paseInicial(pilas)?.id ?? null;
  const abierto = etiquetas.find((e) => e.id === abiertoId && vistaDeEstilo(e.estilo) === vista) ?? paseInicial(pilas);

  // La vista vive en la URL (se puede compartir) sin navegar: todo ya está leído, así que no hay loader ni ida a la base.
  function cambiarVista(v: string) {
    const nueva = v as VistaSellos;
    setVista(nueva);
    const url = new URL(window.location.href);
    if (nueva === "campanas") url.searchParams.delete("vista");
    else url.searchParams.set("vista", nueva);
    window.history.replaceState(window.history.state, "", url);
  }
  const abrir = (id: string) => setAbiertoPorVista((a) => ({ ...a, [vista]: id }));

  // ---- Lo que guarda: lo mismo que la lista de antes, por las mismas puertas --------------------------------------------------

  async function guardar() {
    setGuardando(true);
    const estilo = ESTILO_DE_VISTA[vista];
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ nombre, estilo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo agregar ${T.la} ${T.uno}.`);
        return;
      }
      const nueva: Etiqueta = {
        id: datos.etiqueta.id,
        nombre: datos.etiqueta.nombre,
        activo: true,
        notas: datos.etiqueta.notas,
        estado: datos.etiqueta.estado,
        estilo,
        vigenteDesde: null,
        vigenteHasta: null,
        descuentoPct: null,
        categoriaIds: [],
        sedeIds: [],
      };
      setEtiquetas((actual) => ordenarEtiquetas([...actual, nueva]));
      abrir(nueva.id);
      responsable.despues(null);
      const { titulo, detalle } = avisoEtiquetaAgregada(datos.etiqueta.nombre, datos.etiqueta.estado, esCampanas ? "campanas" : "sellos");
      avisar.exito(titulo, detalle ? { detalle } : undefined);
      setAgregando(false);
      setNombre("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
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
      setEtiquetas((actual) => ordenarEtiquetas(actual.map((x) => (x.id === e.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.etiqueta.notas } : x))));
      const { o } = TEXTOS_MODO[e.estilo === "campana" ? "campanas" : "sellos"];
      avisar.exito(e.estado === "rechazado" ? `${e.nombre} reactivad${o}` : `${e.nombre} aprobad${o}`);
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
      setEtiquetas((actual) => ordenarEtiquetas(actual.map((x) => (x.id === e.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${e.nombre} rechazad${TEXTOS_MODO[e.estilo === "campana" ? "campanas" : "sellos"].o}`, { detalle: "Pasa a la pila de desactivadas. Se puede reactivar después." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  // Activar o desactivar una aprobada no cambia su estado: no lleva comentario. Una RECHAZADA se reactiva aprobándola.
  async function cambiarActivo(e: Etiqueta, activo: boolean) {
    setCambiandoId(e.id);
    const { o } = TEXTOS_MODO[e.estilo === "campana" ? "campanas" : "sellos"];
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: e.id, activo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${activo ? "reactivar" : "desactivar"} ${e.estilo === "campana" ? "la campaña" : "la insignia"}.`);
        return;
      }
      setEtiquetas((actual) => ordenarEtiquetas(actual.map((x) => (x.id === e.id ? { ...x, activo, ...(activo ? { estado: "aprobado" as const } : {}) } : x))));
      avisar.exito(
        `${e.nombre} ${activo ? "reactivad" : "desactivad"}${o}`,
        activo ? { detalle: "Vuelve a aparecer al elegir las insignias de una prenda." } : { detalle: "Deja de aparecer al elegir las insignias de una prenda nueva; el historial se conserva." },
      );
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  // ---- El pase --------------------------------------------------------------------------------------------------------------

  // Funciones que devuelven JSX, no componentes: un componente declarado aquí adentro se rearmaría en cada clic y el pase no
  // alcanzaría a abrirse con su transición.
  function pase(e: Etiqueta, tono: TonoPase, indice: number) {
    const esAbierto = abierto?.id === e.id;
    const p = prendasDe(e);
    const marca = marcaDelPase(e, hoy, p.vendidas);
    const avance = avanceDeCampana(e.vigenteDesde, e.vigenteHasta, hoy);
    const tramo = tramoDeCampana(e.vigenteDesde, e.vigenteHasta, hoy);
    const vigencia = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
    const chip = e.activo && e.estado === "aprobado" ? chipDeTarjeta(vigencia, p.modelos.length + e.categoriaIds.length, hoy) : null;
    const dondeRige = e.descuentoPct !== null ? textoSedesDeCampana(e.sedeIds, tiendas) : null;
    const anio = e.vigenteDesde ? e.vigenteDesde.slice(0, 4) : null;
    const ofertas = e.estilo === "campana" && reglasDisponibles ? reglasDeCampana(reglas, e.id) : [];
    const ofertasVivas = reglasVivas(ofertas, hoy);
    const porActivar = ofertasVivas.filter((r) => vigenciaDeRegla(r, hoy) === "borrador").length;
    return (
      <article
        key={e.id}
        className={`sl-pase ${esAbierto ? "sl-abierto" : ""}`}
        data-tono={tono}
        data-sl-grupo={e.estilo}
        data-guia={esAbierto ? "sellos.pase" : undefined}
        style={{ "--i": indice } as CSSProperties}
      >
        <button type="button" className="sl-cab" aria-expanded={esAbierto} aria-controls={`pase-${e.id}`} onClick={() => abrir(e.id)}>
          <SelloTinta nombre={e.nombre} estilo={e.estilo} anio={anio} tamano={44} giro={0} indice={indice} apagado={!e.activo} />
          <span className="min-w-0">
            <span className="sl-cab-nombre block truncate">{e.nombre}</span>
            <span className="sl-cab-bajada">
              {e.estado === "pendiente" ? "por aprobar" : e.estado === "rechazado" ? "rechazado" : bajadaDelPase(e, hoy)}
            </span>
          </span>
          <span className="sl-cab-marca">
            {marca.cifra !== null ? <CifraQueCuenta valor={marca.cifra} alMontar /> : null}
            {marca.texto ? <small>{marca.texto}</small> : null}
          </span>
        </button>
        <div className="sl-cuerpo" id={`pase-${e.id}`} inert={!esAbierto}>
          <div>
            <div className="sl-perfo" />
            <div className="sl-dentro">
              {(chip || e.estado !== "aprobado" || porActivar > 0) && (
                <div className="flex flex-wrap gap-1.5" style={{ "--i": 0 } as CSSProperties}>
                  {e.estado === "pendiente" && <Chip tono="ambar">Por aprobar</Chip>}
                  {e.estado === "rechazado" && <Chip tono="apagado" tachado={false}>Rechazado</Chip>}
                  {chip && <Chip tono={chip.tono} title={chip.title}>{chip.texto}</Chip>}
                  {chip?.alerta && <Chip tono="ambar" title={chip.title}>{chip.alerta}</Chip>}
                  {porActivar > 0 && (
                    <Chip tono="ambar" title="Hay ofertas guardadas como borrador: un líder las activa para que bajen el precio.">
                      {porActivar === 1 ? "1 oferta por activar" : `${porActivar} ofertas por activar`}
                    </Chip>
                  )}
                </div>
              )}
              {e.activo && (tramo === "ahora" || tramo === "proximas") && e.vigenteDesde && e.vigenteHasta && (
                <div className="sl-grande" style={{ "--i": 1 } as CSSProperties}>
                  <b>
                    <CifraQueCuenta valor={tramo === "ahora" ? diasEntre(hoy, e.vigenteHasta) : diasEntre(hoy, e.vigenteDesde)} alMontar />
                  </b>
                  <span>{tramo === "ahora" ? (diasEntre(hoy, e.vigenteHasta) === 1 ? "día para que termine" : "días para que termine") : "días para que empiece"}</span>
                </div>
              )}
              {avance && e.vigenteDesde && e.vigenteHasta && (
                <div style={{ "--i": 2 } as CSSProperties}>
                  <BarraAvance pct={avance.pct} alto="fina" tono="tinta" etiqueta={`Lo que lleva ${e.nombre}`} texto={`Día ${avance.dia} de ${avance.total}`} />
                  <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-tinta/65">
                    <span>{fechaCorta(e.vigenteDesde)}</span>
                    <span>hoy, día {avance.dia} de {avance.total}</span>
                    <span>{fechaCorta(e.vigenteHasta)}</span>
                  </div>
                </div>
              )}
              <div className="sl-datos" style={{ "--i": 3 } as CSSProperties}>
                <div>
                  <strong>{p.vendidas !== null ? p.vendidas.toLocaleString("es-PE") : "—"}</strong>vendidas en 30 días
                </div>
                <div>
                  <strong>{p.unidades !== null ? p.unidades.toLocaleString("es-PE") : "—"}</strong>en las tiendas
                </div>
                {ofertas.length > 0 ? (
                  <div>
                    <strong>{ofertasVivas.length}</strong>
                    {ofertasVivas.length === 1 ? "oferta o promoción" : "ofertas y promociones"}
                  </div>
                ) : (
                  <div>
                    <strong>{e.descuentoPct !== null ? `${e.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %` : "—"}</strong>descuento
                  </div>
                )}
              </div>
              {dondeRige && (
                <div style={{ "--i": 3 } as CSSProperties}>
                  <Chip tono="pizarra" versalitas={false} title="Solo en esa tienda se cobra el descuento; en las demás, el precio normal.">
                    {dondeRige}
                  </Chip>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5" style={{ "--i": 4 } as CSSProperties}>
                {accionesDelPase(e, esAbierto)}
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // `conGuia`: solo el pase abierto lleva las anclas de la guía (los cerrados tienen los mismos botones, escondidos e inertes).
  function accionesDelPase(e: Etiqueta, conGuia: boolean) {
    if (!puedeEditar(e)) return <p className="text-xs text-tinta/65">Solo lo cambia quien tiene el módulo {e.estilo === "campana" ? "Campañas o Insignias" : "Insignias"}.</p>;
    if (!e.activo) {
      return (
        <div className="w-40">
          <BotonReactivar
            cambiando={cambiandoId === e.id}
            onClick={() => (e.estado === "rechazado" ? abrirAprobacion(e) : setConfirmando(confirmacionCatalogo("reactivar", e.nombre, () => cambiarActivo(e, true))))}
          />
        </div>
      );
    }
    if (e.estado === "pendiente") {
      return (
        <BotonesPendiente
          onAprobar={() => abrirAprobacion(e)}
          onRechazar={() => {
            setRechazandoAbierto(e.id);
            setMotivoRechazo("");
          }}
        />
      );
    }
    const vigencia = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
    const imprimir = e.descuentoPct !== null && vigencia?.estado !== "proxima";
    const boton = botonCampana(e, hoy);
    // Una campaña se configura con sus ofertas («Tres preguntas», ADR-0490); la hoja de siempre (`CampanaModal`) solo queda si la base aún no las tiene.
    const conOfertas = e.estilo === "campana" && reglasDisponibles;
    return (
      <>
        <button type="button" onClick={() => setEtiquetando(e)} data-guia={conGuia ? "sellos.prendas" : undefined} className="btn-cayla btn-sutil btn-chico">
          Prendas
        </button>
        <button
          type="button"
          onClick={() => (conOfertas ? setOfertandoId(e.id) : setConfigurando(e))}
          title={conOfertas ? (boton.texto === "Repetir" ? boton.title : "Sus ofertas y sus fechas") : boton.title}
          data-guia={conGuia ? "sellos.configurar" : undefined}
          className="btn-cayla btn-sutil btn-chico"
        >
          {boton.texto}
        </button>
        {imprimir && (
          <BotonImprimir href={urlEtiquetasDePrecio({ campana: e.id })} chico>
            {vigencia?.estado === "terminada" ? "Precio normal" : "Etiquetas de precio"}
          </BotonImprimir>
        )}
        {e.estilo === "campana" && disenoWeb && e.descuentoPct !== null && (
          <BotonVer href={`/tienda-web/campanas/${e.id}`} chico>
            Diseño web
          </BotonVer>
        )}
        <button
          type="button"
          disabled={cambiandoId === e.id}
          onClick={() => setConfirmando(confirmacionCatalogo("desactivar", e.nombre, () => cambiarActivo(e, false)))}
          className="btn-cayla btn-peligro btn-chico ml-auto"
        >
          {cambiandoId === e.id ? "Desactivando…" : "Desactivar"}
        </button>
      </>
    );
  }

  function abrirAprobacion(e: Etiqueta) {
    setAprobandoAbierto(e.id);
    setComentarioAprobar("");
  }

  // ---- El pase abierto, en grande --------------------------------------------------------------------------------------------

  /** Cuántas ofertas vivas tiene una campaña y cuántas esperan a un líder (para «Lo que ya tiene»). */
  function ofertasDe(e: Etiqueta) {
    const vivas = reglasVivas(reglasDeCampana(reglas, e.id), hoy);
    return { total: vivas.length, borradores: vivas.filter((r) => vigenciaDeRegla(r, hoy) === "borrador").length };
  }

  function detalle(e: Etiqueta) {
    const p = prendasDe(e);
    const cats = categoriasDe(e);
    const tramo = tramoDeCampana(e.vigenteDesde, e.vigenteHasta, hoy);
    const kicker =
      e.estado === "pendiente"
        ? "Por aprobar"
        : !e.activo
          ? "Desactivado"
          : tramo === "ahora" && e.vigenteHasta
            ? `Rige hoy · hasta el ${fechaLarga(e.vigenteHasta)}`
            : tramo === "proximas" && e.vigenteDesde
              ? `Empieza el ${fechaLarga(e.vigenteDesde)}`
              : tramo === "pasaron" && e.vigenteHasta
                ? `Pasó el ${fechaCorta(e.vigenteHasta)}`
                : e.estilo === "campana"
                  ? "Sin fechas"
                  : TEXTOS_VISTA[vistaDeEstilo(e.estilo)].nombre;
    const editable = puedeEditar(e) && e.activo && e.estado === "aprobado";
    const cupo = lookbookVisible(p.modelos.length, columnasLookbook);
    const visibles = p.modelos.slice(0, cupo.visibles);
    const resto = cupo.resto;
    return (
      <>
        <div className="sl-kick" style={{ "--i": 0 } as CSSProperties}>
          {kicker}
        </div>
        {/* unificar-fijo: el título del pase abierto es la pieza de esta pantalla (la portada del pase), no un título de sección */}
        <h2 className="sl-titular mt-3" style={{ "--i": 1 } as CSSProperties}>
          <span>{e.nombre}</span>
        </h2>
        {prendasVitrina &&
          (p.modelos.length > 0 ? (
            <div
              ref={refLookbook}
              className="sl-lookbook mt-6"
              data-guia="sellos.lookbook"
              // Pocas prendas (no llenan una fila): se centran bajo el título en vez de quedar pegadas a la izquierda.
              data-pocas={p.modelos.length < columnasLookbook ? "" : undefined}
              style={{ "--i": 2, "--sl-n": p.modelos.length } as CSSProperties}
            >
              {visibles.map((m, j) => (
                <div key={m.clave} className="sl-prenda" style={{ "--j": j } as CSSProperties}>
                  <div className="sl-prenda-foto">
                    <FotoDePrenda fotoUrl={m.fotoUrl} colorHex={m.colorHex} prefijo={m.categoria?.prefijo} familia={m.categoria?.familia} categoria={m.categoria?.nombre} />
                  </div>
                  <span className="sl-prenda-nombre" title={m.referencia}>
                    {m.referencia}
                  </span>
                  <span className="sl-prenda-dato">
                    {[m.colorNombre, m.unidades !== null ? (m.unidades === 0 ? "agotada" : `${m.unidades} u`) : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
              {resto > 0 &&
                (editable ? (
                  <button type="button" className="sl-mas" style={{ "--j": visibles.length } as CSSProperties} onClick={() => setEtiquetando(e)}>
                    <span>
                      <b>+{resto}</b>prendas más
                    </span>
                  </button>
                ) : (
                  <div className="sl-mas" style={{ "--j": visibles.length } as CSSProperties}>
                    <span>
                      <b>+{resto}</b>prendas más
                    </span>
                  </div>
                ))}
            </div>
          ) : cats.length === 0 ? (
            <div className="mt-6" style={{ "--i": 2 } as CSSProperties}>
              <Vacio
                icono={<Shirt />}
                titulo={e.estilo === "campana" ? "Esta campaña todavía no tiene prendas" : "Ninguna prenda lleva esta insignia"}
                acciones={
                  editable ? (
                    <Boton peso="primario" onClick={() => setEtiquetando(e)}>
                      + Elegir prendas
                    </Boton>
                  ) : undefined
                }
              >
                {e.estilo === "campana" && tramo === "ahora" && e.descuentoPct !== null
                  ? `Rige con ${e.descuentoPct.toLocaleString("es-PE")} %, pero mientras no tenga prendas no rebaja nada en caja ni en la web.`
                  : "Márcalas en «Prendas» o elige sus categorías en «Configurar»."}
              </Vacio>
            </div>
          ) : null)}
        {e.estilo === "campana" && tramo !== "pasaron" && (
          <div className="sl-listo mt-6" data-guia="sellos.listo" style={{ "--i": 3 } as CSSProperties}>
            <p className="label-cayla pb-1.5 pt-3.5 text-[10px] text-tinta/65">Lo que ya tiene</p>
            {loQueTiene(e, p.modelos.length, cats, hoy, p.aMano, e.estilo === "campana" && reglasDisponibles ? ofertasDe(e) : undefined).map((x, i) => (
              <div key={x.clave} className="sl-listo-fila" data-estado={x.hecho ? "hecho" : x.opcional ? "opcional" : "falta"} style={{ "--i": i } as CSSProperties}>
                <span className="sl-listo-marca" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <path d={x.hecho ? "M6 12.5l4 4L18 8.5" : x.opcional ? "M8 12h8" : "M12 7v6M12 16.5v.1"} strokeWidth="2.2" />
                  </svg>
                </span>
                <span>
                  {x.nombre}
                  <span className="sr-only">{x.hecho ? ": listo" : x.opcional ? ": opcional" : ": falta"}</span>
                </span>
                <span className="sl-listo-detalle">{x.detalle}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const nota = vista === "rotacion" && rotacion ? notaSinRegistrar(rotacion.registradas, rotacion.sinRegistrar) : null;
  const rechazandoEtiqueta = etiquetas.find((e) => e.id === rechazandoAbierto) ?? null;
  const aprobandoEtiqueta = etiquetas.find((e) => e.id === aprobandoAbierto) ?? null;
  const ofertando = etiquetas.find((e) => e.id === ofertandoId) ?? null;
  const puedeCrear = esCampanas ? puedeEditarCampanas : puedeEditarSellos;
  let indice = 0;

  return (
    <div className="space-y-6">
      <div data-guia="sellos.cabecera">
        <EncabezadoPagina
          sede={sede}
          titulo="Insignias"
          subtitulo="Lo que se le marca a una prenda. Primero las campañas; con las pestañas, las demás insignias."
          acciones={
            <>
              {esCampanas && disenoWeb && (
                <BotonVer href="/tienda-web/campanas" guia="sellos.diseno-web">
                  Cómo se ven en la web
                </BotonVer>
              )}
              {puedeCrear && (
                <Boton peso="primario" onClick={() => setAgregando(true)} data-guia="sellos.nuevo">
                  {`+ ${T.nuevo}`}
                </Boton>
              )}
            </>
          }
        />
      </div>

      {vistas.length > 1 && (
        <Pestanas
          etiquetaAccesible="Qué insignias ver"
          activa={vista}
          onCambio={cambiarVista}
          guia="sellos.pestanas"
          idIndicador="sellos-vistas"
          items={vistas.map((v) => ({
            clave: v,
            etiqueta: TEXTOS_VISTA[v].nombre,
            icono: ICONO_VISTA[v],
            conteo: etiquetas.filter((e) => e.activo && vistaDeEstilo(e.estilo) === v).length,
            pide: "activos",
            tono: "neutro" as const,
            guia: `sellos.pestana-${v}`,
          }))}
        />
      )}

      {nota && <p className="nota-cayla max-w-3xl text-xs">{nota}</p>}

      {pilas.length === 0 ? (
        <Vacio
          icono={<Award />}
          titulo={esCampanas ? "Todavía no hay campañas" : `Todavía no hay insignias de ${TEXTOS_VISTA[vista].nombre}`}
          acciones={
            puedeCrear ? (
              <Boton peso="primario" onClick={() => setAgregando(true)}>
                {`+ ${T.nuevo}`}
              </Boton>
            ) : undefined
          }
        >
          {esCampanas ? "Crea la primera con su nombre y después ponle sus fechas, su descuento y sus prendas." : "Crea uno y márcalo en sus prendas."}
        </Vacio>
      ) : (
        <div key={vista} className="sl-marco">
          <div ref={refBilletera} className="sl-billetera">
            <div data-guia="sellos.pila">
              {pilas.map((pila) => (
                <section key={pila.clave} className="sl-pila" aria-label={pila.titulo}>
                  <h3 className="sl-pila-titulo">
                    {pila.titulo}
                    <Globito n={pila.pases.length} />
                  </h3>
                  {pila.pases.map((e) => (
                    <Fragment key={e.id}>
                      {pase(e, pila.tono, indice++)}
                      {enLinea && abierto?.id === e.id && (
                        <div className="sl-detalle sl-detalle-en-linea" aria-live="polite" data-guia="sellos.detalle">
                          {detalle(e)}
                        </div>
                      )}
                    </Fragment>
                  ))}
                </section>
              ))}
            </div>
            {abierto && !enLinea && (
              <aside key={abierto.id} className="sl-detalle" aria-live="polite" data-guia="sellos.detalle">
                {detalle(abierto)}
              </aside>
            )}
          </div>
        </div>
      )}

      {agregando && (
        <NuevaEtiquetaModal
          modo={esCampanas ? "campanas" : "sellos"}
          nombre={nombre}
          onNombre={setNombre}
          responsable={responsable}
          guardando={guardando}
          onGuardar={guardar}
          onClose={() => setAgregando(false)}
        />
      )}

      {etiquetando && (
        <PrendasDeEtiquetaModal
          etiqueta={etiquetando}
          prendasConCosto={prendasConCosto}
          marcasManuales={manuales[etiquetando.id] ?? []}
          tiendas={tiendas}
          sedeActualId={sedeActualId}
          onClose={() => setEtiquetando(null)}
          onAplicado={(finales) => {
            setManuales((actual) => ({ ...actual, [etiquetando.id]: finales }));
            setEtiquetando(null);
          }}
        />
      )}

      {configurando && (
        <CampanaModal
          modo={configurando.estilo === "campana" ? "campanas" : "sellos"}
          etiqueta={configurando}
          puedeDarDescuento={puedeEditar(configurando)}
          categorias={categorias}
          tiendas={tiendas}
          sedeActualId={sedeActualId}
          prendasConCosto={prendasConCosto}
          variantesManuales={manuales[configurando.id] ?? []}
          onClose={() => setConfigurando(null)}
          onGuardado={(cambios) => {
            setEtiquetas((actual) => ordenarEtiquetas(actual.map((x) => (x.id === configurando.id ? { ...x, ...cambios } : x))));
            setConfigurando(null);
          }}
        />
      )}

      {ofertando && (
        <OfertasHoja
          etiqueta={ofertando}
          reglas={reglasDeCampana(reglas, ofertando.id)}
          categorias={categorias}
          tiendas={tiendas}
          sedeActualId={sedeActualId}
          prendasConCosto={prendasConCosto}
          variantesManuales={manuales[ofertando.id] ?? []}
          esLider={esLider}
          hoy={hoy}
          puedeDarDescuento={puedeEditar(ofertando)}
          alGuardarCampana={(cambios) => setEtiquetas((actual) => ordenarEtiquetas(actual.map((x) => (x.id === ofertando.id ? { ...x, ...cambios } : x))))}
          alReglas={setReglas}
          onClose={() => setOfertandoId(null)}
        />
      )}

      {aprobandoEtiqueta && (
        <Modal titulo={`${verboAprobacion(aprobandoEtiqueta.estado)} «${aprobandoEtiqueta.nombre}»`} subtitulo={AYUDA_COMENTARIO_APROBAR} onClose={() => setAprobandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Comentario (obligatorio)" value={comentarioAprobar} onChange={(ev) => setComentarioAprobar(ev.target.value)} autoFocus />
              <div className="pie-acciones">
                <Boton peso="fantasma" onClick={cerrar} disabled={aprobandoId === aprobandoEtiqueta.id}>
                  Cancelar
                </Boton>
                <Boton peso="primario" cargando={aprobandoId === aprobandoEtiqueta.id} disabled={!comentarioAprobar.trim()} onClick={() => aprobar(aprobandoEtiqueta)}>
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
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(ev) => setMotivoRechazo(ev.target.value)} autoFocus />
              <div className="pie-acciones">
                <Boton peso="fantasma" onClick={cerrar} disabled={rechazandoId === rechazandoEtiqueta.id}>
                  Cancelar
                </Boton>
                <Boton peso="primario" cargando={rechazandoId === rechazandoEtiqueta.id} onClick={() => rechazar(rechazandoEtiqueta)}>
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
