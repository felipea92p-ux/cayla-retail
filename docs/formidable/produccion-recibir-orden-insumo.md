# Formidable · Producción ▸ Recibir ▸ la hoja «Recibir OI-…» (y la orden después)   (`/produccion/recibir`)

- **Fecha / SHA:** 2026-10-14 · fase 7 parte 2 (`claude/purchase-order-phase7-2-9b0c82`, PR #1098) · **Dispositivo que manda:** escritorio
  (el Mac mini del Taller); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿Qué llegó de esta orden, y qué ya no va a llegar?» · **Protagonista:** los insumos que entran al Taller
- **Veredicto en una línea:** «Se recibe al primer intento, pero después la orden no dice la verdad completa: no muestra lo que llegó fuera de ella
  (el hilo) y su chip queda en “Llegó en parte” para siempre aunque Recibir diga que no queda nada.»

> Medido en el banco propio con Chromium sin pantalla (el panel del navegador estaba oculto). Prueba ciega: un agente (Sonnet) que solo vio
> las capturas, con datos inventados. Escéptico: un agente (Opus) que leyó el código y las capturas para refutar cada hallazgo.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s dijo bien qué era; terminó al primer intento (12 pasos), con 15 dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] la hoja tiene una acción principal |
| 3 Simplicidad profunda | 6 | [Observado] el pie cuenta lotes («Se abrirán 3 lotes y quedará anotado 1 insumo…») y no cantidades; «1 insumo» eran 20 botones |
| 4 Lenguaje de tienda | 7 | [Observado] «El resto seguirá pendiente» aparece antes de marcar la casilla y le sonó contradictorio; «nos debe… a este costo» no dice cuánto. «Lote» es palabra del Taller (escéptico) |
| 5 Contenido primero | 8 | [Observado] cada insumo con «quedan N», «pediste», «facturado» y la etiqueta «No estaba en la orden · F777-0001» |
| 6 Lo difícil, a un toque | 6 | [Medido, /chaos] el porqué de un número que no vale vive en un `title`: solo con el mouse encima (la hoja hermana del papel sí lo escribe) |
| 7 Perdonar antes que preguntar | 7 | [Observado] dudó cómo corregir un número mal escrito después de registrar (no hay camino: es stock) |
| 8 Quitar antes de agregar | 8 | sin sobrantes claros |
| 9 De punta a punta | 4 | [Observado + Medido] la orden no muestra lo facturado ni lo recibido de la línea fuera de ella (la base no lo devuelve), y su chip contradice a Recibir |
| **Leyes (promedio)** | **6,8** | **la ley 9 en 4** |
| **Oficio visual** | **8** | [Medido] de la hoja: 0 problemas de contraste, huecos en la escala, una sola acción principal; lo demás es del cromo o de piezas del sistema |

## Los 3 cambios de mayor impacto (Felipe dio el OK a los tres el 2026-10-14: hechos en `1fb64b6bd` y `2ff6bf4de`, decisión 88 del ADR-0362)
1. **Antes →** después de recibir, la orden muestra «Llegó al Taller» solo en sus líneas pedidas: los 3 conos de hilo que trajo la factura no aparecen
   (la base, `fn_orden_insumo`, no devuelve lo facturado ni lo recibido de una línea fuera de la orden), y el chip queda «Llegó en parte» aunque Recibir
   diga «Ya no queda nada por recibir» (no descuenta lo anotado como «no va a llegar»). Al revés: con lo pedido completo y el hilo pendiente, diría «Llegó
   todo». **Después →** la orden lista también lo que llegó fuera de ella («Hilo algodón · no estaba en la orden · F777-0001 · Llegó al Taller: 3 de 3
   conos») y su chip dice lo mismo que Recibir: «Recibida» cuando no queda nada por recibir (con «Nos debe» al lado si algo no llegó) y «Llegó en parte»
   mientras quede algo, también fuera de la orden. **Ley:** 9 y 1. **Se verifica:** la ciega encuentra los 3 conos en la orden; una prueba recorre los
   cuatro casos del chip. **Esfuerzo:** M (la lectura de la orden, en la migración de la actividad 3, todavía sin pegar). **Decide:** Felipe (stock).
2. **Antes →** el pie dice «Se abrirán 3 lotes y quedará anotado 1 insumo que no va a llegar», y una caja en blanco recibe TODO lo que queda (el número gris
   es lo que entra). **Después →** el pie dice las cantidades: «Entran al Taller: 10 metros de lino, 80 botones y 3 conos de hilo. No llegarán 20 botones:
   el proveedor nos debe S/ 4.00.» **Ley:** 3 y 4 (se ve, justo antes del botón, también lo que entra por una caja en blanco). **Esfuerzo:** S.
   **Decide:** Felipe (stock).
3. **Antes →** bajo la casilla, «El resto seguirá pendiente» aparece antes de marcarla; marcada, «Queda anotado… como lo que el proveedor nos debe, a este
   costo»; y si un número no vale, el porqué solo con el mouse encima. **Después →** sin marcar: «Si no van a llegar, márcalo; si no, los 20 quedan
   pendientes para otra entrega»; marcada: «El proveedor nos debe 20 botones: S/ 4.00»; y un número que no vale lo dice debajo de la hoja, como la hoja
   hermana del papel (`PieGuia conFrase`: «Solo quedan 50 por recibir»). **Ley:** 4, 6 y 9. **Esfuerzo:** S. **Decide:** Felipe.

## Lo que sobra (ley 8)
Nada que esconder en la hoja.

## Lo que no pediste y importa más
«En blanco es todo lo que queda»: quien deja una caja vacía queriendo decir «no llegó nada» abre un lote de lo que no llegó. La ciega lo entendió porque
leyó la frase de arriba; con apuro, nadie la lee. El cambio 2 lo deja a la vista justo encima del botón; si eso no alcanza, la regla misma (provisional,
ADR-0362) es tuya.

## Escéptico (Opus, 2026-10-14)
| Hallazgo | Veredicto | Cómo queda |
|---|---|---|
| B1 el pie no dice qué entra | MATIZADO | «Lote» es palabra del Taller (su subtítulo y «Código de lote»); la frase de arriba, «quedan N» y el número gris ya lo dicen. Queda: «1 insumo» ambiguo, el pie sin cantidades y el riesgo de «en blanco = todo» |
| B2 la orden no muestra lo de fuera de la orden | CONFIRMADO, más grave | No es solo la web: `fn_orden_insumo` devuelve facturación y recepción solo de las líneas pedidas. Arreglarlo pide la migración |
| B3 los textos de la casilla | CONFIRMADO | El primero viene palabra por palabra de la recepción del papel |
| B4 el porqué solo con el mouse | CONFIRMADO (no es nuevo) | Es el g4 de /chaos; un retroceso frente a la hoja hermana, que lo escribe (`conFrase`, ya en 5 hojas) |
| B5 «Registrar comprobante» negro en una orden completa | MATIZADO | Daño bajo: la pantalla abre avisando que ya tiene todo su papel; queda como ajuste cosmético |
| B6 11 botones principales en Recibir | REFUTADO | Son los «Recibir» de la lista detrás del velo, medidos con la hoja abierta; un botón por tarjeta ya era el patrón de «Facturas sin orden» |
| (se le escapó a la revisión) El chip de la orden contradice a Recibir | NUEVO, grave | Va al cambio 1 |

## Lista aparte (no se ejecuta)
- En la orden ya completa, «Registrar comprobante» sigue negro: bajarlo a secundario cuando el papel está completo.
- En la orden, nada explica por qué la factura F777-0001 suma S/ 149.86 en una orden de S/ 115.00 (son los 3 conos y el IGV): se resuelve en parte con el cambio 1.
- «Código de lote» opcional: no supo qué escribir (si queda vacío, el lote se llama como la orden).
- /chaos (g4): tras un corte, corregir y reintentar no ofrece «Recargar». **Hecho (2026-10-15)** con la misma regla que el papel
  (`esEnvioConOtrosDatos`, con su prueba); visto en el navegador en el papel, no en esta hoja.
- El porqué de un número que no vale queda escrito sobre los botones, fuera del pie fijo: con la hoja arriba se ve la caja marcada y el botón
  apagado, y el porqué al bajar. Es de la pieza (`PieGuia conFrase`, igual en sus cinco hermanas), no de esta hoja: llevarlo al pie fijo sería para todas.

## Prueba ciega (2026-10-14, Sonnet, sobre capturas del banco)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «donde se anota lo que llega al Taller de los pedidos a proveedores; sigue tocar “Recibir” de la orden»: bien |
| Primer intento | sí: 10 m de lino y 3 conos (en blanco), 80 botones y «el resto no va a llegar · Faltó mercadería» |
| Pasos | 12 (mínimo 6): abrió la lista de motivos para mirar, bajó antes de registrar y abrió la orden para comprobar |
| Dudas | 15; las de fondo: los «10» y «3» grises, «El resto seguirá pendiente» antes de marcar, «nos debe… a este costo», «1 insumo», el hilo que no aparece en la orden |
| Palabras no entendidas | 9: «lote», «A medio recibir», «fuera de la orden», «nos debe», «Llegó en papel», «Papel completo»… |
| Errores evitables | ninguno al registrar; después no pudo comprobar el hilo |
| ¿Terminó? | sí: lino 10, botones 80 y 20 anotados como «no llegó» (S/ 4.00); el hilo, deducido por «3 lotes», no visto |

## Antes de decir «listo»
- Concurrencia: [Medido, /chaos] la misma persona en dos aparatos recibe todo lo que queda: la segunda espera y lee «no queda»; una ráfaga de diez sesiones sobre 5 m deja 5 lotes de 1 m.
- Caída externa: [Medido, /chaos] red cortada y respuesta perdida: el reintento igual devuelve la misma recepción.
- Persona sin contexto: ciega ✓ (arriba) · real: sin probar (y conviene con alguien del Taller que no haya hecho la orden).

## Después (2026-10-15, `1fb64b6bd` y `2ff6bf4de`, en el banco, 1440 px)
| Lo medido | Antes | Después |
|---|---|---|
| La orden, después de recibir | sin los 3 conos de hilo que trajo la factura; el chip, «Llegó en parte» para siempre | [Medido] «No estaba en la orden · lo trajo el papel»: «Hilo algodón · 3 conos — Llegó al Taller: 3 de 3 conos — F777-0001 · S/ 12.00»; los chips, «Papel completo · Recibida · Nos debe» |
| El pie de la hoja | «Se abrirán 3 lotes y quedará anotado 1 insumo…» | [Medido] «Entran al Taller 10 metros de Lino crudo, 80 unidades de Botón nácar y 3 conos de Hilo algodón. No llegarán 20 unidades de Botón nácar: el proveedor nos debe S/ 4.00.» |
| Bajo la casilla, sin marcar | «El resto seguirá pendiente» (antes de marcar) | [Medido] «Si no va a llegar, márcalo. Si no lo marcas, lo que falta (20 unidades) sigue pendiente para otra entrega.» |
| Bajo la casilla, marcada | «Queda anotado… a este costo» | [Medido] «El proveedor nos debe 20 unidades: S/ 4.00, al costo de arriba.» |
| Un número que no vale (101 de 100) | el porqué, solo en un `title` | [Medido] la caja se marca, el botón se apaga y el porqué queda escrito sobre los botones (con la hoja arriba, se lee al bajar) |

**Notas después:** ley 9, de 4 a 8 (la orden dice lo mismo que Recibir); ley 3, de 6 a 8 (el pie con cantidades); ley 4, de 7 a 8 (los textos de la
casilla); ley 6, de 6 a 7 (el porqué escrito, pero al pie). Las demás no cambian: la ciega no se repitió. **Leyes: 7,7 (provisional).** Oficio: 8, sin
volver a medir. Capturas: el banco (`formi/despues/r01`–`r03`), fuera del repo.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-14 | `a08cd59c2` | 6,8 | 8 | — (los 3 esperan el OK de Felipe) |
| 2026-10-15 | `2ff6bf4de` | 7,7 (provisional) | 8 (sin volver a medir) | los 3 (la orden con lo de fuera y su chip, el pie con cantidades, los textos y el porqué) |
