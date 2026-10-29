"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Gift, Info, Layers, Star, Tag, Undo2, Wallet } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { BotonVerMas } from "@/components/ui/VerMas";
import { Volver } from "@/components/ui/Volver";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { EtiquetaDeCampana } from "@/components/campana-hoja/EtiquetaDeCampana";
import { CategoriasDeCampana } from "@/components/campana-hoja/CategoriasDeCampana";
import type { CategoriaOpcion, Etiqueta } from "@/components/EtiquetasLista";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { alcanceCampana, avisoReimprimir, chipDeTarjeta, destinoReimprimir, nombreBajoCosto, prendasBajoCosto, prendasQueCambianDePrecioHoy, textoSedesDeCampana, type PrendaConCosto, type TiendaOpcion } from "@/lib/etiqueta-campana";
import { ejemplosDeCaja, piezasDelMosaico } from "@/lib/campana-hoja";
import { sumarDias } from "@/lib/fechas-lima";
import { fechaCorta, repetirTemporada, textoRango, vigenciaDe } from "@/lib/etiqueta-vigencia";
import {
  DIAS_SEMANA,
  PORCENTAJES_RAPIDOS,
  PORCENTAJE_MAX,
  PORCENTAJE_MIN,
  PORCENTAJE_PASO,
  atajosDeFechas,
  categoriasDichas,
  contarPorCategoria,
  contarPrendas,
  cuentaDias,
  diaCorto,
  diasQueCaen,
  esNombreAutomatico,
  fraseDeOferta,
  lista,
  nombreAutomatico,
  nombreDeOferta,
  nombreDia,
  nombresOrdenados,
  ofertaDesdeRegla,
  ofertaNueva,
  ordenarReglas,
  prendasQueAlcanza,
  problemasDeOferta,
  reglasQueSeCruzan,
  resumenAntes,
  textoDias,
  textoDiasCorto,
  textoFechas,
  vigenciaDeRegla,
  type CuerpoGuardarOferta,
  type OfertaEnEdicion,
  type ReglaCampana,
  type VigenciaRegla,
} from "@/lib/campana-reglas";

/* ====================================================================
   «Tres preguntas» · las OFERTAS de una campaña (Felipe 2026-10-23, elegida entre cinco: docs/maquetas/ofertas-promociones-2026-10/formulario/)

   PROMETE: una hoja con tres cosas — las ofertas ya registradas de la campaña (a la izquierda), un asistente de UNA pregunta por
   pantalla (¿Qué le das al cliente? · ¿Cuándo? · ¿En qué prendas y tiendas?) y, a la derecha, la etiqueta de la campaña que se arma con
   cada respuesta (la misma de la hoja de la campaña, ADR-0488, con el resumen de la oferta). El cuándo y las prendas ya vienen contestados
   con lo más común; las tiendas no (se marcan una por una); quien ya sabe usa el atajo de la pregunta 1.
   ASUME: hoy solo existe «Un % menos» (los otros 14 tipos de la maqueta cambian dinero en la caja y llegan después: se ven apagados con
   «Pronto»). Las tiendas y las prendas de una oferta son un subconjunto de las de su campaña. Quien abre esta hoja tiene la llave de
   campañas y activa, cambia y retira sin esperar a un líder (ADR-0534; la base vuelve a exigir la llave). Guardar y activar van por
   /api/productos/campana-reglas; la base valida todo otra vez.
   NO HACE: no cambia precios por su cuenta ni toca el descuento «de siempre» de la campaña (solo se retira desde «Ya registradas»).
   ==================================================================== */

type Paso = 1 | 2 | 3;
type Guardando = "borrador" | "activar" | "cambios" | null;

const GRUPOS: { k: string; titulo: string; corto: string; texto: string; icono: ReactNode; activo: boolean }[] = [
  { k: "rebaja", titulo: "Una rebaja", corto: "Una rebaja", texto: "Un porcentaje menos en las prendas", icono: <Tag aria-hidden />, activo: true },
  { k: "varias", titulo: "Llevar varias y pagar menos", corto: "Llevar varias", texto: "3x2, 2 polos por S/\u00a059.90, la 2.ª al 50 %…", icono: <Layers aria-hidden />, activo: false },
  { k: "monto", titulo: "Gastar un monto y ahorrar", corto: "Gastar un monto", texto: "S/\u00a030 menos desde S/\u00a0300", icono: <Wallet aria-hidden />, activo: false },
  { k: "regalo", titulo: "Un regalo", corto: "Un regalo", texto: "Un arreglo de basta gratis desde S/\u00a0200", icono: <Gift aria-hidden />, activo: false },
  { k: "club", titulo: "Algo para miembros del Club", corto: "Para el Club", texto: "10 % menos, puntos dobles, compra privada…", icono: <Star aria-hidden />, activo: false },
];

const CHIP_ESTADO: Record<VigenciaRegla, { texto: string; tono: TonoChip }> = {
  vigente: { texto: "Vigente", tono: "verde" },
  programada: { texto: "Programada", tono: "pizarra" },
  borrador: { texto: "Borrador", tono: "ambar" },
  terminada: { texto: "Terminada", tono: "neutro" },
  retirada: { texto: "Retirada", tono: "apagado" },
};

/** «26 oct» (sin el punto con que `fechaCorta` cierra la abreviatura: la frase pone el suyo). */
const sinPunto = (t: string) => t.replace(/\.$/, "");
const pct = (n: number) => String(n).replace(".", ",");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function OfertasHoja({
  etiqueta,
  reglas,
  categorias,
  tiendas,
  sedeActualId,
  prendasConCosto,
  variantesManuales,
  hoy,
  puedeDarDescuento,
  alGuardarCampana,
  alReglas,
  onClose,
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
  hoy: string;
  /** Quien configura la campaña puede ponerle su descuento de siempre (si no, el formulario no lo ofrece). */
  puedeDarDescuento: boolean;
  /** La campaña se guardó desde adentro (fechas, categorías, tiendas, descuento): la pantalla actualiza su fila. */
  alGuardarCampana: (cambios: Pick<Etiqueta, "descuentoPct" | "vigenteDesde" | "vigenteHasta" | "categoriaIds" | "sedeIds">) => void;
  /** La lista fresca de TODAS las ofertas, tal como la devolvió la base tras guardar, activar o retirar. */
  alReglas: (todas: ReglaCampana[]) => void;
  onClose: () => void;
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
  const nombreCategoria = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.nombre]));
    return (id: string) => mapa.get(id) ?? "";
  }, [categorias]);

  // ---- Lo que la campaña tiene: sus prendas a la venta y las categorías con prendas ---------------------------------------------
  const manuales = useMemo(() => new Set(variantesManuales), [variantesManuales]);
  const prendasCampana = useMemo(() => {
    const cats = new Set(etiqueta.categoriaIds);
    return prendasConCosto.filter((p) => (p.categoriaId !== null && cats.has(p.categoriaId)) || manuales.has(p.id));
  }, [prendasConCosto, etiqueta.categoriaIds, manuales]);
  const [o, setO] = useState<OfertaEnEdicion>(nuevaOferta);
  // Cada categoría dice cuántas prendas a la venta trae, como en la hoja de la campaña: son las de TODO el catálogo porque una oferta puede
  // elegir categorías que la campaña no tiene. Una prenda es un modelo en su color (sus tallas cuentan una vez, ADR-0488) y las de Claurè
  // no cuentan salvo que la oferta las incluya a propósito, porque la base no se las baja.
  const cuentaCats = useMemo(() => contarPorCategoria(prendasConCosto, o.incluyeClaure), [prendasConCosto, o.incluyeClaure]);
  const catsCampana = useMemo(() => new Set(etiqueta.categoriaIds), [etiqueta.categoriaIds]);

  // ---- El asistente ---------------------------------------------------------------------------------------------------------------
  const [paso, setPaso] = useState<Paso>(1);
  const [elegido, setElegido] = useState(false);
  const [visitado, setVisitado] = useState<Record<Paso, boolean>>({ 1: false, 2: false, 3: false });
  const [navego, setNavego] = useState(false);
  // La categoría recién marcada: su casilla vuela a su pieza en la etiqueta (`EtiquetaDeCampana`).
  const vuelo = useRef<string | null>(null);
  // La persona tocó la grilla de categorías (aunque la dejó vacía: vacío es «ninguna», no «las de la campaña»).
  const [tocoCats, setTocoCats] = useState(false);
  const [masQ3, setMasQ3] = useState(false);
  const [soloAlgunosDias, setSoloAlgunosDias] = useState(false);
  const [guardando, setGuardando] = useState<Guardando>(null);
  const [recien, setRecien] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [regsAb, setRegsAb] = useState(false);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  // Lo poco que la campaña misma tiene aquí (su descuento de siempre y el límite de tiendas de antes) se toca con las mismas puertas de
  // siempre (`PATCH /api/productos/etiquetas`). Sus FECHAS ya no se cambian aquí sino en «Editar» de su pase (Felipe 2026-10-28). Todo lo
  // demás —cuánto baja, en qué prendas, en qué tiendas y cuándo— es de cada oferta.
  const router = useRouter();
  const repeticion = useMemo(() => repetirTemporada(campDesde, campHasta, hoy), [campDesde, campHasta, hoy]);
  const [guardandoCampana, setGuardandoCampana] = useState(false);
  const [retirandoDescuento, setRetirandoDescuento] = useState(false);
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
      setRetirandoDescuento(false);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardandoCampana(false);
    }
  }

  const editada = o.id ? (reglas.find((r) => r.id === o.id) ?? null) : null;
  const cambiar = (parche: Partial<OfertaEnEdicion>) => setO((a) => ({ ...a, ...parche }));

  function ir(p: Paso) {
    setNavego(true);
    setVisitado((v) => ({ ...v, [paso]: true }));
    setPaso(p);
  }
  function reiniciar() {
    setO(nuevaOferta());
    setElegido(false);
    setPaso(1);
    setVisitado({ 1: false, 2: false, 3: false });
    setTocoCats(false);
    setMasQ3(false);
    setSoloAlgunosDias(false);
  }
  function editar(r: ReglaCampana) {
    setO({ ...ofertaDesdeRegla(r, esNombreAutomatico(r, nombreCategoria, nombreSede)), sedeIds: r.sedeIds.length > 0 ? r.sedeIds : idsDeTiendas });
    setElegido(true);
    setPaso(1);
    setNavego(true);
    setVisitado({ 1: false, 2: false, 3: false });
    setTocoCats(false);
    setMasQ3(false);
    setSoloAlgunosDias(r.dias.length < 7);
    setRegsAb(false);
  }

  // ---- Lo que la oferta alcanzaría y lo que avisa ---------------------------------------------------------------------------------
  const alcanzadas = useMemo(() => prendasQueAlcanza(prendasCampana, prendasConCosto, o), [prendasCampana, prendasConCosto, o]);
  const bajoCosto = useMemo(() => prendasBajoCosto(o.porcentaje, alcanzadas, new Set<string>(), new Set(alcanzadas.map((p) => p.id))), [o.porcentaje, alcanzadas]);
  const nAlcanza = contarPrendas(alcanzadas);
  // Por debajo del costo se cuenta como se cuentan las prendas (un modelo en su color) y se nombran dos, no dos tallas del mismo.
  const bajoPorModelo = useMemo(() => [...new Map(bajoCosto.map((p) => [p.modelo ?? p.id, p])).values()], [bajoCosto]);
  // La grilla de categorías: las marcadas son las de la oferta; sin ninguna elegida, las de la campaña (menos lo que una oferta vieja deja fuera).
  const categoriasPendientes = tocoCats && o.categoriasSolo.length === 0;
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
  const cruces = reglasQueSeCruzan(oDicha, reglas, hoy);
  const diasEnFechas = o.desde && o.hasta && o.desde <= o.hasta ? diasQueCaen(o.desde, o.hasta) : [];
  const diasSueltos = o.dias.length > 0 && o.dias.length < 7;
  const rige = o.desde && o.hasta && o.desde <= o.hasta ? cuentaDias(o.desde, o.hasta, o.dias) : null;
  const nombre = nombreDeOferta(oDicha, nombreCategoria, nombreSede);
  const nombreManual = o.nombre.trim() !== "";

  const faltan: CampoDeGuia[] = [];
  // En el orden de las etapas: qué le das, cuándo, y al final prendas y tiendas.
  if (!elegido) faltan.push({ id: "que", nombre: "Elegir qué le das al cliente", requerido: true, hecho: false, pendiente: "Elige qué le das al cliente." });
  else if (problemas.length > 0) {
    const sinDias = /al menos un día de la semana/.test(problemas[0]);
    faltan.push({ id: "cuando", nombre: sinDias ? "Elegir al menos un día de la semana" : "Corregir lo de «¿Cuándo?»", requerido: true, hecho: false, pendiente: problemas[0] });
  } else if (tiendasPendientes) faltan.push({ id: "tiendas", nombre: "Elegir en qué tiendas rige", requerido: true, hecho: false, pendiente: "Marca al menos una tienda." });
  else if (categoriasPendientes) faltan.push({ id: "categorias", nombre: "Elegir las categorías", requerido: true, hecho: false, pendiente: "Marca al menos una categoría." });
  const puedeGuardar = elegido && !tiendasPendientes && !categoriasPendientes && problemas.length === 0 && !terminada;

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

  async function guardar(activar: boolean) {
    if (!puedeGuardar || guardando) return;
    const cuerpo: CuerpoGuardarOferta = {
      id: o.id,
      etiquetaId: etiqueta.id,
      nombre,
      porcentaje: o.porcentaje,
      desde: o.desde,
      hasta: o.hasta,
      dias: o.dias,
      categoriasSolo: o.categoriasSolo,
      categoriasFuera: o.categoriasFuera,
      sedeIds: o.sedeIds,
      incluyeClaure: o.incluyeClaure,
      activar,
    };
    setGuardando(activar ? "activar" : o.id ? "cambios" : "borrador");
    const r = await llamar("POST", cuerpo);
    setGuardando(null);
    if (!r.ok) return;
    setRecien(r.id);
    const cuando = o.desde > hoy ? `desde el ${sinPunto(fechaCorta(o.desde))}` : "desde ahora";
    if (activar) avisar.exito("Oferta activada", { detalle: `«${nombre}» rige ${cuando} en caja y en la tienda web.` });
    else if (o.id) avisar.exito("Cambios guardados", { detalle: "Valen desde ahora; lo que ya se vendió se queda como estaba." });
    else avisar.exito("Oferta guardada como borrador", { detalle: "Actívala cuando quieras que empiece a bajar el precio." });
    reiniciar();
  }

  async function activarRegla(r: ReglaCampana) {
    setTrabajando(r.id);
    const res = await llamar("PATCH", { id: r.id, accion: "activar" });
    setTrabajando(null);
    if (res.ok) {
      setRecien(r.id);
      avisar.exito("Oferta activada", { detalle: `«${r.nombre}» rige ${r.desde > hoy ? `desde el ${sinPunto(fechaCorta(r.desde))}` : "desde ahora"} en caja y en la tienda web.` });
    }
  }
  async function retirarRegla(r: ReglaCampana) {
    setTrabajando(r.id);
    const res = await llamar("PATCH", { id: r.id, accion: "retirar" });
    setTrabajando(null);
    setRetirando(null);
    if (res.ok) {
      if (o.id === r.id) reiniciar();
      avisar.exito("Oferta retirada", { detalle: `«${r.nombre}» deja de bajar el precio. Queda en el historial.` });
    }
  }

  // ---- Piezas pequeñas --------------------------------------------------------------------------------------------------------------
  const alternarEn = (lista_: string[], id: string) => (lista_.includes(id) ? lista_.filter((x) => x !== id) : [...lista_, id]);
  // La selección de categorías de la hoja (la de producción). Si queda igual a las de la campaña es «las de la campaña» (sin lista: las que se
  // sumen después entran solas y las marcadas a mano también); si no, es una lista de la oferta. Sin ninguna es «ninguna», y no deja guardar.
  function fijarCategorias(siguiente: ReadonlySet<string>) {
    const comoLaCampana = siguiente.size === catsCampana.size && [...siguiente].every((id) => catsCampana.has(id));
    cambiar({ categoriasSolo: comoLaCampana ? [] : [...siguiente], categoriasFuera: [] });
    setTocoCats(!comoLaCampana);
  }
  // La casilla recién marcada vuela a su pieza en la etiqueta.
  const alternarCategoria = (id: string) => {
    const siguiente = new Set(elegidasSolo);
    if (siguiente.has(id)) siguiente.delete(id);
    else {
      siguiente.add(id);
      vuelo.current = id;
    }
    fijarCategorias(siguiente);
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

  // ---- Pregunta 1 -----------------------------------------------------------------------------------------------------------------
  function pregunta1() {
    return (
      <>
        <h2>¿Qué le das al cliente?</h2>
        <p className="of-baj">{elegido ? "Ajusta el número. Lo demás ya viene contestado." : "Elige lo que más se parezca. Los detalles vienen después."}</p>
        {!elegido ? (
          <div className="of-fams" role="group" aria-label="Qué le das al cliente">
            {GRUPOS.map((g) => (
              <button
                key={g.k}
                type="button"
                className="of-fam"
                disabled={!g.activo}
                aria-disabled={!g.activo || undefined}
                title={g.activo ? undefined : "Llega pronto: cambia el dinero en la caja y lo estamos probando."}
                onClick={() => g.activo && setElegido(true)}
                data-guia={g.activo ? "sellos.oferta-rebaja" : undefined}
              >
                <span className="of-ico">{g.icono}</span>
                <b>{g.titulo}</b>
                <small>{g.texto}</small>
                <span className="of-go">{g.activo ? <ChevronRight aria-hidden /> : <Chip tono="neutro" versalitas={false}>Pronto</Chip>}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="of-gp" role="group" aria-label="Qué le das al cliente">
              {GRUPOS.map((g) => (
                <button key={g.k} type="button" className="pildora-cayla" aria-pressed={g.activo} disabled={!g.activo} title={g.activo ? undefined : "Llega pronto"}>
                  {g.corto}
                  {!g.activo && <span className="font-normal"> · pronto</span>}
                </button>
              ))}
            </div>
            <div className="of-sub">
              <span className="of-lbl">De qué forma</span>
              <div className="of-opciones">
                <button type="button" className="pildora-cayla" aria-pressed>
                  Un % menos
                </button>
                <button type="button" className="pildora-cayla" disabled title="Llega pronto">
                  Soles menos en cada prenda · pronto
                </button>
                <button type="button" className="pildora-cayla" disabled title="Llega pronto">
                  Un precio único · pronto
                </button>
              </div>
            </div>
            <div className="mt-3">
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
                tono={bajoPorModelo.length > 0 ? "error" : undefined}
                menos={{ onClick: () => cambiar({ porcentaje: Math.max(PORCENTAJE_MIN, o.porcentaje - PORCENTAJE_PASO) }), deshabilitado: o.porcentaje <= PORCENTAJE_MIN, etiqueta: "Bajar el descuento" }}
                mas={{ onClick: () => cambiar({ porcentaje: Math.min(PORCENTAJE_MAX, o.porcentaje + PORCENTAJE_PASO) }), deshabilitado: o.porcentaje >= PORCENTAJE_MAX, etiqueta: "Subir el descuento" }}
                data-guia="sellos.oferta-pct"
              >
                <span className="whitespace-nowrap">−{pct(o.porcentaje)} %</span>
              </PasoCantidad>
              <div role="group" aria-label="Descuentos de siempre" className="flex flex-wrap gap-1.5">
                {PORCENTAJES_RAPIDOS.map((v) => (
                  <button key={v} type="button" className="pildora-cayla tabular-nums" aria-pressed={o.porcentaje === v} onClick={() => cambiar({ porcentaje: v })}>
                    {v} %
                  </button>
                ))}
              </div>
            </div>
            </Campo>
            </div>
            <p className="of-ayuda">
              <Info aria-hidden />
              <span>El precio baja ese porcentaje. El cliente no tiene que hacer nada: la caja y la tienda web lo aplican solas.</span>
            </p>
          </>
        )}
      </>
    );
  }

  // ---- Dónde rige (se contesta en «¿Cuándo y dónde?») ------------------------------------------------------------------------------
  const dondeRige = textoSedesDeCampana(etiqueta.sedeIds, tiendas) ?? "En todas las tiendas";
  const dondeDeLaOferta = sinTiendas ? dondeRige : tiendasPendientes ? "Elige al menos una tienda" : seleccionCompleta ? "En todas las tiendas" : (textoSedesDeCampana(o.sedeIds, tiendas) ?? dondeRige);
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
          <span className="of-lbl" style={{ margin: "0 0.125rem 0 0" }}>
            Días
          </span>
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
        <h2>¿Cuándo y dónde?</h2>
        <p className="of-baj">
          {tiendasPendientes ? "Las fechas ya vienen contestadas. Falta marcar en qué tiendas rige." : campHasta ? `Rige toda la campaña (hasta el ${sinPunto(fechaCorta(campHasta))}) salvo que lo cambies.` : "Elige desde cuándo y hasta cuándo."}
        </p>
        {atajos.length > 0 && (
          <div className="of-opciones mt-3" role="group" aria-label="Fechas de siempre">
            {atajos.map((a) => (
              <button key={a.texto} type="button" className="pildora-cayla" aria-pressed={o.desde === a.desde && o.hasta === a.hasta} onClick={() => cambiar({ desde: a.desde, hasta: a.hasta })}>
                {a.texto}
              </button>
            ))}
          </div>
        )}
        <div className="of-fechas">
          <CampoFecha etiqueta="Desde" valor={o.desde} onValor={(v) => cambiar({ desde: v })} tono={errorFechas ? "error" : undefined} />
          <CampoFecha etiqueta="Hasta" valor={o.hasta} onValor={(v) => cambiar({ hasta: v })} tono={errorFechas ? "error" : undefined} pie={errorFechas} />
        </div>
        {dias2()}
        <div className="of-donde">
          <span className="of-lbl">Dónde rige</span>
          {chipsDeTiendas}
          <p className="of-pequeno mt-1.5" aria-live="polite">
            {textoDonde} La tienda web cobra lo mismo y no se elige aparte.
          </p>
        </div>
      </>
    );
  }

  // ---- Pregunta 3 · ¿En qué prendas? ----------------------------------------------------------------------------------------------------
  // Lo que se dice de las prendas, en una línea (la etiqueta de la derecha y el nombre usan la misma).
  const prendasTexto = (() => {
    const base = o.categoriasSolo.length > 0 ? categoriasDichas(o.categoriasSolo, nombreCategoria) : "Todas las de la campaña";
    const extras = [o.categoriasFuera.length > 0 ? `menos ${lista(nombresOrdenados(o.categoriasFuera, nombreCategoria).map((n) => n.toLowerCase()))}` : "", o.incluyeClaure ? "con Claurè" : ""].filter(Boolean);
    return extras.length > 0 ? `${base} · ${extras.join(" · ")}` : base;
  })();
  // La frase de producción bajo «Categorías»: «Alcanza a 47 prendas a la venta: 3 de 1 categoría y 44 marcadas a mano.»
  const alcanceTexto = (() => {
    if (categoriasPendientes) return "Marca al menos una categoría.";
    const claure = claureFuera > 0 ? ` ${plural(claureFuera, "prenda", "prendas")} de Claurè ${claureFuera === 1 ? "queda" : "quedan"} fuera.` : "";
    const comoLaCampana = o.categoriasSolo.length === 0;
    if (comoLaCampana && prendasCampana.length === 0) return "La campaña todavía no tiene prendas: marca las categorías de esta oferta.";
    const delCatalogo = prendasConCosto.filter((p) => o.incluyeClaure || !p.deClaure);
    const a = alcanceCampana(delCatalogo, elegidasSolo, comoLaCampana ? manuales : new Set<string>());
    const partes = [a.porCategoria > 0 ? `${a.porCategoria} de ${plural(elegidasSolo.size, "categoría", "categorías")}` : "", a.aMano > 0 ? `${plural(a.aMano, "marcada", "marcadas")} a mano` : ""].filter(Boolean);
    return `Alcanza a ${plural(nAlcanza, "prenda", "prendas")} a la venta${partes.length > 0 ? `: ${partes.join(" y ")}` : ""}.${claure}`;
  })();
  const distintaDeLaCampana = o.categoriasSolo.length > 0 || tocoCats;

  function preguntaPrendas() {
    const oracion = fraseDeOferta(oDicha, nombreCategoria, nombreSede);
    return (
      <>
        <h2>¿En qué prendas?</h2>
        <p className="of-baj">{distintaDeLaCampana ? "Marca las categorías donde rige esta oferta." : "Ya viene lo de la campaña. Marca o quita categorías para cambiarlo."}</p>
        <div className="of-panel" data-guia="sellos.oferta-prendas">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="of-lbl" style={{ margin: 0 }}>
                Categorías
              </span>
              {/* Marcan varias de un toque: el botón chico sutil, no el enlace (ADR-0358, ronda 9). Los dos siempre están: si aparecieran al marcar,
                  la lista saltaría bajo el mouse (ADR-0185). */}
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn-cayla btn-sutil btn-chico" disabled={elegidasSolo.size >= categorias.length} onClick={() => fijarCategorias(new Set(categorias.map((c) => c.id)))}>
                  Elegir todas
                </button>
                <button type="button" className="btn-cayla btn-sutil btn-chico" disabled={elegidasSolo.size === 0} onClick={() => fijarCategorias(new Set())}>
                  Quitar todas
                </button>
              </div>
            </div>
            <p className="of-pequeno mt-1" aria-live="polite">
              {alcanceTexto}
            </p>
            <div className="mt-3">
              <CategoriasDeCampana categorias={categorias} prendasDe={cuentaCats} elegidas={elegidasSolo} onAlternar={alternarCategoria} onFamilia={alternarFamilia} plegables />
            </div>
          </div>
          {hayClaure && (
            <div>
              <p className="of-sublbl" style={{ marginTop: 0 }}>
                Prendas de Claurè <span>· otra empresa: quedan fuera, salvo que las pongas a propósito</span>
              </p>
              <div className="of-opciones">
                <button type="button" className="pildora-cayla" aria-pressed={o.incluyeClaure} onClick={() => cambiar({ incluyeClaure: !o.incluyeClaure })}>
                  Incluir las de Claurè
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="of-rev" data-guia="sellos.oferta-revision">
          <span className="of-lbl">Revisa y guarda</span>
          <p className="of-oracion">{oracion}</p>
          {rige && diasSueltos && rige.rige > 0 && (
            <p className="of-pequeno">
              Rige {rige.rige} de {rige.total} días de esas fechas.
            </p>
          )}
          <div className="of-avisos">
            {problemas
              // «Elige al menos un día» ya lo dice la pista de los días y el «Falta:» del pie: no se repite en ámbar.
              .filter((p) => p !== errorFechas && !/al menos un día de la semana/.test(p))
              .map((p) => (
                <Aviso key={p} tono="atencion" chico>
                  {p}
                </Aviso>
              ))}
            {nAlcanza === 0 && (
              <Aviso tono="atencion" chico titulo="Todavía no alcanza ninguna prenda">
                Márcalas en «Prendas», en la tarjeta de la campaña, o elige otras categorías.
              </Aviso>
            )}
            {bajoPorModelo.length > 0 && (
              <Aviso tono="atencion" chico titulo={`Queda por debajo del costo: ${plural(bajoPorModelo.length, "prenda", "prendas")}`}>
                {bajoPorModelo.slice(0, 2).map(nombreBajoCosto).join(", ")}
                {bajoPorModelo.length > 2 ? "…" : ""}. No se bloquea, pero pierdes plata en cada una: avísale al contador.
              </Aviso>
            )}
            {o.incluyeClaure && (
              <Aviso tono="atencion" chico titulo="Entran las prendas de Claurè">
                Es otra empresa: confirma con su dueña que acepta el descuento.
              </Aviso>
            )}
            {cruces.length > 0 && (
              <Aviso tono="info" chico titulo={`Se cruza con «${cruces[0].nombre}»${cruces.length > 1 ? ` y ${cruces.length - 1} más` : ""}`}>
                En cada prenda gana la que deja al cliente con el mejor precio; no se suman.
              </Aviso>
            )}
            {etiqueta.descuentoPct !== null && (
              <Aviso tono="info" chico titulo={`La campaña ya tiene su descuento de siempre (${pct(etiqueta.descuentoPct)} %)`}>
                Donde se cruce con esta oferta gana el mayor.
              </Aviso>
            )}
            {diasSueltos && rige && rige.rige > 0 && (
              <Aviso tono="info" chico titulo="El papel colgado no cambia cada día">
                Antes de activarla, decide qué dirá la etiqueta de precio.
              </Aviso>
            )}
          </div>
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
                placeholder={nombreAutomatico(oDicha, nombreCategoria, nombreSede)}
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
      </>
    );
  }

  // ---- La etiqueta de la campaña (la de producción), con lo que esta oferta pone encima ---------------------------------------------
  // Es la misma `EtiquetaDeCampana` de la hoja de la campaña (ADR-0488): su descuento, sus fechas, a cuántas prendas llega, sus categorías
  // y lo que cobra la caja. Aquí se le suma un resumen de la oferta: qué prendas, en qué tiendas y cuándo.
  const cuandoTexto = `${sinPunto(textoFechas(o.desde, o.hasta)).replace(/^el /, "")}${diasSueltos ? ` · ${textoDias(o.dias)}` : ""}`;
  // El mosaico y los ejemplos de la caja salen de lo que la oferta alcanza de verdad (también las marcadas a mano de una campaña sin categorías).
  const cuentaAlcanza = useMemo(() => contarPorCategoria(alcanzadas, true), [alcanzadas]);
  const catsAlcanza = useMemo(() => new Set(cuentaAlcanza.keys()), [cuentaAlcanza]);
  const mosaico = piezasDelMosaico(categorias, catsAlcanza, cuentaAlcanza);
  // Mientras no elige qué le da al cliente, la caja cobra el precio de siempre: no se enseña un descuento que nadie puso.
  const ejemplos = ejemplosDeCaja(alcanzadas, catsAlcanza, manuales, cuentaAlcanza, elegido ? o.porcentaje : null);

  function etiquetaViva() {
    const fechasBien = o.desde !== "" && o.hasta !== "" && o.desde <= o.hasta;
    const linea = (n: string, v: string) => (
      <div className="of-ef">
        <span className="of-n">{n}</span>
        <span className="of-v">{v || <i className="of-pend">por elegir</i>}</span>
      </div>
    );
    const resumen = (
      <>
        <div className="eqp-solo-ancho">
          <hr className="eqp-perfora" />
          {linea("Prendas", prendasTexto)}
          {linea("Tiendas", tiendasPendientes ? "" : dondeDeLaOferta)}
          {linea("Cuándo", cuandoTexto)}
        </div>
        <p className="of-res-corto">{[tiendasPendientes ? "tiendas por elegir" : dondeDeLaOferta, cuandoTexto].join(" · ")}</p>
      </>
    );
    return (
      <aside className="of-lado cph-hoja" aria-label={`La etiqueta «${etiqueta.nombre}»`} data-guia="sellos.oferta-etiqueta">
        <EtiquetaDeCampana
          nombre={etiqueta.nombre}
          descuento={elegido ? o.porcentaje : null}
          textoSinDescuento="Elige qué le das al cliente"
          rango={fechasBien ? (textoRango(o.desde, o.hasta) ?? "") : "Revisa las fechas"}
          chip={fechasBien ? chipDeTarjeta(vigenciaDe(o.desde, o.hasta, hoy), nAlcanza, hoy) : null}
          total={nAlcanza}
          piezas={mosaico.piezas}
          mas={mosaico.mas}
          ejemplos={ejemplos}
          categoriaDe={(id) => {
            const c = id ? categorias.find((x) => x.id === id) : undefined;
            return c && { id: c.id, nombre: c.nombre, prefijo: c.prefijo, familiaCodigo: c.familiaCodigo, prendas: cuentaAlcanza.get(c.id) ?? 0 };
          }}
          vueloRef={vuelo}
          sello={null}
          resumen={resumen}
        />
      </aside>
    );
  }

  // ---- Los pasos y el pie ----------------------------------------------------------------------------------------------------------
  function pasos() {
    const d = (n: Paso, texto: string) => {
      const apagado = !elegido && n > 1;
      const hecho = visitado[n] && elegido && (n !== 2 || !tiendasPendientes) && (n !== 3 || !categoriasPendientes);
      return (
        <button
          key={n}
          type="button"
          className="of-paso"
          aria-current={paso === n ? "step" : undefined}
          aria-disabled={apagado || undefined}
          data-hecho={hecho ? "" : undefined}
          data-guia={n === 3 ? "sellos.oferta-paso-3" : n === 2 ? "sellos.oferta-paso-2" : undefined}
          onClick={() => !apagado && ir(n)}
        >
          <i>{hecho ? <Check aria-hidden strokeWidth={3} /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3 */ /> : n}</i>
          <span>{texto}</span>
        </button>
      );
    };
    return (
      <nav className="of-pasos" aria-label="Pasos" data-guia="sellos.oferta-pasos">
        {d(1, "Qué le das")}
        {d(2, "Cuándo y dónde")}
        {d(3, "Prendas")}
      </nav>
    );
  }

  function pie(cerrar: () => void) {
    const edita = o.id !== null;
    const estadoEdita = editada?.estado ?? null;
    const guardandoAlgo = guardando !== null;
    const cuando = o.desde > hoy ? `desde el ${sinPunto(fechaCorta(o.desde))}` : "desde ahora";
    let falta: ReactNode = null;
    let derecha: ReactNode = null;

    if (faltan.length > 0) {
      falta = <FaltanDelPaso faltan={faltan} ahora={faltan[0].id} onIr={(c) => ir(c.id === "que" ? 1 : c.id === "cuando" || c.id === "tiendas" ? 2 : 3)} />;
    }
    if (paso === 1) {
      if (faltan.length === 0) {
        falta = (
          <span className="of-falta">
            {edita ? "Cambia lo que quieras: vale desde ahora y lo que ya se vendió no cambia." : "Prendas, tiendas y fechas ya vienen contestadas. El atajo la guarda como borrador."}
          </span>
        );
      }
      derecha = (
        <>
          {elegido && (
            <Boton peso="fantasma" disabled={!puedeGuardar || guardandoAlgo} cargando={guardando === "borrador" || guardando === "cambios"} textoCargando="Guardando…" onClick={() => guardar(false)} data-guia="sellos.oferta-atajo">
              {edita ? "Listo, guardar los cambios" : "Listo, guardar con lo demás de fábrica"}
            </Boton>
          )}
          <Boton peso="primario" className="of-siguiente" disabled={!elegido} onClick={() => ir(2)}>
            Siguiente
            <ChevronRight aria-hidden className="ml-1 inline h-4 w-4" />
          </Boton>
        </>
      );
    } else if (paso === 2) {
      if (faltan.length === 0) falta = <span className="of-falta">Lo de fábrica sirve casi siempre: rige toda la campaña, todos los días.</span>;
      derecha = (
        <Boton peso="primario" className="of-siguiente" disabled={problemas.length > 0 || tiendasPendientes} onClick={() => ir(3)}>
          Siguiente
          <ChevronRight aria-hidden className="ml-1 inline h-4 w-4" />
        </Boton>
      );
    } else {
      const ok = puedeGuardar;
      if (ok) {
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
        <Boton peso="primario" disabled={!ok || guardandoAlgo} cargando={guardando === "cambios"} onClick={() => guardar(false)}>
          Guardar cambios
        </Boton>
      ) : (
        <>
          <Boton peso="fantasma" disabled={!ok || guardandoAlgo} cargando={guardando === "borrador" || guardando === "cambios"} onClick={() => guardar(false)}>
            {edita ? "Guardar cambios" : "Guardar como borrador"}
          </Boton>
          <Boton peso="primario" disabled={!ok || guardandoAlgo} cargando={guardando === "activar"} textoCargando="Activando…" onClick={() => guardar(true)} data-guia="sellos.oferta-activar">
            <Check aria-hidden className="mr-1 inline h-4 w-4" />
            Activar
          </Boton>
        </>
      );
    }

    return (
      <div className="of-pie pie-hoja-fijo">
        <span className={paso === 1 ? "of-vuelta-oculta" : undefined}>
          <Volver onClick={() => ir((paso - 1) as Paso)} a="el paso anterior" deshabilitado={paso === 1} />
        </span>
        <Boton peso="fantasma" onClick={cerrar} disabled={guardandoAlgo}>
          Cancelar
        </Boton>
        {falta ?? <span className="of-falta" />}
        {derecha}
      </div>
    );
  }

  // ---- Las ya registradas ---------------------------------------------------------------------------------------------------------
  function railFila(r: ReglaCampana) {
    const v = vigenciaDeRegla(r, hoy);
    const chip = CHIP_ESTADO[v];
    const viva = r.estado !== "desactivada" && v !== "terminada";
    const antes = r.cambios > 0 ? resumenAntes(r.ultimoCambio) : "";
    const datos = [`−${pct(r.porcentaje)} %`, `${sinPunto(fechaCorta(r.desde))} – ${sinPunto(fechaCorta(r.hasta))}`, textoDiasCorto(r.dias)].filter(Boolean).join(" · ");
    const confirmando = retirando === r.id;
    return (
      <div key={r.id} className="of-rw">
        <button
          type="button"
          className="of-reg"
          aria-current={o.id === r.id ? "true" : undefined}
          data-recien={recien === r.id ? "" : undefined}
          disabled={!viva}
          title={viva ? "Toca para editarla" : undefined}
          onClick={() => editar(r)}
        >
          <b>{r.nombre}</b>
          <span className="of-reg-m">
            <Chip tono="neutro" versalitas={false}>
              Oferta
            </Chip>
            <Chip tono={chip.tono}>{chip.texto}</Chip>
          </span>
          <small>{datos}</small>
          {r.sedeIds.length > 0 && <small>{textoSedesDeCampana(r.sedeIds, tiendas)}</small>}
          {r.incluyeClaure && <small>Con las prendas de Claurè</small>}
          {r.cambios > 0 && (
            <small className="of-hist">
              <Undo2 aria-hidden />
              {plural(r.cambios, "cambio", "cambios")}
              {antes ? ` · antes: ${antes}` : ""}
            </small>
          )}
        </button>
        {viva && !confirmando && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.estado === "borrador" && (
              <Boton peso="fantasma" className="btn-chico" cargando={trabajando === r.id} textoCargando="Activando…" onClick={() => activarRegla(r)}>
                Activar
              </Boton>
            )}
            <button type="button" className="btn-cayla btn-enlace text-xs" disabled={trabajando === r.id} onClick={() => setRetirando(r.id)}>
              Retirar
            </button>
          </div>
        )}
        {viva && confirmando && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Retirar «${r.nombre}»`}>
            <Boton peso="peligro" className="btn-chico" cargando={trabajando === r.id} textoCargando="Retirando…" onClick={() => retirarRegla(r)}>
              Sí, retirar
            </Boton>
            <Boton peso="fantasma" className="btn-chico" disabled={trabajando === r.id} onClick={() => setRetirando(null)}>
              No
            </Boton>
            <span className="of-pequeno">{r.estado === "activa" ? "Deja de bajar el precio ya." : "Se descarta el borrador."}</span>
          </div>
        )}
      </div>
    );
  }

  const ordenadas = ordenarReglas(reglas, hoy);
  const visibles = verTodas ? ordenadas : ordenadas.slice(0, 3);
  const resto = ordenadas.length - 3;
  const totalRail = ordenadas.length + (etiqueta.descuentoPct !== null ? 1 : 0);

  function rail() {
    return (
      <aside className="of-rail" data-guia="sellos.ofertas-registradas">
        <button type="button" className="of-tog" aria-expanded={regsAb} onClick={() => setRegsAb((v) => !v)}>
          <Tag aria-hidden className="h-4 w-4" /> Ya registradas <span className="tabular-nums font-normal">{totalRail}</span>
          <ChevronDown aria-hidden className="ml-auto h-4 w-4" />
        </button>
        <div className="of-rl" data-abierta={regsAb ? "" : undefined}>
          <div className="of-gt">
            <b>Ya registradas</b>
            <span className="of-pequeno tabular-nums">{totalRail}</span>
          </div>
          {etiqueta.descuentoPct !== null && (
            <div className="of-rw">
              <div className="of-reg" style={{ cursor: "default" }}>
                <b>El descuento de la campaña</b>
                <span className="of-reg-m">
                  <Chip tono="neutro" versalitas={false}>
                    De siempre
                  </Chip>
                </span>
                <small>−{pct(etiqueta.descuentoPct)} % en toda la campaña, todos los días. Para cambiarlo, retíralo y registra una oferta.</small>
              </div>
              {puedeDarDescuento && !retirandoDescuento && (
                <div>
                  <button type="button" className="btn-cayla btn-enlace text-xs" onClick={() => setRetirandoDescuento(true)}>
                    Retirar
                  </button>
                </div>
              )}
              {retirandoDescuento && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Retirar el descuento de siempre">
                  <Boton peso="peligro" className="btn-chico" cargando={guardandoCampana} textoCargando="Retirando…" onClick={() => guardarCampana({ descuentoPct: null }, "Descuento de siempre retirado")}>
                    Sí, retirar
                  </Boton>
                  <Boton peso="fantasma" className="btn-chico" disabled={guardandoCampana} onClick={() => setRetirandoDescuento(false)}>
                    No
                  </Boton>
                  <span className="of-pequeno">Deja de bajar el precio ya.</span>
                </div>
              )}
            </div>
          )}
          {visibles.map(railFila)}
          {resto > 0 && (
            <BotonVerMas abierto={verTodas} onCambiar={setVerTodas} texto={`Ver ${resto} más`} forma="enlace" />
          )}
          {totalRail === 0 && <p className="of-hint">Todavía no hay ofertas. Las que registres aparecen aquí.</p>}
          <p className="of-hint">Toca una para editarla: vale desde ese momento, lo ya vendido no cambia y queda su historial.</p>
        </div>
      </aside>
    );
  }

  // ---- La hoja --------------------------------------------------------------------------------------------------------------------
  return (
    <Modal
      titulo={`Configuración «${etiqueta.nombre}»`}
      subtitulo="Las ofertas de la campaña: cuánto baja, en qué prendas y cuándo."
      ancho="max-w-[78rem]" /* unificar-fijo: el asistente de ofertas (lista, preguntas y etiqueta) es de diseño propio, a todo lo ancho (maqueta «Tres preguntas» elegida por Felipe 2026-10-23) */
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="mt-4 space-y-4" data-guia="sellos.ofertas">
          <div className="of-camp" data-guia="sellos.ofertas-campana">
            <Chip tono="neutro" versalitas={false}>
              La campaña
            </Chip>
            <span>
              {terminada && campHasta ? `Terminó el ${sinPunto(fechaCorta(campHasta))}` : campDesde && campHasta ? `Rige del ${sinPunto(fechaCorta(campDesde))} al ${sinPunto(fechaCorta(campHasta))}` : "Sin fechas todavía (ponlas desde «Editar» en su pase)"} ·{" "}
              {plural(contarPrendas(prendasCampana), "prenda", "prendas")} a la venta
            </span>
            {etiqueta.sedeIds.length > 0 && (
              <>
                <Chip tono="pizarra" versalitas={false} title="La campaña de antes solo regía en esas tiendas: una oferta no puede salirse de ellas.">
                  {textoSedesDeCampana(etiqueta.sedeIds, tiendas)}
                </Chip>
                <button type="button" className="btn-cayla btn-enlace text-xs" disabled={guardandoCampana} onClick={() => guardarCampana({ sedeIds: [] }, "La campaña rige en todas las tiendas")}>
                  Quitar el límite
                </button>
              </>
            )}
          </div>

          {terminada && (
            <Aviso tono="atencion" titulo="Esta campaña ya terminó">
              {repeticion ? `Para ponerle ofertas, repítela en ${repeticion.anio} desde «Editar» en su pase: ahí se le pasan las fechas al año que viene.` : "Para ponerle ofertas, primero cámbiale las fechas desde «Editar» en su pase."}
            </Aviso>
          )}

          <div className="of-hoja">
            {rail()}
            {!terminada && (
              <section className="of-wz" aria-label={o.id ? "Editar oferta" : "Nueva oferta"}>
                <div className="of-top">
                  <b>{o.id ? "Editar oferta" : "Nueva oferta"}</b>
                  {pasos()}
                </div>
                {editada && (
                  <Aviso tono="atencion" chico titulo={`Editando «${editada.nombre}»`} accion={<button type="button" className="btn-cayla btn-enlace text-xs" onClick={reiniciar}>Registrar otra en vez de editar</button>}>
                    Los cambios valen desde ahora; lo que ya se vendió se queda como estaba.
                  </Aviso>
                )}
                <div className="of-cols mt-2">
                  <div className="of-q" key={paso} data-entra={navego ? "" : undefined} id="oferta-pregunta">
                    {paso === 1 ? pregunta1() : paso === 2 ? preguntaCuando() : preguntaPrendas()}
                  </div>
                  {etiquetaViva()}
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
