import type { TonoChip } from "@/components/ui/Chip";

/* ====================================================================
   Lista de actividad · la forma de las listas «qué pasó, cuándo y cómo salió» (2026-10-01)

   Movimientos (qué entró y salió de la tienda) y Conteos recientes (qué se contó) se leen igual: el día como título, y cada fila con
   hora · punto de color · ficha (ícono o foto, título y detalle) · qué pasó · quién o qué documento · cifra · flecha. Esa forma la
   eligió Felipe en la demo de Movimientos (docs/maquetas/movimientos-rediseno-2026-09/) y después pidió que Conteo se leyera igual
   («se entiende mucho más»): por eso vive aquí, en UN lugar, y no copiada en cada lista. Cambiar una medida cambia las dos.

   No lleva «use client»: la usan una lista de servidor (Conteos recientes) y una de cliente (Movimientos), y un valor exportado por un
   archivo cliente NO se puede leer desde el servidor (llega como referencia, no como el texto).
   ==================================================================== */

/** La fila: desde sm, seis celdas [hora · punto · ficha 1,5fr · qué pasó 1fr · quién/referencia 1fr · cifra 7 rem]. En celular, tres
 *  [punto · ficha · cifra] y debajo, en un segundo renglón, «qué pasó» y «quién/referencia». Las clases van ENTERAS: Tailwind solo
 *  genera lo que encuentra literal. */
export const FILA_ACTIVIDAD =
  "relative grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 transition-colors hover:bg-crema/60 focus-within:bg-crema/60 sm:grid-cols-[3.25rem_0.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] sm:items-center sm:gap-x-4 sm:px-2";

// El tono del estado como un punto: sobrio, y no obliga a que «Entrada · Traslado recibido» o «3 diferencias encontradas» quepan en
// un chip.
export const PUNTO_ACTIVIDAD: Record<TonoChip, string> = {
  neutro: "bg-tinta/30",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
  pizarra: "bg-pizarra",
  apagado: "bg-tinta/15",
  tinta: "bg-tinta",
};

/** El título de cada día: una fila negra (tinta) con la letra blanca de CAYLA (crema), «HOY» o «SÁBADO, 26 DE SETIEMBRE» a la izquierda y
 *  cuántas filas trae el día a la derecha (Felipe, 2026-10-01: que el día se vea de un golpe al recorrer la lista). */
export const DIA_TITULO = "mt-4 mb-1 flex items-baseline justify-between gap-3 rounded-lg bg-tinta px-3 py-2";
export const DIA_ETIQUETA = "label-cayla text-[11px] font-bold text-crema";
export const DIA_CUANTOS = "label-cayla text-[10.5px] font-bold text-crema";

/** La hora, primera columna de la fila (desde sm; en celular sigue bajo el nombre, donde no hay columnas). Un rango trae la hora de
 *  la primera y, debajo, la de la última. */
export function ColumnaHora({ desde, hasta }: { desde?: string | null; hasta?: string | null }) {
  return (
    <span className="hidden whitespace-nowrap text-[13px] leading-snug tabular-nums text-taupe sm:block">
      {desde}
      {hasta && hasta !== desde && <span className="block">–{hasta}</span>}
    </span>
  );
}
