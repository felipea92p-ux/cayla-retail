---
name: movimiento
description: Diseña y audita el movimiento de una pieza del ERP al milímetro —qué se mueve, con qué tiempo (`--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento`), con qué curva, en qué orden y cómo se ve quieta— y enseña a hacer «full animaciones» que se sientan de clase mundial: con propósito, coreografía, desfases con tope, salida más corta que la entrada, solo transform y opacity, interrumpibles, una vez y sin bucle. Dice también dónde no van nunca (lo que se usa cientos de veces, el teclado, las filas). Respeta ADR-0136 y ADR-0625 y mide en el navegador con `document.getAnimations()`. Úsala cuando Felipe diga «full animaciones», «anímalo», «que se mueva bonito», «se siente lenta», «movimiento», cuando una hoja o una pantalla nueva vaya a moverse, o cuando /milimetro pida la sección Movimiento de una ficha. Con `auditar <ruta>` solo mide.
---

**Una animación rica se gana su lugar explicando algo (de dónde vino, a dónde fue, qué cambió, que se logró) y se retira de todo lo que se repite. Bien hecha, se siente cara porque nunca te hace esperar.**

Movimiento de: $ARGUMENTS   (una pieza, una hoja, una ruta como `/inventario`, `auditar <ruta>`, o sin argumento = lo que estás construyendo)

## Candados

1. **El repo manda sobre la skill.** Los tiempos son `--t-resp` 100 ms, `--t-cambio` 160 ms, `--t-hoja` 260 ms y `--t-momento` 480 ms; las curvas,
   `--ease-cayla` y `--ease-salida` (`apps/web/app/globals.css`). La regla es ADR-0136 con su lista de excepciones, y ADR-0625 dice que todo arranca
   quieto. Las señales de espera llevan `data-senal` o van en la lista de `app/estilos/movimiento.css`. Lo que anima desde JavaScript pregunta
   `prefiereQuieto()` o `useQuieto()`, nunca `matchMedia`. GSAP solo entra por `lib/motion-gsap.ts` (`caylaEase`, `Flip`). **La skill nunca introduce
   un hex, una curva propia, un tiempo suelto de 100 ms o más en una pieza del sistema, ni una librería nueva** (lo vigila `lib/movimiento-tiempos.test.ts`).
2. **«Full animaciones» no abre una excepción por sí solo.** Cada excepción la nombra Felipe, mirando, y entra a la lista de ADR-0136 y de `CLAUDE.md`
   («Movimiento y modales») con su alcance y su prueba `lib/<pieza>-movimiento.test.ts`. La skill diseña la coreografía y la **propone**; no la agrega.
3. **Cuando la investigación mejora una regla del repo,** la skill no la cambia sola. La escribe como propuesta (regla actual → qué hacen los mejores
   → propuesta → riesgo → cómo se mide) y se decide con Felipe mirando, como en `/unificar`. Una regla de varios módulos espera su OK.
4. **Tres niveles, siempre etiquetados:** `[Evidencia]` (estudio revisado o experimento), `[Norma]` (WCAG, especificación web, guía oficial) y
   `[Práctica]` (sistemas de diseño, NN/g, design engineers). **Casi todos los milisegundos son `[Práctica]`**: ningún estudio fija «260 ms» como óptimo.
5. **Se mide, no se opina.** Cada número trae su forma de verificarlo: `referencia/medir.js` con `javascript_tool`, un `grep` o una prueba del repo.
6. **No duplica.** `/better-ui` (pulido: se consulta, no manda) · `/unificar` (el movimiento es parte de la pieza: migrar nunca pierde una animación) ·
   `/formidable` (¿se entiende?) · `/focus` (el hilo de la guía tiene su movimiento en ADR-0284) · `/graficos` (qué cuenta un gráfico al animarse; aquí
   solo los tiempos) · `/skill-optimizacion-ui-ux-perf` (lentitud de carga) · `/milimetro` (arma la ficha y te llama).

## Las reglas al milímetro

Fuentes cortas entre paréntesis; el detalle, en `referencia/fuentes.md`. Recetas de coreografía rica: `referencia/coreografia.md`.

**A. Cuándo se mueve algo**
1. **Se mueve solo si explica:** de dónde sale, qué causó qué, qué cambió, o un momento que pasa una vez. Si no explica nada, queda quieto →
   ADR-0136 («nunca decorativo») → `[Evidencia]` (Chang y Ungar 1993; Tversky et al. 2002: el valor está en el cambio espacial) + `[Práctica]` (Vercel).
2. **La frecuencia pone el techo.** Lo que se ve cientos de veces por turno (hover y selección de fila, buscar, teclear, una pestaña, un combo,
   todo Vender) lleva solo color en `--t-resp`, o nada. Lo de unas pocas veces al día (entrar a una pantalla, guardar, un logro) puede ser rico →
   `--t-momento` («una vez y por algo») → `[Práctica]` (Apple HIG, Carbon «unobtrusive», Kowalski, Freiberg).
3. **Lo que dispara una tecla no se desplaza.** Con un atajo, Enter, las flechas o Escape, el cambio llega en el siguiente cuadro; como mucho, un
   fundido de `--t-resp` → no existe en el repo: ver propuesta 6 → `[Práctica]` (Kowalski).
4. **Lo que se mueve solo más de 5 s junto a otro contenido se puede pausar.** En todo el ERP lo pausa el botón «Animaciones» (ADR-0625) → `[Norma]` WCAG 2.2.2 (A).
5. **Nunca más de 3 destellos por segundo** → `anim-destello` (420 ms, una vez) y `anim-tope` (dos respiros en 2,6 s) pasan → `[Norma]` WCAG 2.3.1 (A).

**B. Tiempo**
6. **El primer cuadro llega en menos de 100 ms;** el final puede tardar más. Por eso una entrada con `--ease-cayla`, que se mueve mucho al principio,
   se siente rápida → `--t-resp` → `[Evidencia]` (Miller 1968; Card et al. 1991) + `[Norma]` (RAIL; INP bueno ≤ 200 ms).
7. **Los tiempos salen de la tabla de abajo, nunca un número suelto.** En la interfaz de trabajo ninguna pieza pasa de `--t-hoja`; `--t-momento` es
   para lo que ocurre una vez. Dentro de una excepción, cada pieza dura ≤ 1,2 s, como exigen `lib/vitrinas-movimiento.test.ts` y
   `lib/config-vistas-movimiento.test.ts` → `[Práctica]` (NN/g: desde 500 ms «se arrastra»; Primer: ≤ 300, nunca > 500).
8. **A más distancia o más área, más tiempo.** Botón 100 a 160 ms; lista que abre, `--t-cambio`; hoja de escritorio (18 px y escala), `--t-hoja`;
   hoja del celular, que cruza la pantalla, 460 ms entra y 300 ms sale (`Modal.tsx`); cajón lateral, 420/260 → el repo ya lo cumple →
   `[Práctica]` (Material: «duration should increase as the area/traversal… increases»; Fluent 2).
9. **La salida dura entre el 70 y el 85 % de la entrada, con `--ease-salida`.** Hoja: 260 → 220 ms (`MS_SALIDA`); celular: 460 → 300; cajón: 420 → 260
   → `[Práctica]` (Atlassian 250/200 y 150/100; Primer 300/200; NN/g).
10. **Un dato que cambia porque la persona lo pidió** (otro mes, otra sede) puede tomarse cerca de 1 s para que se siga qué subió y qué bajó.
    Nunca en un refresco automático → lo decide `/graficos` → `[Evidencia]` (Heer y Robertson 2007: animaciones de 1,25 y 2 s; meta de ~1 s).

**C. Curva y física**
11. **Entrar, asentarse o cambiar en su sitio:** `--ease-cayla` (`cubic-bezier(0.32, 0.72, 0.24, 1)`). **Salir:** `--ease-salida` (`0.4, 0, 1, 1`).
    **`linear`** solo para lo continuo (el hilo que barre, el giro de espera). Nunca `ease` por defecto ni una curva propia. En GSAP, `caylaEase`
    → `[Práctica]` (Primer, Polaris, Fluent: lineal solo en spinners).
12. **Sin rebote.** La única pieza con un rebote es la gota de «Hay una versión nueva» (ADR-0422), uno solo → `[Práctica]` (Apple: bounce 0 por
    defecto, > 0,4 exagerado; Material 3: los efectos nunca sobrepasan).
13. **Resortes:** el repo no tiene token. Lo que se arrastra con el dedo (la hoja del celular, ADR-0479) sale con la velocidad del dedo y sin rebote
    → ver propuesta 5 → `[Práctica]` (WWDC18 «Designing Fluid Interfaces»; WWDC23 «Animate with springs»). No hay estudio que compare resortes con Bézier.

**D. Qué propiedades y cuánto cuestan**
14. **Solo `transform` (translate, scale, rotate), `opacity` y, en estados, color.** Nunca se anima `top`, `left`, `width`, `height` ni `margin`, y nunca
    `transition: all` ni `transition-all` (hay 2: propuesta 7). `filter` y `backdrop-filter` solo en lo que flota quieto (ADR-0623) → `[Práctica]`
    (web.dev: con `top/left` se perdió ~50 % de los cuadros, con `transform` ~1 %; Vercel).
15. **Lo que cambia de layout** (una fila que se reordena, una tarjeta que crece) se hace con FLIP: `Flip` de `lib/motion-gsap.ts` → `[Práctica]` (Lewis; Khourshid).
16. **`will-change` solo después de medir un tirón,** y nombrando la propiedad → `[Práctica]` (web.dev).
17. **Cada cuadro en menos de 16 ms** (60 Hz), medido en el equipo de la sede, no en el tuyo → `[Norma]` RAIL.

**E. Coreografía de lo rico**
18. **Un protagonista por momento.** Lo que importa llega primero o con más recorrido; lo secundario después y más corto →
    `[Evidencia]` (Heer y Robertson: lo escenificado ganó en la mayoría de los casos y perdió en uno).
19. **Lo que va junto se mueve igual:** misma dirección, tiempo y curva (el destino común de la Gestalt) → `[Evidencia]` (Heer y Robertson).
20. **Desfase con tope.** Una hoja: 18 ms por pieza, desde 40 ms, hasta 8 pasos (`--k` llega a 7 en `.cascada-modal`), y su último campo se puede
    tocar antes de 500 ms (`lib/movimiento-tiempos.test.ts`). Lo rico: ≤ 70 ms por pieza y el índice topado (`Math.min(i, N)`), con la cascada
    entera ≤ 1 s → `[Práctica]` (Fluent 2: desfases cortos; NN/g).
21. **El presupuesto de una coreografía:** del clic a todo quieto ≤ 1,2 s; el control que la persona va a usar se puede tocar antes de 500 ms
    aunque lo demás siga, y nada bloquea el clic mientras se anima → convención del repo (las pruebas de las excepciones) + `[Práctica]` (Apple: «don't make people wait»).
22. **Sale de donde tocaste:** `transform-origin` en el disparador, como el globo (`.anim-globo`, `top left`) y la onda de `.mov-boton` en el punto del clic
    → `[Práctica]` (Kowalski; Freiberg; Apple HIG).
23. **Interrumpible.** Lo que va y vuelve (hover, abierto/cerrado, elegido) es `transition`, que se da vuelta a mitad de camino; `@keyframes` solo
    para lo que corre una vez. Un segundo clic nunca espera a que termine el primero → `[Práctica]` (Apple HIG «let people cancel motion»; Vercel).
24. **Una vez y sin bucle.** Un bucle solo vale si es una señal (espera, «mira aquí», algo urgente) y tiene su fila en ADR-0136 → `[Evidencia]`
    (Abrams y Christ 2003: el movimiento que empieza capta la atención; el que sigue no).
25. **Una entrada usa `backwards`, no `both`:** al terminar, la pieza vuelve a su estilo, el hover puede moverla y Chrome no la toma como contenedor
    de las listas `fixed` (ADR-0136, nota del 2026-09-22) → regla del repo.

**F. Quieto y movimiento reducido**
26. **La versión quieta conserva la información.** Lo que la animación contaba (de dónde vino, qué cambió, que se guardó) queda dicho en el estado
    final con color, ícono o texto. Toda pantalla se revisa también quieta (ADR-0625) → `[Norma]` (WCAG 2.3.3; Apple: «make motion optional»).
27. **Si el aparato pide menos movimiento, eso gana siempre** (`quedaQuieto`). Lo que sigue al puntero ni se monta quieto. Una señal de espera nueva
    lleva `data-senal` → `lib/movimiento-reglas.test.ts`.
28. **Reducir es sustituir, no borrar:** el desplazamiento se cambia por un fundido de la misma duración (para WCAG, la opacidad no es movimiento).
    Hoy el repo pone todo en 0,01 ms → ver propuesta 2 → `[Norma]` (WCAG 2.3.3, técnica C39) + `[Práctica]` (Val Head 2020).

### Qué token usar para qué (valores reales del repo)

| Token | Valor | Para qué | Ya lo usa |
|---|---|---|---|
| `--t-resp` | 100 ms | color, presión, foco; todo lo frecuente | `.mov-boton` (color, `scale` al presionar), salida de `anim-revelar` |
| `--t-cambio` | 160 ms | algo cambia de lugar o de estado: la píldora, la casilla, la lista que abre, el velo | `anim-velo`, `anim-revelar`, el `translate` del botón |
| `--t-hoja` | 260 ms | una hoja entra; cada pieza de su cascada; la onda del clic | `anim-modal-entra`, `cascada-modal`, `[data-onda]` |
| (sin token) | 220 ms | una hoja sale | `MS_SALIDA` en `Modal.tsx`, `.anim-modal-sale`, `.anim-salida` (propuesta 8) |
| `--t-momento` | 480 ms | una vez y por algo: la luz del botón, un logro, un visto | `cayla-brillo` de `.mov-boton` |
| (excepción) | ≤ 1,2 s por pieza | solo lo que está en la lista de ADR-0136 | `lib/vitrinas-movimiento.test.ts` |
| `--ease-cayla` | `cubic-bezier(0.32, 0.72, 0.24, 1)` | entrar, asentarse, cambiar en su sitio | casi todo |
| `--ease-salida` | `cubic-bezier(0.4, 0, 1, 1)` | salir | `.anim-modal-sale`, `.cajon-lateral` |
| `linear` | — | solo lo continuo | `cayla-hilo-barrido`, el giro de espera |
| `caylaEase` | = `--ease-cayla` | lo que anima GSAP | `lib/motion-gsap.ts` |

## Cómo se usa

**Modo diseñar** (sale la sección Movimiento de la ficha):
1. **¿Qué explica?** Si no explica nada, la sección dice «quieta» y termina.
2. **¿Cuántas veces al día se ve?** Alta, media o rara. Eso fija el techo (regla 2).
3. **¿Qué la dispara?** Clic, tecla, llegada a la pantalla, un dato o nada (automática). Si es una tecla, sin desplazamiento.
4. **Pieza por pieza:** propiedad, desde → hasta, token, curva, desfase, origen y qué pasa si la interrumpen. Primero lo que cuenta el protagonista.
5. **Suma el presupuesto:** del disparador a todo quieto, y cuándo se puede usar el control principal.
6. **Escribe la versión quieta:** qué se ve en su lugar final y qué información conserva.
7. **¿Es una excepción?** Si pasa de `--t-momento`, lleva más de una coreografía o un bucle: di qué fila de ADR-0136 la cubre. Si ninguna, va a
   «Propuestas» para Felipe, con su prueba modelo (`lib/vitrinas-movimiento.test.ts`: sin `infinite`, solo `--ease-cayla`, ≤ 1,2 s,
   apagada con «reducir movimiento», `prefiereQuieto()`). Antes de escribir CSS, mira `referencia/coreografia.md`.

**Modo auditar** (solo local, contra `localhost`):
1. **Enciende las animaciones** en la pestaña (ADR-0625 arranca quieto), con `javascript_tool`:
   `localStorage.setItem("cayla-movimiento","vivo"); document.documentElement.setAttribute("data-movimiento","vivo")`.
2. **Mide:** pega `referencia/medir.js` con `javascript_tool`. Devuelve una foto de lo que se mueve ahora. Para lo que dura poco, llama a
   `__mov.grabar(4000)`, dispara la acción (abre la hoja, guarda) y lee `__mov.informe()`: cada animación con su duración, curva, propiedades y vueltas,
   y marcadas las que no son transform/opacity/color, pasan de 500 ms, no usan la curva del sistema o están en bucle sin ser señal. Agrega el
   presupuesto total (del primer cuadro al último) y lo que se movió por JavaScript (GSAP no aparece en `getAnimations()`).
3. **Busca en el código** (desde `apps/web`):
   - 500 ms o más: `grep -rnoE "\b([5-9][0-9]{2}|[0-9]{4})ms\b|\b[0-9]+(\.[0-9]+)?s (var\(--ease|linear|ease)" <tus archivos .css>`
   - bucles: `grep -rn "infinite" app --include=*.css`
   - prohibidos: `grep -rnE "transition: all|transition-all" app components` y `grep -rn 'matchMedia("(prefers-reduced-motion' components app`
4. **Corre las pruebas:** `pnpm --filter web test -- movimiento` (tiempos, reglas y las de cada excepción) y `pnpm --filter web test -- hover-con-mouse`.
5. **Míralo quieto:** pon `data-movimiento="quieto"` y repite. Nada se queda invisible ni a medio camino, y lo que contaba la animación sigue dicho.
6. **Míralo con «reducir movimiento»** (Rendering ▸ Emulate `prefers-reduced-motion`, o el ajuste del sistema): `__mov.foto()` no debe traer
   desplazamientos, solo señales de espera (técnica C39).
7. **Míralo lento:** el panel Animations de DevTools al 10 % muestra la coreografía cuadro a cuadro. Lo que no pudiste correr va como «No verificado».

## Tu sección de la ficha

```
## Movimiento   (de /movimiento)
Qué explica: <de dónde sale | qué causó | qué cambió | momento único>   ·   o «quieta: no explica nada»
Frecuencia: alta (cientos por turno) | media | rara   →   techo: solo color --t-resp | --t-hoja | --t-momento | excepción
Disparador: clic | tecla (sin desplazamiento) | llegada | dato pedido | automático (≤ 5 s o se pausa)
| Pieza | Propiedad | Desde → hasta | Duración | Curva | Desfase | Origen | Si la interrumpen |
|---|---|---|---|---|---|---|---|
| Hoja | transform, opacity | translateY 18px, scale .965 → reposo | --t-hoja | --ease-cayla | — | centro | Escape: sale en 220 ms |
| Campos | transform, opacity | translateY 10px → reposo | --t-hoja | --ease-cayla | 18 ms × k, desde 40 | — | — |
Salida: <propiedad, 220 ms (70–85 % de la entrada), --ease-salida>
Presupuesto: disparador → todo quieto en <N> ms (≤ 1 200) · control principal usable a los <M> ms (≤ 500)
Bucles: ninguno | <cuál> y su fila de ADR-0136 (o señal de espera con data-senal)
Quieto (ADR-0625) y reducido: <qué se ve en su lugar final> · conserva <qué información> · reducido: <fundido de --t-cambio | nada>
Excepción: no | sí, fila «…» de ADR-0136 | pedirla a Felipe con lib/<pieza>-movimiento.test.ts
Medido: medir.js → <N> animaciones, <M> marcadas, presupuesto <P> ms | No verificado: <qué>
```

## Propuestas de mejora al repo

Todas son **propuesta, espera a Felipe**. Formato: actual → los mejores → propuesta · riesgo · cómo se mide.

1. **Arrancar quieto sin mirar el sistema.** Actual: ADR-0625 deja todo quieto si no hay nada guardado, así que las «full animaciones» que Felipe
   eligió no las ve quien no encuentra el botón. Es una buena regla en tres cosas: el sistema que pide menos gana siempre, las señales de espera
   se salvan y 0,01 ms conserva `animationend`. Los mejores: Val Head pide un interruptor **que por defecto siga al sistema** (aunque también dice que
   `no-preference` no es consentimiento); Primer y Vercel respetan la preferencia. Propuesta: sin nada guardado, «ligero» (fundidos y respuestas
   ≤ `--t-hoja`), y lo rico con el botón encendido. Riesgo: ADR-0625 nació de equipos lentos (ADR-0623), aunque lo medido ahí fue el
   `backdrop-filter` y no las animaciones. Se mide: FPS en el Mac mini de una sede con «ligero» contra «quieto» (`medir.js` + Performance).
2. **Quieto y reducido deberían sustituir, no colapsar.** Actual: `movimiento.css` deja todo en 0,01 ms, y unas 200 reglas de
   `prefers-reduced-motion` ponen `animation: none` o 1 ms. Los mejores: WCAG 2.3.3 no cuenta la opacidad como movimiento; Val Head cambia
   transform por opacity con la misma duración; Motion (`reducedMotion="user"`) conserva opacidad y color. Propuesta: las hojas, avisos y listas
   leen su distancia y su escala inicial de variables (`--mov-distancia`, `--mov-escala`), que quieto y reducido ponen en 0 y 1, manteniendo un
   fundido de `--t-cambio`. Riesgo: toca piezas de `components/ui/` que Dynamic mira (contrato v4). Se mide: quieto, `medir.js` solo ve `opacity` ≤ 160 ms.
3. **Tiempos largos fuera de la lista de excepciones.** Actual: `.anim-sube` dura 850 ms con 70 ms × `--i` y la usan Vender
   (`PuntoDeVentaCatalogo`, `PuntoDeVentaTicket`) y el historial (`HistorialVentasLista`, `--i` hasta 12: lo último termina a ~1,8 s). También
   `.hilo-dibuja` 1,1 s, `.hilo-vertical` 1,8 s más 350 ms de espera, `.anim-entra` 420 ms y `.anim-entrada` 380 ms, en números sueltos. Los mejores: NN/g
   («desde 500 ms se arrastra»), Primer (nunca > 500), Kowalski (< 300). Para ser justos: corren una vez al llegar, que ADR-0128 permite.
   Propuesta: `.anim-sube` pasa a `--t-hoja` con 40 ms de desfase y tope de 8; los hilos del Atelier pasan a ≤ `--t-momento`, o entran a la lista
   si Felipe los quiere así. Riesgo: cambia el aire de Cambios y Devoluciones, así que Felipe lo elige mirando. Se mide: `medir.js` deja de marcar
   > 500 ms en `/vender`, y `lib/movimiento-tiempos.test.ts` suma esas clases.
4. **Bucles sin registro único.** Actual: hay unas 50 líneas con `infinite` en el CSS. Muchas son señales de espera; otras son decorativas y continuas:
   `cayla-onda-color 3.2s infinite` en cada tarjeta de Existencias (N aros a la vez en la grilla), `ia-deriva` 15 y 19 s, `rcc-deriva` 8 s,
   `recibir-camion` 10 s, `cmp-rota` 9 s. Para ser justos: todas las eligió Felipe, y el botón de ADR-0625 las pausa, así que se cumple WCAG 2.2.2. Los mejores:
   Abrams y Christ (el movimiento continuo no retiene la atención) y Carbon («si se nota seguido, quítalo»). Propuesta: `lib/bucles.test.ts`, con
   cada `infinite` atado a su fila de ADR-0136 o a `data-senal` y una deuda que solo baja; y la onda del color da 2 vueltas al verse y queda
   como un aro quieto. Riesgo: Felipe pidió esa onda «siempre y muy lento». Se mide: `__mov.foto()` en `/inventario` (Existencias) cuenta los bucles a la vez.
5. **Sin resortes ni velocidad del dedo.** Actual: solo hay Bézier, y GSAP con `Flip` existe. Los mejores: Apple (WWDC18 y 23) y Material 3
   usan resortes, sobre todo en gestos, y un resorte se da vuelta sin saltar. No hay estudio que lo pruebe y DTCG 2025.10 no tiene tipo «resorte».
   Propuesta: un solo `--ease-resorte` con `linear()` (resorte crítico, rebote 0, sacado del Linear easing generator y comparado en una maqueta),
   solo para soltar la hoja del celular (ADR-0479) y el cajón lateral. Riesgo: bajo, y el beneficio es poco en clics. Se mide: cerrar la hoja con
   el dedo e invertir a mitad, sin salto (Animations al 10 %).
6. **El teclado anima como el mouse.** Actual: no hay regla; una hoja abierta con una tecla hace su cascada igual. Los mejores: Kowalski y Freiberg
   («la animación depende de la frecuencia»; el teclado «se siente lento»). Propuesta: `<Modal>` sabe si lo abrió una tecla y, en ese caso, la
   hoja entra con fundido de `--t-resp` sin cascada. Riesgo: bajo. Se mide: abrir con teclado → `medir.js` sin `transform`.
7. **Dos `transition-all`.** Actual: `components/ui/campos.tsx:428` y `components/Ayuda.tsx:105`. Los mejores: Vercel («Never `transition: all`»).
   Propuesta: nombrar las propiedades con sus tokens y que `lib/movimiento-tiempos.test.ts` lo prohíba. Riesgo: ninguno. Se mide: el `grep` del modo auditar.
8. **La salida no tiene token.** Actual: 220 ms vive como número en `MS_SALIDA` (`Modal.tsx`), `.anim-modal-sale` y `.anim-salida`; 460/300 del celular,
   también. Los mejores: Primer y Atlassian nombran la salida como token compuesto (DTCG `transition`). Propuesta: `--t-salida: 220ms` y una prueba
   que cruce el número de `Modal.tsx` con el CSS. Riesgo: ninguno. Se mide: la prueba.
9. **Dinero que rueda en pantallas de decisión.** Actual: `CifraAnimada` rueda 700 ms (Finanzas, Comprobantes, Proformas, Resumen de sede). Es justo
   reconocer que rodar del valor viejo al nuevo enseña el cambio mejor que contar desde 0 (Willenskomer, «value change»). Los mejores: Kowalski
   («un gráfico de banco puede ir mejor sin animación»). Propuesta: rodar solo cuando la persona cambia la sede o el mes, no al llegar, y en ≤ `--t-momento`.
   Riesgo: Felipe la eligió mirando. Se mide: tiempo hasta el valor final con `__mov.grabar`.
10. **La luz del botón en cada hover.** Actual: todo `btn-cayla` cruza una luz de `--t-momento` al pasar el mouse (ADR-0358, ronda 3, elegida por
    Felipe). Los mejores: Atlassian anima solo el color de un botón y Apple pide no animar lo frecuente. Propuesta: la luz solo en `btn-primario`,
    no en los botones de fila ni en `BotonCompacto`. Riesgo: pierde algo de la sensación elegida. Se mide: pasar el mouse por una tabla y contar en `__mov.informe()`.
