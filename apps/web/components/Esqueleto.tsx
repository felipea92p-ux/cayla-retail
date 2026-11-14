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
export function EsqueletoTabla({ filas = 6, className = "card-cayla" }: { filas?: number; className?: string }) {
  // Anchos fijos, no aleatorios: en un Server Component `Math.random()` daría un valor
  // distinto en servidor y cliente y React lo marcaría como desajuste de hidratación.
  const anchos = [92, 74, 88, 61, 83, 70, 95, 66];
  // `className`: la superficie. Por omisión su propia tarjeta; dentro de una tarjeta que ya existe (la tabla de Existencias), una raya.
  return (
    <div aria-hidden className={`${className} space-y-3 p-5`}>
      {Array.from({ length: filas }, (_, i) => (
        <Banda key={i} ancho={anchos[i % anchos.length]} />
      ))}
    </div>
  );
}

/**
 * Un dato que todavía se calcula dentro de una pantalla que ya se dibujó (Existencias en dos tiempos, 2026-11-13: la lista llega antes
 * que «Hoy»). Una banda del tamaño de lo que viene, sin texto a la vista: cuando el dato llega ocupa ese lugar y nada se mueve. Para el
 * lector, «Calculando». NO es «N/D»: eso dice que no se pudo; esto, que viene en camino. `className` le da la forma (alto, ancho, radio).
 */
export function Calculando({ className = "h-6 w-24 rounded-full" }: { className?: string }) {
  return (
    <span data-calculando className="inline-flex max-w-full align-middle">
      <span aria-hidden className={`inline-block max-w-full animate-pulse bg-tinta/10 ${className}`} />
      <span className="sr-only">Calculando</span>
    </span>
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

/**
 * El esqueleto de una pantalla entera (ADR-0623): lo que dibuja cada `loading.tsx` mientras la pantalla viaja, bajo el menú y
 * la cabecera que siguen vivos. La forma de casi toda pantalla del ERP: el título, una fila de cifras y una tabla, con las piezas
 * de vidrio de siempre (`tarjeta-cifra`, `tabla-cayla`) para que al llegar lo real nada cambie de lugar ni de color.
 */
/**
 * La silueta de una pantalla mientras llega. Con `titulo` (ADR-0628: el nombre del menú del módulo al que se entró) dibuja ese nombre
 * donde irá el de la cabecera, con la misma letra y medida: así se ve en el instante que el clic entró y a dónde. Es texto, no un `<h1>`:
 * la pantalla todavía no llegó; para el lector, una línea «Abriendo …».
 */
export function EsqueletoPantalla({ titulo }: { titulo?: string | null } = {}) {
  const anchos = [42, 31, 47, 28, 38, 34, 44, 30];
  return (
    <div data-esqueleto-pantalla className="flex flex-col gap-6 pt-2">
      {titulo ? (
        <p role="status" className="sr-only">
          Abriendo {titulo}…
        </p>
      ) : null}
      <div aria-hidden className="flex flex-col gap-3">
        <Banda ancho={18} />
        {titulo ? (
          <p className="font-display mt-1 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">{titulo}</p>
        ) : (
          <div className="h-10 w-64 max-w-[70%] animate-pulse rounded bg-tinta/10" />
        )}
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta-cifra card-cayla flex flex-col gap-3 p-5">
            <Banda ancho={50} />
            <div className="h-7 w-2/3 animate-pulse rounded bg-tinta/10" />
          </div>
        ))}
      </div>
      <div aria-hidden className="tabla-cayla card-cayla divide-y overflow-hidden">
        {anchos.map((ancho, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-4 animate-pulse rounded bg-tinta/10" style={{ width: `${ancho}%` }} />
            <div className="h-4 w-16 animate-pulse rounded bg-tinta/10" />
            <div className="ml-auto h-4 w-10 animate-pulse rounded bg-tinta/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
