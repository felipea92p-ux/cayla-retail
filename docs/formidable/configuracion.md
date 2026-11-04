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
