# ADR-0011 — Campos como componentes con estado, y una capa de movimiento propia

**Fecha:** 2026-09-08
**Estado:** Aplicado

## Contexto

Felipe pidió mejorar el diseño y la UI de "emitir comprobante": desplegables, campos
de texto, etiquetas, "buenas animaciones", que quedara "futurista y elegante", y que
fuera reutilizable en otras pantallas si le gustaba. Pidió explícitamente no tocar la
lógica interna, porque está trabajando en ella en paralelo.

Al auditar antes de tocar nada aparecieron dos cosas:

1. **Tensión con el brandbook.** "Futurista" en su forma habitual (glassmorphism,
   glow de neón, gradientes, esquinas redondeadas, sombras) contradice de frente el
   sistema de identidad CAYLA v3.0, cuyos tokens de radio están en `0px` y cuyas
   utilidades de sombra están desactivadas a propósito (`app/globals.css`, decisión
   confirmada con Felipe el 2026-09-05). Aplicar ese look en una pantalla habría
   roto la identidad de toda la app — el mismo problema que ya resolvió ADR-0003.
2. **Techo del enfoque actual.** Los campos del sistema eran strings de clases
   (`campoTexto`, `campoSelect` en `ui/Modal.tsx`). Un string de clases no tiene
   estado: no puede expresar un desplegable que se abre, una línea que se dibuja al
   enfocar, ni una cifra que se re-asienta cuando cambia. Con `<select>` nativo,
   además, la lista la dibuja Windows — cuarto color incluido — justo en el momento
   de más atención de la pantalla.

## Decisión

**"Futurista" se interpreta como instrumento de precisión, no como decoración.** El
futurismo sale del comportamiento (respuesta inmediata, movimiento que explica qué
cambió), no de sombras ni gradientes. Cero colores nuevos. Concretamente:

- **`components/ui/campos.tsx`** — piezas reutilizables con estado: `Campo`,
  `CampoTexto`, `CampoMonto`, `CampoSelect`, `Segmentado`, `Boton`. Todas son
  presentación pura: reciben `valor`, avisan `onValor`, no validan ni deciden nada.
- **Un solo dispositivo visual, el "hilo vivo":** una línea de 1px que en reposo es
  `tinta/20` y al enfocar se dibuja encima en `rojo` desde el centro. Es lo único con
  color que se mueve en todo el sistema, y sirve de indicador de foco accesible.
  Reemplaza a recuadros, rellenos y sombras como fuente de jerarquía — que es lo que
  el brandbook deja disponible cuando prohíbe las otras tres.
- **Capa de movimiento en `app/globals.css`** — tres gestos (`entrada`, `revelar`,
  `asentar`), sin rebote, con `prefers-reduced-motion` colapsando la duración a 1ms
  en vez de eliminar la animación (eliminarla rompería el `fill-mode: both` y dejaría
  estados a medias). Regla: el movimiento responde a una acción de la persona; nada
  se anima solo al entrar a una pantalla.
- **`CampoSelect` se construye a mano y no con Radix Select.** El repo solo tiene
  `@radix-ui/react-dialog`; sumar una dependencia por un desplegable de tres sedes no
  se paga. A cambio, el teclado va completo (flechas, Inicio/Fin, Enter, Escape,
  tipeo para saltar) con los roles ARIA del patrón combobox.
- **El correlativo se muestra antes de emitir.** El modal de emisión ahora enseña el
  número exacto que se va a reservar (`B004-000127`) o avisa que esa sede no tiene
  serie para ese tipo. El dato ya llegaba en la prop `series`; solo faltaba mostrarlo.
  Antes, "esta sede no tiene serie" se descubría cuando la RPC fallaba, con la
  clienta esperando en el mostrador.

## Consecuencias

- Los strings `campoTexto`/`campoSelect`/`botonPrimario` siguen exportados desde
  `ui/Modal.tsx` y sin cambios: los otros 6 modales del sistema no se tocaron. La
  migración es opcional y pantalla por pantalla, no un big bang.
- `ui/Modal.tsx` cambió el centrado en escritorio: pasó de `-translate-x/y-1/2` a un
  contenedor flex aparte. Es obligatorio — la animación de entrada usa `transform`, y
  si el centrado también fuera un transform, la animación lo pisaría y el modal
  saldría corrido. Este error se produjo y se corrigió durante la sesión.
- `ConsultaDocumento` quedó sobre `CampoTexto`. Solo cambió el markup visual; la
  consulta al padrón, el debounce y el manejo de estados quedaron intactos.
- Queda como deuda: `ProformasPanel`, `EfectivoPanel` y los 6 modales del núcleo
  siguen con los campos viejos. Anotado en BACKLOG.
