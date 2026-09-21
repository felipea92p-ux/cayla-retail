/**
 * «¿La pantalla está ocupada?» — el puente entre el loader general (`components/ui/Espera.tsx`,
 * ADR-0149) y los avisos de arriba a la derecha (`components/ui/Avisos.tsx`, ADR-0146).
 *
 * EL PROBLEMA. Al guardar, el código hace `avisar.exito("Guardado")` en el instante en que la base
 * contesta, pero el loader sigue a la vista un buen rato más: 400 ms mínimo, 150 ms de gracia por si
 * viene un refresco encadenado y 220 ms de salida. Resultado: «Guardado» y «Cargando» juntos, el
 * resultado pisando la señal de que todavía se está trabajando. Cada uno vive en su módulo y ninguno
 * sabía del otro.
 *
 * LA REGLA. El loader dice «espera, se está procesando» y el aviso dice «listo, se guardó bien»: el segundo
 * llega DESPUÉS del primero. Un aviso espera a que la pantalla quede libre: se muestra cuando ya no hay
 * peticiones en curso Y el loader terminó de irse. Aquí vive solo ese dato — dos números y quién escucha —
 * sin React ni DOM, para poder probarlo. `Espera` lo alimenta; `Avisos` lo lee.
 *
 * OCUPADA = hay al menos una «ficha» de espera abierta (una carga de pantalla o un guardado que la persona
 * provocó, aunque el loader aún no haya pasado sus 200 ms de cortesía) O el loader está a la vista (incluida
 * su salida). Un guardado tan rápido que el loader ni llega a verse tampoco muestra el aviso a medias.
 */

let fichasEnCurso = 0;
let loaderALaVista = false;
const oyentes = new Set<() => void>();

export function esperaOcupada(): boolean {
  return fichasEnCurso > 0 || loaderALaVista;
}

// Solo se avisa a quien escucha cuando la respuesta cambia (libre ⇄ ocupada), no en cada ficha que entra o sale.
function cambiar(mutar: () => void) {
  const antes = esperaOcupada();
  mutar();
  if (esperaOcupada() !== antes) oyentes.forEach((o) => o());
}

/** Cuántas peticiones/esperas hay abiertas ahora mismo (lo llama `Espera` cada vez que cambia su lista). */
export function marcarFichas(cantidad: number) {
  cambiar(() => {
    fichasEnCurso = cantidad;
  });
}

/** Si el loader está a la vista — con su entrada y su salida —, para que los avisos esperen a que termine de irse. */
export function marcarLoaderALaVista(aLaVista: boolean) {
  cambiar(() => {
    loaderALaVista = aLaVista;
  });
}

/** Para `useSyncExternalStore`. */
export function suscribirEspera(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => void oyentes.delete(oyente);
}
