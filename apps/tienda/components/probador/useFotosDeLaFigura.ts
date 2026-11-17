"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { queEspera, type FotoPedida } from "@/lib/fotos-de-la-figura";

// La figura cambia de prenda recién cuando la foto nueva ya se puede pintar (Felipe, 2026-11-16: «cuando se cambia de prenda no da impresión de
// carga»). Antes el cambio era inmediato: la animación de entrada corría sobre la foto ANTERIOR (el navegador la deja puesta hasta que llega la
// nueva) y la nueva aparecía de golpe al terminar de bajar, sin nada que dijera que se estaba cargando. Ahora:
// - mientras la foto baja, la figura sigue mostrando el outfit de antes, con la prenda que se va atenuada (se nota el toque al instante);
// - si tarda más de `ESPERA_ANTES_DE_AVISAR_MS`, la figura lo dice con lo mismo que ya usa la unión (el velo y «Ajustando tu outfit…»);
// - al llegar, la prenda entra con su animación de siempre, ya con su foto y ya unida (se espera también su medida: una sola espera, una sola entrada).
// La foto se baja con un `<Recorte>` escondido que pide EXACTAMENTE lo mismo que pedirá la figura (mismo `sizes`): al mostrarla sale de la caché.
// Las que asoman a los lados piden también eso mismo, así que pasar con la flecha o deslizando casi nunca espera.

/** Cuánto se espera antes de avisar: si todo llega antes, no hay nada que decir (el mismo plazo de la unión). */
const ESPERA_ANTES_DE_AVISAR_MS = 180;
/** Lo que no llega en tanto ya no se espera: la figura cambia igual y la foto aparece cuando llegue (como antes). Todo puede fallar. */
const LIMITE_DE_LA_ESPERA_MS = 4000;

/** Las fotos que este navegador ya bajó a tamaño de figura (por su dirección). Es del navegador entero, no de un componente. */
const listas = new Set<string>();
let version = 0;
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};

/** Una foto ya se puede pintar (o se supo que no va a llegar): quien la esperaba deja de esperar. */
export function fotoLista(url: string): void {
  if (listas.has(url)) return;
  listas.add(url);
  version++;
  oyentes.forEach((f) => f());
}

/**
 * Lo que la figura dibuja: lo pedido si ya está todo, o lo último que se vio mientras llega. `clave` es la identidad de lo pedido (el outfit):
 * mientras no cambie, se sigue viendo lo adoptado. `medidas`: si la unión ya tiene las suyas (se esperan junto con las fotos). `ver` arma lo que se
 * dibuja a partir de lo pedido y de lo que se veía (`null` la primera vez); es pura: corre al dibujar.
 * Devuelve `faltan` (las fotos que hay que bajar: se montan escondidas) y `demorada` (ya tardó lo bastante para decirlo).
 */
export function useFotosDeLaFigura<P, V>(
  pedido: P,
  clave: unknown,
  fotos: readonly FotoPedida[],
  medidas: boolean,
  ver: (antes: V | null, pedido: P) => V,
): { visto: V; esperando: boolean; faltan: FotoPedida[]; demorada: boolean } {
  useSyncExternalStore(suscribir, () => version, () => 0);
  const [tenido, setTenido] = useState(() => ({ visto: ver(null, pedido), clave }));
  // El pedido que ya esperó lo bastante para avisarlo, y el que ya esperó su tope (se muestra igual): otro pedido empieza de cero.
  const [demorado, setDemorado] = useState<unknown>(null);
  const [vencido, setVencido] = useState<unknown>(null);
  // Lo que ya se está viendo no se espera (el primer outfit llega pintado desde el servidor): solo lo que cambia.
  const elMismo = tenido.clave === clave;
  const faltan = elMismo || vencido === clave ? [] : queEspera(fotos, listas);
  const esperando = !elMismo && vencido !== clave && (faltan.length > 0 || !medidas);
  // Con todo listo se adopta lo pedido. Es estado derivado: React descarta este dibujo y vuelve a dibujar antes de pintar, así que no se ve un cuadro intermedio.
  if (!esperando && !elMismo) setTenido({ visto: ver(tenido.visto, pedido), clave });

  useEffect(() => {
    if (!esperando) return;
    const aviso = window.setTimeout(() => setDemorado(clave), ESPERA_ANTES_DE_AVISAR_MS);
    const tope = window.setTimeout(() => setVencido(clave), LIMITE_DE_LA_ESPERA_MS);
    return () => {
      window.clearTimeout(aviso);
      window.clearTimeout(tope);
    };
  }, [esperando, clave]);

  return { visto: tenido.visto, esperando, faltan, demorada: esperando && demorado === clave };
}
