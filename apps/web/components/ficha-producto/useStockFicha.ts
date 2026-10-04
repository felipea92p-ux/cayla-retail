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
  argumentosDeAjuste,
  armarVariantesAjuste,
  cargaInicialAlPiso,
  faltantesDesdeJson,
  lugarDeAjuste,
  motivoPideNota,
  motivosAjusteDisponibles,
  repartirLineasAjuste,
  reposicionCerrada,
  type FaltanteConteo,
  type LugarAjuste,
  type MotivoAjuste,
  type VarianteAjuste,
} from "@/lib/ajuste-reglas";
import {
  avisoCargaDeLaFicha,
  bloqueoDeSubida,
  cambiosDeStock,
  cantidadDeCelda,
  conPaso,
  fijarCelda,
  juntarSubidas,
  lineasDelLote,
  minimoDeCelda,
  pasoDeCelda,
  problemaDelStockDeLaVisita,
  type CambioDeStock,
  type Pendientes,
  type Subida,
} from "@/lib/matriz-ficha-reglas";
import type { AjusteStockFicha, LecturaStockFicha } from "./piezas";
import { useCargaInicial } from "@/lib/useCargaInicial";
import { avisoCargaInicial, cargaAbierta } from "@/lib/carga-inicial-reglas";
import { sugerirNotaAjuste, type NotaAjuste } from "@/lib/sugerencias-ajuste";

// El stock de la matriz de Editar producto (maqueta B, Felipe 2026-10-02): cada «−»/«+» (o el número escrito en la celda) es un
// ajuste de inventario —el mismo de `AjustarInventarioModal` (ADR-0240, `ajustar_inventario`)— que ESPERA a «Revisar y guardar»
// como cualquier otro cambio de la ficha (ADR-0313, act. 2026-10-02 noche; Felipe: «se debe mostrar el botón de guardar cambios»).
// Antes viajaba solo a los 900 ms de cada toque; ahora la barra lo cuenta, la hoja lo lista («S · Blanco 4 → 6») y sale en UNA
// llamada al confirmar. Lo que se mantiene:
//
//  · El motivo, el lugar (almacén o piso) y quién lo hace se eligen UNA vez por visita (la línea «Registrar los ajustes de stock de
//    esta visita como…»), no en un formulario por cada toque.
//  · Si la respuesta no llega, no se sabe si se aplicó: se vuelve a leer el stock de la base y lo tocado se suelta (reenviarlo a
//    ciegas podría sumar dos veces). Si la base dijo que no, no se aplicó nada: lo tocado queda en la ficha para volver a guardar.
//  · Una talla que faltó en un conteo cerrado (ADR-0291) no se suma a ciegas: «no se adivina». Ese «+» abre el modal de siempre,
//    que pregunta si es la que faltó (ese modal sí guarda al confirmarlo: es su propio formulario).
//  · Una variante NUEVA (todavía sin guardar) no existe en la base: su número se junta aparte y entra como stock inicial justo
//    después de crearla (`cargarNuevas`).
//  · Lo que subió (cuántas unidades por talla) se entrega para imprimir sus etiquetas: el aviso de «guardado» lo ofrece y, al salir
//    de la ficha, queda la franja del módulo hasta imprimirlas o cambiar de módulo.
//  · ADR-0328 (actividad 4): la carga inicial de la sede se cierra en su fecha. La ficha lo avisa antes (`avisoCarga`). «Encontré
//    prendas» se ofrece aquí como en Ajustar, con su nota (dónde estaban) y solo sumando; cerrada la carga, es la ÚNICA forma de
//    sumar una talla que nunca estuvo en la tienda (o una variante nueva): con otro motivo su celda queda quieta y dice por qué
//    (`bloqueoDeSubida`), y lo nuevo viaja como ajuste con ese motivo. Lo que la base rechazaría se dice antes de guardar
//    (`problema`, revisión adversarial: la ficha decía «usa Encontré prendas» sin ofrecerla, y el «+» callaba desde el 2.º clic).

/** Un guardado de stock que no responde en 20 s se da por cortado: se vuelve a leer la base (ver arriba). */
const TOPE_ESPERA_MS = 20_000;

export type StockFicha = {
  /** `false` = la cuenta no tiene «Ajustar stock»: los números se ven, los botones no. */
  puedeAjustar: boolean;
  /** ADR-0328: hasta cuándo esta sede acepta carga inicial, o que ya se cerró. `null` = sin fecha (o no se sabe): nada que avisar. */
  avisoCarga: string | null;
  cargando: boolean;
  /** No se pudo leer el stock de la sede (las celdas siguen en «…»): `recargar` lo vuelve a intentar. */
  fallaLectura: boolean;
  lugar: LugarAjuste;
  separaPisoAlmacen: boolean;
  ubicado: "piso" | "almacen";
  cambiarUbicado: (u: "piso" | "almacen") => void;
  motivo: MotivoAjuste;
  cambiarMotivo: (m: MotivoAjuste) => void;
  motivos: readonly { valor: MotivoAjuste; texto: string }[];
  /** La nota de la visita: solo se pide (y se envía) con «Encontré prendas» (`pideNota`). */
  nota: string;
  cambiarNota: (t: string) => void;
  pideNota: boolean;
  /** La etiqueta y el ejemplo de la caja de nota, según el motivo (ADR-0290). */
  ayudaNota: NotaAjuste;
  /** Lo que la base rechazaría al guardar el stock, dicho antes, con el campo que lo arregla. `null` = nada. */
  problema: { texto: string; campo: "motivo" | "nota" } | null;
  /** Por qué el «+» de una variante guardada no suma (`null` = suma). */
  bloqueoDeSubida: (varianteId: string) => string | null;
  /** Lo mismo para las variantes nuevas (todas nacen sin historia en la tienda). */
  bloqueoNuevas: string | null;
  responsable: ControlResponsable;
  /** Hay stock tocado en variantes guardadas que todavía no se guarda. */
  hayPendientes: boolean;
  /** Lo tocado en variantes guardadas, de cuánto a cuánto (la hoja y la cuenta de la barra). */
  cambios: CambioDeStock[];
  /** El número de la celda de una variante guardada (stock de hoy en el lugar + lo tocado). */
  numero: (varianteId: string) => number;
  /** El stock de hoy en el lugar, sin lo tocado (para marcar la celda que cambió). */
  numeroGuardado: (varianteId: string) => number;
  puedeBajar: (varianteId: string) => boolean;
  /** «+»/«−» sobre una variante guardada. `abrirModal`: esa talla faltó en un conteo y se pregunta en el modal. */
  paso: (varianteId: string, paso: 1 | -1) => { abrirModal: boolean };
  /** El número escrito en la celda. `abrirModal` como en `paso`; `rechazado` si queda bajo lo apartado. */
  fijar: (varianteId: string, objetivo: number) => { abrirModal: boolean; rechazado: boolean };
  /** El número de una variante nueva (sin guardar): lo que entra como stock inicial al guardar. */
  numeroNueva: (clave: string) => number;
  pasoNueva: (clave: string, paso: 1 | -1) => void;
  fijarNueva: (clave: string, objetivo: number) => void;
  nuevasConStock: number;
  /** «Revisar y guardar»: manda lo tocado en las variantes guardadas en UNA llamada. `ok: false` ya avisó del error. */
  guardar: () => Promise<{ ok: boolean }>;
  /** Tras crear las variantes nuevas: carga como stock inicial lo puesto en ellas (ya con id). Devuelve las unidades. */
  cargarNuevas: (idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>) => Promise<number>;
  /** Lo que subió en los guardados de esta visita, por talla (para «Imprimir etiquetas»). Se lee una vez y se vacía. */
  tomarSubidas: () => Subida[];
  /** Suelta lo tocado en estas variantes (ids de las guardadas o claves de las nuevas): «Quitar color» no deja stock pendiente
   *  en una variante que deja de venderse, ni stock inicial en una nueva que ya no se crea. */
  soltar: (claves: readonly string[]) => void;
  /** «Descartar»: suelta todo lo tocado. Devuelve cómo deshacerlo. */
  descartar: () => () => void;
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

export function useStockFicha({
  productoId,
  ajuste,
  lecturaStock,
}: {
  productoId: string | null;
  ajuste: AjusteStockFicha | null | undefined;
  /** De dónde se lee el stock si la cuenta no tiene «Ajustar stock» (se ve, no se toca). */
  lecturaStock?: LecturaStockFicha | null;
}): StockFicha {
  const { agregar: agregarRecordatorio } = useRecordatorioEtiquetas();
  const fuente = ajuste ?? lecturaStock ?? null;
  const sububicaciones = fuente?.sububicaciones ?? [];
  const pisoId = sububicaciones.find((s) => s.tipo === "piso_venta")?.id;
  const almacenId = sububicaciones.find((s) => s.tipo === "almacen_tienda")?.id;
  const separaPisoAlmacen = !!pisoId && !!almacenId;
  const ubicacionId = fuente?.ubicacionId ?? null;
  const puedeTocar = !!ajuste;

  const [variantes, setVariantes] = useState<VarianteAjuste[] | null>(null);
  // En qué lectura falló la base: la matriz lo dice y ofrece «Reintentar» (antes quedaba en «…» para siempre, sin salida). Al
  // reintentar sube el número de lectura y el aviso se va solo.
  const [fallaEn, setFallaEn] = useState<number | null>(null);
  const [faltantes, setFaltantes] = useState<ReadonlyMap<string, FaltanteConteo>>(new Map());
  const [ubicado, setUbicado] = useState<"piso" | "almacen">("almacen");
  const [motivo, setMotivo] = useState<MotivoAjuste>("conteo_fisico");
  const [nota, setNota] = useState("");
  const [pendientes, setPendientes] = useState<Pendientes>({});
  const [nuevas, setNuevas] = useState<Record<string, number>>({});
  const responsable = useResponsable(undefined, { recordarEn: productoId ? `ficha-stock:${productoId}` : undefined });
  const lugar = lugarDeAjuste(ubicado, separaPisoAlmacen);
  // La carga inicial de esta sede (lectura opcional, solo si se puede tocar el stock). Cerrada, lo que nunca estuvo en la tienda
  // suma solo con «Encontré prendas»; con otro motivo su celda queda quieta y dice por qué.
  const carga = useCargaInicial(puedeTocar ? ubicacionId : null);
  const abiertaCarga = cargaAbierta(carga);
  const enPisoCerrado = reposicionCerrada(ubicado, separaPisoAlmacen);
  const avisoCarga = avisoCargaDeLaFicha(avisoCargaInicial(carga), abiertaCarga, motivo, enPisoCerrado);
  const pideNota = motivoPideNota(motivo);
  // La nota viaja solo con el motivo que la pide: escrita con «Encontré prendas» y cambiada a otro motivo, no se manda escondida.
  const notaParaEnviar = pideNota ? nota : "";
  const bloqueoDe = (v: VarianteAjuste | undefined) =>
    v ? bloqueoDeSubida({ sinHistoria: v.sinHistoria, cargaAbierta: abiertaCarga, motivo, enPisoCerrado }) : null;
  const bloqueoNuevas = bloqueoDeSubida({ sinHistoria: true, cargaAbierta: abiertaCarga, motivo, enPisoCerrado });

  // Lo que subió en la visita, por talla: para el recordatorio del módulo al salir (`subieron`) y para el aviso del guardado
  // que se está haciendo (`delGuardado`, se lee una vez).
  const subieron = useRef<Subida[]>([]);
  const delGuardado = useRef<Subida[]>([]);
  function anotarSubidas(s: Subida[]) {
    subieron.current = juntarSubidas(subieron.current, s);
    delGuardado.current = juntarSubidas(delGuardado.current, s);
  }

  // Cada lectura de la base sube este número (al abrir, y cuando la respuesta de un guardado no llegó).
  const [lectura, setLectura] = useState(0);
  const leer = useCallback(() => setLectura((n) => n + 1), []);

  useEffect(() => {
    if (!productoId || !ubicacionId) return;
    let vigente = true;
    const supabase = createClient();
    // La MISMA lectura que «Ajustar inventario» (ADR-0270: una sola lectura de `stock` para ajustar), sin el loader.
    const estaLectura = lectura;
    leerVariantesParaAjuste(productoId, ubicacionId, { sinLoader: true })
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setFallaEn(estaLectura);
          return void avisar.error(traducirError(error, "leer el stock de la prenda"));
        }
        const vs = armarVariantesAjuste(data ?? [], pisoId, almacenId);
        setVariantes(vs);
        // Lectura opcional: sin la función (o si falla) no se pregunta nada y el stepper sigue como siempre. Sin «Ajustar stock»
        // no hay stepper: no hace falta.
        if (!puedeTocar) return;
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
  }, [productoId, ubicacionId, pisoId, almacenId, lectura, puedeTocar]);

  // Al salir de la ficha (guardó y volvió a la lista, o se fue por el menú): lo que subió pasa al recordatorio del módulo.
  useEffect(
    () => () => {
      if (subieron.current.length > 0) agregarRecordatorio(subieron.current);
    },
    [agregarRecordatorio]
  );

  async function guardar(): Promise<{ ok: boolean }> {
    if (!ajuste || !variantes || !ubicacionId || Object.keys(pendientes).length === 0) return { ok: true };
    const lote = pendientes;
    const lineas = lineasDelLote(variantes, lote, lugar, motivo);
    if (lineas.length === 0) {
      setPendientes({});
      return { ok: true };
    }
    const { ajustes, cargaInicial } = repartirLineasAjuste(lineas, abiertaCarga);
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { error } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? (ubicado === "piso" ? pisoId! : almacenId!) : null,
            ajustes,
            cargaInicial,
            motivo,
            alPiso: cargaInicialAlPiso(ubicado, separaPisoAlmacen, !!ajuste?.puedeBajarAlPiso),
            nota: notaParaEnviar,
            token: crypto.randomUUID(),
          })
        )
        .abortSignal(control.signal)
        .setHeader("x-espera", "no"),
      responsable.firma()
    );
    window.clearTimeout(tope);
    responsable.despues(error);
    if (error) {
      if (esRespuestaIncierta(error)) {
        // No se sabe si llegó: lo tocado se suelta y se lee la base (reenviarlo podría sumar dos veces).
        setPendientes({});
        leer();
        avisar.error("Se cortó la conexión y no sabemos si el stock se guardó: la ficha volvió a leerlo de la base, y ese es el número de cada talla ahora.");
      } else {
        avisar.error(traducirError(error, "guardar el stock"), { detalle: "Lo que tocaste sigue en la ficha: corrígelo y vuelve a guardar." });
      }
      return { ok: false };
    }
    // La base aplicó EXACTAMENTE este lote: la copia local se corrige igual, sin otra lectura ni el loader.
    const porId = new Map(lineas.map((l) => [l.variante.varianteId, l.delta]));
    setVariantes((actuales) => (actuales ?? []).map((v) => (porId.has(v.varianteId) ? conDelta(v, lugar, porId.get(v.varianteId)!) : v)));
    setPendientes({});
    anotarSubidas(
      lineas.filter((l) => l.delta > 0).map((l) => ({ varianteId: l.variante.varianteId, color: l.variante.color, talla: l.variante.talla, unidades: l.delta }))
    );
    return { ok: true };
  }

  const varianteDe = (id: string) => variantes?.find((v) => v.varianteId === id);

  function numero(varianteId: string): number {
    return cantidadDeCelda(varianteDe(varianteId), lugar, pendientes[varianteId] ?? 0);
  }

  function puedeBajar(varianteId: string): boolean {
    const v = varianteDe(varianteId);
    return pasoDeCelda(cantidadDeCelda(v, lugar, 0), pendientes[varianteId] ?? 0, -1, minimoDeCelda(v, lugar, motivo)) !== null;
  }

  function paso(varianteId: string, p: 1 | -1): { abrirModal: boolean } {
    if (!ajuste || !variantes) return { abrirModal: false };
    const v = varianteDe(varianteId);
    // Una variante que no está en la lectura (recién creada, antes de releer) no se toca: su paso no viajaría en ningún lote.
    if (!v) return { abrirModal: false };
    if (p > 0 && (faltantes.get(varianteId)?.pendientes ?? 0) > 0) return { abrirModal: true };
    // La celda ya se ve quieta (su «+» apagado dice por qué); esto es solo la red por si el toque llega igual.
    if (p > 0 && bloqueoDe(v)) return { abrirModal: false };
    // Sobre lo pendiente MÁS reciente (no el del render): dos toques en el mismo instante cuentan dos.
    setPendientes((actual) => {
      const siguiente = pasoDeCelda(cantidadDeCelda(v, lugar, 0), actual[varianteId] ?? 0, p, minimoDeCelda(v, lugar, motivo));
      return siguiente === null ? actual : conPaso(actual, varianteId, siguiente);
    });
    return { abrirModal: false };
  }

  function fijar(varianteId: string, objetivo: number): { abrirModal: boolean; rechazado: boolean } {
    if (!ajuste || !variantes) return { abrirModal: false, rechazado: true };
    const v = varianteDe(varianteId);
    if (!v) return { abrirModal: false, rechazado: true };
    const hoy = cantidadDeCelda(v, lugar, 0);
    // Contra lo de HOY, no contra el número de la celda: al escribir «20» la tecla «2» ya dejó la celda en 2, y «20» > 2 abría el
    // modal con un −13 que nadie pidió. Si se abre el modal, lo escrito en la celda se suelta (el modal es el que pregunta).
    if (objetivo > hoy && (faltantes.get(varianteId)?.pendientes ?? 0) > 0) {
      setPendientes((actual) => conPaso(actual, varianteId, 0));
      return { abrirModal: true, rechazado: false };
    }
    if (objetivo > hoy && bloqueoDe(v)) return { abrirModal: false, rechazado: false };
    const siguiente = fijarCelda(hoy, objetivo, minimoDeCelda(v, lugar, motivo));
    if (siguiente === null) return { abrirModal: false, rechazado: true };
    setPendientes((actual) => conPaso(actual, varianteId, siguiente));
    return { abrirModal: false, rechazado: false };
  }

  // Sin «Ajustar stock», una variante nueva nace en 0 y no se le pone nada: `cargarNuevas` no podría cargarlo y se perdería en
  // silencio (la hoja diría «entran con 3 unidades» y el aviso, «nacen sin unidades»).
  function pasoNueva(clave: string, p: 1 | -1) {
    if (!ajuste) return;
    // Con la carga cerrada, una variante nueva suma solo con «Encontré prendas» (su celda ya se ve quieta con otro motivo).
    if (p > 0 && bloqueoNuevas) return;
    setNuevas((actual) => conPaso(actual, clave, Math.max(0, (actual[clave] ?? 0) + p)));
  }

  function fijarNueva(clave: string, objetivo: number) {
    if (!ajuste || !Number.isInteger(objetivo) || objetivo < 0) return;
    if (objetivo > 0 && bloqueoNuevas) return;
    setNuevas((actual) => conPaso(actual, clave, objetivo));
  }

  async function cargarNuevas(idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>): Promise<number> {
    const cargas = Object.entries(nuevas)
      .filter(([clave, n]) => n > 0 && idsPorClave.has(clave))
      .map(([clave, n]) => ({ clave, variante: { varianteId: idsPorClave.get(clave)! }, delta: n }));
    if (cargas.length === 0 || !ubicacionId || !ajuste) return 0;
    // El mismo tope y el mismo trato de la respuesta incierta que `guardar` (revisión 2026-10-03): sin tope, una base que no
    // responde dejaba el guardado colgado; y si la red caía DESPUÉS de que la base cargó, el aviso pedía cargarlas de nuevo
    // desde «Ajustar stock» y entraban dos veces.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    // Carga abierta: stock inicial, sin motivo ni nota. Cerrada (ADR-0328): no hay stock inicial; entran como ajuste con el motivo
    // de la visita, que solo puede ser «Encontré prendas» (`bloqueoNuevas` y `problema` lo aseguran antes), y su nota.
    const comoAjuste = !abiertaCarga;
    const { error } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? (ubicado === "piso" ? pisoId! : almacenId!) : null,
            ajustes: comoAjuste ? cargas : [],
            cargaInicial: comoAjuste ? [] : cargas,
            motivo: comoAjuste ? motivo : "",
            alPiso: cargaInicialAlPiso(ubicado, separaPisoAlmacen, !!ajuste?.puedeBajarAlPiso),
            nota: comoAjuste ? notaParaEnviar : "",
            token: crypto.randomUUID(),
          })
        )
        .abortSignal(control.signal)
        .setHeader("x-espera", "no"),
      responsable.firma()
    );
    window.clearTimeout(tope);
    responsable.despues(error);
    if (error) {
      // Lo puesto en las nuevas se suelta en los dos casos: ya existen con su id, y la ficha relee el stock al terminar.
      setNuevas({});
      if (esRespuestaIncierta(error)) {
        avisar.error("La prenda quedó guardada, pero se cortó la conexión y no sabemos si entró el stock de las variantes nuevas.", {
          detalle: "Mira el número de cada talla en la tabla (se vuelve a leer de la base) antes de cargarlas otra vez.",
        });
      } else {
        avisar.error(traducirError(error, "cargar el stock de las variantes nuevas"), {
          detalle: "La prenda ya quedó guardada; carga sus unidades con «+» en la tabla y vuelve a guardar.",
        });
      }
      return 0;
    }
    anotarSubidas(
      cargas.map((c) => {
        const nom = nombres.get(c.clave);
        return { varianteId: c.variante.varianteId, color: nom?.color ?? null, talla: nom?.talla ?? null, unidades: c.delta };
      })
    );
    setNuevas({});
    return cargas.reduce((s, c) => s + c.delta, 0);
  }

  function descartar(): () => void {
    const antes = { pendientes, nuevas };
    setPendientes({});
    setNuevas({});
    return () => {
      setPendientes(antes.pendientes);
      setNuevas(antes.nuevas);
    };
  }

  const motivos = motivosAjusteDisponibles(ubicado, separaPisoAlmacen);
  const problema = problemaDelStockDeLaVisita({
    lineas: variantes ? lineasDelLote(variantes, pendientes, lugar, motivo) : [],
    nuevasConStock: Object.values(nuevas).filter((n) => n > 0).length,
    motivo,
    nota,
    cargaAbierta: abiertaCarga,
    enPisoCerrado,
  });

  return {
    puedeAjustar: puedeTocar,
    avisoCarga: puedeTocar ? avisoCarga : null,
    nota,
    cambiarNota: setNota,
    pideNota,
    ayudaNota: sugerirNotaAjuste(motivo),
    problema,
    bloqueoDeSubida: (id) => bloqueoDe(varianteDe(id)),
    bloqueoNuevas,
    cargando: !!fuente && variantes === null,
    fallaLectura: fallaEn === lectura,
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
    cambios: variantes ? cambiosDeStock(variantes, pendientes, lugar) : [],
    numero,
    numeroGuardado: (id) => cantidadDeCelda(varianteDe(id), lugar, 0),
    puedeBajar,
    paso,
    fijar,
    soltar: (claves) => {
      setPendientes((actual) => claves.reduce((p, k) => conPaso(p, k, 0), actual));
      setNuevas((actual) => claves.reduce((p, k) => conPaso(p, k, 0), actual));
    },
    numeroNueva: (clave) => nuevas[clave] ?? 0,
    pasoNueva,
    fijarNueva,
    nuevasConStock: Object.keys(nuevas).length,
    guardar,
    cargarNuevas,
    tomarSubidas: () => {
      const s = delGuardado.current;
      delGuardado.current = [];
      return s;
    },
    descartar,
    recargar: leer,
  };
}
