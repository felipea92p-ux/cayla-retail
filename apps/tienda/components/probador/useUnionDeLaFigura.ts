"use client";

import { useEffect, useState } from "react";
import type { Caja, ColorDelProbador, PrendaDelProbador, Zona } from "@/lib/probador";
import { cajaDeAbajoUnida, medirRecorte, type MedidaDelRecorte } from "@/lib/union-prendas";

// La unión de lo de arriba con lo de abajo en la figura (ADR-0449): mide en el navegador el recorte de cada una y le da a la prenda de abajo la caja
// que hace coincidir su pretina con el borde de abajo de la de arriba (`cajaDeAbajoUnida`, con sus límites). Sin esa medida —todavía no llegó, o la
// imagen no se pudo leer— se queda la caja de siempre, por su largo en cm, y cuando llega la prenda cambia de tamaño con la transición de la figura.

/** El ancho al que se baja un recorte para medirlo: las medidas son fracciones, así que no cambian con el tamaño y se mide rápido. */
const ANCHO_PARA_MEDIR = 240;

/** Lo que se midió de cada recorte (por su URL); `null`: no se pudo. Dura lo que dura la pestaña: son unos pocos números por prenda. */
const medidas = new Map<string, MedidaDelRecorte | null>();
const enCurso = new Map<string, Promise<void>>();

/** Baja el recorte (el almacén de fotos deja leer sus píxeles desde el navegador) y lo mide. Nunca falla: un recorte que no se puede medir queda `null`. */
function medir(url: string): Promise<void> {
  const pendiente = enCurso.get(url);
  if (pendiente) return pendiente;
  const tarea = new Promise<void>((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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
        medidas.set(url, medirRecorte(g.getImageData(0, 0, ancho, alto).data, ancho, alto));
      } catch {
        medidas.set(url, null);
      }
      resolver();
    };
    img.onerror = () => {
      medidas.set(url, null);
      resolver();
    };
    img.src = url;
  }).finally(() => enCurso.delete(url));
  enCurso.set(url, tarea);
  return tarea;
}

type PiezaDeLaFigura = { z: Zona; p: PrendaDelProbador; c: ColorDelProbador; caja: Caja };

/**
 * Las piezas de la figura con la de abajo unida a la de arriba. Con las dos zonas puestas pide medir sus recortes y, cuando están, devuelve las
 * mismas piezas con la caja de abajo cambiada; mientras tanto, o sin una de las dos, devuelve las piezas tal cual llegaron.
 */
export function useUnionDeLaFigura<T extends PiezaDeLaFigura>(piezas: readonly T[]): T[] {
  const [, refrescar] = useState(0);
  const arriba = piezas.find((x) => x.z === "arriba");
  const abajo = piezas.find((x) => x.z === "abajo");
  const urlArriba = arriba?.c.foto.url ?? null;
  const urlAbajo = abajo?.c.foto.url ?? null;

  useEffect(() => {
    if (!urlArriba || !urlAbajo) return;
    const faltan = [urlArriba, urlAbajo].filter((u) => !medidas.has(u));
    if (faltan.length === 0) return;
    let vivo = true;
    void Promise.all(faltan.map(medir)).then(() => {
      if (vivo) refrescar((n) => n + 1);
    });
    return () => {
      vivo = false;
    };
  }, [urlArriba, urlAbajo]);

  if (!arriba || !abajo || !urlArriba || !urlAbajo || !medidas.has(urlArriba) || !medidas.has(urlAbajo)) return [...piezas];
  const unida = cajaDeAbajoUnida(
    { caja: arriba.caja, medida: medidas.get(urlArriba), metida: arriba.p.metida },
    { proporcion: abajo.c.foto.proporcion, medida: medidas.get(urlAbajo) },
  );
  return unida ? piezas.map((x) => (x === abajo ? { ...x, caja: unida } : x)) : [...piezas];
}
