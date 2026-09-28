# Spike visual · Ayuda guiada por módulo (2026-09-25)

`ayuda-spike.html`: un solo archivo, se abre con doble clic en el navegador. Datos de ejemplo; nada se guarda salvo qué
guías ya hiciste (en el navegador). Pedido de Felipe: «una opción de ayuda en cada módulo que despliegue todo lo que se
puede hacer ahí; al elegir, el sistema enseña el paso a paso con un círculo visible donde hay que presionar y el resto
oscuro, hasta completar el proceso; y que la persona pueda terminar la guía antes de acabarla».

## Qué se ve

1. **Botón «? Ayuda»** en la cabecera de cada módulo (junto a la acción principal). También se abre con la tecla `?`.
2. **Panel «¿Qué quieres hacer?»** (hoja lateral con el movimiento de ADR-0136):
   - buscador («vender», «descuento», «cerrar»…);
   - **«Conoce esta pantalla»**: recorrido de 3–5 paradas que solo explica;
   - las tareas del módulo agrupadas en **«Lo de todos los días»** y **«De vez en cuando»**, con cuántos pasos tiene cada una;
   - las que ya hiciste llevan un visto verde;
   - si dejaste una guía a medias, arriba aparece **«Te quedaste en el paso 3 de 4 · Retomar»**.
3. **La guía**: todo se oscurece salvo un **círculo** sobre lo que hay que presionar (si el objetivo es ancho, una fila o
   una tarjeta, el círculo se estira a píldora para no tapar media pantalla). Al llegar a cada paso, un anillo rojo late
   tres veces y se queda quieto. La tarjeta dice «Paso 2 de 8», qué hacer en una línea y una pista:
   - **presiona dentro del círculo** → la guía avanza sola cuando lo haces (el clic llega al botón real: la venta se hace
     de verdad, no es una película);
   - **escribe y presiona Enter** → avanza cuando lo escrito tiene sentido;
   - **solo mira** → «Siguiente».
   Presionar fuera del círculo no hace nada: el anillo vuelve a latir para mostrar dónde.
4. **Terminar antes**: «Terminar guía», la ✕ o `Esc`. La pantalla queda tal cual (si había una ventana abierta, sigue
   abierta: la persona continúa sola). Sale el aviso «Guía pausada en el paso 3 de 4 · Retomar».
5. **Final**: visto que se dibuja, «¡Listo! Hiciste tu primera venta de principio a fin» y «Ver otras guías».
6. **Celular (375 px)**: la tarjeta pasa a ser una hoja fija abajo y la guía desplaza la pantalla para que el círculo
   quede siempre en la zona libre de arriba.

Guías armadas: **Vender** (recorrido, hacer una venta · 8 pasos, registrar a la clienta, aplicar un descuento, separar una
prenda), **Caja** (recorrido, cerrar la caja, sacar plata del cajón) y **Traslados** (recorrido, enviar mercadería, ver
qué está en camino). Enlace directo a una guía: `ayuda-spike.html#guia=vender/venta/3` (módulo/tarea/paso) — sirve para
mandarle a una colaboradora «mira cómo se hace».

## Decisiones tomadas en el spike (y por qué)

- **La guía no simula: opera la pantalla real.** Así lo aprendido es exactamente lo que después se hace. Por eso cada paso
  tiene un `preparar()` que deja la pantalla lista si la persona se saltó algo («Lo hago después») — la guía nunca queda
  apuntando a un botón que no existe; si igual no lo encuentra, lo dice y deja seguir.
- **El velo es un SVG con el agujero recortado** (`fill-rule: evenodd`), no una sombra gigante: en Chrome la sombra de
  2000 px y la máscara SVG salían mucho más claras de lo pedido. El círculo lo anima CSS y el recorte lo copia cuadro a cuadro.
- **El anillo late 3 veces, no en bucle** (ADR-0136 prohíbe movimiento en bucle salvo señales): es una señal de «aquí»,
  se apaga con `prefers-reduced-motion`.
- **Los avisos esperan a que se cierre la guía** (como con el loader de ADR-0149): el velo oscuro y un aviso verde encima
  se pisaban.
- **Lo que ya hiciste y dónde pausaste se guarda en el navegador** en el spike. En el ERP debería ir a la base por persona
  (ver preguntas).

## Cómo llevarlo al ERP (propuesta, para cuando se apruebe)

- `components/ayuda/` con `<BotonAyuda modulo="vender" />` (dentro de `<CabeceraPantalla>`: ninguna pantalla hace nada
  extra), `<PanelAyuda>` y `<Guia>`; el motor (cálculo del círculo, posición de la tarjeta, avance) en `lib/guias.ts`,
  puro y testeado.
- Las guías como **datos**, una por módulo (`lib/guias/vender.ts`…), con la misma `clave` de `retail.modulos`: el panel
  solo muestra guías de módulos que la cuenta ve (ADR-0161), y las tareas «solo del líder» solo al líder.
- Los objetivos se marcan con `data-guia="v-cobrar"` en los componentes, **nunca** con clases de estilo — si alguien
  rediseña el botón, la guía no se rompe. Una prueba recorre cada guía y exige que cada `data-guia` exista en el código.
- Tabla `retail.guias_vistas (persona_id, guia, paso, terminada_en)` para el visto y el «Retomar» entre aparatos.

## Preguntas abiertas para Felipe

1. **¿La primera vez que alguien entra a un módulo, se le ofrece sola la guía** («¿Te muestro cómo se vende? 1 min»)
   o solo cuando presiona «Ayuda»?
2. **¿El líder ve quién ya hizo cada guía?** (sirve para saber quién está lista para vender sola; implica la tabla de arriba).
3. **¿Por qué módulos empezamos?** Propuesta: Vender, Caja, Cambios/Devoluciones y Recibir — los que usa una colaboradora
   nueva la primera semana.

## Verificado

En el panel del navegador, a 1024 px y a 375 px: las **11 guías de los 3 módulos se recorren de punta a punta** con un
script que presiona dentro del círculo, escribe o pasa de paso (11/11 «OK», sin errores de JavaScript, sin desborde
horizontal). A mano: la venta de 8 pasos con clics reales, pausar en el paso 3 de «Cerrar la caja» y retomar desde el panel.
