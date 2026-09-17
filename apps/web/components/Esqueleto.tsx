// Marcador de posición mientras una sección todavía viaja por la red.
//
// EL PROBLEMA QUE RESUELVE. Hoy una pantalla pesada espera TODOS sus datos antes de
// dibujar un solo píxel propio: la cabecera, la navegación y los botones —que no dependen
// de ninguna consulta— se quedan detrás del catálogo. Envolviendo solo la parte con datos
// en <Suspense>, lo que no depende de la red aparece de inmediato y la tabla llega después.
//
// Por qué un esqueleto y no un "Cargando…": el texto suelto no dice cuánto falta ni qué
// va a aparecer, así que la espera se siente indefinida. Un bloque con la forma de lo que
// viene se lee como "ya está armándose", y además evita que la página salte cuando el
// contenido real ocupa su lugar.
//
// Se mantiene deliberadamente sobrio (brandbook v3.0: sin brillos ni barridos): solo una
// respiración muy suave sobre el color de papel. `prefers-reduced-motion` la desactiva
// desde globals.css, igual que el resto del movimiento del sistema.

/** Una banda del alto de una fila. `ancho` en porcentaje para que no se vean todas iguales. */
function Banda({ ancho }: { ancho: number }) {
  return <div className="h-4 animate-pulse rounded bg-tinta/10" style={{ width: `${ancho}%` }} />;
}

/**
 * Esqueleto de tabla/listado. `filas` debería parecerse a lo que la pantalla suele
 * mostrar — no a lo máximo posible: un esqueleto más largo que el contenido real hace
 * que la página se encoja al cargar, que es justo el salto que se quería evitar.
 */
export function EsqueletoTabla({ filas = 6 }: { filas?: number }) {
  // Anchos fijos, no aleatorios: en un Server Component `Math.random()` daría un valor
  // distinto en servidor y cliente y React lo marcaría como desajuste de hidratación.
  const anchos = [92, 74, 88, 61, 83, 70, 95, 66];
  return (
    <div aria-hidden className="card-cayla space-y-3 p-5">
      {Array.from({ length: filas }, (_, i) => (
        <Banda key={i} ancho={anchos[i % anchos.length]} />
      ))}
    </div>
  );
}

/** Esqueleto para una rejilla de tarjetas (indicadores, resúmenes por sede). */
export function EsqueletoTarjetas({ tarjetas = 4 }: { tarjetas?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-tinta/12 bg-tinta/12 sm:grid-cols-4">
      {Array.from({ length: tarjetas }, (_, i) => (
        <div key={i} className="space-y-3 bg-crema p-5">
          <Banda ancho={55} />
          <div className="h-7 w-2/3 animate-pulse rounded bg-tinta/10" />
        </div>
      ))}
    </div>
  );
}
