"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esRespuestaIncierta, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { leerVariantesParaAjuste } from "@/components/AjustarInventarioModal";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { useCargaInicial } from "@/lib/useCargaInicial";
import { avisoCargaInicial, cargaAbierta, esRechazoPorCargaCerrada } from "@/lib/carga-inicial-reglas";
import {
  argumentosDeAjuste,
  armarVariantesAjuste,
  cargaInicialAlPiso,
  faltantesDesdeJson,
  leerResultadoAjuste,
  lugarDeAjuste,
  repartirLineasAjuste,
  reposicionCerrada,
  stockEn,
  TEXTO_AJUSTE_INCIERTO,
  type FaltanteConteo,
  type LineaAjuste,
  type LugarAjuste,
  type VarianteAjuste,
} from "@/lib/ajuste-reglas";
import { conPaso, lineasDelLote, type Pendientes } from "@/lib/matriz-ficha-reglas";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import {
  armarModelo,
  maximoDeLaCelda,
  minimoDeLaCelda,
  MOTIVO_INICIAL,
  motivoCerrado,
  motivoPlanilla,
  notaLista,
  paraLaBase,
  porQueNoBaja,
  porQueNoSube,
  problemaDelLote,
  resumenDelLote,
  type ClaveMotivoPlanilla,
  type ExtraDeVariante,
  type ModeloDeAjuste,
} from "@/lib/existencias-ajuste-modelo";

// El estado de «Ajustar stock» del modal de la prenda (ADR-0494): la planilla de todo el modelo. Lo usa `PanelTalla` siempre (un hook no
// se llama a medias) y trabaja solo mientras la planilla está abierta (`activo`). Lo que se toca son DIFERENCIAS por talla (como la ficha,
// `useStockFicha`), y viaja en UNA llamada a `ajustar_inventario` con la marca del intento (ADR-0240): si la respuesta no llega, lo tocado
// queda fijo y «Guardar» reenvía LO MISMO con la misma marca, así que si ya se guardó la base no lo repite (como el ajuste de una talla
// que reemplaza, `FlujoTalla`). La lectura es la MISMA de Ajustar y de la ficha (`leerVariantesParaAjuste`, ADR-0270).

/** Un guardado que no responde en 20 s se da por cortado (como `FlujoTalla` y la ficha). */
const TOPE_ESPERA_MS = 20_000;

/** Una línea del lote con el nombre de su celda («Negro M»), para los avisos y el talón. */
export type LineaDelLote = LineaAjuste & { nombre: string };

/** Lo que la base guardó: cuántas tallas, qué entró (para las etiquetas) y si era un reintento de algo ya guardado. */
export type AjusteGuardado = { lineas: LineaDelLote[]; yaEstaba: boolean; lugar: LugarAjuste; motivo: ClaveMotivoPlanilla };

export type ControlAjuste = {
  /** El modelo de la planilla; `null` mientras se lee. */
  modelo: ModeloDeAjuste | null;
  /** No se pudo leer el stock de la prenda: «Reintentar». */
  fallaLectura: boolean;
  reintentar: () => void;
  separa: boolean;
  ubicado: "piso" | "almacen";
  lugar: LugarAjuste;
  /** Cambia de lugar; devuelve por qué no, si hay cambios sin guardar (lo contado es de UN lugar). */
  cambiarLugar: (u: "piso" | "almacen") => string | null;
  motivo: ClaveMotivoPlanilla;
  cambiarMotivo: (m: ClaveMotivoPlanilla) => string | null;
  nota: string;
  cambiarNota: (t: string) => void;
  responsable: ControlResponsable;
  /** El número de la celda: el stock de hoy en el lugar más lo tocado. */
  numero: (v: VarianteAjuste) => number;
  hoy: (v: VarianteAjuste) => number;
  pendiente: (varianteId: string) => number;
  porQueNoSube: (v: VarianteAjuste) => string | null;
  porQueNoBaja: (v: VarianteAjuste) => string | null;
  /** «+»/«−». `abrirConteo`: esa talla faltó en un conteo cerrado y se enlaza en la ventana completa (ADR-0291: no se adivina). */
  paso: (v: VarianteAjuste, p: 1 | -1) => { razon: string | null; abrirConteo: boolean };
  /** El número escrito en la celda. */
  fijar: (v: VarianteAjuste, objetivo: number) => { razon: string | null; abrirConteo: boolean };
  lineas: LineaDelLote[];
  resumen: { tallas: number; entran: number; salen: number };
  problema: ReturnType<typeof problemaDelLote>;
  /** Lo que la carga inicial de la sede tiene que decir (hasta cuándo, o que ya se cerró). */
  avisoCarga: string | null;
  enviando: boolean;
  /** Se cortó la conexión al guardar: lo tocado queda fijo hasta reenviar. */
  incierto: boolean;
  error: string | null;
  guardar: () => Promise<AjusteGuardado | null>;
  descartar: () => void;
  /** La guía de foco (ADR-0284): una talla tocada, el motivo, la nota si la pide y quién. Sale de lo mismo que frena «Guardar». */
  guia: GuiaCampos;
};

/** El nombre de una celda: el color y la talla («Negro M»), o solo el color si el modelo es de talla única. */
export function nombreDeCelda(v: Pick<VarianteAjuste, "color" | "talla">, modelo: ModeloDeAjuste | null): string {
  const unaTalla = (modelo?.tallas.length ?? 0) <= 1;
  return [v.color ?? "Sin color", unaTalla ? null : (v.talla ?? "Única")].filter(Boolean).join(" ");
}

/** Suma `delta` al stock del lugar en la copia local (lo que la base acaba de aplicar). */
function conDelta(v: VarianteAjuste, lugar: LugarAjuste, delta: number): VarianteAjuste {
  return {
    ...v,
    stockPiso: lugar === "piso" ? v.stockPiso + delta : v.stockPiso,
    stockAlmacen: lugar === "almacen" ? v.stockAlmacen + delta : v.stockAlmacen,
    stockSinDividir: v.stockSinDividir + delta,
    sinHistoria: false,
  };
}

export function useAjusteDelModelo({
  activo,
  productoId,
  ubicacionId,
  separa,
  sububicacionPisoId,
  sububicacionAlmacenId,
  puedeBajarAlPiso,
  ordenColores,
  ubicadoInicial,
}: {
  activo: boolean;
  productoId: string;
  ubicacionId: string;
  separa: boolean;
  sububicacionPisoId: string | null;
  sububicacionAlmacenId: string | null;
  /** Lo nuevo «en el piso» es además una bajada (ADR-0306): sin Existencias, entra al almacén. */
  puedeBajarAlPiso: boolean;
  /** El orden de los colores en Existencias: la planilla los dibuja igual. */
  ordenColores: readonly (string | null)[];
  /** Donde la talla elegida tiene más unidades (`lugarInicial`). */
  ubicadoInicial: "piso" | "almacen";
}): ControlAjuste {
  const responsable = useResponsable();
  const [variantes, setVariantes] = useState<VarianteAjuste[] | null>(null);
  const [extras, setExtras] = useState<ReadonlyMap<string, ExtraDeVariante>>(new Map());
  const [faltantes, setFaltantes] = useState<ReadonlyMap<string, FaltanteConteo>>(new Map());
  const [fallaLectura, setFallaLectura] = useState(false);
  const [lectura, setLectura] = useState(0);
  const [ubicado, setUbicado] = useState(ubicadoInicial);
  const [motivo, setMotivo] = useState<ClaveMotivoPlanilla>(MOTIVO_INICIAL);
  const [nota, setNota] = useState("");
  const [pendientes, setPendientes] = useState<Pendientes>({});
  const [enviando, setEnviando] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);
  // La marca de cada intento: la misma mientras no cambie lo que se manda, nueva si cambia (como `FlujoTalla`).
  const intento = useRef<{ huella: string; token: string } | null>(null);

  // Cada vez que la planilla se abre, la visita empieza de cero en el lugar de la talla elegida (patrón «previo + comparación»: en el
  // MISMO render, para que ni un cuadro muestre lo tocado en la visita anterior).
  const [abierta, setAbierta] = useState(activo);
  if (activo !== abierta) {
    setAbierta(activo);
    if (activo) {
      setUbicado(ubicadoInicial);
      setMotivo(MOTIVO_INICIAL);
      setNota("");
      setPendientes({});
      setIncierto(false);
      setError(null);
      setVariantes(null);
      setLectura((n) => n + 1);
    }
  }

  const { carga, releer: releerCarga } = useCargaInicial(activo ? ubicacionId : null);
  const abiertaCarga = cargaAbierta(carga);
  const lugar = lugarDeAjuste(ubicado, separa);
  const enPisoCerrado = reposicionCerrada(ubicado, separa);
  const base = paraLaBase(motivo, nota);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    // Sin el loader de pantalla completa (ADR-0149, `x-espera: no`): el modal se transforma en la planilla y la planilla dice que lee.
    leerVariantesParaAjuste(productoId, ubicacionId, { sinLoader: true }).then(({ data, error: e }) => {
      if (!vigente) return;
      if (e) return setFallaLectura(true);
      setFallaLectura(false);
      const filas = data ?? [];
      const vs = armarVariantesAjuste(filas, sububicacionPisoId ?? undefined, sububicacionAlmacenId ?? undefined);
      setExtras(new Map(filas.map((f) => [f.id, { hex: f.color?.hex ?? null, activa: f.activo !== false }])));
      setVariantes(vs);
      // Lectura opcional: sin la función (o si falla) no se pregunta nada y la planilla suma como siempre.
      createClient()
        .rpc("fn_faltantes_de_conteo", { p_ubicacion_id: ubicacionId, p_variante_ids: vs.map((v) => v.varianteId) })
        .setHeader("x-espera", "no")
        .then(({ data: f, error: errF }) => {
          if (vigente) setFaltantes(errF ? new Map() : faltantesDesdeJson(f));
        });
    });
    return () => {
      vigente = false;
    };
  }, [activo, lectura, productoId, ubicacionId, sububicacionPisoId, sububicacionAlmacenId]);

  const modelo = variantes ? armarModelo(variantes, extras, ordenColores) : null;
  const nombre = (v: VarianteAjuste) => nombreDeCelda(v, modelo);
  const pendiente = (id: string) => pendientes[id] ?? 0;
  const hoy = (v: VarianteAjuste) => stockEn(v, lugar);
  const numero = (v: VarianteAjuste) => hoy(v) + pendiente(v.varianteId);
  const sube = (v: VarianteAjuste) =>
    porQueNoSube({ variante: v, motivo, pendiente: pendiente(v.varianteId), cargaAbierta: abiertaCarga, enPisoCerrado, nombre: nombre(v) });
  const baja = (v: VarianteAjuste) => porQueNoBaja({ variante: v, lugar, motivo, pendiente: pendiente(v.varianteId), nombre: nombre(v) });
  const fija = "Se cortó la conexión al guardar: lo tocado queda como está hasta que vuelvas a tocar «Guardar».";

  const lineas: LineaDelLote[] = variantes ? lineasDelLote(variantes, pendientes, lugar, base.motivo).map((l) => ({ ...l, nombre: nombre(l.variante) })) : [];
  const resumen = resumenDelLote(lineas);
  const problema = problemaDelLote({ lineas, motivo, nota, cargaAbierta: abiertaCarga, enPisoCerrado, responsableListo: responsable.listo });
  const pideNota = Boolean(motivoPlanilla(motivo).nota);
  const guia = useGuiaCampos([
    { id: "cambios", nombre: "una talla", requerido: true, hecho: lineas.length > 0, pendiente: "Toca − o + en una talla, o escribe lo que contaste." },
    { id: "motivo", nombre: "el motivo", requerido: true, hecho: problema?.campo !== "motivo", pendiente: "Elige qué pasó: el motivo no calza con lo que tocaste." },
    ...(pideNota ? [{ id: "nota", nombre: motivoPlanilla(motivo).nota!.etiqueta.replace(/[¿?]/g, "").toLocaleLowerCase("es"), requerido: true, hecho: notaLista(motivo, nota), pendiente: "Escríbelo en una línea." }] : []),
    { id: "responsable", nombre: "quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace el ajuste." },
  ]);

  function paso(v: VarianteAjuste, p: 1 | -1) {
    if (incierto || enviando) return { razon: fija, abrirConteo: false };
    if (p > 0 && (faltantes.get(v.varianteId)?.pendientes ?? 0) > 0) return { razon: null, abrirConteo: true };
    const razon = p > 0 ? sube(v) : baja(v);
    if (razon !== null) return { razon: razon || null, abrirConteo: false };
    // Sobre lo pendiente MÁS reciente (no el del render): dos toques en el mismo instante cuentan dos.
    setPendientes((actual) => {
      const siguiente = (actual[v.varianteId] ?? 0) + p;
      const n = hoy(v) + siguiente;
      if (n < minimoDeLaCelda(v, lugar, motivo)) return actual;
      const tope = maximoDeLaCelda(v, lugar, motivo);
      if (tope !== null && n > tope) return actual;
      return conPaso(actual, v.varianteId, siguiente);
    });
    setError(null);
    return { razon: null, abrirConteo: false };
  }

  function fijar(v: VarianteAjuste, objetivo: number) {
    if (incierto || enviando) return { razon: fija, abrirConteo: false };
    if (!Number.isInteger(objetivo) || objetivo < 0) return { razon: null, abrirConteo: false };
    const actual = hoy(v);
    // Contra lo de HOY (como la ficha): al escribir «20», la tecla «2» no es un error.
    if (objetivo > actual && (faltantes.get(v.varianteId)?.pendientes ?? 0) > 0) return { razon: null, abrirConteo: true };
    if (objetivo > actual) {
      const r = porQueNoSube({ variante: v, motivo, pendiente: 0, cargaAbierta: abiertaCarga, enPisoCerrado, nombre: nombre(v) });
      if (r) return { razon: r, abrirConteo: false };
    }
    if (objetivo < actual) {
      const r = porQueNoBaja({ variante: v, lugar, motivo, pendiente: 0, nombre: nombre(v) });
      if (r) return { razon: r, abrirConteo: false };
    }
    const minimo = minimoDeLaCelda(v, lugar, motivo);
    if (objetivo < minimo) return { razon: `${nombre(v)}: no puede quedar en menos de ${minimo} (hay apartadas para clientes).`, abrirConteo: false };
    setPendientes((p) => conPaso(p, v.varianteId, objetivo - actual));
    setError(null);
    return { razon: null, abrirConteo: false };
  }

  function cambiarLugar(u: "piso" | "almacen") {
    if (u === ubicado) return null;
    if (lineas.length > 0 || incierto) return "Lo contado es de un lugar: guarda o descarta antes de pasar al otro.";
    setUbicado(u);
    // «Encontré» se anota en el almacén: al pasar al piso, la visita vuelve a «Conté y hay otro número».
    if (motivoCerrado(motivo, u, separa)) setMotivo(MOTIVO_INICIAL);
    return null;
  }

  function cambiarMotivo(m: ClaveMotivoPlanilla) {
    if (incierto) return fija;
    const cerrado = motivoCerrado(m, ubicado, separa);
    if (cerrado) return cerrado;
    setMotivo(m);
    setError(null);
    return null;
  }

  async function guardar(): Promise<AjusteGuardado | null> {
    if (enVuelo.current || !variantes || lineas.length === 0 || problema) return null;
    const { ajustes, cargaInicial } = repartirLineasAjuste(lineas, abiertaCarga);
    const sububicacionId = separa ? (ubicado === "piso" ? sububicacionPisoId : sububicacionAlmacenId) : null;
    const sinMarca = {
      ubicacionId,
      sububicacionId,
      ajustes,
      cargaInicial,
      motivo: base.motivo,
      alPiso: cargaInicialAlPiso(ubicado, separa, puedeBajarAlPiso),
      nota: base.nota,
    };
    const huella = JSON.stringify([sububicacionId, base, ajustes.map((l) => [l.variante.varianteId, l.delta]), cargaInicial.map((l) => [l.variante.varianteId, l.delta])]);
    if (!intento.current || intento.current.huella !== huella) intento.current = { huella, token: crypto.randomUUID() };
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const r = await firmar(
        createClient()
          .rpc("ajustar_inventario", argumentosDeAjuste({ ...sinMarca, token: intento.current.token }))
          .abortSignal(control.signal)
          .setHeader("x-espera", "no"),
        responsable.firma()
      );
      data = r.data;
      errorRpc = r.error;
    } catch (ex) {
      errorRpc = { message: ex instanceof Error ? ex.message : String(ex) };
    }
    window.clearTimeout(tope);
    enVuelo.current = false;
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      if (esRespuestaIncierta(errorRpc) || esFalloDeRed(errorRpc)) {
        setIncierto(true);
        setError(TEXTO_AJUSTE_INCIERTO);
        return null;
      }
      setIncierto(false);
      setError(traducirError(errorRpc, "ajustar el inventario"));
      // La carga se cerró con la planilla abierta (pasada la medianoche del último día): se vuelve a leer (ADR-0328).
      if (esRechazoPorCargaCerrada(errorRpc)) releerCarga();
      return null;
    }
    // La base aplicó EXACTAMENTE este lote: la copia local se corrige igual, sin otra lectura.
    const porId = new Map(lineas.map((l) => [l.variante.varianteId, l.delta]));
    setVariantes((actuales) => (actuales ?? []).map((v) => (porId.has(v.varianteId) ? conDelta(v, lugar, porId.get(v.varianteId)!) : v)));
    setPendientes({});
    setIncierto(false);
    intento.current = null;
    return { lineas, yaEstaba: leerResultadoAjuste(data)?.ya_registrado === true, lugar, motivo };
  }

  return {
    modelo,
    fallaLectura,
    reintentar: () => setLectura((n) => n + 1),
    separa,
    ubicado,
    lugar,
    cambiarLugar,
    motivo,
    cambiarMotivo,
    nota,
    cambiarNota: (t: string) => {
      if (!incierto) setNota(t);
    },
    responsable,
    numero,
    hoy,
    pendiente,
    porQueNoSube: sube,
    porQueNoBaja: baja,
    paso,
    fijar,
    lineas,
    resumen,
    problema,
    avisoCarga: avisoCargaInicial(carga),
    enviando,
    incierto,
    error,
    guardar,
    descartar: () => {
      if (incierto || enviando) return;
      setPendientes({});
      setError(null);
    },
    guia,
  };
}
