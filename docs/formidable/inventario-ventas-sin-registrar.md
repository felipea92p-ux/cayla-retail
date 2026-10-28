# Formidable · Inventario ▸ Ventas sin registrar   (/inventario/por-regularizar)

- **Fecha / SHA:** 2026-10-07 · f5191c7f + la mesa «Puente» (ADR-0360) sin commit · **Dispositivo que manda:** escritorio (Mac mini); el celular se adapta
- **Pregunta que debería resolver:** «¿Qué prenda real era esta venta que caja anotó a mano?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende y se completa a la primera (8 pasos, 7 dudas), pero el botón y casi toda la mesa quedan bajo el pliegue y la rueda del mouse se atrapa en las columnas.»

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 (provisional) | [Observado] ciega: completó la tarea al primer intento, 8 pasos (4 que cambian algo), 7 dudas, 0 errores · real: sin probar (nunca pasa de 7 sin la pasada real) |
| 2 Una pregunta, una respuesta | 6 | [Observado] «¿Qué prenda es?» es la pregunta, pero hay 9 controles antes de la mesa (7 sin ser líder), y la acción principal vive en la columna del medio y queda bajo el pliegue |
| 3 Simplicidad profunda | 6 | [Observado] buenos veredictos («Se cobró S/ 10.00 menos que el oficial», «Libres: 15 → 14»), pero «coincide 3/3» sale tres veces en tres notaciones |
| 4 Lenguaje de tienda | 6 | [Observado] dudas de la ciega: «Sin unidades libres», «Admin», «La unión», «cola de arranque» |
| 5 Contenido primero | 6 | [Medido] la mesa empieza en y=572 de 900 (63,5 %); [Medido] **regresión**: el talón y «Lo que anotó caja» ya no muestran la talla y el color anotados (la lista anterior sí) |
| 6 Lo difícil, a un toque | 4 | [Código] los «porqué» (vencida, los 3 datos) viven en title (hover); la diferencia de precio de cada tarjeta es opacity 0 hasta hover/foco. Lo escondido es secundario: por eso 4 y no 3 |
| 7 Perdonar antes que preguntar | 6 | [Código] el resumen previo («Libres: 15 → 14») está; una regularizada no tiene «Corregir» (heredado, mueve stock: decide Felipe) |
| 8 Quitar antes de agregar | 5 | ver «Lo que sobra» |
| 9 De punta a punta | 6 | [Código] estados vacíos y errores bien; si falla la lectura del stock se degrada en silencio |
| **Leyes (promedio)** | **5,8** | |
| **Oficio visual** | **4 (provisional, rango 3–5)** | [Medido] fallan: contraste de un texto (3,43:1), texto propio bajo 12 px, jerarquía (muchos tamaños), alineación de 2–3 px, radios; faltan por medir: puntero grueso (44 px) y espaciado. El foco con Tab se ve en todo lo de la mesa [Observado] |

El chrome global (lateral, «Buscar… Ctrl K», «Salir», «Actividad», selector de sede, «Admin · queda a tu nombre») se reporta aparte y no cuenta.

## Los 3 cambios de mayor impacto (esperan el OK de Felipe; ninguno toca dinero, stock, permisos ni SUNAT)
1. **Que nada importante quede bajo el pliegue y que la rueda no se atrape** (leyes 2, 5, 9 · esfuerzo S + M · presentación).
   *Antes:* a 1440×900 la mesa arranca al 64 %, el botón «Regularizar» queda ~460 px más abajo y la rueda sobre las prendas se queda en la columna (1800 px de
   rueda movieron la columna 58 px y la página 0). *Después:* al elegir una prenda la mesa se lleva el puente a la vista; se quita `overscroll-behavior: contain`;
   y (la parte M, a decisión tuya) «Identificar con sugerencias», «Cerrar la cola», el orden y «Todas las colaboradoras» pasan a un menú «Más» para que la mesa
   empiece por encima de ~300 px. *Verifica:* `top` de `.vsr-mesa` y del botón a 1440×900 y 1440×800; la misma rueda mueve la página.
2. **Devolver lo que anotó caja y que se lea todo lo que decide** (leyes 4, 5 y oficio · S · presentación).
   *Antes:* ni el talón ni «Lo que anotó caja» muestran talla y color; si un visito sale «≠» no se ve contra qué; el texto vacío del puente da 3,43:1; «N en Lima»,
   «coincide n/3», los visitos y la etiqueta de diferencia van de 9,5 a 11,5 px. *Después:* «Talla S · Beige» en el talón y en «Lo que anotó caja»; el «≠» dice
   «caja anotó M»; todo texto que decide a 12 px o más y el vacío a ≥ 4,5:1. *Verifica:* captura al mismo ancho; `medir-oficio.js` sin esas fallas.
3. **Un veredicto y un «¿Por qué?» tocable** (leyes 3, 4, 6, 9 · S–M · presentación y texto).
   *Antes:* «coincide 3/3» + rayitas + tres visitos; «Sugerida» sin motivo; «Vencida» y «Libres» solo con hover; aviso ámbar que no se parece al detalle de la opción; sin
   stock la mesa no lo dice. *Después:* un solo veredicto por tarjeta («Calza en todo» / «Falta: talla»); un «¿Por qué?» que se toca (qué es «Vencida», por qué «Sugerida»,
   qué hace «Llegó nueva»); la diferencia de precio siempre visible; «No pudimos leer el stock ahora» cuando falla. *Verifica:* la prueba ciega parafrasea cada texto; recorrido
   sin hover (tablet).

## Lo que sobra (ley 8)
La nota larga del pie (repite la bajada y la regla de los 2 días); el chip «Pendiente» en cada talón del filtro «Pendientes» (solo informa «Vencida»); «coincide n/3» y las
rayitas una vez que haya veredicto; las etiquetas «OFICIAL/COBRADO» de la regla (los importes ya salen en la tarjeta del puente); el código de la prenda en cada tarjeta.
Se esconde o se mueve, no se borra nada.

## Lo que no pediste y importa más
Una regularizada no se puede corregir: «Reabrir» es solo de las cerradas y lo heredó el rediseño. Con candidatas del mismo color, un clic mal dirigido deja el stock movido.
Corregirlo es mover stock y movimientos: **OK obligatorio de Felipe**; mientras tanto, el cambio 2 (que se lea qué se une con qué) lo reduce.

## Lista aparte (no se ejecuta)
Del caos (ver su informe, gravedad 4): el foco no vuelve al talón al cerrar la hoja del celular; con el teclado cada talón es una parada de Tab (hasta 25 por página: una sola parada y
flechas ↑↓); tras «ya la regularizó otra persona» la pantalla debería releerse sola. De la revisión: hasta 6 rojos si hay muchas vencidas (heredado: un chip «Vencida» por venta);
«Todas las colaboradoras» fija el género; el aviso del puente («Si no llegó registrada…») no se parece a la opción; «Perdió la etiqueta» no se apaga con 0 libres (la base lo rechaza,
y eso es coherente con `regularizar_prenda`); radios y alturas de la barra de filtros (heredado); celular: los filtros ocupan la primera pantalla.

## Hallazgos refutados o matizados por el escéptico
Refutados: «no hay aviso de éxito» (sí hay: `avisar.exito`, llega después del loader, arriba a la derecha); «Admin · queda a tu nombre» (es del sistema, de `ComboResponsable`, y solo lo ve un Admin).
Matizados (ciertos pero heredados o más chicos): el 64 % depende en parte de los dos bloques solo de líder; «Reabrir» solo para cerradas (heredado); 6 rojos = 1 botón + N chips «Vencida» (1 + N; antes
también había 1 tarjeta roja + N chips); chip «Pendiente» (ya existía); los dos buscadores (el de prendas es nuevo y a propósito); «Sin unidades libres» no deshabilita (coherente con la base).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | Coincide: «ventas que caja hizo de prendas que aún no estaban cargadas… me toca decirle al sistema qué prenda era cada una» |
| Primer intento | Sí, sin retroceder ni pedir ayuda |
| Pasos | 8 acciones (4 que cambian algo: tocar la venta, la prenda, «Llegó nueva», «Regularizar») |
| Dudas | «coincide 3/3» entre tres candidatas (lo resolvió por el precio); «Sin unidades libres»; «Hoy no tiene unidades libres… elige “Llegó nueva”»; «Perdió la etiqueta» vs «Llegó nueva»; «Admin · queda a tu nombre»; la rueda no baja la página; no vio el aviso de listo |
| Palabras no entendidas | «Cerrar la cola de arranque», «Identificar con sugerencias» (no los tocó), «La unión», «Libres: 0 → 0» |
| Errores evitables | 0 (la rueda atrapada y el botón bajo el pliegue no hicieron lo esperado) |

## Antes de decir «listo»
- **Concurrencia:** la base serializa (`select … for update` en `regularizar_prenda`) y rechaza la segunda con `prenda_ya_regularizada` (probado en serie en la base); la carrera real no se corrió (restaurador roto). La pantalla muestra el mensaje pero no se relee sola.
- **Caída externa:** error de guardado y sesión vencida: mensajes claros y botón de nuevo habilitado [Observado]. Fallo de lectura del stock: sigue, sin decirlo.
- **Persona sin contexto:** ciega: pasa; colaboradora real: sin probar.

## Cambios ejecutados (2026-10-07, con el OK de Felipe: el 1, el 2 y los 4 del caos)
1. **Hecho** (completo, con el menú «Más»): herramientas en una fila, mesa al 51 % (antes 64 %), la rueda ya no se atrapa, el botón se trae a la vista al elegir prenda y «cómo estaba». Medido a 1440×900: botón visible
   (bottom 871 de 900). A 1440×800 con pocas ventas queda a ~5 px (la página no tiene más recorrido).
2. **Hecho:** «Talla S · Beige» en el talón y en «Lo que anotó caja»; el «≠» dice contra qué; todo texto propio ≥ 12 px y 0 contrastes propios bajo 4,5:1 (medir-oficio.js).
3. **Hecho:** un veredicto por tarjeta («Calza en todo» / qué cambia), «¿Por qué?» tocables (vencida, estas prendas, cuál elijo), diferencia de precio siempre visible, aviso cuando falla la lectura del stock, palabras de tienda («Venta y prenda», «Unidades libres»), sin chip «Pendiente» en el filtro «Pendientes» y nota del pie corta.
Del caos, cerrados: rueda, foco al cerrar la hoja, una parada de Tab + flechas, relectura tras «ya la regularizó otra persona». Recalificado (provisional) tras el cambio 3 con una segunda prueba ciega: ver «Recalificación».

## Recalificación (2026-10-07, después de los 3 cambios y los 4 del caos)
- **Segunda prueba ciega** (otra venta, otra tarea): primer intento, 8 pasos, 0 retrocesos, 0 errores; confirmó el resultado por el aviso y por los contadores. Dudas: «Cerradas» frente a «Regularizadas» (heredado); «Admin · queda a tu nombre» (del sistema); la primera venta entra elegida sola (decisión: se queda).
  Las dudas de la primera vez que ya no aparecen: «coincide 3/3», «Sin unidades libres» sin saber si se podía elegir, la rueda atrapada, el aviso de éxito.
- **Medido:** mesa al 51 % de la altura (antes 64 %); botón a la vista a 1440×900, 800 y 720; 0 contrastes y 0 textos < 12 px propios de la mesa; la rueda mueve la página; un Tab para los talones.
- **Notas (provisionales, sin la pasada real):** leyes **7,0** (ley 1: 8; 2: 7; 3: 7; 4: 7; 5: 7; 6: 7; 7: 6; 8: 7; 9: 7) y oficio **6** (siguen fallando radios y alturas de la barra de filtros, bordes de 2–3 px, hasta 1 + N rojos
  por las «Vencida», y los tamaños de texto de todo el ERP). Son notas mías con esa evidencia: la pasada con 3–5 colaboradoras reales sigue sin hacerse.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-07 | f5191c7f | 5,8 | 4 (provisional) | — (primera medición) |
| 2026-10-07 (después) | + cambios 1, 2 y 4 del caos | sin recalificar | sin recalificar | 1 y 2 hechos; 3 pendiente |
| 2026-10-07 (final) | + cambio 3 | 7,0 (provisional) | 6 (provisional) | 1, 2 y 3 + los 4 del caos |
