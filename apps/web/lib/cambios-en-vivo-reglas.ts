/**
 * Reglas puras del tiempo real por WebSocket (Supabase Realtime, ADR-0603). Sin React ni red: el hook
 * `useCambiosEnVivo` las usa, y aquí se prueban.
 *
 * La idea (principio 9, «todo puede fallar»): el WebSocket solo AVISA «algo cambió en tu sede»; la pantalla sigue
 * leyendo por el camino de siempre (la huella del stock, el sello de la caja, `router.refresh`). Si el socket no
 * conecta o se cae, el sondeo de antes sigue y la pantalla funciona igual, solo que tarda unos segundos más.
 */

/** Cuánto se junta una ráfaga de cambios antes de avisar: una venta de 5 prendas escribe 5 filas de `stock`. */
export const ESPERA_JUNTAR_MS = 800;

/** Existencias vuelve a pedir toda la página (miles de filas), así que junta más: una carga de 200 tallas no la refresca 200 veces. */
export const ESPERA_JUNTAR_PAGINA_MS = 3_000;

/** Con el socket conectado el sondeo de respaldo baja a una vuelta de cada tantas (10 s × 6 = 1 min). */
export const VUELTAS_DE_RESPALDO_CONECTADO = 6;

/** Cada cuántas vueltas del sondeo toca de verdad leer: todas si el socket no está, una de seis si está. */
export function vueltasPorLectura(conectado: boolean): number {
  return conectado ? VUELTAS_DE_RESPALDO_CONECTADO : 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El filtro de Realtime para una sede (`ubicacion_id=eq.<uuid>`). `null` si no hay sede (se escucha todo lo que la
 * cuenta ve; la RLS ya la acota) o si el id no es un uuid: un id raro nunca se pega en el filtro, y el sondeo cubre.
 */
export function filtroDeUbicacion(ubicacionId: string | null | undefined): string | null {
  if (!ubicacionId || !UUID.test(ubicacionId)) return null;
  return `ubicacion_id=eq.${ubicacionId}`;
}

/** Un id que no cabe en un filtro no se escucha (queda el sondeo), pero «sin sede» sí es válido. */
export function sePuedeEscuchar(ubicacionId: string | null | undefined): boolean {
  return !ubicacionId || UUID.test(ubicacionId);
}

export type Temporizador = {
  poner: (accion: () => void, ms: number) => unknown;
  quitar: (id: unknown) => void;
};

/**
 * Junta una ráfaga de avisos en uno: el primero abre una ventana de `ms` y los que llegan dentro se absorben; al
 * cerrarse la ventana se llama `accion` una vez. Una ventana (no «esperar silencio») para que una tienda con ventas
 * seguidas nunca deje la pantalla sin actualizar.
 */
export function crearJuntador(
  ms: number,
  accion: () => void,
  reloj: Temporizador = { poner: (a, t) => setTimeout(a, t), quitar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) },
) {
  let id: unknown = null;
  return {
    avisar() {
      if (id !== null) return;
      id = reloj.poner(() => {
        id = null;
        accion();
      }, ms);
    },
    cancelar() {
      if (id === null) return;
      reloj.quitar(id);
      id = null;
    },
  };
}

export type QueHacerConUnCambio = "refrescar" | "guardar-para-despues" | "reintentar";

/**
 * Qué hace una pantalla que se vuelve a pedir entera (Existencias) cuando llega un aviso:
 * con la pestaña oculta no gasta (guarda el aviso y refresca al volver); con una hoja abierta no le cambia las cifras
 * a quien está contando o ajustando (reintenta en unos segundos); si no, refresca.
 */
export function queHacerConUnCambio({ oculta, hojaAbierta }: { oculta: boolean; hojaAbierta: boolean }): QueHacerConUnCambio {
  if (oculta) return "guardar-para-despues";
  if (hojaAbierta) return "reintentar";
  return "refrescar";
}

/** Cada cuánto se vuelve a mirar si la hoja ya se cerró. */
export const REINTENTO_CON_HOJA_MS = 4_000;
