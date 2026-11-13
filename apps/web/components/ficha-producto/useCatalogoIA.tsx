"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoProducto, subirFotoProducto, subirParDeCatalogo } from "@/lib/producto-fotos";
import { pedirFotoDeCatalogo } from "@/lib/foto-catalogo-cliente";
import { esFotoIA, moldeDeLaPrenda, originalDeLaFotoIA } from "@/lib/foto-catalogo-reglas";
import type { FotoLocal } from "@/lib/fotos-por-color-reglas";
import type { FotoSubida } from "./useSubirFotos";
import { HojaCatalogoIA, type PedidoCatalogo } from "./HojaCatalogoIA";

// «Catálogo con IA» en Editar producto (2026-11-13; maqueta docs/maquetas/fotos-con-ia-2026-11, forma A; ficha docs/milimetro/catalogo-con-ia.md).
//
// Una opción APAGADA de fábrica y recordada en cada aparato. Encendida, elegir la foto de un color abre la hoja de ángulos; «Preparar foto» la
// cierra al instante y ese color se prepara en su cuadro mientras la persona sigue: nada espera a nada (Felipe: «mientras no termina no puedo
// subir la que sigue»). Al terminar, la foto de catálogo queda SOLA como la del color, sin paso de revisión (Felipe: «hay que omitir Revisar»);
// «Usar mi foto» vuelve a la real, que siempre queda guardada a su lado (`subirParDeCatalogo`).
//
// LA MISMA PRENDA EN TODOS LOS COLORES: el primer color que tiene foto de IA es el MOLDE (`moldeDeLaPrenda`) y los demás se piden con él, para
// que solo cambie el color y el estampado (medido: 99 % de la silueta). Si el molde todavía se está preparando, los colores que vienen detrás lo
// esperan: así ninguno sale con otra forma por haber llegado antes.
//
// Si la IA falla, se sube la foto real y se avisa: un color nunca queda sin foto por la IA (principio 9).

const CLAVE_APARATO = "cayla-catalogo-ia";

export type CatalogoIA = {
  /** El servidor tiene la llave: sin ella la opción no se dibuja y todo es como siempre. */
  disponible: boolean;
  encendido: boolean;
  cambiarEncendido: (v: boolean) => void;
  /** Encendido, elegir fotos de un color abre la hoja de ángulos (la primera es el frente; la segunda, la espalda; la tercera, el detalle). */
  abrir: (archivos: File[], color: string | null) => void;
  /** La vista local (blob:) de la foto que se está preparando para ese color, o `null`. */
  preparandoDe: (color: string | null) => string | null;
  /** «Usar mi foto» en una de IA, o «Usar la de IA» en una real que se preparó en esta sesión. `null` si no aplica. */
  alternativa: (foto: FotoLocal) => { texto: string; usar: () => void } | null;
  /** La hoja de ángulos, para dibujarla una vez en la ficha. */
  hoja: ReactNode;
};

function leerEncendido(): boolean {
  try {
    return localStorage.getItem(CLAVE_APARATO) === "1";
  } catch {
    return false;
  }
}

/** La opción «Catálogo con IA», apagada de fábrica y recordada en el aparato. La comparten Editar y Nuevo producto. */
export function useInterruptorIA(): [boolean, (v: boolean) => void] {
  const [encendido, setEncendido] = useState(false);
  useEffect(() => {
    // Se lee al montar: en el servidor no hay `localStorage`.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee una vez del aparato, después de hidratar
    setEncendido(leerEncendido());
  }, []);
  function cambiar(v: boolean) {
    setEncendido(v);
    try {
      localStorage.setItem(CLAVE_APARATO, v ? "1" : "0");
    } catch {
      // Sin almacenamiento (ventana privada): la opción vale hasta recargar.
    }
  }
  return [encendido, cambiar];
}

/** La foto de frente que llega a la hoja: la misma validación que una subida normal. `null` si no sirve (y ya se avisó). */
export function frenteValido(archivos: File[]): File | null {
  const frente = archivos[0];
  if (!frente) return null;
  const objecion = objecionFotoProducto(frente);
  if (objecion) {
    avisar.error("Esa foto no se puede usar", { detalle: `${frente.name}: ${objecion}` });
    return null;
  }
  return frente;
}

export function useCatalogoIA({
  disponible,
  fotos,
  colores,
  nombreColor,
  onLista,
  onFotos,
}: {
  disponible: boolean;
  /** Las fotos como se ven, para el molde y para «Usar mi foto». */
  fotos: readonly FotoLocal[];
  /** Los colores de la prenda en el orden de sus variantes: el primero con foto de IA es el molde. */
  colores: readonly string[];
  nombreColor: (codigo: string | null) => string;
  /** La foto lista entra en su color y pasa a ser la que se ve en él (lo mismo que «Cambiar foto» del panel). */
  onLista: (nuevas: FotoSubida[]) => void;
  /** La lista entera, cuando «Usar mi foto» cambia una por otra. */
  onFotos: (siguientes: FotoLocal[]) => void;
}): CatalogoIA {
  const [encendido, cambiarEncendido] = useInterruptorIA();
  const [hoja, setHoja] = useState<{ color: string | null; frente: File; espalda: File | null; detalle: File | null } | null>(null);
  const [preparando, setPreparando] = useState<ReadonlyMap<string, string>>(new Map());
  // La de IA de cada foto real preparada en esta sesión: para «Usar la de IA» después de un «Usar mi foto».
  const [iaDeLaReal, setIaDeLaReal] = useState<ReadonlyMap<string, string>>(new Map());
  // El resultado llega ~25 s después: sin la lista al día, un color agregado entre medio se perdería.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  // El molde que se está preparando (el primer color de la sesión), para que los demás lo esperen.
  const moldeEnCurso = useRef<{ color: string | null; promesa: Promise<Blob | null> } | null>(null);
  // Lo mismo, para dibujar: de qué color es el molde que se está preparando (`undefined` = ninguno). La hoja lo nombra.
  const [colorMoldeEnCurso, setColorMoldeEnCurso] = useState<string | null | undefined>(undefined);

  const claveDe = (color: string | null) => color ?? "";
  const urlMolde = moldeDeLaPrenda(colores, fotos);
  const colorDelMolde = urlMolde ? (fotos.find((f) => f.url === urlMolde)?.colorCodigo ?? null) : (colorMoldeEnCurso ?? null);
  const hayMolde = Boolean(urlMolde) || colorMoldeEnCurso !== undefined;

  async function preparar(p: PedidoCatalogo) {
    const vista = URL.createObjectURL(p.frente);
    setPreparando((m) => new Map(m).set(claveDe(p.color), vista));
    try {
      let molde: Blob | null = null;
      // Si este color resulta ser el molde, `soltar` le avisa a los que lo esperan (con su foto, o `null` si la IA falló).
      const esMolde: { soltar: ((b: Blob | null) => void) | null } = { soltar: null };
      const url = moldeDeLaPrenda(colores, fotosRef.current);
      if (url) molde = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      else if (moldeEnCurso.current) molde = await moldeEnCurso.current.promesa;
      else {
        // Este color es el molde de los que vengan detrás mientras se prepara.
        const promesa = new Promise<Blob | null>((resolver) => (esMolde.soltar = resolver));
        moldeEnCurso.current = { color: p.color, promesa };
        setColorMoldeEnCurso(p.color);
      }

      const r = await pedirFotoDeCatalogo({ frente: p.frente, espalda: p.espalda, detalle: p.detalle, molde });
      const supabase = createClient();
      let subida: { url: string; conIA: boolean } | { error: string };
      if ("png" in r) {
        esMolde.soltar?.(r.png);
        subida = await subirParDeCatalogo(supabase, p.frente, r.png);
      } else {
        esMolde.soltar?.(null);
        avisar.aviso("La IA no respondió: quedó tu foto.", { detalle: r.error });
        const real = await subirFotoProducto(supabase, p.frente);
        subida = "error" in real ? real : { url: real.url, conIA: false };
      }
      if (esMolde.soltar) {
        moldeEnCurso.current = null;
        setColorMoldeEnCurso(undefined);
      }
      if ("error" in subida) avisar.error(`La foto de ${nombreColor(p.color)} no subió`, { detalle: subida.error });
      else onLista([{ url: subida.url, colorCodigo: p.color }]);
    } finally {
      setPreparando((m) => {
        const n = new Map(m);
        n.delete(claveDe(p.color));
        return n;
      });
      URL.revokeObjectURL(vista);
    }
  }

  function cambiarUrl(foto: FotoLocal, url: string) {
    // La base no cambia la URL de una fila que ya existe (`catalogo_actualizar_producto` solo toca orden, principal y color): la foto se
    // reemplaza por una nueva en el mismo lugar, y al guardar la de antes se quita.
    onFotos(fotosRef.current.map((f) => (f.clientKey === foto.clientKey ? { ...f, clientKey: crypto.randomUUID(), id: null, url } : f)));
  }

  function alternativa(foto: FotoLocal) {
    const real = originalDeLaFotoIA(foto.url);
    if (real) {
      return {
        texto: "Usar mi foto",
        usar: () => {
          setIaDeLaReal((m) => new Map(m).set(real, foto.url));
          cambiarUrl(foto, real);
        },
      };
    }
    const ia = iaDeLaReal.get(foto.url);
    if (ia && !esFotoIA(foto.url)) return { texto: "Usar la de IA", usar: () => cambiarUrl(foto, ia) };
    return null;
  }

  return {
    disponible,
    encendido: disponible && encendido,
    cambiarEncendido,
    abrir: (archivos, color) => {
      const frente = frenteValido(archivos);
      if (frente) setHoja({ color, frente, espalda: archivos[1] ?? null, detalle: archivos[2] ?? null });
    },
    preparandoDe: (color) => preparando.get(claveDe(color)) ?? null,
    alternativa,
    hoja: hoja ? (
      <HojaCatalogoIA
        nombreColor={nombreColor(hoja.color)}
        inicial={hoja}
        molde={hayMolde && colorDelMolde !== hoja.color ? { url: urlMolde, nombreColor: nombreColor(colorDelMolde) } : null}
        onPreparar={(p) => {
          setHoja(null);
          void preparar(p);
        }}
        onClose={() => setHoja(null)}
      />
    ) : null,
  };
}
