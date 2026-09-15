/* ====================================================================
   MuestraColor · el color como color, no como palabra (2026-09-15, Inventario)

   Por qué existe: en la tabla de Inventario la columna Color decía «Blanco»,
   «Beige», «Azul marino» — para encontrar las blusas negras había que LEER
   cada fila. Una cápsula del color real se distingue sin leerlo, como una
   etiqueta de tela colgada en el perchero. El nombre no desaparece: al
   pasar el mouse (o enfocar con teclado) se desliza desde la cápsula hacia
   la derecha, en una pastilla que flota sobre la fila sin mover nada de
   sitio. En celular no hay mouse: ahí el nombre va siempre al lado.

   El hex sale de `retail.colores.hex`. Los tres colores que no son un color
   (Estampado, Multicolor, Animal print) no lo tienen y se dibujan con un
   degradado de varios tonos: «esto es de varios colores», no «no sé cuál».
   ==================================================================== */

/** Para los colores sin hex: varios tonos del propio catálogo, en rueda. */
const VARIOS_COLORES = "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)";

export function MuestraColor({ nombre, hex }: { nombre: string | null; hex: string | null }) {
  if (!nombre) return <span className="text-tinta/45">—</span>;

  return (
    <span
      // `group` para que el hover/foco del conjunto revele el nombre; `relative`
      // para que la pastilla se ancle al círculo y no al ancho de la celda.
      className="group relative inline-flex items-center outline-none"
      tabIndex={0}
      aria-label={`Color ${nombre}`}
    >
      <span
        aria-hidden
        // Cápsula, no círculo: `rounded-full` sobre un rectángulo más ancho
        // que alto cierra en semicírculo a cada lado — la forma de una
        // etiqueta de tela, no de un punto. Borde tenue para que Blanco y
        // Crudo se vean sobre crema; el brillo interior le da volumen.
        className="h-3.5 w-7 shrink-0 rounded-full border border-tinta/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] transition-transform duration-300 ease-cayla group-hover:scale-110 group-focus-visible:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-rojo/50 motion-reduce:transition-none"
        style={{ background: hex ?? VARIOS_COLORES }}
      />
      <span
        // Escritorio: pastilla flotante a la derecha, aparece deslizándose
        // desde el círculo (opacidad + 4px de recorrido). Celular (< sm):
        // texto normal al lado, siempre visible.
        className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-full border border-sand bg-papel px-2 py-0.5 text-xs text-tinta opacity-0 shadow-sm transition-[opacity,transform] duration-300 ease-cayla group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none max-sm:static max-sm:translate-x-0 max-sm:translate-y-0 max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:py-0 max-sm:text-sm max-sm:text-tinta/75 max-sm:opacity-100 max-sm:shadow-none"
      >
        {nombre}
      </span>
    </span>
  );
}
