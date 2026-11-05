# Formidable · Configuración   (`/configuracion`)

- **Fecha / SHA:** 2026-11-02 · base d4ec6298f   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver:** ¿Qué ajusto una vez y todo el ERP lo lee?   · **Protagonista:** el dinero y las metas de cada tienda
- **Veredicto en una línea:** la ciega encontró dónde hacer las 4 tareas al primer intento, pero «Tiendas y caja» sigue siendo muy larga y casi todo se entiende leyendo.

Alcance: las 8 pestañas de la pantalla. Sus hojas no se revisaron. Las notas son criterio del revisor sobre la evidencia, no una medición.

## Notas (0–10)
| Eje | Antes | Después | Evidencia |
|---|---|---|---|
| 1 Sin manual | 7 | 7 | [Observado] ciega sobre capturas: 4 de 4 tareas en el lugar correcto, con dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | 5 | [Observado] «Es larguísima. No supe qué bloque mirar primero» (Tiendas, 7 bloques). No se arregló: ver lista aparte |
| 3 Simplicidad profunda | 6 | 7 | [Medido] la regla fecha > mes > semana no estaba en pantalla; ahora el pie de «Lo normal» lo dice |
| 4 Lenguaje de tienda | 5 | 6 | [Observado] «Mínimo de caja» se confundía con el cajón; se aclaró. Siguen «Cuenta contable», «respaldo de WhatsApp» |
| 5 Contenido primero | 7 | 7 | [Opinión] los números mandan; el marco se retira |
| 6 Lo difícil, a un toque | 7 | 7 | [Medido] la guía interactiva lo cubre: 39 pasos |
| 7 Perdonar antes que preguntar | 6 | 6 | [Medido] se guarda solo y, si falla, vuelve al valor anterior con su aviso; sin Deshacer |
| 8 Quitar antes de agregar | 5 | 5 | [Opinión] no se quitó nada; se sumaron tres frases |
| 9 De punta a punta | 4 | 7 | [Medido] los textos de programador y el mensaje crudo de la base pasan a lenguaje de tienda; las 8 pestañas caben |
| **Leyes (promedio)** | **5.8** | **6.3** | |
| **Oficio visual** | | **6** | [Medido] 4 o 5 de 8 comprobaciones fallan a 1440, sin cambio. Sobre todo el marco común y la pieza `<Interruptor>` (38×22) |

## Los 3 cambios aplicados
1. **Todo el ancho, con sentido.** Antes: columna de 64 rem y pestañas cortadas. Después: 1108 px a 1440 y 1588 a 1920; WhatsApp y «Pregúntale a CAYLA» van lado a lado desde 1280 px; el combo de «Finanzas cuenta» se topa en vez de estirarse; CLAURE usa 4 columnas desde 1700 px; «Gastos con CLAURE» pasa a «Reparto CLAURE» para que las 8 pestañas quepan a 1440. Ley 9. Se verificó con capturas a 1920, 1440, 1280 y 375, sin desborde. Presentación.
2. **Textos que aclaran.** «Caja» pasa a «Caja de toda CAYLA», con lo que cuenta y lo que no ([Medido] `fn_flujo_disponible`: sin tarjeta de crédito ni la parte de CLAURE); el único «Guardar» dice por qué existe; el pie de «Lo normal» dice qué manda; «gana sobre» pasa a «manda sobre». Leyes 3 y 4. No cambia ninguna regla.
3. **Errores en lenguaje de tienda.** «Falta pegar en la base la migración…» y el mensaje crudo de la base pasan a `<Aviso>`: qué pasó y qué hacer; el detalle va al registro del servidor. Ley 9. **No se provocó el error en el navegador:** solo se comprobaron tipos y pruebas.

## Veredictos del escéptico
- **Confirmados:** el «Guardar» sin explicar; los textos de programador.
- **Matizados:** «no sabría si quedó guardado» (todas las pestañas avisan; el visto en la celda solo está en Tiendas y caja; la duda salió en parte de mirar capturas); «Mínimo de caja» (es de toda la empresa, con dos exclusiones); cuál meta manda (la regla existe, la pantalla no la enunciaba entera).

## Lo que sobra (ley 8)
- «Cuenta contable» (104, 105, 101) en la lista de cuentas: no ayuda a decidir a quien la mira. Se propone esconderla; sigue en la hoja de cada cuenta si hace falta. Sin aplicar.

## Lo que no pediste y importa más
«Tiendas y caja» junta 7 cosas distintas en una sola página de casi 3800 px. Partirla, o darle un índice, es lo que más ayudaría. Cambia cómo se navega, así que es decisión de Felipe.

## Lista aparte (no se ejecutó)
- ~~Partir o indexar «Tiendas y caja».~~ Felipe la partió el 2026-11-04 en «Metas» y «Empresa y tiendas» (ADR-0195, actualización de ese día).
- El visto en la celda también en Caja y avisos, Presupuesto, Impuestos, Reparto CLAURE y los combos de Cuentas.
- A 1024 px varias tablas se recorren de lado (8 en Tiendas). Ya pasaba antes.
- `<Interruptor>` (38×22) y el enlace «sin meta» (20 px) bajo los 24 px de mínimo.
- `/focus`: la pantalla sigue `PENDIENTE` en `lib/guia-de-foco-pantallas.ts`; qué cuenta como «falta» lo decide Felipe.
- Los campos del kit dentro de sus hojas siguen en hueso.

## Prueba ciega
| 5 s | Primer intento | Dudas | Palabras no entendidas |
|---|---|---|---|
| «Donde se ponen los números de cada tienda» · «No supe qué bloque mirar primero» | 4 de 4 tareas en el lugar correcto | ¿«Meta mes por mes» manda sobre lo de arriba? · ¿«Guardar» significa que lo demás no se guarda solo? · ¿«Sin cuenta» es que falta elegir? | «Claure», «Eres admin», «Por depositar», «respaldo de WhatsApp» |

Agente (Sonnet) sobre capturas estáticas de la versión anterior a los textos: no escribió ni vio un aviso, y no se repitió después de los cambios.

## Antes de decir «listo»
- **Concurrencia:** sin cambio; no toca ningún guardado. Sin probar.
- **Caída externa:** si una lectura falla, sale el `<Aviso>` de error con qué hacer. Sin provocar en el navegador.
- **Persona sin contexto:** agente ciego, sí; colaboradora real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-02 | d4ec6298f | 6.3 | 6 | 3 de 3 |

## Ronda 2026-11-04: Empresa y tiendas, «Las vitrinas»

Ciega (Sonnet, sobre capturas, sin mouse): **4 de 10**. Encontró sola lo que le falta a Lima y entendió el aro, el dial y el líquido. Se perdió en lo que sigue, y un sistema de capturas no muestra el
efecto al pasar el mouse, así que la primera nota hay que confirmarla con una colaboradora real. Oficio [Medido]: a 375, 1024, 1280 y 1920 px sin desborde y ningún valor cortado.

Tres cambios propuestos; Felipe dio el OK y están aplicados:

1. **Que se note que se toca:** un lápiz en cada dato que se cambia y «Poner» en lo que falta. La ciega no supo cómo cambiar nada.
2. **Decir qué falta en palabras:** bajo el nombre de la sede, «Falta WhatsApp y hora de cierre». El aro solo cuenta.
3. **Nombres y dibujos que se expliquen:** «Preguntar» y su estrella no dicen que es el asistente, «Carga inicial» y su candado no dicen de qué, y el QR no dice WhatsApp. El candado de la empresa debería decir «Solo se lee» a la vista.

Segunda ciega, otra lectora (Sonnet, sobre capturas con datos de ejemplo, sin mouse): **5 de 10**. Ya sabe qué falta en cada sede, cómo cambiar un dato y que la empresa solo se lee. Después de esa ronda, «Cierra» pasó a «Hora de cierre» y las series dicen «Boleta B001». Lo que sigue dudoso: qué cuenta el aro, qué significan «Cerró» y «Hasta» en la carga, qué hace el asistente y qué pasa al llegar a su tope. Falta probarla con una colaboradora real.

## Metas, Dinero, Gastos e Impuestos (2026-11-05)

Ciega (Sonnet, sobre capturas, sin mouse y sin abrir el «?», con pocos datos de prueba): **Metas 5 · Dinero 4 · Gastos 6 · Impuestos 4**. Oficio [Medido]: sin desborde a 375, 1024, 1280, 1440 y 1920 px, y de 1,1 a 2,9 pantallas de alto.
Lo que más la frenó es la jerga, no el dibujo: no le quedó claro qué hacer primero en Metas ni en Dinero, y en Impuestos sí, porque la pantalla empieza por lo que falta confirmar. Hay que confirmarlo con una persona real: estas pantallas son del líder, no de una colaboradora de sede.

Tres cambios propuestos; Felipe dio el OK y están aplicados:

1. **Palabras de tienda en Dinero:** «Máquinas y planilla», «Quienes cobran en BCP», «Finanzas cuenta desde: Sin corte» y «Poner» no se entendieron.
2. **Un primer paso a la vista:** en Metas y Dinero, una línea que diga por dónde empezar cuando falta algo (por ejemplo, «Falta elegir la cuenta de Yape, Plin y Transferencia»).
3. **Lo que explica un término de SUNAT, junto al término:** UIT, Pago a cuenta y Movilidad llevan una línea corta en vez de depender del «?», y «+ Nueva tasa» y sus hermanos suben de tamaño.

Segunda ciega, otra lectora (Sonnet, sobre capturas, sin mouse): **Metas 6 · Dinero 6 · Gastos 7 · Impuestos 3**. Ahora dice sola por dónde empezar en Metas y Dinero. Son lectoras distintas, así que el cambio de nota orienta pero no mide. Impuestos no mejoró: sabe qué le pide la pantalla, pero no qué está confirmando («Sola no la toco»). Es la pestaña del líder con su contador; falta ver si con una persona real pasa lo mismo.
Queda sin entender: «CLAURE» y «Por depositar» (un nombre propio y el nombre de una cuenta) y que las cápsulas de los días de Metas se escriben.

Impuestos, una vuelta más (Felipe pidió arreglarla antes del PR): la pantalla le pide al contador en vez de a la persona («Pregúntale a tu contador si esto está bien», «Copiar la lista», «Está bien»), cada dato se lee en palabras de tienda y lo medido en UIT dice sus soles, el límite abre con un veredicto («Vas bien: todavía no llegas al aviso») y lo que casi nunca se toca quedó plegado. Tercera ciega, otra lectora, y esta vez en el papel de dueña con contador: **6 de 10**. Ya sabe qué hacer y qué dice «Está bien»; siguen sin entenderse UIT, IGV y Movilidad, y no sabe qué pasa al cambiar un número. El papel cambió, así que esa nota no se compara directo con el 3.
