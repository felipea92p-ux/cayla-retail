# 14 · Lo que cambia en ADR-0400 después de la ronda de 36

**Fecha:** 2026-10-16 · **Fuente:** las respuestas de Felipe (`13-respuestas-de-felipe.md`, 10 llamadas, 35 de las 36 del banco más 5 de seguimiento; P-12 diferida) contra las decisiones
de ADR-0400 (leído en la rama `claude/production-module-redesign-136cca`). **Esto resume lo que Felipe contestó y qué decisión toca; no diseña nada.** Cada fila dice qué de
ADR-0400 se mantiene, se matiza o se reabre. La actualización del ADR y su construcción esperan el OK de Felipe.

## Qué cambia, decisión por decisión

| ADR-0400 | Qué dijo Felipe | Efecto |
|---|---|---|
| **d.1** · la orden es la única entidad; avance por fase, no por bulto ni por operaria | P-07 sueldo mensual · P-08 todo en el sistema · P-11 anota solo la encargada · P-12 diferida | **Se mantiene.** El sistema pasa a ser el único registro (no «el papel alcanza»). El dato por persona no paga nada, así que no hace falta. |
| **d.2** · fases Corte · Costura · Acabado, más Bordado, Estampado y Lavandería opcionales | P-13 y N-1: cada orden = **Ploteo · Corte · Costura · Ojales y botones · Limpiar hilos y revisar · Planchado · Etiquetar y embolsar**; el modelo (una vez) = **Patronaje y Muestreo**; **bordado, estampado y lavado apagados por ahora**, ampliable | **REABRE.** Cambia la lista de fases y su orden. El orden de «revisar» y «planchar» es supuesto mío. |
| **d.3** · una fase entera tiene un solo «quién», decidido al abrir | P-16: dos órdenes para partir un modelo | **Se mantiene.** |
| **d.4** · Salida y Vuelta, guía como texto, segundas no entran al stock | P-01 la tela la pone CAYLA (la manda cortada) · P-02 guía como comentario breve, lo formal después · P-03 el Taller está declarado ante SUNAT · P-06 falla chica «se arregla y cuenta» · P-06b la arregla el Taller | **Se mantiene la Salida y la Vuelta; se matiza «segundas».** Una falla chica se arregla y cuenta como buena. **La guía como texto sigue, con el riesgo legal ya informado y asumido por Felipe** (SUNAT pide guía antes de mover mercadería); la lista del contador sigue abierta. |
| **d.5** · tarifa por prenda + mínimo + fijo; el aviso de mínimo no bloquea | P-36 solo un aviso · P-15 sin adelantos · P-14 mezcla de papeles · P-17 sin factura: seguir y marcar · P-18 cobrar por escrito | **Se mantiene.** Suma: el papel puede ser factura, boleta, recibo o nada y se marca; **pendiente: una rúbrica o contrato simple para los servicios** (P-18). |
| **d.6** · la tela se compra por metros; el consumo se escribe en el modelo y lo medido lo corrige | P-19 **también punto, por kilo** · N-2 Audaces en metros y se convierte a kilos (gramaje y ancho) · P-20 Audaces da un número por marcada · P-21 lo medido manda desde **3 órdenes cerradas** · P-23 la tela se revisa y mide, sin reposo · P-24 el tono nunca fue problema | **REABRE dos veces.** (1) Hay que prever kilos para el punto y su conversión; ADR-0400 la había descartado. (2) «Lo medido gana» pasa de la primera orden a la tercera. |
| **d.7** · avance «Terminé N de M»; solo las buenas avanzan; cortar de más hasta 10 % | P-22 y N-3: hasta **3 prendas por talla y color** · P-04 una fase corta la cierra «la encargada, con motivo» · P-25 arreglan muchas, pierden pocas · P-26 quien termina declara «buena» · P-27 el lote pasa al stock una sola vez | **REABRE el 10 %.** El tope es en prendas, no en porcentaje (hay que alinearlo con el tope de cierre de ADR-0415). Una fase puede cerrar corta con motivo. «Menos de 3 %» (R-31) no sirve como medida. |
| **d.8** a **d.10** · cabecera, alcance y pantallas | — | Sin cambios. |
| **Supuesto** · la fecha de entrega promete la salida del Taller | P-33 «sale del Taller» · P-09 de 10 a 20 días (estimación) · P-10 courier o carga | **Se confirma.** El plazo sigue sin medirse. |
| **Costo** (D-31 y d.5) | P-31 fuera del costo de la prenda, **con cifra aparte por mes** · P-32 el cierre muestra costo, metros y buenas | **Reabre D-31 en parte:** el costo real ya no «se pega a la prenda»; se mide aparte, sin anotar horas. El contador debe decir cómo cierra el costo de ventas. |

## Cosas nuevas que no estaban en ADR-0400

- **Cada orden guarda si fue reposición o novedad y a qué tienda va** (P-34).
- **Marca «urgente» con fecha** (P-35).
- **Cambiar una orden ya empezada, con motivo** (P-29): hoy no existe ninguna función de edición.
- **Anular con tela ya cortada pregunta qué se hace** con lo cortado (P-05): toca `anular_produccion` (stock y dinero).
- **Anotar quién aprobó la muestra** antes de un modelo nuevo en cantidad (P-28).
- **Señal de atraso del servicio** (P-30: la mitad llega a tiempo y completa).
- **Papel «sin factura»** marcado en el costo de un servicio (P-17).

## Lo que queda abierto

1. **Contador:** guía de remisión, cómo cierra el costo de ventas con la planilla del Taller, detracción, el gasto sin factura y si un descuento por tela se lee como venta (`04` §8, 26 preguntas).
2. **Rúbrica o contrato simple** para los servicios (tolerancia de faltantes y defectos, quién responde, cómo se descuenta): un borrador puede escribirse; lo revisa el contador o un abogado.
3. **Dirección del Taller** (la dio Felipe en la sesión; va en `ubicaciones` al construir y no en archivos versionados).
4. **Cómo se anota hoy** en el Taller, el reporte real de Audaces y la última orden con fechas: siguen en el paquete de evidencia (`10`); varias cifras (plazo, pérdidas, atrasos) son estimaciones suyas, sin medir.
5. **Quién recibe la caja:** Felipe eligió «quien esté de turno»; sin responsable fijo una diferencia no tiene dueño (P-10b).
6. **P-12** (quién ve el dato por persona): diferida, no aplica con sueldo mensual.

## Lo que esto toca de lo ya construido

El rediseño de ADR-0400 **ya está en producción en su base** (las 8 migraciones, pegadas el 2026-10-16) y su web está en la rama del rediseño, sin PR. Tres de estos cambios tocan lo ya pegado:
la lista de fases (`produccion_fases.clave`, que hoy admite corte, costura, acabado, bordado, estampado y lavandería), el consumo y la compra en kilos (`insumos`, `producto_consumos`) y el tope de
corte de más. **Un cambio de esquema en producción lo confirma Felipe antes**, y lo que toca stock o dinero (cerrar, anular, el tope de cierre) lleva su OK aparte.
