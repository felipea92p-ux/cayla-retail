"use client";

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { avisar } from "@/components/ui/Avisos";
import { pedirFotoDeCatalogo } from "@/lib/foto-catalogo-cliente";
import { HojaCatalogoIA, type PedidoCatalogo } from "@/components/ficha-producto/HojaCatalogoIA";
import { frenteValido, useInterruptorIA } from "@/components/ficha-producto/useCatalogoIA";
import type { FotoPendiente } from "./FotosAlta";

// «Catálogo con IA» en Nuevo producto (2026-11-13): lo mismo que en Editar producto (`useCatalogoIA`), pero sobre las fotos que el alta guarda en el
// NAVEGADOR hasta crear el producto (`FotosAlta`). La foto real entra a su fila apenas se elige; la de IA se le agrega cuando llega (`ia`) y pasa a
// ser la que se ve. Nada sube al almacén antes de crear: al crear, el formulario espera a que terminen las que se están preparando (`esperar`)
// y sube el par. Mismo molde (el primer color con foto de IA) y mismo «Usar mi foto». Si la IA falla, queda la real y se avisa.

export type CatalogoIAAlta = {
  disponible: boolean;
  encendido: boolean;
  cambiarEncendido: (v: boolean) => void;
  abrir: (archivos: File[], color: string | null) => void;
  /** ¿Se está preparando la foto de este color? */
  preparando: (color: string | null) => boolean;
  /** «Usar mi foto» / «Usar la de IA» de una foto pendiente con versión de IA. */
  alternar: (clave: string) => void;
  /**
   * Al crear el producto: espera a que terminen las que se están preparando y devuelve `lista` con cada foto de IA ya puesta. No se lee el
   * estado de la pantalla: la última en llegar todavía no se ha dibujado cuando la espera termina, y se subiría la real sola.
   */
  esperar: (lista: readonly FotoPendiente[]) => Promise<FotoPendiente[]>;
  hoja: ReactNode;
};

export function useCatalogoIAAlta({
  disponible,
  fotos,
  setFotos,
  colores,
  nombreColor,
}: {
  disponible: boolean;
  fotos: readonly FotoPendiente[];
  setFotos: Dispatch<SetStateAction<FotoPendiente[]>>;
  /** Los colores elegidos, en orden: el primero con foto de IA es el molde. */
  colores: readonly string[];
  nombreColor: (codigo: string | null) => string;
}): CatalogoIAAlta {
  const [encendido, cambiarEncendido] = useInterruptorIA();
  const [hoja, setHoja] = useState<PedidoCatalogo | null>(null);
  const [preparando, setPreparando] = useState<ReadonlySet<string>>(new Set());
  const enCurso = useRef(new Set<Promise<void>>());
  // Lo que la IA ya devolvió, por foto, apenas llega (sin esperar a que se dibuje): lo lee `esperar`.
  const listas = useRef(new Map<string, NonNullable<FotoPendiente["ia"]>>());
  const moldeEnCurso = useRef<Promise<Blob | null> | null>(null);
  const [colorMoldeEnCurso, setColorMoldeEnCurso] = useState<string | null | undefined>(undefined);
  // La IA responde ~25 s después: el molde se busca en las fotos de AHORA.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);

  const claveDe = (color: string | null) => color ?? "";
  /** El molde ya hecho: la de IA del primer color (en el orden elegido) que la tiene, y que se está usando. */
  function moldeHecho(lista: readonly FotoPendiente[]): FotoPendiente | null {
    for (const c of colores) {
      const f = lista.find((x) => x.colorCodigo === c && x.ia?.usar);
      if (f) return f;
    }
    // La foto «para todos los colores» no es molde (formidable, 2026-11-13).
    return lista.find((x) => x.colorCodigo !== null && x.ia?.usar) ?? null;
  }

  async function preparar(p: PedidoCatalogo) {
    const clave = crypto.randomUUID();
    const vistaReal = URL.createObjectURL(p.frente);
    // La foto real entra ya a su fila: si la IA falla, o si se crea el producto sin esperarla, el color no queda sin foto.
    setFotos((fs) => [...fs, { clave, archivo: p.frente, vista: vistaReal, colorCodigo: p.color }]);
    setPreparando((s) => new Set(s).add(claveDe(p.color)));

    const esMolde: { soltar: ((b: Blob | null) => void) | null } = { soltar: null };
    let molde: Blob | null = null;
    const hecho = moldeHecho(fotosRef.current);
    // La foto «para todos los colores» no usa molde ni lo es: puede mostrar la prenda en otra forma.
    if (p.color === null) molde = null;
    else if (hecho?.ia) molde = hecho.ia.png;
    else if (moldeEnCurso.current) molde = await moldeEnCurso.current;
    else {
      moldeEnCurso.current = new Promise<Blob | null>((resolver) => (esMolde.soltar = resolver));
      setColorMoldeEnCurso(p.color);
    }

    const r = await pedirFotoDeCatalogo({ frente: p.frente, espalda: p.espalda, detalle: p.detalle, molde });
    if ("png" in r) {
      esMolde.soltar?.(r.png);
      const vistaIA = URL.createObjectURL(r.png);
      listas.current.set(clave, { png: r.png, vistaIA, vistaReal, usar: true });
      setFotos((fs) => fs.map((f) => (f.clave === clave ? { ...f, vista: vistaIA, ia: { png: r.png, vistaIA, vistaReal, usar: true } } : f)));
    } else {
      esMolde.soltar?.(null);
      avisar.aviso("La IA no respondió: quedó tu foto.", { detalle: r.error });
    }
    if (esMolde.soltar) {
      moldeEnCurso.current = null;
      setColorMoldeEnCurso(undefined);
    }
    setPreparando((s) => {
      const n = new Set(s);
      n.delete(claveDe(p.color));
      return n;
    });
  }

  const hecho = moldeHecho(fotos);
  const colorDelMolde = hecho ? hecho.colorCodigo : colorMoldeEnCurso;

  return {
    disponible,
    encendido: disponible && encendido,
    cambiarEncendido,
    abrir: (archivos, color) => {
      const frente = frenteValido(archivos);
      if (frente) setHoja({ color, frente, espalda: archivos[1] ?? null, detalle: archivos[2] ?? null });
    },
    preparando: (color) => preparando.has(claveDe(color)),
    alternar: (clave) =>
      setFotos((fs) =>
        fs.map((f) => (f.clave === clave && f.ia ? { ...f, vista: f.ia.usar ? f.ia.vistaReal : f.ia.vistaIA, ia: { ...f.ia, usar: !f.ia.usar } } : f)),
      ),
    esperar: async (lista) => {
      await Promise.all([...enCurso.current]);
      // La que ya tenía su `ia` en la lista la conserva (pudo pasar por «Usar mi foto»); la que llegó recién, la toma de `listas`.
      return lista.map((f) => (f.ia || !listas.current.has(f.clave) ? f : { ...f, ia: listas.current.get(f.clave)! }));
    },
    hoja: hoja ? (
      <HojaCatalogoIA
        nombreColor={hoja.color === null ? "Todos los colores" : nombreColor(hoja.color)}
        inicial={hoja}
        molde={hoja.color !== null && colorDelMolde !== undefined && colorDelMolde !== hoja.color ? { url: hecho?.ia?.vistaIA ?? null, nombreColor: nombreColor(colorDelMolde) } : null}
        onPreparar={(p) => {
          setHoja(null);
          const promesa = preparar(p).finally(() => enCurso.current.delete(promesa));
          enCurso.current.add(promesa);
        }}
        onClose={() => setHoja(null)}
      />
    ) : null,
  };
}
