# Spike visual · Buscador global + lockup de marca + colibrí en vector (2026-09-28)

`spike.html` — comparación por piezas sueltas (lockup, buscador, colibrí). `spike-pantalla-inicio.html` — los tres
cambios puestos sobre la pantalla de Inicio real completa, con un interruptor **Antes / Después** para comprobar que
nada de lo que ya funciona se movió: todo el contenido (Hoy, Te toca, Accesos, Equipo de hoy, el lateral entero) queda
pixel a pixel igual entre los dos estados — lo único que cambia es que aparecen las 3 piezas nuevas. Ambos
autocontenidos, ábrelos en el navegador (necesitan `cayla-isotipo.png` al lado). Datos inventados (pantallas y
equipo). **Ninguno es una implementación**: no tocan `AppShell.tsx`, `login/page.tsx` ni ningún componente real.

Pedido de Felipe, comparando dos capturas: la de Inicio de Retail (logo "CAYLA" solo, colibrí de baja resolución) y la
de Dynamic (paleta de comandos "Buscar una pantalla o a alguien del equipo…", ⌘K). Tres preguntas, tres respuestas.

## Por qué es "agregar", no "tocar"

Los tres cambios se diseñaron para no desplazar ni un píxel de lo que ya existe:
- **El buscador** es un botón nuevo en la cabecera, insertado a la IZQUIERDA de lo que ya había (Actividad, Tienda
  TRU) — esos dos no cambian de sitio. Se abre como overlay (`<Modal>`, ADR-0136): no reordena la pantalla de atrás.
- **"Retail" en el logo** se agrega DEBAJO de "CAYLA", nunca en su lugar — la palabra "CAYLA" no cambia de tamaño, de
  posición ni de peso.
- **El colibrí en vector** dibuja el mismo trazo que el PNG de hoy, al mismo tamaño — es un cambio de nitidez, no de
  diseño. `spike-pantalla-inicio.html` lo prueba: en "Antes" es el PNG de siempre, en "Después" es el `<path>` ya
  calcado en `EtiquetaPrecio.tsx` — mismo dibujo, dos formas de pintarlo.

## 1 · Buscador global, como en Dynamic — SÍ, factible

Hoy Retail tiene dos cosas sueltas, ninguna es esto:

- `/buscar` (`app/(app)/buscar/page.tsx`) busca **solo en el catálogo de prendas** (SKU, referencia, talla, color) —
  para responderle a una clienta cuánto stock hay y dónde. No busca pantallas ni personas.
- Hubo un `BuscadorGlobal` en la cabecera que escribía `?q=` hacia esa misma pantalla — se quitó el **2026-09-16**
  (comentario en `buscar/page.tsx:14-17`) porque no tenía más destino que el catálogo.

Lo que pide Felipe es un tercero: una paleta de comandos que busca **pantallas del menú** y **personas del equipo**,
como atajo de navegación — el spike la abre con el botón "Buscar una pantalla…" de la cabecera o `Ctrl`/`Cmd`+`K`.

**Por qué es barato:**
- Las pantallas ya están resueltas por rol en `lib/menu.ts` (`menuPara()` → `hojasDe()`) — el mismo filtro que arma el
  lateral. El buscador nunca ofrecería una pantalla que la persona no puede abrir, sin escribir esa regla dos veces.
- Las personas salen de `colaboradores` + su ubicación — el mismo dato que ya pinta "Equipo de hoy" en Inicio.
- El componente es un `<Modal>` (`components/ui/Modal.tsx`) anclado arriba, variante nueva o cercana a `papel` — mismo
  velo con desenfoque, misma cascada de 55 ms (ADR-0136). No es una gramática de movimiento nueva, es el modal de
  siempre con un campo que filtra en cliente (sin round-trip al servidor por cada tecla, a diferencia de `/buscar`).
- El atajo `Ctrl`/`Cmd`+`K` no choca con nada: el único atajo global hoy es `[` (plegar el lateral, `AppShell.tsx:791-803`).

**Lo que falta decidir (tuyo, no mío):**
1. ¿La caja de texto también busca prendas (fusiona con `/buscar`) o se queda en pantallas + equipo, y la lupa del
   catálogo sigue aparte? Yo separaría: mezclar "3 unidades de la talla M" con "Chiara Farfán" en la misma lista
   confunde más de lo que ahorra. Dos buscadores con trabajos distintos, no uno que hace de todo.
2. ¿Un integrante ve a TODO el equipo de su sede, o solo a quien puede tocar según ADR-0178 (`fn_alcanzo_a`)? Yo iría
   con "todo el equipo de la sede que mira" — es para encontrar a alguien, no para actuar sobre esa persona; el
   permiso de verdad ya vive en la pantalla de Colaboradores.
3. ¿Vale la pena en celular? Dynamic lo tiene en escritorio (la captura es del dashboard de RR.HH., pantalla ancha).
   En Retail celular ya hay un atajo a `/buscar` en la lupa de cabecera (ADR-0205) — yo dejaría el `Ctrl+K` como algo
   de escritorio nomás; en celular escribir "⌘K" no significa nada.

## 2 · El logo dice de qué sistema es — SÍ, factible, tres puntos de contacto

Hoy "CAYLA" se pinta igual en Retail que en Dynamic (dos sistemas separados, unificados solo por debajo en el
Supabase de producción — ver nota de arquitectura de `CLAUDE.md`). Quien mira una captura no sabe en cuál está.

Se toca en exactamente tres lugares, ningún dato nuevo:
- `AppShell.tsx:940-954` — logo del lateral expandido.
- `AppShell.tsx:1115-1117` — logo de la cabecera móvil (compacta, sin el lateral).
- `login/page.tsx:61-65` — la pantalla de ingreso, donde el lockup es más grande y hay más aire para probarlo.

El spike prueba 3 formas (selector arriba), todas con "CAYLA" intacto (sigue siendo LA marca) y "Retail" como segundo
nivel, más chico y en un color secundario:

| Opción | Cuándo se lee bien | Riesgo |
|---|---|---|
| **A · Apilado** (CAYLA / RETAIL) | Columna angosta — sobrevive al lateral plegado a íconos (`compacto`, ADR-0130) | Ninguno |
| **B · En línea** (CAYLA · Retail) | Cabeceras anchas, login | En el lateral expandido (17rem) puede no caber con el label largo |
| **C · Píldora** (CAYLA `[RETAIL]`) | Se lee más "de producto" (como un badge de entorno) | Es el que más se aleja del brandbook de tres colores — la píldora agrega una cuarta superficie |

**Mi recomendación:** **A**, apilado. Es el único que no depende del ancho disponible — funciona igual en el lateral
de 17rem, en la cabecera móvil de 26 px y en el login de 56 px, sin una regla de "a partir de tal ancho, cambia de
forma". Lo único que falta que decidas es la palabra: ¿"Retail" (lo que es hoy, y es lo que dice el menú del negocio)
o algo más genérico por si un día CAYLA vende este sistema a otra marca (la visión de venta de `CLAUDE.md`)? Yo
dejaría "Retail" — ese día se cambia una palabra en tres archivos, no se está diseñando hoy para una hipótesis.

## 3 · El colibrí de baja resolución — SÍ, pero la solución no es "más resolución"

`/cayla-isotipo.png` mide **223 × 150 px** y se reusa en 10 archivos (`AppShell.tsx`, `login/page.tsx`,
`ReciboTermico.tsx`, `ProformaA4.tsx`, `BoletaA4.tsx`, `CambioTicket.tsx`, `EtiquetaPrecio.tsx`,
`ComprobantesListaVacia.tsx`, `PrendaCelda.tsx`, `Espera.tsx`) — de 32 px en el lateral (donde casi no se nota) a
documentos impresos a tamaño de página (donde sí).

**Esto ya se rompió una vez, y ya se arregló — solo que en un único lugar.** `EtiquetaPrecio.tsx:27-35` cuenta la
historia: el PNG "salía serruchado en la Brother" (Felipe, 2026-09-25), y la solución no fue pedir un PNG más grande
— fue calcar el colibrí a mano como cuatro `<path>` de SVG. Ese trazo ya está en el repo, ya verificado contra una
impresora térmica real. El spike reusa ESE mismo trazo (no dibuja uno nuevo) para probarlo a 32, 56 y 96 px.

**Causa raíz (principio 12):** el problema nunca fue "poca resolución" — un PNG cualquiera que subas hoy se va a ver
igual de mal el día que alguien lo use más grande todavía (una pantalla, un banner, una lona para la tienda). El
problema es depender de un raster para un isotipo de dos colores y cuatro trazos, que es exactamente lo que un
vector resuelve una vez y para siempre.

**Qué implica el arreglo real:**
1. Extraer el `<path>` de `EtiquetaPrecio.tsx` a un componente compartido, `components/ui/IsotipoCayla.tsx` (props:
   alto/ancho, color de trazo — hoy `#000` en la etiqueta, `currentColor` en todos los demás).
2. Reemplazar los 10 usos de `<Image src="/cayla-isotipo.png">` (o `<img>`, en lo que se imprime) por el componente.
   `EtiquetaPrecio.tsx` no cambia — ya lo tiene.
3. El PNG se queda SOLO como favicon / `og:image` (metadatos que de verdad piden un raster) — no se borra, se le
   recorta el trabajo.

Cero migraciones, cero RLS, y no hace falta pedirle a nadie un archivo de diseño nuevo: el trazo nítido ya está
probado. Es la tarea más chica de las tres — una tarde, sin decisiones de negocio pendientes.

## Qué reutiliza y qué inventa

Reutiliza: los tokens reales de `globals.css` (colores, `--ease-cayla`), los íconos de línea de `AppShell.tsx` (mismo
`viewBox`, mismo trazo 1.5), el patrón de avatar con iniciales de `AvatarPersona.tsx` (círculo `bg-sand`, `font-display`),
y el `<path>` del colibrí ya calcado en `EtiquetaPrecio.tsx`.

Inventa (para el spike nomás): la lista de pantallas y de equipo está escrita a mano — en producción sale de
`lib/menu.ts` y `colaboradores`. El filtrado del campo es JS plano sin tildes ni mayúsculas, la misma idea que
`combo-reglas.ts` (ADR-0209) ya aplica en cualquier combo de más de 8 opciones — un buscador real reusaría esa
función en vez de reescribir el `normalize`.

## Verificado en el navegador

`Ctrl+K` abre y cierra la paleta, filtra por pantalla y por persona sin tildes, ↑↓ mueve la fila marcada, Enter y Esc
cierran, el botón de la cabecera hace lo mismo que el atajo. Los tres selectores (lockup, PNG/vector del colibrí)
repintan sin recargar. Sin errores de consola.
