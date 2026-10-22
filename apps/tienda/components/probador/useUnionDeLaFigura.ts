"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Caja, FotoDelColor, Zona } from "@/lib/probador";
import {
  ANCHO_PARA_MEDIR,
  cajaDeAbajoUnida,
  cajaDeArribaAjustada,
  direccionParaMedir,
  hiloDeLaEspera,
  type HiloDeLaEspera,
  medidasATexto,
  medidasDesdeTexto,
  medirRecorte,
  type MedidaDelRecorte,
} from "@/lib/union-prendas";

// La unión de lo de arriba con lo de abajo en la figura (ADR-0449): mide en el navegador el recorte de cada una y le da a la prenda de abajo la caja
// que hace coincidir su pretina con el borde de abajo de la de arriba (`cajaDeAbajoUnida`, con sus límites). Sin esa medida —todavía no llegó, o la
// imagen no se pudo leer— se queda la caja de siempre, por su largo en cm.
//
// Para que se sienta inmediata (Felipe, 2026-10-18):
// - se mide una copia chica del recorte (la que ya sirve el optimizador, 256 px), no el PNG entero;
// - lo medido se recuerda entre visitas (`localStorage`), así que una prenda ya vista se une al instante;
// - mientras se ve la figura, se miden en segundo plano las prendas vecinas (las que se pasan con la flecha o deslizando);
// - si aun así hay que esperar, la figura lo dice (el hilo, el velo y «Ajustando tu look…»; `ajustando` e `hilo`, ADR-0449 act. 2026-10-22) en vez de mover la prenda sin avisar.

/** Cuánto se espera antes de decir «Ajustando…»: si la medida llega antes, no hay nada que avisar (y nada que parpadee). */
const ESPERA_ANTES_DE_AVISAR_MS = 180;
/** Una imagen que no responde en tanto se da por no medible: se queda la caja de siempre y el aviso se va. */
const LIMITE_POR_RECORTE_MS = 4000;
// v3: las medidas traen el perfil del bajo y su ancho por filas; lo recordado en v1 y v2 se vuelve a medir.
const CLAVE_GUARDADA = "cayla-union-v3";

/** Lo que se midió de cada recorte (por su dirección); `null`: no se pudo. Dura lo que dura la pestaña, más lo recordado de otras visitas. */
const medidas = new Map<string, MedidaDelRecorte | null>();
const enCurso = new Map<string, Promise<void>>();
let recordadasLeidas = false;
let guardando: number | null = null;

// Lo medido es del navegador entero, no de un componente: cada medida nueva avisa a quien dibuja una figura (`useSyncExternalStore`).
let version = 0;
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};
const notificar = () => {
  version++;
  oyentes.forEach((f) => f());
};

/** Trae lo recordado de visitas anteriores; devuelve si trajo algo nuevo. Solo en el navegador y después de montar (la primera pintura coincide con el servidor). */
function leerRecordadas(): boolean {
  if (recordadasLeidas || typeof window === "undefined") return false;
  recordadasLeidas = true;
  try {
    let nuevas = false;
    for (const [url, m] of medidasDesdeTexto(window.localStorage.getItem(CLAVE_GUARDADA))) {
      if (!medidas.has(url)) {
        medidas.set(url, m);
        nuevas = true;
      }
    }
    return nuevas;
  } catch {
    return false;
  }
}

function guardarRecordadas() {
  if (typeof window === "undefined" || guardando !== null) return;
  guardando = window.setTimeout(() => {
    guardando = null;
    try {
      window.localStorage.setItem(CLAVE_GUARDADA, medidasATexto(medidas));
    } catch {
      // Sin almacenamiento (ventana privada, lleno): se vuelve a medir la próxima vez.
    }
  }, 600);
}

type Foto = { url: string; optimizar: boolean };

/** Baja el recorte y lo mide. Nunca falla: un recorte que no se puede medir (o que tarda demasiado) queda `null`. */
function medir(foto: Foto): Promise<void> {
  const clave = foto.url;
  const pendiente = enCurso.get(clave);
  if (pendiente) return pendiente;
  const tarea = new Promise<void>((resolver) => {
    const img = new Image();
    let listo = false;
    const terminar = (m: MedidaDelRecorte | null) => {
      if (listo) return;
      listo = true;
      window.clearTimeout(reloj);
      medidas.set(clave, m);
      if (m) guardarRecordadas();
      notificar();
      resolver();
    };
    const reloj = window.setTimeout(() => terminar(null), LIMITE_POR_RECORTE_MS);
    // Misma procedencia: la copia chica sale de la tienda y no pide permiso; la foto suelta del almacén sí (tiene CORS abierto).
    if (!foto.optimizar) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const ancho = Math.min(ANCHO_PARA_MEDIR, img.naturalWidth);
        const alto = Math.max(1, Math.round((img.naturalHeight * ancho) / Math.max(1, img.naturalWidth)));
        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        const g = lienzo.getContext("2d", { willReadFrequently: true });
        if (!g) throw new Error("sin canvas");
        g.drawImage(img, 0, 0, ancho, alto);
        terminar(medirRecorte(g.getImageData(0, 0, ancho, alto).data, ancho, alto));
      } catch {
        terminar(null);
      }
    };
    img.onerror = () => terminar(null);
    img.src = direccionParaMedir(foto);
  }).finally(() => enCurso.delete(clave));
  enCurso.set(clave, tarea);
  return tarea;
}

/** Lo que la unión lee de cada pieza: su zona, si va metida, su recorte y su caja (la figura interactiva manda más; la quieta, solo esto). */
export type PiezaDeLaFigura = { z: Zona; p: { metida: boolean }; c: { foto: FotoDelColor }; caja: Caja };

/**
 * Las piezas de la figura con la de abajo unida a la de arriba. Con las dos zonas puestas pide medir sus recortes y, cuando están, devuelve las
 * mismas piezas con la caja de abajo cambiada; mientras tanto, o sin una de las dos, devuelve las piezas tal cual llegaron. `ajustando` es verdad
 * cuando la medida se está haciendo y ya tardó lo bastante para que se note. `cercanas` son fotos que probablemente se vean pronto (las vecinas de
 * lo puesto): se miden sin apuro, para que al pasarlas ya estén.
 */
export function useUnionDeLaFigura<T extends PiezaDeLaFigura>(
  piezas: readonly T[],
  cercanas: readonly Foto[] = [],
): { piezas: T[]; ajustando: boolean; hilo: HiloDeLaEspera | null } {
  useSyncExternalStore(suscribir, () => version, () => 0);
  // El par (arriba + abajo) que ya esperó lo bastante para avisarlo; otro par, o nada pendiente, no arrastra el aviso.
  const [demoraDe, setDemoraDe] = useState<string | null>(null);
  const arriba = piezas.find((x) => x.z === "arriba");
  const abajo = piezas.find((x) => x.z === "abajo");
  const fotoArriba = arriba?.c.foto ?? null;
  const fotoAbajo = abajo?.c.foto ?? null;
  const urlArriba = fotoArriba?.url ?? null;
  const urlAbajo = fotoAbajo?.url ?? null;
  const optimizarArriba = fotoArriba?.optimizar ?? false;
  const optimizarAbajo = fotoAbajo?.optimizar ?? false;
  const clavesCercanas = cercanas.map((f) => `${f.optimizar ? 1 : 0}${f.url}`).join("\n");

  // Lo recordado de otras visitas, apenas monta (no en la primera pintura: tiene que coincidir con la del servidor).
  useEffect(() => {
    if (leerRecordadas()) notificar();
  }, []);

  // La de arriba se mide siempre (también sola: su tamaño se ajusta a su forma); la de abajo, cuando hay una de arriba a la que unirla.
  useEffect(() => {
    if (!urlArriba) return;
    const faltan = [
      { url: urlArriba, optimizar: optimizarArriba },
      ...(urlAbajo ? [{ url: urlAbajo, optimizar: optimizarAbajo }] : []),
    ].filter((f) => !medidas.has(f.url));
    if (faltan.length === 0) return;
    void Promise.all(faltan.map(medir));
  }, [urlArriba, urlAbajo, optimizarArriba, optimizarAbajo]);

  // Las vecinas, cuando el navegador está libre y de a una: no le quitan el turno a lo que se está viendo.
  useEffect(() => {
    if (!clavesCercanas) return;
    const fotos = clavesCercanas.split("\n").map((k) => ({ optimizar: k[0] === "1", url: k.slice(1) }));
    let vivo = true;
    const pedir = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 300));
    const quitar = window.cancelIdleCallback ?? window.clearTimeout;
    const pasos: number[] = [];
    const siguiente = (i: number) => {
      if (!vivo || i >= fotos.length) return;
      const f = fotos[i];
      if (medidas.has(f.url)) return siguiente(i + 1);
      pasos.push(pedir(() => void medir(f).then(() => siguiente(i + 1))) as number);
    };
    siguiente(0);
    return () => {
      vivo = false;
      for (const id of pasos) quitar(id);
    };
  }, [clavesCercanas]);

  const completa = !!urlArriba && !!urlAbajo && medidas.has(urlArriba) && medidas.has(urlAbajo);
  const pendiente = !!urlArriba && !!urlAbajo && !completa;

  const par = `${urlArriba}\n${urlAbajo}`;
  useEffect(() => {
    if (!pendiente) return;
    const t = window.setTimeout(() => setDemoraDe(par), ESPERA_ANTES_DE_AVISAR_MS);
    return () => window.clearTimeout(t);
  }, [pendiente, par]);

  const ajustando = pendiente && demoraDe === par;
  // 1. La de arriba, ajustada a su propia forma (solo crece, y solo si su bajo es implausiblemente angosto).
  const cajaArriba = arriba && urlArriba ? cajaDeArribaAjustada({ caja: arriba.caja, medida: medidas.get(urlArriba), metida: arriba.p.metida }) : null;
  const arribaFinal = arriba && cajaArriba ? { ...arriba, caja: cajaArriba } : arriba;
  // 2. La de abajo, unida a la de arriba ya ajustada.
  const unida =
    arribaFinal && abajo && urlArriba && urlAbajo && completa
      ? cajaDeAbajoUnida(
          { caja: arribaFinal.caja, medida: medidas.get(urlArriba), metida: arribaFinal.p.metida },
          { proporcion: abajo.c.foto.proporcion, medida: medidas.get(urlAbajo) },
        )
      : null;
  // El hilo de la espera corre por el borde de abajo de la prenda de arriba (con su fila medida si ya se midió); solo hay hilo si hay algo de abajo que unir.
  const hilo = arribaFinal && abajo ? hiloDeLaEspera({ caja: arribaFinal.caja, medida: urlArriba ? medidas.get(urlArriba) : null }) : null;
  return {
    piezas: piezas.map((x) => (x === arriba && arribaFinal ? arribaFinal : x === abajo && unida ? { ...x, caja: unida } : x)),
    ajustando,
    hilo,
  };
}
