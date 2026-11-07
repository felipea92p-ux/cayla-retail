# Pantalla — Producción ▸ Resumen (`/produccion`)

> Modo: completo, enfocado en el aviso «81 modelos por producir y ninguno tiene orden abierta» y en la tabla «¿Qué producir?» · Fecha: 2026-10-27 · Tipo: **tablero de decisión, solo lectura** · Rol/sede: líder, sede **Taller** `[visto]` · Dispositivo: escritorio en el Taller · Datos: **producción real, solo lectura** (7 consultas `select` el 2026-10-27, sin datos personales; anexo al final).
> SHA analizado: `d56321836` = `origin/main` (2026-10-27). **Este documento reemplaza al del 2026-10-13**: la pantalla se rehízo desde entonces (hoja «Ver el modelo», fotos, reparto trasladar/producir; `git diff --stat 1f8345e3a origin/main` sobre sus archivos: 15 archivos, +1423 −110), así que aquel análisis quedó vencido. Sus tareas #1–#9 constan cerradas en su propio texto (commits `553c05c08` … `c86c560d3`); su historial sigue abajo. Si los archivos de abajo cambian, este análisis vence.
> Archivos: `app/(app)/produccion/page.tsx` · `components/ResumenProduccionPanel.tsx` · `components/produccion-resumen/*` · `lib/produccion-decisiones.ts` · `lib/produccion-decision-reglas.ts` · `lib/decision-produccion.ts` · `lib/resumen-reglas.ts` · `lib/inventario-reglas.ts` · tablas `producciones`, `produccion_lineas`, `productos`, `variantes`, `stock`, `movimientos`
> Otra sesión tocándola: **sí** — `docs/SESIONES-ACTIVAS.md` lista `claude/production-module-review-0ade12` (Órdenes, ADR-0509, PR abierto) y `claude/production-module-redesign-136cca` (rediseño de Producción, ADR-0400). Tocan Órdenes y el cajón, no `ResumenProduccionPanel`; el riesgo de choque es `lib/ordenes-lista-reglas.ts` y la guía `produccion`.

## 0 · Veredicto
La cuenta del aviso es **correcta, pero su titular suena a certeza que los datos todavía no tienen**: «81» mezcla unas pocas señales firmes con muchas de apenas 1–2 ventas, sobre solo 4 semanas de historia. Y «ninguno tiene orden abierta» es literal: las 4 órdenes del Taller se crearon **hoy** y ninguna es de esos 81.
**Cumple su finalidad:** 5,0/10 (promedio 6,3; tope de 5 porque el titular puede llevar a cortar tela para modelos con 1–2 ventas) · **Relevancia:** 6,8/10 — **Soporte**.

## 1 · Finalidad declarada
«Decirle al líder, parado en el Taller, qué necesita su decisión hoy, juntando órdenes, insumos, pagos e inventario». Fuente: `docs/PLAN-PRODUCCION.md:23-25`, ADR-0133, y el propio subtítulo `ResumenProduccionPanel.tsx` («¿Qué necesita tu decisión hoy?»). **Coinciden.** La prueba de la finalidad es lo que pasó: **Felipe vio «81 modelos por producir» y no supo qué hacer con eso** `[visto, su mensaje]`. Una pantalla de decisión que no deja decidir no cumple, aunque la cuenta esté bien.

## 2 · Objeción
1. **El número de arriba (81) no dice cuánto pesa.** Es una cuenta de modelos, no de trabajo. No dice cuántas prendas faltan, ni cuáles tienen base de ventas, ni cuántas puede hacer el Taller. 81 de 483 modelos activos `[producción]` es el 17 % del catálogo «urgente»: cuando todo es urgente, nada lo es.
2. **El ritmo («8,6 por semana») se lee como ventas, y no lo es.** Es ventas ÷ días con stock (`resumen-reglas.ts`, `calcularVelocidad`): un modelo que vendió 6 prendas en los pocos días que tuvo stock sale «8,6 por semana», aunque en 30 días solo sean 6 ventas `[visto]` `[código]`. Con una ventana fija de 28 días, los modelos que caen en «producir» son **54, no 81**, y solo **22 tienen 3 o más ventas** `[producción, aproximado]`. El criterio de días con stock es el correcto (no castiga al agotado), pero el titular no lo explica.
3. **«Ninguna orden abierta» deja de ser verdad en cuanto el Taller registre lo que ya hace.** Hasta hoy el ERP no tenía ni una orden (`producciones` = 4 filas, todas del 27-oct `[producción]`). Quien lea «ninguno tiene orden» pensará «nadie está fabricando», cuando lo cierto es «nadie lo ha registrado». Y 2 de las 3 muestras son de 54 y 69 prendas: para una muestra es mucho, y `enProduccionPorVariante` **ignora las muestras** (`produccion-decision-reglas.ts`, línea de `esMuestra`), así que si eran lotes reales la pantalla seguirá diciendo «no hay orden» de esos modelos.

*Trade-off que asumo:* separar «firmes» de «poca base» baja el número del titular y puede parecer que se resta urgencia; pero un titular que no discrimina entrena al líder a ignorarlo.

## 3 · Lo que está bien y no se toca
- Cada tarjeta y fila dice en qué se apoya («solo 1 venta en 30 días: poca base», chip «Poca base») `[visto]` `[código produccion-decisiones.ts:183]`: honesto y ya hecho.
- La cuenta de «cuánto fabricar» descuenta lo que hay en tiendas, en camino, en órdenes y en el Taller antes de pedir (`repartirFalta`) `[código produccion-decision-reglas.ts]`, y es la misma cifra que precarga «Nueva orden».
- No se opina sin ritmo medido (`sin_ritmo`) y la tarjeta nunca afirma «no hay orden» delante de una orden (`frasePorOrden`) `[código produccion-decisiones.ts:397]`.
- Los agotados se ordenan por lo que más se vende, no por el abecedario `[código produccion-decisiones.ts:~285]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 8 | Limpia y en tokens; la barra de cobertura con marcas en 7 y 30 días se lee. Falta una forma de ver «cuánto» (cantidad) | `[visto]` |
| Lógica de negocio | 6 | Ritmo sobre pocos días y pocas ventas; muestras fuera de «en producción»; sin ventana mínima de historia | `[código]` `[producción]` |
| Arquitectura | 7 | Reglas puras y probadas; lo secundario tolera fallar. El motor de demanda (ADR-0347) se calcula y no frena el titular | `[código decision-produccion.ts:42-68]` |
| Funciones | 6 | Falta: total de prendas por fabricar, filtro/tramos en la tabla de 81, y un «por qué» en el titular | `[visto]` |
| Utilidad | 5 | El propio dueño no supo interpretarla: es la prueba de la persona sin contexto | `[visto]` |
| Conexión con el ERP | 7 | Aguas arriba: ventas y stock de 3 sedes. Aguas abajo: «Abrir orden sugerida» → Nueva orden | `[código]` |

**Utilidad, escenario real.** Una líder abre el Resumen un martes: lee «81 modelos por producir y ninguno tiene orden abierta» → duda qué es urgente → ve «Ver los 81 modelos» → baja a una tabla larga sin filtro, con 5 de las primeras filas en «agotado» y cifras como «8,6» sin saber si es mucho. No hay un paso siguiente claro. Fallo del diseño.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Decide qué se fabrica y cuánta tela se compra |
| Dinero y stock que toca | ×1 | 7 | Orienta corridas y compras de tela; no escribe |
| Frecuencia y personas | ×1 | 6 | Líder, a diario, una sede |
| Qué se detiene si falla | ×1 | 5 | Se decide a ojo, como hasta hoy |

Relevancia = (16 + 7 + 6 + 5) / 5 = **6,8** → Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** `movimientos` (ventas = `salida` con `venta_item_id`), `stock` de tiendas y almacenes, `producciones`/`produccion_lineas`. **Hecho de producción:** el ERP tiene movimientos desde el **2026-09-29**, es decir **4 semanas** de historia, y TRU pasó de 53 a 358 prendas vendidas por semana, AQP arrancó la semana del 12-oct y LIM casi no vende `[producción]`.
- **Aguas abajo:** «Abrir orden sugerida» → `/produccion/ordenes?nueva=<modelo>&sugerida=1`.
- **Externos:** ninguno. Si la lectura de ventas falla, la pantalla lo dice y sigue (`falloRed`): se degrada sin perder datos.

## 7 · Las 12 tareas, por importancia

### #1 · [Mejorar] El titular se parte por confianza: «81 modelos: N con base, M con poca base»
- **Dónde:** `tarjetaProducirAgrupada`, `lib/produccion-decisiones.ts:~420`; usa `baseDelRitmo(...).pocaBase` y `UMBRAL_POCA_BASE_VENTAS`, que ya existen.
- **Por qué en este puesto:** es la causa del malentendido de Felipe y la que puede orientar un gasto equivocado. Sin tocar el negocio: solo agrupa.
- **Cómo lo verificas tú:** en `/produccion` el aviso dice, por ejemplo, «81 modelos por producir: 22 con base, 59 con poca base», y «Ver los 81» baja a la tabla.
- **Esfuerzo / dependencias:** S · ninguna.

### #2 · [Mejorar] Decir cuánto falta: «faltan ~N prendas» en el titular y una columna «Falta fabricar» en la tabla
- **Dónde:** suma de `FilaModelo.producir` (ya calculada, `produccion-decisiones.ts:204`); columna en `ResumenProduccionPanel.tsx` (tabla ~línea 281).
- **Por qué:** convierte «81 modelos» en una cifra con la que se decide (y contra la capacidad del Taller). **Respeta la regla ya aprobada:** con poca base (≤ 2 ventas) no se muestra cantidad (`sugerenciaDeOrden`, ADR-0346), así que el total suma solo los modelos con base y la columna dice «sin cantidad · poca base» en los demás (maqueta `docs/maquetas/produccion-resumen-81-2026-10/`). Aproximación con ventana fija: ~250 prendas para 30 días en los 54, ~177 en los 22 firmes `[producción, aproximado]`; la cifra real la da `repartirFalta` por talla.
- **Cómo lo verificas tú:** la columna aparece, cada fila trae un número y la suma coincide con la del titular.
- **Esfuerzo / dependencias:** S · mejor junto a la #1.

### #3 · [Mejorar] «¿Por qué?» en el titular, en palabras de tienda
- **Dónde:** `Decision.porque` (existe, `hayPorQueAntes`, `ResumenProduccionPanel.tsx:37`) y `components/produccion-resumen/PorQue.tsx`; texto en `tarjetaProducirAgrupada`.
- **Por qué:** explica «producir = a este ritmo se agota en ≤7 días y no alcanza para 30», y «8,6 por semana = lo vendido ÷ los días que hubo stock». Formidable, ley 6: lo difícil, a un toque.
- **Cómo lo verificas tú:** un toque en «¿Por qué?» abre la explicación con un ejemplo real de la lista.
- **Esfuerzo / dependencias:** S · ninguna.

### #4 · [Mejorar] Filtro por tramos sobre la tabla de 81 («Con base · Poca base · Agotados · Con orden»)
- **Dónde:** tabla `ResumenProduccionPanel.tsx:269-355`; pieza `FiltroPuesto`/`pildora-cayla` (ADR-0358).
- **Por qué:** 81 filas sin filtro no se leen. Con la #1 es la misma cuenta dicha como botones.
- **Cómo lo verificas tú:** al tocar «Con base» quedan 22 filas (hoy, a la fecha de este análisis).
- **Esfuerzo / dependencias:** M · después de la #1.

### #5 · [Corregir] Aviso de historia corta mientras el ERP tenga menos de ~8 semanas de ventas
- **Dónde:** nueva regla en `lib/produccion-decisiones.ts` (la fecha del primer movimiento) y una `nota-cayla` en el Resumen.
- **Por qué:** `[producción]`: 4 semanas, TRU creciendo cada semana, AQP recién empezó. Los ritmos de hoy subestiman o sobreestiman según la semana. Es una nota honesta, no un candado.
- **Cómo lo verificas tú:** la nota aparece hoy y desaparece sola pasadas las 8 semanas; el número (8) es tuyo.
- **Esfuerzo / dependencias:** S · ninguna.
- **DECIDÍ:** una nota con la edad de los datos. **DESCARTÉ:** bajar la sensibilidad del motor, porque oculta modelos que sí se agotan. **SE ROMPE SI:** una tienda con 3 semanas de ventas pareja se lee como «poca historia» y se ignora un quiebre real.

### #6 · [Corregir] «Muestra» grande: preguntar si es muestra o producción
- **Dónde:** `NuevaOrdenProduccionForm.tsx` y `enProduccionPorVariante` (`produccion-decision-reglas.ts`).
- **Por qué:** 2 muestras de 54 y 69 prendas `[producción]`; una muestra no cuenta como «en producción», y si era un lote real la pantalla dice «no hay orden».
- **Cómo lo verificas tú:** al guardar una muestra mayor que un tope que tú pongas, pregunta «¿es una muestra o una corrida?».
- **Esfuerzo / dependencias:** S · el tope lo decide Felipe.

### #7 · [Replantear] Decidir si la lista «por producir» parte de la ventas firmes o de la cobertura
- Ver «Estrategia alternativa». **DECIDÍ:** proponerlo, no cambiarlo. **DESCARTÉ:** cambiar la regla ya aprobada (ADR-0133: unidad = modelo) sin tu decisión. **SE ROMPE SI:** se oculta un modelo con 2 ventas que en verdad se agotó por un pedido grande.

### #8 · [Mejorar] Orden de los agotados: por ventas firmes primero, no solo por ritmo
- **Dónde:** `filasPorModelo`, `produccion-decisiones.ts:~285`.
- **Por qué:** con cobertura 0 todos empatan; hoy decide el ritmo, que es la cifra más ruidosa. Poner primero los de más ventas reales es más estable.
- **Cómo lo verificas tú:** los primeros agotados tienen más ventas que los siguientes.
- **Esfuerzo / dependencias:** S · después de la #1.

### #9 · [Corregir] «Ver los 81 modelos» → «Ver los 81 en la tabla»
- **Dónde:** `tarjetaProducirAgrupada`, `accion.texto`.
- **Por qué:** el botón no dice qué hace; el verbo es de tienda. Menor.
- **Esfuerzo:** S.

### #10 · [Mejorar — bajo valor] Mostrar el sello «agotado» en la fila con la cantidad de la talla más vendida
- La hoja «Ver el modelo» ya lo tiene; llevar un resumen a la fila. Opcional.

### #11 · [Eliminar/fusionar — opcional] Unificar «Producir ya» y «Trasladar al piso» en un solo botón con dos destinos
- Hoy son dos cosas distintas con razón (llevar del Taller no gasta). Solo si se confunden en la práctica.

### #12 · [futuro] Capacidad del Taller (prendas por semana) para decir «esto no cabe esta semana»
- Hoy no existe el dato en la base (`producciones` no guarda capacidad). Es futuro: ver §9.

## 8 · Estrategia alternativa
**Hoy:** una lista de modelos que piden fabricar, ordenados por días de stock.
**Alternativa — «El plan de la semana»:** en vez de 81 filas, una propuesta de **una corrida**: «esta semana: 6 modelos firmes, ~180 prendas, 2 telas», agrupada por proveedor y por tela, con un botón que abre las órdenes.
- **Ganas:** responde «¿qué hago el lunes?» y no «¿cuáles faltan?». Une Resumen con Nueva orden.
- **Pagas:** necesita saber la capacidad del Taller y la tela disponible (hoy `insumos` está en 0); con 4 semanas de ventas, el plan sería demasiado frágil. Es una buena idea para dentro de ~2 meses.
- **Decide Felipe.** No cambia las 12.

## 9 · Referentes de ERP y futuro
*De memoria, sin verificar:* los ERP de producción textil suelen cerrar la brecha entre «demanda» y «órdenes» con un plan semanal por capacidad de planta. Pasa el filtro de «3 tiendas y 1 taller» solo cuando el Taller registre sus órdenes y sus insumos en el ERP. Por eso va a futuro.

## 10 · Fuera de esta pantalla
**El Taller recién empezó a registrar hoy** `[producción]`: las 4 órdenes son del 27-oct, el stock del Taller es **0** y los insumos están en 0. Mientras el Taller no registre lo que ya fabrica y lo que ya tiene, esta pantalla va a decir «no hay orden» por construcción, y «Producir ya» seguirá sobre-pidiendo. **El cuello de botella no es la pantalla, es la carga de datos del Taller** (qué hay en cola, qué telas tiene).

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:produccion]` #1 Titular partido por confianza — S
- [ ] `[pantalla:produccion]` #2 «Faltan ~N prendas» y columna «Falta fabricar» — S
- [ ] `[pantalla:produccion]` #3 «¿Por qué?» en el titular — S
- [ ] `[pantalla:produccion]` #4 Filtro por tramos en la tabla — M
- [ ] `[pantalla:produccion]` #5 Aviso de historia corta — S
- [ ] `[pantalla:produccion]` #6 Preguntar muestra vs. producción cuando la muestra es grande — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | «Ver órdenes» / «+ Nueva orden» | Navega | bien | `[visto]` |
| Pestañas | Hoy · Eficiencia | Cambia de mirada | bien | `[visto]` |
| Cifras | Capital, valor en proceso, por pagar, entregas | 4 tarjetas | bien (hoy en 0 por falta de carga) | `[visto]` |
| Para decidir | Tarjeta «81 modelos…» | Resume los de «producir» | ajustar (#1–#3) | `[visto]` |
| ¿Qué producir? | Tabla con cobertura | Lista por modelo | ajustar (#2, #4) | `[visto]` |
| ¿Qué producir? | Chip de estado | Producir ya, Poca base… | bien | `[visto]` |

## Anexo · Datos de producción (solo lectura, 2026-10-27)
Fuente: proyecto `cayla-dynamic`, schema `retail`. Todas las cifras con ventana fija de 28 días son **aproximadas** (la pantalla usa días con stock).
- `producciones`: 4 filas, todas `en_proceso`, creadas el 27-oct: 1 producción (57 prendas, modelo con 66 en tiendas), 3 muestras (16, 54 y 69 prendas; los 3 modelos con 0 ventas históricas).
- Catálogo: 486 productos (483 activos), 2.788 variantes, 3.159 unidades en tiendas y almacenes, **0 unidades en el Taller**.
- Movimientos desde el 2026-09-29. Prendas vendidas por semana: TRU 53 → 222 → 276 → 358; AQP 1 → 5 → 63 → 145; LIM 8 y 6 en las dos últimas.
- Modelos activos según ventas en 30 días: 202 con 0, 146 con 1–2 (poca base), 76 con 3–5, 32 con 6–10, 27 con más de 10.
- Con ventana fija de 28 días y cobertura ≤ 7 días: 54 modelos (22 con 3+ ventas); ~250 prendas para cubrir 30 días (~177 en los 22).

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-13 | completo (sin SQL parcial: F0 y F8) | 5,0 | 5,8 | — (primer análisis) |
| 2026-10-13 (tarde) | cierre tras construir | — | — | #1, #2, #3, #4 (parte a) y #5 cerradas; las notas no se recalculan hasta correr F6, F4 y F3 |
| 2026-10-27 | completo, enfocado en el aviso de «81 modelos» (SQL de solo lectura) | 5,0 | 6,8 | #1–#9 del análisis anterior constan cerradas en su texto (commits `553c05c08` … `c86c560d3`); se reemplaza por 12 tareas nuevas |
| 2026-10-27 (tarde) | cierre tras construir | — | — | Se construyeron, con otro formato, #1 (titular partido: «¿Qué fabrico primero?» con «Para vigilar» aparte), #2 en parte (la cantidad va en cada fila; **falta el total «faltan ~N prendas»**), #3 («¿Por qué?» en cada fila), #4 como dos grupos en vez de filtros y #5 (nota de historia corta); #6–#12 abiertas. Ver `docs/formidable/produccion-resumen.md` |
