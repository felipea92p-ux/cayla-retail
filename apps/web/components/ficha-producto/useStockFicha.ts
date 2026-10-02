"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esRespuestaIncierta, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { useRecordatorioEtiquetas } from "./RecordatorioEtiquetas";
import { leerVariantesParaAjuste } from "@/components/AjustarInventarioModal";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  MOTIVOS_AJUSTE,
  argumentosDeAjuste,
  armarVariantesAjuste,
  cargaInicialAlPiso,
  faltantesDesdeJson,
  lugarDeAjuste,
  motivosAjusteDisponibles,
  repartirLineasAjuste,
  type FaltanteConteo,
  type LugarAjuste,
  type MotivoAjuste,
  type VarianteAjuste,
} from "@/lib/ajuste-reglas";
import { cantidadDeCelda, conPaso, lineasDelLote, minimoDeCelda, pasoDeCelda, textoDelLote, type Pendientes } from "@/lib/matriz-ficha-reglas";
import type { AjusteStockFicha } from "./piezas";

// El stock de la matriz de Editar producto (maqueta B, Felipe 2026-10-02): cada «−»/«+» ES un ajuste de inventario —el mismo de
// `AjustarInventarioModal` (ADR-0240, `ajustar_inventario`)—, INMEDIATO y aparte de «Revisar y guardar»: un stock que se movió es
// un hecho, no un borrador (principio 4). Lo que cambia frente al modal es el gesto, no el camino:
//
//  · El motivo, el lugar (almacén o piso) y quién lo hace se eligen UNA vez por visita (la línea «Registrar los ajustes de stock de
//    esta visita como…»), no en un formulario por cada toque.
//  · Los toques se juntan en un lote: a los 900 ms del último sale UNA llamada (un movimiento por talla, no uno por clic), sin el
//    loader de pantalla completa (`x-espera: no`, como Conteo): el aviso dice «Guardado ya».
//  · Si la base dice que no (o la respuesta no llega), se vuelve a leer el stock de la base: la celda muestra la verdad y nada se
//    reenvía solo (reenviar a ciegas podría sumar dos veces).
//  · Una talla que faltó en un conteo cerrado (ADR-0291) no se suma a ciegas: «no se adivina». Ese «+» abre el modal de siempre,
//    que pregunta si es la que faltó.
//  · Una variante NUEVA (todavía sin guardar) no existe en la base: su número se junta aparte y entra como stock inicial justo
//    después de «Revisar y guardar» (`cargarNuevas`).
//  · Lo que subió se junta para el recordatorio de etiquetas y se entrega al SALIR de la ficha (Felipe: «luego de guardar los
//    cambios, no antes»), donde la franja queda a la vista hasta cambiar de módulo.

const ESPERA_LOTE_MS = 900;
const TOPE_ESPERA_MS = 20_000;

export type StockFicha = {
  /** `false` = la cuenta no tiene «Ajustar stock»: los números se ven, los botones no. */
  puedeAjustar: boolean;
  cargando: boolean;
  lugar: LugarAjuste;
  separaPisoAlmacen: boolean;
  ubicado: "piso" | "almacen";
  cambiarUbicado: (u: "piso" | "almacen") => void;
  motivo: MotivoAjuste;
  cambiarMotivo: (m: MotivoAjuste) => void;
  motivos: readonly { valor: MotivoAjuste; texto: string }[];
  responsable: ControlResponsable;
  /** Hay toques sin confirmar por la base (en espera o viajando). */
  hayPendientes: boolean;
  /** El número de la celda de una variante guardada (stock de hoy en el lugar + lo tocado). */
  numero: (varianteId: string) => number;
  puedeBajar: (varianteId: string) => boolean;
  /** «+»/«−» sobre una variante guardada. Devuelve el color a abrir en el modal si esa talla faltó en un conteo. */
  paso: (varianteId: string, paso: 1 | -1) => { abrirModal: boolean };
  /** El número de una variante nueva (sin guardar): lo que entra como stock inicial al guardar. */
  numeroNueva: (clave: string) => number;
  pasoNueva: (clave: string, paso: 1 | -1) => void;
  nuevasConStock: number;
  /** Tras «Revisar y guardar»: carga como stock inicial lo puesto en las variantes nuevas (ya con id). */
  cargarNuevas: (idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>) => Promise<number>;
  /** Volver a leer el stock de la base (tras el modal). */
  recargar: () => void;
};

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

export function useStockFicha({ productoId, ajuste }: { productoId: string | null; ajuste: AjusteStockFicha | null | undefined }): StockFicha {
  const { agregar: agregarRecordatorio } = useRecordatorioEtiquetas();
  const sububicaciones = ajuste?.sububicaciones ?? [];
  const pisoId = sububicaciones.find((s) => s.tipo === "piso_venta")?.id;
  const almacenId = sububicaciones.find((s) => s.tipo === "almacen_tienda")?.id;
  const separaPisoAlmacen = !!pisoId && !!almacenId;
  const ubicacionId = ajuste?.ubicacionId ?? null;

  const [variantes, setVariantes] = useState<VarianteAjuste[] | null>(null);
  const [faltantes, setFaltantes] = useState<ReadonlyMap<string, FaltanteConteo>>(new Map());
  const [ubicado, setUbicado] = useState<"piso" | "almacen">("almacen");
  const [motivo, setMotivo] = useState<MotivoAjuste>("conteo_fisico");
  const [pendientes, setPendientes] = useState<Pendientes>({});
  const [nuevas, setNuevas] = useState<Record<string, number>>({});
  const responsable = useResponsable(undefined, { recordarEn: productoId ? `ficha-stock:${productoId}` : undefined });
  const lugar = lugarDeAjuste(ubicado, separaPisoAlmacen);

  // El lote sale con lo de ESE momento: refs para que el temporizador no lea un render viejo.
  const estado = useRef({ variantes, pendientes, motivo, lugar, ubicado });
  const responsableRef = useRef(responsable);
  useEffect(() => {
    estado.current = { variantes, pendientes, motivo, lugar, ubicado };
    responsableRef.current = responsable;
  });
  const temporizador = useRef<number | null>(null);
  const enVuelo = useRef(false);
  // El envío vuelve a programarse a sí mismo si llegaron toques durante el viaje: se llama por esta referencia.
  const enviarRef = useRef<() => void>(() => {});
  const otraVez = useRef(false);
  // Lo que subió en la visita, para el recordatorio de etiquetas (se entrega al salir de la ficha).
  const subieron = useRef(new Map<string, { varianteId: string; color: string | null; talla: string | null }>());

  // Cada lectura de la base sube este número (al abrir, y cuando la base dijo que no o la respuesta no llegó).
  const [lectura, setLectura] = useState(0);
  const leer = useCallback(() => setLectura((n) => n + 1), []);

  useEffect(() => {
    if (!productoId || !ubicacionId) return;
    let vigente = true;
    const supabase = createClient();
    // La MISMA lectura que «Ajustar inventario» (ADR-0270: una sola lectura de `stock` para ajustar), sin el loader.
    leerVariantesParaAjuste(productoId, ubicacionId, { sinLoader: true })
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) return void avisar.error(traducirError(error, "leer el stock de la prenda"));
        const vs = armarVariantesAjuste(data ?? [], pisoId, almacenId);
        setVariantes(vs);
        // Lectura opcional: sin la función (o si falla) no se pregunta nada y el stepper sigue como siempre.
        supabase
          .rpc("fn_faltantes_de_conteo", { p_ubicacion_id: ubicacionId, p_variante_ids: vs.map((v) => v.varianteId) })
          .setHeader("x-espera", "no")
          .then(({ data: f, error: errF }) => {
            if (vigente) setFaltantes(errF ? new Map() : faltantesDesdeJson(f));
          });
      });
    return () => {
      vigente = false;
    };
  }, [productoId, ubicacionId, pisoId, almacenId, lectura]);

  // Al salir de la ficha (guardó y volvió a la lista, o se fue por el menú): lo que subió pasa al recordatorio del módulo.
  useEffect(
    () => () => {
      if (subieron.current.size > 0) agregarRecordatorio([...subieron.current.values()]);
    },
    [agregarRecordatorio]
  );

  const enviar = useCallback(async () => {
    temporizador.current = null;
    if (enVuelo.current) {
      otraVez.current = true;
      return;
    }
    const { variantes: vs, pendientes: lote, motivo: mot, lugar: lug, ubicado: ubi } = estado.current;
    if (!vs || !ubicacionId || Object.keys(lote).length === 0) return;
    const resp = responsableRef.current;
    const lineas = lineasDelLote(vs, lote, lug, mot);
    if (lineas.length === 0) {
      setPendientes({});
      return;
    }
    const { ajustes, cargaInicial } = repartirLineasAjuste(lineas);
    enVuelo.current = true;
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { error } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? (ubi === "piso" ? pisoId! : almacenId!) : null,
            ajustes,
            cargaInicial,
            motivo: mot,
            alPiso: cargaInicialAlPiso(ubi, separaPisoAlmacen, !!ajuste?.puedeBajarAlPiso),
            nota: "",
            token: crypto.randomUUID(),
          })
        )
        .abortSignal(control.signal)
        .setHeader("x-espera", "no"),
      resp.firma()
    );
    window.clearTimeout(tope);
    resp.despues(error);
    enVuelo.current = false;
    // Lo que viajó deja de estar pendiente (lo tocado DURANTE el viaje se queda para el lote siguiente).
    const restar = (p: Pendientes) => {
      const salida: Record<string, number> = { ...p };
      for (const [id, d] of Object.entries(lote)) {
        const queda = (salida[id] ?? 0) - d;
        if (queda === 0) delete salida[id];
        else salida[id] = queda;
      }
      return salida;
    };
    if (error) {
      setPendientes(restar);
      avisar.error(
        esRespuestaIncierta(error)
          ? "Se cortó la conexión y no sabemos si el ajuste llegó: la ficha volvió a leer el stock de la base, y ese es el número de cada talla ahora."
          : traducirError(error, "ajustar el stock")
      );
      leer();
    } else {
      // La base aplicó EXACTAMENTE este lote: la copia local se corrige igual, sin otra lectura ni el loader.
      const porId = new Map(lineas.map((l) => [l.variante.varianteId, l.delta]));
      setVariantes((actuales) => (actuales ?? []).map((v) => (porId.has(v.varianteId) ? conDelta(v, lug, porId.get(v.varianteId)!) : v)));
      setPendientes(restar);
      for (const l of lineas) {
        if (l.delta > 0) subieron.current.set(l.variante.varianteId, { varianteId: l.variante.varianteId, color: l.variante.color, talla: l.variante.talla });
      }
      const textoMotivo = MOTIVOS_AJUSTE.find((m) => m.valor === mot)?.texto ?? "";
      avisar.exito(textoDelLote(lineas.map((l) => ({ talla: l.variante.talla, color: l.variante.color, delta: l.delta, resultado: l.resultado })), textoMotivo), {
        detalle: "Guardado ya — no es parte de «Revisar y guardar».",
      });
    }
    if (otraVez.current) {
      otraVez.current = false;
      temporizador.current = window.setTimeout(() => enviarRef.current(), ESPERA_LOTE_MS);
    }
  }, [ubicacionId, separaPisoAlmacen, pisoId, almacenId, ajuste?.puedeBajarAlPiso, leer]);

  useEffect(() => {
    enviarRef.current = () => void enviar();
  }, [enviar]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    []
  );

  const varianteDe = (id: string) => variantes?.find((v) => v.varianteId === id);

  function numero(varianteId: string): number {
    return cantidadDeCelda(varianteDe(varianteId), lugar, pendientes[varianteId] ?? 0);
  }

  function puedeBajar(varianteId: string): boolean {
    const v = varianteDe(varianteId);
    return pasoDeCelda(cantidadDeCelda(v, lugar, 0), pendientes[varianteId] ?? 0, -1, minimoDeCelda(v, lugar)) !== null;
  }

  function paso(varianteId: string, p: 1 | -1): { abrirModal: boolean } {
    if (!ajuste || !variantes) return { abrirModal: false };
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el ajuste.", { enfocar: "ficha-stock-responsable" });
      return { abrirModal: false };
    }
    const v = varianteDe(varianteId);
    if (p > 0 && (faltantes.get(varianteId)?.pendientes ?? 0) > 0) return { abrirModal: true };
    // Sobre lo pendiente MÁS reciente (no el del render): dos toques en el mismo instante cuentan dos.
    setPendientes((actual) => {
      const siguiente = pasoDeCelda(cantidadDeCelda(v, lugar, 0), actual[varianteId] ?? 0, p, minimoDeCelda(v, lugar));
      return siguiente === null ? actual : conPaso(actual, varianteId, siguiente);
    });
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => void enviar(), ESPERA_LOTE_MS);
    return { abrirModal: false };
  }

  function pasoNueva(clave: string, p: 1 | -1) {
    setNuevas((actual) => {
      const siguiente = Math.max(0, (actual[clave] ?? 0) + p);
      const salida = { ...actual };
      if (siguiente === 0) delete salida[clave];
      else salida[clave] = siguiente;
      return salida;
    });
  }

  async function cargarNuevas(idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>): Promise<number> {
    const cargas = Object.entries(nuevas)
      .filter(([clave, n]) => n > 0 && idsPorClave.has(clave))
      .map(([clave, n]) => ({ clave, variante: { varianteId: idsPorClave.get(clave)! }, delta: n }));
    if (cargas.length === 0 || !ubicacionId) return 0;
    const { error } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? (ubicado === "piso" ? pisoId! : almacenId!) : null,
            ajustes: [],
            cargaInicial: cargas,
            motivo: "",
            alPiso: cargaInicialAlPiso(ubicado, separaPisoAlmacen, !!ajuste?.puedeBajarAlPiso),
            nota: "",
            token: crypto.randomUUID(),
          })
        )
        .setHeader("x-espera", "no"),
      responsable.firma()
    );
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "cargar el stock de las variantes nuevas"), {
        detalle: "La prenda ya quedó guardada; carga sus unidades desde «Ajustar stock».",
      });
      return 0;
    }
    for (const c of cargas) {
      const nom = nombres.get(c.clave);
      subieron.current.set(c.variante.varianteId, { varianteId: c.variante.varianteId, color: nom?.color ?? null, talla: nom?.talla ?? null });
    }
    setNuevas({});
    return cargas.reduce((s, c) => s + c.delta, 0);
  }

  const motivos = motivosAjusteDisponibles(ubicado, separaPisoAlmacen);

  return {
    puedeAjustar: !!ajuste,
    cargando: !!ajuste && variantes === null,
    lugar,
    separaPisoAlmacen,
    ubicado,
    cambiarUbicado: (u) => {
      if (Object.keys(pendientes).length > 0) return;
      setUbicado(u);
      if (motivosAjusteDisponibles(u, separaPisoAlmacen).every((m) => m.valor !== motivo)) setMotivo("conteo_fisico");
    },
    motivo,
    cambiarMotivo: setMotivo,
    motivos,
    responsable,
    hayPendientes: Object.keys(pendientes).length > 0,
    numero,
    puedeBajar,
    paso,
    numeroNueva: (clave) => nuevas[clave] ?? 0,
    pasoNueva,
    nuevasConStock: Object.keys(nuevas).length,
    cargarNuevas,
    recargar: leer,
  };
}
