# ADR-0019 — El panel "+ Nuevo" es un menú, no un diálogo

**Fecha:** 2026-09-09
**Estado:** Aplicado
**Cierra:** el pendiente que ADR-0003 dejó abierto y que ADR-0014 resolvió a medias
**Alcance:** `components/AppShell.tsx` (`MenuNuevo` y sus dos disparadores). Nada más.

## Contexto

Esta pregunta se reabrió tres veces, y por eso queda escrita acá en vez de en un
comentario más:

1. **ADR-0003** (modal compartido con Radix) migró los 8 modales de la app a
   `components/ui/Modal` y dejó `MenuNuevo` afuera *a propósito* — "es un menú anclado
   al lateral/bottom-sheet, no un modal centrado" — pero sin cerrar qué se hacía con él.
2. **ADR-0014** (el riel del lateral) le agregó `Escape`, clic afuera, foco de entrada
   al panel y devolución de foco al botón. Quedó anotado que "no atrapa el foco".
3. Hoy, al preguntarse si tocaba migrarlo a `Modal`, la respuesta volvió a ser no.

Lo que seguía roto de verdad no era la falta de trampa de foco: era que **Tab recorría
las cinco opciones y después seguía por la app de atrás** — visualmente tapada por el
velo, pero entera tabulable. Quien navega con teclado terminaba escribiendo en un
formulario que no podía ver.

## Decisión

**No se migra a `Modal`, y no por ahorrar trabajo: atrapar el foco es el patrón de un
diálogo.** Un menú hace lo contrario — el tabulador lo cierra y sigue de largo. Ponerle
`Modal` sería darle el comportamiento de otra cosa.

Se implementa el patrón *menu button* de la W3C, que es lo que este control siempre fue:

- `role="menu"` + `aria-label="Nuevo"` en el panel; `role="menuitem"` y `tabIndex={-1}`
  en cada fila. Los dos disparadores (el botón del lateral y el "+" del celular)
  declaran `aria-haspopup="menu"` y `aria-expanded`.
- Teclado completo: flechas con vuelta, Inicio/Fin, Espacio para activar (Enter ya
  funcionaba solo, son `<a>`), tipeo para saltar, `Escape` para cerrar.
- **Tab cierra el panel.** Es el arreglo que importaba.
- El encabezado "Nuevo" del panel sale del árbol de accesibilidad (`aria-hidden`):
  `role="menu"` solo admite hijos de menú, y el nombre ya lo da el `aria-label`.

El teclado es **el mismo de `CampoSelect`** (`campos.tsx`): se levantó de ahí, no se
inventó. Eso también significa que se comporta igual, que es la mitad del valor.

**Una diferencia con la letra del patrón, asumida a conciencia:** la W3C dice que Tab
cierra el menú y mueve el foco *al siguiente elemento de la página*. Acá cierra y
devuelve el foco *al botón que abrió*. Cuesta un Tab más y evita arrastrar para siempre
un buscador de "próximo elemento tabulable" por un menú de cinco opciones. Lo que nunca
pasa, que era el problema real, es que el foco quede flotando detrás del velo.

## Consecuencias

- La marca roja de la fila activa dejó de depender de `:focus-visible` y ahora la manda
  un índice en estado, igual que en el desplegable de `campos.tsx`. El mouse escribe ese
  mismo índice (`onMouseEnter`), así que nunca hay dos filas encendidas a la vez.
- `Escape` se queda escuchando en `document` y no en el panel: si alguien hizo clic en
  el velo, el foco pudo haber salido de las filas, y Escape tiene que cerrar igual. Es
  la única tecla que no depende de dónde esté parado el foco.
- Si algún día el panel crece mucho en opciones, lo que corresponde es agrupar con
  `role="group"` y separadores — **no** volver a mirar hacia `Modal`.
- Verificado en navegador sobre ruta de prueba temporal (borrada al cerrar): estructura
  ARIA, foco inicial en la primera fila, flechas con vuelta en los dos sentidos,
  Inicio/Fin, tipeo ("b" salta a "Bajar a tienda"), Espacio navegando de verdad, y Tab y
  Escape cerrando con el foco de vuelta en el botón y sin caer en el enlace de atrás.
