# ADR-0181 — Seis decisiones de negocio sobre el dominio de Inventario (Felipe, 2026-09-24)

**Fecha:** 2026-09-24 · **Estado:** propuesto (implementado y verificado LOCAL; nada aplicado a producción/remoto) ·
**Amplía:** [ADR-0180](0180-dominio-inventario-comportamiento-comercial.md) — responde las 4 preguntas de negocio que
ese ADR dejó explícitamente abiertas, más dos piezas de fundación que Felipe pidió completar ahora (contrato de
calidad, primitiva de timeline).

## Contexto

Tras el informe de verificación de ADR-0180 (fórmulas ejecutadas contra el código real, no solo referencias),
Felipe respondió con 6 decisiones canónicas. Ninguna se asumió — todas estaban en el ADR-0180 como preguntas
explícitas o como huecos declarados ("D. Falta realmente por implementar").

## Decisiones y qué cambió

**1+2. Liquidación de prenda dañada — excluida de la demanda comercial, nunca resetea "Sin venta".**
`fn_es_venta_de_stock` deja de incluir `cuarentena_liquidada` (vuelve a ser solo venta normal + cambio).
`demanda_base.clase` gana una categoría explícita, `'liquidacion_danada'` — no `null`: es una salida contable
REAL (sigue moviendo stock, sigue en `ventas`/`venta_items`, intacta) pero queda fuera de los dos únicos `clase`
que `demanda` suma (`'venta'`/`'devolucion'`), y por lo tanto fuera de Vendido/Ritmo/Rotación piso/Rotación
total/Tendencia. `ultima_venta_par` filtra `clase='venta'` — al dejar de serlo, una liquidación ya NO resetea el
reloj de «Sin venta». Un solo cambio de SQL resuelve las dos decisiones a la vez, sin lógica adicional.

**3. "Rotación" (COGS/soles) se renombra a "Rotación valorizada" en toda la pantalla.**
Nueva constante `ETIQUETA_ROTACION_VALORIZADA = "Rotación valorizada"` (`rotacion.ts`), única fuente del nombre,
usada en las 5 pantallas donde aparecía (`ResumenDesempenoGeneral`, `ResumenDesempenoPanel`,
`ResumenComparacionGeneral`, `ResumenComparacionPanel`, `ResumenComparacionDetalle`). `TEXTO_FORMULA_ROTACION`
actualizado al texto exacto pedido: *"Costo de ventas ÷ inventario promedio valorizado a costo."* "Rotación
piso"/"Rotación total" (unidades, `inventario-exposicion.ts`) no cambiaron de nombre — ya eran distintas.

**4. Devolución real vs. movimiento interno — confirmado que YA estaba correcto, sin cambio de código.**
Investigación de `retail.aprobar_devolucion` (línea 323, `20260922235000_...sql`): una devolución con
`condicion='vendible'` inserta su `movimientos` directo con `sububicacion_id = fn_sububicacion_por_defecto(...,
'venta')` = `piso_venta` — **nunca pasa por almacén** — y con `motivo='devolucion'`, nunca `'movimiento_interno'`.
Por diseño, `armarCohortes` ya trataba esto como stock genuinamente nuevo (reloj en 0): Caso A (movimiento
interno, pausa/reanuda) y Caso B (devolución, reloj nuevo) ya eran dos caminos correctamente distintos porque
usan señales distintas (`esMovimientoInterno`). Se agregó una prueba explícita que lo fija (`inventario-exposicion.test.ts`,
"decisión 4 — devolución real de cliente").

**5. Contrato común de calidad del dato — nuevo módulo `inventario-calidad.ts`.**
`EstadoCalidad` (`exacto`/`estimado`/`no_disponible`) + `MotivoCalidad` (6 valores: `TRAZABILIDAD_INSUFICIENTE`,
`EXPOSICION_INSUFICIENTE`, `SIN_INVENTARIO`, `HISTORIAL_INCOMPLETO`, `SIN_BASE_COMPARABLE`,
`SIN_COSTO_VERIFICABLE`) — una sola taxonomía. No se reescribieron los tipos existentes (`RotacionUnidades`,
`SellThroughExposicion`, `Velocidad`, etc. — romperlos habría tocado cada consumidor sin necesidad real): se les
dio una PROYECCIÓN (`calidadDeRotacionUnidades`, `calidadDeRotacionValorizada`, `calidadDeSellThroughExposicion`,
`calidadDeVelocidad`, `calidadDeSinVenta`, `calidadDeTendencia`) que traduce la forma propia de cada métrica al
contrato común. `resumen-formato.ts` gana `TEXTO_MOTIVO_CALIDAD` (el texto de cada motivo, una sola vez) y
`textoCalidad()`. Conectado en `ResumenComportamiento.tsx`: las celdas de Rotación piso/total y Sell-through de
exposición ya usan el contrato para su tooltip, en vez de una cadena de texto suelta escrita a mano.

**6. Primitiva compartida de timeline — nueva función SQL `retail.fn_ledger_timeline`.**
Migración nueva (`20260924020000_ledger_timeline_variante.sql`), independiente de la de hoy en la mañana:
reconstruye los intervalos de nivel de PISO y TOTAL de UNA variante en UNA sede para cualquier ventana de
tiempo — el mismo patrón de CTEs que `fn_resumen_comparacion` (que NO se tocó, para no arriesgar la pantalla
que ya funciona), generalizado. Devuelve la serie cruda de intervalos, no números agregados: quien la consuma
calcula lo que necesite (días con stock, promedio ponderado, exposición). Verificada a mano contra los
movimientos reales de una variante en Tienda TRU (ver sección de verificación abajo) — no se rediseñó ninguna
otra pantalla, queda preparada para que Existencias/Movimientos/Traslados la consuman después.

## Lo que NO se tocó

- `fn_resumen_comparacion`: cero cambios de estructura en esta ronda (solo se reconstruyó a la par por el
  `create or replace` de la migración de hoy, sin modificar su lógica).
- `RotacionUnidades`, `SellThroughExposicion`, `Velocidad`, `Tendencia`: sus tipos originales siguen igual; el
  contrato de calidad es una capa aparte, no un reemplazo.
- Las etiquetas "Mejoró rotación"/"Rotó más" (Comparar períodos, `resumen-comparacion.ts`/`resumen-lectura.ts`):
  no se renombraron a "valorizada" — Comparar no tiene columnas de piso/total todavía, así que no hay ambigüedad
  adyacente hoy. Si se extiende Comparar (pendiente de ADR-0180), vale la pena revisarlas en ese momento.

## Cómo se verificó

- **24,280 pruebas en verde** (119 archivos, +19 desde ADR-0180), typecheck y lint limpios.
- SQL: la clasificación `liquidacion_danada` se probó de forma aislada (datos sintéticos, sin tocar tablas
  reales) — confirma que queda separada de `'venta'`.
- `fn_ledger_timeline` se verificó a MANO contra movimientos reales de una variante en Tienda TRU (2 ajustes de
  +4 a almacén, luego un traslado interno de 3 a piso): el resultado reconstruido coincide exactamente con la
  secuencia real — piso en 0 hasta el traslado, luego 3; total en 0→4→8, sin que el traslado interno mueva el
  total (confirma que el fix del bucket total de ADR-0180 también vive correctamente en esta función nueva).
  No se pudo cruzar contra `fn_resumen_comparacion` con la misma identidad simulada por un tema de permisos de
  sede (Tienda TRU, no la sede base de la identidad usada) — la verificación quedó por trazado manual contra
  datos reales, no por comparación entre las dos funciones.
- La sesión local del navegador se cerró durante esta ronda (el dataset local cambió sustancialmente respecto a
  la verificación de ADR-0180 — parece haber habido un reseteo de la base local en algún punto de la sesión).
  No se re-verificó visualmente el renombre "Rotación valorizada" en el navegador — es un cambio de texto de
  bajo riesgo, cubierto por tests, pero queda pendiente verlo en vivo cuando Felipe vuelva a iniciar sesión.

## Se rompe si

- Se agrega una nueva "salida sin demanda comercial" (además de `cuarentena_liquidada`) sin darle su propia
  categoría explícita en `demanda_base.clase` — la instrucción de Felipe fue clara: nunca una ausencia silenciosa
  (`null`/no-match), siempre una categoría real, aunque no sume a ningún total.
- Alguien reutiliza `fn_ledger_timeline` asumiendo que YA calcula días con stock o promedios — no lo hace a
  propósito: expone los intervalos crudos, el cálculo es responsabilidad de quien la consume.
