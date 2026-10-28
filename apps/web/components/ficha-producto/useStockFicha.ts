"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esRespuestaIncierta, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { useRecordatorioEtiquetas } from "./RecordatorioEtiquetas";
import { leerVariantesParaAjuste } from "@/components/AjustarInventarioModal";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { argumentosDeAjuste, armarVariantesAjuste, cargaInicialAlPiso, type VarianteAjuste } from "@/lib/ajuste-reglas";
import { conPaso, juntarSubidas, type Subida } from "@/lib/matriz-ficha-reglas";
import type { AjusteStockFicha, LecturaStockFicha } from "./piezas";
import { useCargaInicial } from "@/lib/useCargaInicial";
import { cargaAbierta, esRechazoPorCargaCerrada } from "@/lib/carga-inicial-reglas";
import { avisoStockDescartado, VISITA_DE_STOCK_INICIAL } from "@/lib/ficha-cambio-de-sede";

// El stock de Editar producto, SOLO LECTURA (ADR-0494, actividad 3; Felipe 2026-10-27): ajustar stock se hace solo en Existencias. Cada
// número de la matriz lleva su candado y el candado abre «Ajustar stock» (`lib/existencias-ajustar-desde-editar.ts`). Lo único que se
// escribe desde aquí es el stock INICIAL de una variante que nace: una variante nueva (todavía sin guardar) lleva sus unidades de
// partida, y entran justo después de crearla (`cargarNuevas`); desde ese momento su número también tiene candado.
//
//  · Antes este hook también guardaba los − / + de las variantes ya guardadas (un `ajustar_inventario` por visita, con motivo, lugar y
//    nota). Ese camino se retiró entero: el único `ajustar_inventario` que sale de Editar es el del nacimiento de una variante.
//  · Carga inicial de la sede (ADR-0328): abierta, las unidades de una variante nueva entran como stock inicial; cerrada, entran como
//    «Encontré prendas» (la única forma de sumar una talla que nunca estuvo en la tienda), siempre en el almacén y con una nota fija.
//  · Si la respuesta del guardado no llega, no se sabe si se aplicó: la ficha lo dice y vuelve a leer el stock (reenviarlo a ciegas
//    podría sumar dos veces).
//  · Lo que entró (cuántas unidades por talla) se entrega para imprimir sus etiquetas: el aviso de «guardado» lo ofrece y, al salir de
//    la ficha, queda la franja del módulo hasta imprimirlas o cambiar de módulo.
//  · El stock puesto en variantes nuevas es de SU sede (Felipe, 2026-10-11; `lib/ficha-cambio-de-sede.ts`): al cambiar de sede con el
//    selector de la cabecera se suelta, con un aviso.

/** Un guardado que no responde en 20 s se da por cortado: se vuelve a leer la base (ver arriba). */
const TOPE_ESPERA_MS = 20_000;
/** La nota de la carga de una variante nueva cuando la carga inicial de la sede ya se cerró (el motivo «Encontré prendas» la pide). */
const NOTA_DE_NACIMIENTO = "Stock inicial de una variante nueva, cargado al crearla desde Editar producto";

export type StockFicha = {
  /** `false` = la cuenta no tiene «Ajustar stock»: los números se ven, sin candado ni puerta, y una variante nueva nace en 0. */
  puedeAjustar: boolean;
  cargando: boolean;
  /** No se pudo leer el stock de la sede (las celdas siguen en «…»): `recargar` lo vuelve a intentar. */
  fallaLectura: boolean;
  /** Quién firma el guardado de TODA la ficha (precios, costos, etiquetas, variantes nuevas y su stock inicial). */
  responsable: ControlResponsable;
  /** El stock de hoy de una variante guardada en la sede (piso + almacén; sin piso y almacén separados, todo lo que hay). */
  numero: (varianteId: string) => number;
  /** El número de una variante nueva (sin guardar): lo que entra como stock inicial al guardar. */
  numeroNueva: (clave: string) => number;
  pasoNueva: (clave: string, paso: 1 | -1) => void;
  fijarNueva: (clave: string, objetivo: number) => void;
  nuevasConStock: number;
  /** Tras crear las variantes nuevas: carga como stock inicial lo puesto en ellas (ya con id). Devuelve las unidades. */
  cargarNuevas: (idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>) => Promise<number>;
  /** Lo que entró en los guardados de esta visita, por talla (para «Imprimir etiquetas»). Se lee una vez y se vacía. */
  tomarSubidas: () => Subida[];
  /** Suelta lo puesto en estas variantes nuevas (sus claves): «Quitar color» no deja stock inicial en una variante que ya no se crea. */
  soltar: (claves: readonly string[]) => void;
  /** «Descartar»: suelta lo puesto. Devuelve cómo deshacerlo. */
  descartar: () => () => void;
  /** Volver a leer el stock de la base (tras guardar). */
  recargar: () => void;
};

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
  // Las unidades de partida entran siempre en el almacén (el piso se llena bajando del almacén).
  const ubicado = VISITA_DE_STOCK_INICIAL.ubicado;

  const [variantes, setVariantes] = useState<VarianteAjuste[] | null>(null);
  // En qué lectura falló la base: la matriz lo dice y ofrece «Reintentar». Al reintentar sube el número de lectura y el aviso se va solo.
  const [fallaEn, setFallaEn] = useState<number | null>(null);
  const [nuevas, setNuevas] = useState<Record<string, number>>({});

  // Cambio de sede: lo puesto en variantes nuevas se suelta en ESTE MISMO render (patrón «previo + comparación» de React) y un aviso
  // lo dice después, en un efecto. El resto de la ficha (nombre, precio, fotos) no es de ninguna sede y se queda.
  const [sedeDelStock, setSedeDelStock] = useState({ ubicacionId, etiqueta: ajuste?.sede ?? "" });
  const [descartado, setDescartado] = useState<{ texto: string; detalle: string } | null>(null);
  if (ubicacionId !== sedeDelStock.ubicacionId) {
    setDescartado(
      avisoStockDescartado({
        etiqueta: sedeDelStock.etiqueta || "la sede anterior",
        cambios: [],
        nuevasConStock: Object.values(nuevas).filter((n) => n > 0).length,
      })
    );
    setSedeDelStock({ ubicacionId, etiqueta: ajuste?.sede ?? "" });
    setNuevas({});
    setVariantes(null);
    setFallaEn(null);
  }
  useEffect(() => {
    if (descartado) avisar.aviso(descartado.texto, { detalle: descartado.detalle, duracion: 7000 });
  }, [descartado]);
  const responsable = useResponsable(undefined, { recordarEn: productoId ? `ficha-stock:${productoId}` : undefined });
  // La carga inicial de esta sede (lectura opcional, solo si se puede tocar el stock).
  const { carga, releer: releerCarga } = useCargaInicial(puedeTocar ? ubicacionId : null);
  const abiertaCarga = cargaAbierta(carga);

  // Lo que entró en la visita, por talla: para el recordatorio del módulo al salir (`subieron`) y para el aviso del guardado
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
    const estaLectura = lectura;
    // La MISMA lectura que «Ajustar inventario» (ADR-0270: una sola lectura de `stock`), sin el loader.
    leerVariantesParaAjuste(productoId, ubicacionId, { sinLoader: true }).then(({ data, error }) => {
      if (!vigente) return;
      if (error) {
        setFallaEn(estaLectura);
        return void avisar.error(traducirError(error, "leer el stock de la prenda", { lectura: true }));
      }
      setVariantes(armarVariantesAjuste(data ?? [], pisoId, almacenId));
    });
    return () => {
      vigente = false;
    };
  }, [productoId, ubicacionId, pisoId, almacenId, lectura]);

  // Al salir de la ficha (guardó y volvió a la lista, o se fue por el menú): lo que entró pasa al recordatorio del módulo.
  useEffect(
    () => () => {
      if (subieron.current.length > 0) agregarRecordatorio(subieron.current);
    },
    [agregarRecordatorio]
  );

  const varianteDe = (id: string) => variantes?.find((v) => v.varianteId === id);

  // Sin «Ajustar stock», una variante nueva nace en 0 y no se le pone nada: `cargarNuevas` no podría cargarlo y se perdería en silencio.
  function pasoNueva(clave: string, p: 1 | -1) {
    if (!ajuste) return;
    setNuevas((actual) => conPaso(actual, clave, Math.max(0, (actual[clave] ?? 0) + p)));
  }

  function fijarNueva(clave: string, objetivo: number) {
    if (!ajuste || !Number.isInteger(objetivo) || objetivo < 0) return;
    setNuevas((actual) => conPaso(actual, clave, objetivo));
  }

  async function cargarNuevas(idsPorClave: ReadonlyMap<string, string>, nombres: ReadonlyMap<string, { color: string | null; talla: string | null }>): Promise<number> {
    const cargas = Object.entries(nuevas)
      .filter(([clave, n]) => n > 0 && idsPorClave.has(clave))
      .map(([clave, n]) => ({ clave, variante: { varianteId: idsPorClave.get(clave)! }, delta: n }));
    if (cargas.length === 0 || !ubicacionId || !ajuste) return 0;
    // El mismo tope y el mismo trato de la respuesta incierta de siempre (revisión 2026-10-03): sin tope, una base que no responde dejaba
    // el guardado colgado; y si la red caía DESPUÉS de que la base cargó, cargarlas de nuevo las entraba dos veces.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    // Carga abierta: stock inicial, sin motivo ni nota. Cerrada (ADR-0328): no hay stock inicial; entran como ajuste «Encontré prendas»
    // con su nota fija, que es lo único que la base acepta para una talla que nunca estuvo en la tienda.
    const comoAjuste = !abiertaCarga;
    const { error } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? almacenId! : null,
            ajustes: comoAjuste ? cargas : [],
            cargaInicial: comoAjuste ? [] : cargas,
            motivo: comoAjuste ? "reposicion" : "",
            alPiso: cargaInicialAlPiso(ubicado, separaPisoAlmacen, !!ajuste?.puedeBajarAlPiso),
            nota: comoAjuste ? NOTA_DE_NACIMIENTO : "",
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
          detalle: "Mira el número de cada talla en la tabla (se vuelve a leer de la base) antes de cargarlas otra vez desde Existencias.",
        });
      } else {
        avisar.error(traducirError(error, "cargar el stock de las variantes nuevas"), {
          detalle: "La prenda ya quedó guardada; carga sus unidades con «Ajustar stock» en Existencias.",
        });
        if (esRechazoPorCargaCerrada(error)) releerCarga();
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
    const antes = nuevas;
    setNuevas({});
    return () => setNuevas(antes);
  }

  return {
    puedeAjustar: puedeTocar,
    cargando: !!fuente && variantes === null,
    fallaLectura: fallaEn === lectura,
    responsable,
    numero: (id) => {
      const v = varianteDe(id);
      return v ? (separaPisoAlmacen ? v.stockPiso + v.stockAlmacen : v.stockSinDividir) : 0;
    },
    soltar: (claves) => setNuevas((actual) => claves.reduce((p, k) => conPaso(p, k, 0), actual)),
    numeroNueva: (clave) => nuevas[clave] ?? 0,
    pasoNueva,
    fijarNueva,
    nuevasConStock: Object.keys(nuevas).length,
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
