"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "./supabase/client";
import type { EstadoCandidatas, ParametrosCandidatas } from "./parecidas-alta-tipos";
import { ambitoDeLectura, claveDeIds } from "./candidatas-alta-datos";
import { SIN_CANDIDATAS, crearControlCandidatas, crearLectorDeLaBase } from "./candidatas-alta-lector";

// «Prendas parecidas» en el alta — el hook que entrega a la pantalla lo que ya existe en la marca (o categoría) elegida.
//
// EL PROBLEMA. Ver `candidatas-alta-lector.ts`: las lecturas llegan en distinto momento y la persona cambia de marca mientras
// una anterior vuela. Aquí solo se CONECTA ese control con React: toda la lógica (la lectura, la carrera, el plazo, la memoria)
// vive allá, sin React y sin la directiva "use client", para poder probarla sin navegador y llamarla desde el servidor si hace falta.
//
// CONTRATO
//   PROMETE: lo de `candidatas-alta-lector.ts` (no lee si `activo` es falso o no hay marca ni categoría; un resultado tardío de
//            una marca anterior nunca pisa al vigente; `fallo = true` Y las candidatas que sí se leyeron; `reintentar()`). Además:
//            el primer render (el del servidor, y el de antes de que corra el efecto) no toca la red ni muestra lo de otra marca:
//            arranca «cargando». El cliente de la base se crea al primer uso, no al renderizar.
//   ASUME:   lo mismo que el lector, y que quien llama pasa `marcaId = null` cuando la marca elegida es un comodín como
//            «Importado» (D5: manda la categoría). Con `leer` inyectado (pruebas y página de prueba) no se toca la base.
//   NO HACE: no compara ni ordena (eso es `parecidas-alta-reglas.ts`), no trae precio ni costo, no escribe.

export function useCandidatasAlta(parametros: ParametrosCandidatas): EstadoCandidatas {
  const { marcaId, categoriaId, activo, leer } = parametros;
  const claveIds = claveDeIds(parametros.idsExtra);

  // El lector de verdad (y su cliente de la base) se arma al primer uso, no al renderizar: el render del servidor no toca la red.
  const [control] = useState(() => crearControlCandidatas({ crearLector: () => crearLectorDeLaBase(createClient()) }));

  // El lector inyectable va por su propio efecto (declarado antes que el de sincronizar): cambiar de función no rearma nada.
  useEffect(() => {
    control.usarLector(leer);
  }, [control, leer]);
  useEffect(() => () => control.cerrar(), [control]);
  useEffect(() => {
    control.sincronizar({ marcaId, categoriaId, activo, idsExtra: claveIds === "" ? [] : claveIds.split(",") });
  }, [control, marcaId, categoriaId, activo, claveIds]);

  const snap = useSyncExternalStore(control.suscribir, control.instantanea, control.instantanea);
  const reintentar = useCallback(() => control.reintentar(), [control]);

  // Lo leído solo vale para la marca (o categoría) que la pantalla tiene elegida AHORA: el primer render tras cambiarla todavía
  // trae lo anterior, y no se muestra. Mientras llega lo nuevo, `cargando`.
  const ambito = ambitoDeLectura(activo ? marcaId : null, activo ? categoriaId : null);
  const hayAmbito = ambito.ambito !== "ninguno";
  const vigente = hayAmbito && snap.clave === ambito.clave ? snap : null;
  return {
    candidatas: vigente?.candidatas ?? SIN_CANDIDATAS,
    cargando: hayAmbito ? (vigente ? vigente.cargando : true) : false,
    fallo: vigente?.fallo ?? false,
    reintentar,
  };
}
