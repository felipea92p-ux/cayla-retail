# Spike visual · Caja con comparativa (2026-10-02)

> **Estado: solo diseño, sin decidir.** Nada de esto está en el ERP. Datos **inventados** (Tienda TRU, viernes 2 oct, 15:40).
> Parte de `CajaAbiertaPanel.tsx` tal como está en `main`; respeta ADR-0226 (cajón visible para todas, accesos y tarjetas elegibles,
> que en esta maqueta no se redibujan) y los tokens de `globals.css` (sin rojo decorativo: ▲ verde, ▼ ámbar).

Abrir `caja-comparativa.html` en el navegador. La barra negra cambia **Diseño** (A, B, C) y **Vista** (escritorio / celular 375 px).
La barra «¿Contra qué te comparas?» es parte del diseño: **Ayer / Semana pasada** y **Hasta las 15:40 / Día completo**.

## Versión 2 (2026-10-02): más impacto, mismo sistema de movimiento
Pidió Felipe que sorprenda. Lo nuevo, todo **respuesta a una acción** (ADR-0136: `--ease-cayla`, sin rebote, sin bucles, se apaga con `prefers-reduced-motion`):
- **Tarjeta héroe oscura** con el veredicto en una frase («Vas 42 % por encima de ayer») y el **anillo** mide cuánto del **total de ayer** (día completo) ya vendiste: **sin metas diarias, la meta es igualar ayer** (decisión de Felipe 2026-10-02). El anillo sigue la referencia elegida: con «Semana pasada» mide contra el día completo del viernes 25. Si pasa del 100 %, el chip dice cuánto superó.
- **Cifras que cuentan** desde el valor anterior (no desde cero) al cambiar de referencia.
- **Línea del día que se revela** de izquierda a derecha, con la **brecha sombreada** (verde arriba, ámbar abajo) y un **cursor** que lee cada hora.
- **«Dónde ganas y dónde pierdes»:** barras de diferencia hora por hora, con la mejor y la peor hora en palabras.
- **Botón «＋ Simular una venta»** (solo del spike): todo se recalcula y anima, como pasaría con el sondeo en vivo de la caja.
- Entrada en cascada de las tarjetas (como la regla de modales) solo al abrir o cambiar de diseño, no en cada clic.
- Tokens a decidir: sobre la tarjeta oscura el ▲▼ usa tintes claros (`#e9c46a`, `#b9d3aa`) que no existen en `globals.css`; harían falta como tokens «sobre tinta».

## Los tres diseños
- **A · Tablero con referencia** — el orden de hoy, cada cifra con su ▲▼. El cambio más chico.
- **B · Hoy contra su referencia** — tabla alineada hoy · referencia · cambio + una frase en palabras. El más explicativo.
- **C · Con la semana a la vista** — tira de 8 días arriba; tocar un día lo hace la referencia. El que da más contexto.

## Decisiones de diseño (ya tomadas en la maqueta, por revisar)
1. **Comparar «a la misma hora» es el predeterminado.** Un día entero contra medio día siempre pierde y asusta sin razón. «Día completo» queda como opción.
2. **Ayer ≠ el mismo día de la semana pasada**, y cada uno responde otra cosa: ayer dice «¿voy mejor que el último turno?»; la semana pasada dice «¿es un buen viernes?». Por eso son dos botones y no uno.
3. **El efectivo del cajón NO se compara**: es un estado (lo que hay ahora), no un resultado del día. Compararlo con ayer no significa nada.
4. **Gastos y devoluciones comparan en tono informativo (pizarra), no verde/ámbar:** gastar menos no es «mejor» ni más es «peor».
5. **Cuadre del cierre** de la referencia aparece en la tabla (cuadró / faltó S/ 2.50): lo único que dice cómo cerró aquel día.

## Qué pediría la versión real a la base (no existe todavía)
- Una RPC de **solo lectura** `fn_comparativa_caja(p_ubicacion_id, p_dia)` que devuelva, para un día de Lima, el total y la serie por hora
  (efectivo/otros), tickets y reparto por método — sobre **todas** las cajas de la sede ese día, sin ventas anuladas (misma regla de
  `fn_resumen_caja`, ADR-0191). Prefijo `fn_`: ya cuenta como lectura para el loader global (`espera-reglas.ts`).
- Hoy solo existe `getVentasMismaHoraSemanaAnterior` (`lib/caja.ts`), que da un número suelto y no se usa en la pantalla.
- Cuenta de cálculo: 3 sedes × 2 días × 12 horas ≈ 72 puntos por lectura. Sin índice ni caché que justificar.

## Preguntas abiertas para Felipe
1. ¿Cuál diseño (A, B o C), o una mezcla?
2. ¿Dejamos elegir **cualquier día** como referencia, o solo ayer / semana pasada?
3. ¿La comparación la ve **toda** la tienda o solo quien gestiona la caja (como el total del cajón)? Hoy el spike la muestra a todas.
4. ¿Se suma un tercer botón «promedio de los últimos 4 mismos días»? Es la referencia más justa para un día raro.

## Consecuencia de quitar las metas diarias
La pantalla real hoy tiene la tarjeta «Meta de hoy» (`CajaAbiertaPanel.tsx`, `getParametrosCaja`, ADR-0195 F1: meta por tienda y campaña, y de ahí el fondo del cierre). Esta maqueta la reemplaza por «igualar ayer». **El fondo de cierre por campaña sigue vivo** (es del cierre, no de la meta); lo que se retira es solo la meta de venta. Queda por decidir si Configuración ▸ Tiendas y caja deja de pedirla y qué pasa con la proyección «al ritmo de hoy cierras en…».

## Siempre contra el día completo (Felipe 2026-10-02)
Se quitó el filtro «Hasta las 15:40 / Día completo»: la referencia es siempre el **día completo**. Consecuencias ya reflejadas en la maqueta:
- El veredicto deja de decir «por encima/por debajo» como titular (hoy aún no termina y casi siempre estaría «abajo»): ahora dice **«Llevas 55 % de lo que vendió ayer»** y cuánto falta para igualarlo. La comparación justa a la misma hora queda como dato secundario en la frase de abajo.
- La línea del día muestra el día entero de la referencia; hoy termina en «ahora». Los ▲▼ de tarjetas y métodos comparan contra el día completo, así que durante el día salen ▼: se leen como «aún no llegas», no como «vas mal».
- «Dónde ganas y dónde pierdes» sigue comparando hora contra la misma hora (una hora no es un día).

## Siempre contra ayer (Felipe 2026-10-02)
Se quitó «Semana pasada»: la referencia es **solo ayer, día completo**. La barra de comparación quedó como una etiqueta informativa («Comparando con ayer · jue 1 · día completo»). En el diseño C la tira de 8 días ya no elige referencia: solo ubica el día y marca ayer. Esto cierra las preguntas 2 y 4 de arriba (cualquier día / promedio de 4 mismos días): quedan fuera. Y la lectura `fn_comparativa_caja` solo necesita **un día** (ayer), no una ventana de días.

## Cómo compara «Dónde ganas y dónde pierdes» la hora en curso
Las horas ya cerradas se comparan enteras (9:00–9:59 hoy contra 9:00–9:59 de ayer). La **hora en curso** se compara **solo por los minutos transcurridos**: si son las 15:10 y hoy se vendió S/ 50 en la 15–16h, se compara contra los primeros 10 minutos de la 15–16h de ayer (10/60 de lo que vendió esa hora ≈ S/ 42 si fueron S/ 250), no contra los S/ 250 completos. Es un **prorrateo lineal**: supone que ayer se vendió parejo dentro de la hora; con poco volumen puede errar unos soles. Por eso la barra va rayada y la etiqueta dice «en curso». En la versión real, si `fn_comparativa_caja` trae las ventas de ayer con su minuto, se puede comparar exacto en vez de prorratear.

## Todo en tiempo real, cada minuto (Felipe 2026-10-02)
La pantalla tiene un reloj interno: cada minuto recalcula el titular, el anillo, la línea (el punto de hoy avanza con la hora y la línea de «ahora» se mueve), la hora en curso de «Dónde ganas y dónde pierdes» (se prorratea con los minutos reales) y la cabecera («En vivo · 15:41»). Al cruzar una hora exacta, la hora que termina se cierra y nace una barra rayada nueva. Las cifras **cuentan desde el valor anterior** y no se repiten las animaciones de entrada en cada minuto (solo cuando se abre la pantalla o se cambia de diseño). El selector «Tiempo» de la barra negra es del spike: En vivo (1 min = 1 min), Rápido (1 s = 1 min, para demos) y Pausa.
**En el ERP real:** el reloj por sí solo no basta. Una venta nueva ya llega por `useCajaEnVivo` (sondeo cada pocos segundos, ADR-0226), y el tic por minuto lo da el mismo patrón de `useAhora(60_000)` que ya usa `CajaAbiertaPanel`. La lectura de ayer no cambia durante el día: se pide **una vez** al abrir la pantalla, no cada minuto.

## El botón «Cerrar caja» tiene que notarse (Felipe 2026-10-02)
No es un recordatorio (eso es la Isla, ADR-0305): es que **el propio botón sea notorio**, todo el día.
- **Cabecera:** botón grande, con candado y en rojo de acento (`--rojo`, texto blanco), con «Abierta hace 6 h 38 min» debajo. Deja de ser un botón oscuro igual a cualquier otro.
- **Barra fija abajo** (se queda pegada al borde mientras se recorre la pantalla): «Cuando termines tu turno, cierra la caja» + el mismo botón. En celular, el botón ocupa todo el ancho.
- **Sube de color con la hora de cierre** de la tienda (`ubicaciones.hora_cierre`): neutra antes, **tinta** desde la hora («Es hora de cerrar la caja»), **rojo profundo** a los 30 min («La caja sigue abierta · 31 min tarde»). El botón da **un** destello al cambiar de nivel (sin bucles, ADR-0136). Mismos cortes que la Isla (30 y 60 min); aquí se dejó el de 30 para el rojo.
- En el spike: botón «⏩ Ir a las 19:44» para ver el paso de nivel (la hora de cierre de la maqueta es la de TRU, 19:45).
- **Rojo de acento:** el sistema pide máximo 2 rojos por pantalla. Esta pantalla ya usa el filo de «Tienda TRU ·» y el «ahora» del gráfico; si el botón es el protagonista, conviene quitar el «ahora» rojo (pasarlo a tinta) para no pasar de 2.
- **Quién lo ve:** solo quien puede cerrar (`gestionarCaja`). A los demás, la barra dice «Avisa a un líder para cerrar la caja», sin botón.
