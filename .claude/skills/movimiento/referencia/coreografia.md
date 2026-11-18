# Coreografía rica, bien hecha — recetas para las excepciones «full animaciones»

Esto es para cuando Felipe pidió «full animaciones» y la pieza ya tiene (o va a pedir) su fila en la lista de ADR-0136. Para todo lo demás vale la
regla común: la cascada de `<Modal>`, `.mov-boton` y los cuatro tiempos. Ninguna receta trae un color: los colores salen de los tokens
(`/color`). Ninguna trae una curva nueva: `--ease-cayla` para entrar y `--ease-salida` para irse.

## Qué separa una animación rica de clase mundial de una recargada

| De clase mundial | Recargada |
|---|---|
| Cada movimiento cuenta algo: de dónde sale, a dónde va, qué cambió, que se guardó | Se mueve porque se puede |
| Hay un protagonista y lo demás lo acompaña, más corto | Todo entra a la vez con la misma fuerza |
| Lo que va junto se mueve igual (mismo tiempo, curva y dirección) | Cada pieza con su propio tiempo y su propia curva |
| Los desfases son cortos y tienen tope: la décima pieza llega casi con la octava | 70 ms × 20 piezas: la última llega al segundo y medio |
| Sale más rápido de lo que entró, con `--ease-salida` | La salida dura lo mismo, o más, que la entrada |
| Lo que recorre más, dura más; lo chico es rápido | Un botón y una hoja con el mismo tiempo |
| Solo `transform` y `opacity`; el color, en estados | Anima `height`, `top`, sombras grandes y desenfoques mientras se desplaza |
| Se puede interrumpir: un segundo clic manda | Hay que esperar a que termine para poder tocar |
| Corre una vez y se queda quieta | Late, flota o deriva para siempre |
| Quieta, dice lo mismo | Quieta, se queda en blanco o a medio camino |

## El presupuesto (llénalo antes de escribir CSS)

```
Disparador:                    <clic en «Guardar» | llegada a la pantalla | cambio de sede>
Protagonista:                  <qué pieza cuenta la historia>          entra a los 0 ms, dura <≤ 480> ms
Acompañantes:                  <N piezas>  desfase <18–70> ms, tope de índice <8>, cada una ≤ <260–480> ms
Cifras / trazos:               <cuáles>    empiezan cuando su pieza ya está a la vista (no antes)
El control principal se usa a: <≤ 500> ms
Todo quieto a:                 <≤ 1 200> ms   (= demora de la última + su duración)
Salida:                        <220 ms con --ease-salida, todo junto, sin cascada>
```

La cuenta de una cascada: `fin = inicio + desfase × min(índice, tope) + duración`. Con 40 + 18 × 7 + 260 = 426 ms, la cascada de `<Modal>` cumple
`lib/movimiento-tiempos.test.ts` (último campo < 500 ms). Con 80 + 70 × 12 + 850 = 1 770 ms, `.anim-sube` en el historial de Vender no
(propuesta 3 de la skill).

## Recetas

### 1. Llegada a una pantalla rica (la de Las vitrinas, Rendimiento, Estados financieros)
- Bloques: `opacity 0 → 1` y `translateY(10px) → 0`, `--t-hoja`, `--ease-cayla`, desfase 40 ms, tope 8, `backwards`.
- Dentro de cada bloque, su dato se arma **después** de que el bloque se asienta: barra que crece (`scaleX` con `transform-origin: left`), cifra que
  rueda (`<CifraAnimada>`), trazo que se dibuja (`stroke-dashoffset` en un SVG chico; es pintura, así que solo en piezas chicas).
- Una luz que cruza una placa, una vez, en `--t-momento`, como `cayla-brillo`.
- Lo que sigue al mouse (brillo, filo, inclinación < 1,5°) no se mueve solo, no se monta quieto (`prefiereQuieto()`) y vive en `@media (hover: hover)`.
- Quieto: todo en su lugar final, con sus cifras finales.

### 2. Guardar con un logro (el sello de Insignias, la etiqueta de la campaña)
- El botón ya responde solo (`.mov-boton`, la onda en el punto del clic, `<Boton cargando>` con su hilo, que es señal).
- Al responder la base, el visto se dibuja (`check-trazo`) o el sello se estampa: `scale(1.06) → 1` con `opacity`, **sin rebote** (el sobrepaso es una
  sola subida que se asienta con `--ease-cayla`, no un ida y vuelta).
- El aviso de éxito sale después del loader (ADR-0149), nunca encima.
- Quieto: el visto ya dibujado y el texto «Guardado».

### 3. Algo viaja a otro lugar (el vuelo de la prenda a «Tu compra», la foto que cruza)
- Mide antes y después y anima la diferencia con `transform`: `Flip` de `lib/motion-gsap.ts`, o Web Animations con la caja medida.
- El arco es para lo que viaja solo, sin la mano de la persona (Chang y Ungar); lo que arrastra la persona sigue al dedo 1:1.
- 520 a 680 ms según la distancia (el vuelo de Apunte de compras) y el destino se ilumina una vez al llegar.
- Quieto: el elemento aparece en su destino y el destino se marca (color), sin viaje.

### 4. Una fila entra o se va de una lista
- Entra: `opacity` y `translateY(-4px) → 0` en `--t-cambio`; la fila nueva puede respirar en verde una vez (`data-recien`, color, 1,4 s).
- Se va: `opacity` en 220 ms; las de abajo suben con FLIP, todas juntas (mismo tiempo y curva).
- Nunca re-animar toda la tabla al buscar o filtrar: solo lo que entra de verdad (las filas con `key` estable no se re-montan).

### 5. Un dato cambia porque la persona lo pidió (otra sede, otro mes)
- La cifra rueda del valor viejo al nuevo (`<CifraAnimada>`, 700 ms hoy); las barras se transforman, no se re-arman desde cero.
- Cerca de 1 s solo si hay que seguir qué subió y qué bajó (`/graficos`, Heer y Robertson). Nunca en un refresco automático.

### 6. Una señal que necesita bucle (urgente, «mira aquí», espera)
- Un solo bucle por pantalla, chico (un punto, un halo), lento (≥ 1,6 s por vuelta) y que se detiene cuando la condición se va.
- Si es espera: `data-senal` (o la lista de `movimiento.css`) para que siga quieto.
- Si no es espera: su fila en ADR-0136, o no existe.

## Lo que nunca va, aunque Felipe pida «full animaciones»

- En lo de cientos de veces por turno: el hover de una fila, el tecleo, el buscador, el combo, cambiar de pestaña, la grilla de Vender.
- En lo que dispara una tecla: atajos, Enter, flechas, Escape.
- Rebote (salvo la gota de ADR-0422), paralaje ligado al scroll, zoom grande, giros de pantalla, «scroll-jacking».
- Un movimiento que tape o retrase el dato que la persona vino a leer.
- `transition: all`, animar `height` o `top`, `backdrop-filter` en lo que se desplaza (ADR-0623).

## La prueba de una excepción (modelo: `apps/web/lib/vitrinas-movimiento.test.ts`)

Cada excepción nueva trae `lib/<pieza>-movimiento.test.ts`, que lee su CSS y comprueba:
1. sin `infinite` ni `animation-iteration-count` (o solo el bucle con nombre);
2. sin `cubic-bezier`, `linear(`, `spring` ni `bounce` propios: toda declaración usa `var(--ease-cayla)` (o `--ease-salida` al salir);
3. cada `animation` dura ≤ 1 200 ms;
4. un bloque `@media (prefers-reduced-motion: reduce)` con `animation: none !important` y `transition: none !important`;
5. el JavaScript de la pieza pregunta `prefiereQuieto()` (o `useQuieto()`);
6. los `:hover` viven en `@media (hover: hover)` (ver también `lib/hover-con-mouse.test.ts`);
7. sin hex ni `rgb()` (lo pide además `lib/tema-colores.test.ts`).
