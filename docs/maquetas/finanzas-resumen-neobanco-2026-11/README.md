# Finanzas ▸ Resumen · tres caminos de neobanco (maqueta 2026-11-07)

Pedido de Felipe (2026-11-07): inspirarse en los sitios de finanzas más vanguardistas (Revolut y otros), encontrar **la forma más
sencilla de mostrar la información para que cualquiera la entienda** y armar 3 maquetas, empezando por el Resumen de Finanzas.

- **La maqueta:** `index.html`, un solo archivo. Se abre en el navegador; abajo se elige el camino (**A · B · C**, también `#a`, `#b`, `#c`)
  y el tema. La barra de arriba cambia la sede (Todas, Trujillo, Arequipa, Lima) y las cifras de los tres caminos cambian con ella.
- **Las cifras son de ejemplo** y salen de un solo modelo (`modelo(sede)` en el archivo): lo vendido, lo que te deja, la plata y los pagos
  cuadran entre sí en los tres caminos y en cada sede. Hoy en la maqueta: sábado 7 de noviembre de 2026.
- **No se tocó** código de la app, migraciones ni producción.

## Lo que ya estaba decidido y no se reabre

De Estados financieros (ADR-0611, Felipe 2026-11-05): neobanco; la cifra y una frase que la interpreta como protagonista; muy poca
información a la vista; cifras en Inter; claro y oscuro al mismo nivel. Los tres caminos lo respetan y solo cambian **cómo se ordena la
información**. Colores solo de los tokens; movimiento una vez, sin rebote ni bucle (ADR-0136).

**El fondo y el vidrio son los que hoy están en producción** (corregido el 2026-11-08, a pedido de Felipe). La tela de Hilos de ADR-0611 se
retiró el 2026-11-06 («Sin tela de Hilos ni lentes», actualización de ese ADR), así que la maqueta ya no la usa. En su lugar va lo de `main`:
- **Fondo:** el crema del ERP con **la Aurora** detrás: tres nubes muy tenues y quietas (roja arriba a la derecha, pizarra a la derecha y ámbar
  abajo), que entran una vez con un fundido. Son los mismos tamaños, lugares y opacidades de `app/estilos/vidrio/marco.css` (12 %, 12 % y 10 %
  en claro; 10 % en oscuro).
- **Lo que se desplaza** (las tarjetas, los bloques y las tablas) va en **vidrio claro, sin desenfoque** (`--vidrio-claro-*` de
  `vidrio/recetas.css`, ADR-0623: desenfocar lo que corre con el scroll bajaba de 53 a 32 cuadros por segundo).
- **Lo que flota quieto** (el dock de la maqueta y la franja pegada de C en escritorio) lleva el vidrio del marco **con** desenfoque.
- **Las piezas** salen de las recetas Serena: los segmentos son un pozo con la gota que marca, el botón principal es ahumado (pasa a rojo
  profundo al pasar el mouse), el secundario es una gota y el globito del gráfico es tinta al 84 %, como la cabecera de una tabla.
- **Se quitó** el filo de luz que giraba al entrar y el brillo que seguía al mouse: venían de la tela de Hilos.

## El problema de hoy

El Resumen construido (`components/finanzas/ResumenFinanzas.tsx` en `main`) apila unos 9 bloques: las tres respuestas, lo vendido por sede
con la confianza, la caja de dos semanas, «Hoy te toca», a dónde va la plata, el equilibrio del mes, los cambios del mes, la inversión en
mercadería y sus ajustes. Cada uno está bien hecho, pero juntos piden leer mucho antes de saber «¿cómo vamos?».

## Lo que se aprendió de los referentes

Investigación con fuentes públicas (centros de ayuda y blogs de cada empresa). No cargaron la ayuda de Mercury, Revolut y Qonto, ni el blog de
Nubank, así que de esos casos solo queda lo que se pudo leer.

| Patrón | Quién lo hace | Dónde entra |
|---|---|---|
| Una cifra con su comparación en una frase | Stripe, Copilot, Revolut | A, y la frase de B y C |
| Comparar con **el mismo punto** del mes pasado, no con el mes completo | Copilot («Net this month»), Square (mismo día de la semana pasada) | Los tres |
| La línea real contra una punteada de referencia, que se recorre con el dedo | Copilot, Robinhood | A |
| El saldo que mira hacia adelante: «tienes X, vienen Y, te quedan Z» | Monzo (Balance in Trends) | B |
| Dónde está la plata: lista corta de cuentas y cajas | Mercury | B |
| Lo que viene, en una tira de fechas | Copilot (Upcoming), Monzo | B (tira), C (hilo) |
| Sueldos aparte del resto del gasto | Puzzle (son el 55–75 % del gasto) | A («Gastaste»), B («De cada S/ 100») |
| Como mucho 3 avisos, y solo con datos suficientes | Shopify (máx. 3 al día, mínimo 10 pedidos por semana) | «Hoy te toca» en los tres; «Lo que pasó» en C |
| El color solo para estados, todo lo demás monocromo | Stripe, Robinhood | Los tres |

**Lo que no se copió:** jerga de startup («burn», «runway»), gráficos de trader, colores mezclados para montos que hay que cuadrar
(Apple Card) y pantallas que arma cada usuario (Digits). Tampoco la página de una sola columna larga: es lo que los comerciantes le criticaron
al inicio nuevo de Shopify. Por eso C deja las cuatro cifras fijas arriba.

## Los tres caminos

| | Camino | La idea | Referente | Su riesgo |
|---|---|---|---|---|
| **A** | **Un número** | Tres preguntas: ¿cuánto te deja?, ¿cuánto tienes? y ¿qué pagas pronto? Cada una tiene su cifra enorme, su frase y su gráfico. Al recorrer el gráfico con el dedo, la cifra y la frase cuentan ese día. Debajo van lo vendido, lo gastado y lo que es de SUNAT, «Hoy te toca» y cada tienda. | Robinhood, Stripe, Copilot | Tapa dónde está la plata. Si la ganancia engaña (stock comprado, IGV por pagar), la frase engaña con mucha seguridad. |
| **B** | **Lo que tienes de verdad** | La cifra grande es **lo libre para usar**: lo que tienes, menos lo que ya tiene dueño (los pagos de 14 días, el IGV que vas juntando y la plata de Claudia). Una barra lo parte en esos bolsillos y cada uno se abre. Al lado, dónde está la plata. Debajo, las dos semanas día por día y, aparte, lo que te deja el mes. | Monzo, Mercury, Simple («Safe-to-Spend») | Hay que separar bien plata y ganancia. La pantalla lo dice con todas las letras, pero es un concepto nuevo para el equipo. |
| **C** | **Pasó y viene** | Las cuatro cifras fijas arriba. La semana se cuenta en una frase con sus cifras tocables: al tocar una, se abre su gráfico. Debajo, un hilo de tiempo con hoy, lo que viene y lo que pasó (máx. 3, con un mínimo de volumen). Al costado, los meses que cerraron, apilados como tarjetas. | Copilot, Shopify, Digits | Depende de datos limpios y de reglas de aviso bien calibradas. Con poco volumen, los avisos son ruido. |

**Recomendación:** **B** como base, la que mejor responde las seis preguntas (vendimos, gastamos, ganamos, cuánta plata hay y dónde, qué viene,
impuestos) sin depender de avisos generados. Arriba iría el recorrido con el dedo de A y abajo, el hilo de lo que viene de C. Felipe elige
mirando (ADR-0358).

## Lo que pide una decisión de Felipe antes de construir

Son reglas de dinero, así que esperan el OK de Felipe:

1. **«Libre para usar» (B) es una regla nueva:** lo que tienes − los pagos de los próximos 14 días (Por pagar) − el IGV del mes que vas juntando
   − la plata de CLAURE. No cuenta lo que se vaya a vender: es la lectura prudente. Hoy el Resumen no calcula nada así.
2. **La proyección de caja de la maqueta** suma lo que entra por ventas (con IGV, menos lo que se repone) y resta los pagos. Es un remedo: la real
   es `fn_flujo_caja_proyeccion` (Dinero ▸ Flujo), y es la que se usaría.
3. **«Lo que pasó» (C)** necesita reglas de aviso con umbral: un cambio de ±3 % o más, y solo en una tienda que vendió S/ 3,000 o más. Los
   números los decide Felipe.

## Qué se verificó

- En el navegador integrado, a 1440 px y a 375 px, en claro y en oscuro. La consola salió sin errores y no hay scroll lateral a 375 px (en los
  tres caminos, el ancho del documento es igual al de la ventana).
- El recorrido con el mouse en el gráfico de A cambia la cifra y la frase según el día.
- Tras el cambio de fondo (2026-11-08), otra vez a 1440 y 375 px, en claro y oscuro: sin lienzos de hilos, tres nubes de Aurora, las tarjetas
  sin `backdrop-filter`, la franja de C con desenfoque, la consola sin errores y el ancho del documento igual al de la ventana en A, B y C. A
  375 px, la cifra dentro del tramo «libre» de la barra se cortaba («S/ 12,5»): ahora se calla cuando el tramo mide menos de 104 px, y la
  dice la fila de abajo.
- **No se verificó:** el contraste WCAG medido de cada texto sobre el vidrio (pendiente: `tema:auditar` cuando se construya), el rendimiento
  del `backdrop-filter` en el Mac mini de la tienda ni la prueba con colaboradoras reales.
