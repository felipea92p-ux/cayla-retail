# ADR-0121 — Resumen de Inventario v2: período elegible, velocidad por días con stock, motor de reposición y capital verificado

**Fecha:** 2026-09-18 (migración `20260919141804`; nació como `20260919010000` y se renombró el 2026-09-19 porque esa versión la usa `etiquetar_variantes`, que ya corrió en producción — la del Resumen no).
**Numeración:** nació como ADR-0106, pasó a 0113 y quedó en **0121** porque 0106 y 0113 los tomaron otras sesiones en `main`. **La migración y el comentario de la función en producción dicen «ADR-0113»**: no se reescribieron porque el cuerpo de una migración ya aplicada no se edita (cambiar un comentario dentro de la función rompería la igualdad byte a byte con lo que corre en producción). Léase ADR-0121.
**Estado:** **Aplicada en producción el 2026-09-19** con la autorización de Felipe (Supabase `apply_migration`, historial `20260919145415_resumen_inventario_v2`), después de un ensayo completo dentro de una transacción revertida contra datos reales. Verificado después de aplicar: una sola firma `(uuid, integer, date, date, date, date)`, `anon` sin EXECUTE, cuerpo idéntico byte a byte al del archivo (md5 de `prosrc`), la llamada vieja `(p_ubicacion_id, p_ventana_dias)` sigue sirviendo, y las cifras de las 4 sedes coinciden exactamente con las de la función anterior (filas, stock, ventas, devoluciones).
**Enmienda a:** ADR-0101 (decisiones 2, 4, 5, 6 y 9). La pantalla de ADR-0101 ya está en producción; esto la evoluciona, no la reemplaza por otra.
**Afecta:** `retail.fn_resumen_variantes` (misma función, firma nueva, la vieja se elimina),
`packages/database/src/types.ts` (solo esa entrada), `lib/{inventario-reglas,resumen-reglas,resumen-periodo,resumen-busqueda,resumen-filtros,resumen-formato,resumen-acciones,resumen-mapeo,resumen-armado,resumen-inventario}.ts`, `components/Resumen*.tsx` + `useResumenUrl.ts`, `ui/{TarjetaSenal,Graficos}.tsx`, `SelectorUbicacion.tsx`, `ReponerPisoModal.tsx`, `scripts/pruebas/fn_resumen_variantes.mjs` y el job de CI. **Ninguna tabla cambia de forma, ninguna RPC de escritura cambia, ningún traslado ni movimiento se crea desde Resumen.**

## Contexto

Felipe pidió reconstruir `/inventario/resumen` como la capa **analítica y de decisión** del inventario — Existencias responde «¿qué tengo físicamente ahora?»; Resumen responde «¿cómo se está comportando, qué significa y qué conviene hacer?» — con período elegible, comparación, búsqueda inteligente, motor de reposición determinista y explicable, curvas rotas, y capital a costo **solo si el costo es confiable**. Con una unidad de comunicación: **hecho → velocidad → riesgo → oportunidad → acción**.

ADR-0101 ya había dejado anotado como «segundo paso» lo más importante (días con stock como denominador). La inspección previa verificó contra `pg_proc` y contra **producción en solo lectura** (los mismos hechos, no la documentación): `fn_resumen_variantes` es idéntica en local y producción; el POS vende **solo del piso** (`registrar_venta` usa `fn_sububicacion_por_defecto(…,'venta')` = `piso_venta`) y las entradas/traslados llegan al **almacén**; `fn_aplicar_movimiento` mueve cantidades entre (ubicación, sububicación) de forma cerrada; `variantes.costo` lo escriben **dos caminos ajenos** al promedio ponderado (ver decisión 9).

## Decisiones

1. **Se evoluciona `fn_resumen_variantes`; no se crea otra función.**
   DECIDÍ: misma función, firma `(p_ubicacion_id, p_ventana_dias default 30, p_desde, p_hasta, p_cmp_desde, p_cmp_hasta)`, con `drop function` explícito de `(uuid, integer)` y **todas las columnas viejas intactas**.
   DESCARTÉ: una `fn_resumen_v2` aparte porque dejaría dos definiciones de «demanda» vivas (justo el error que ADR-0101 corrigió), y dejar la sobrecarga vieja porque PostgREST resuelve por nombre y una llamada ambigua rompe en silencio.
   SE ROMPE SI la pantalla nueva se despliega **antes** de pegar la migración (la RPC nueva no existe). El orden inverso es seguro: el cliente viejo llama con `{p_ubicacion_id, p_ventana_dias}` y los `default` lo resuelven.

2. **Velocidad = ventas netas ÷ días EN VENTA del período** (una sola definición, en `resumen-reglas.ts:calcularVelocidad`).
   Netas = ventas − devoluciones (los cambios entran por ambos lados; nunca negativas; las anuladas nunca llegan). Días en venta = los días (con decimales) en que había stock **en el piso**, reconstruidos en Postgres restando del stock de hoy todo lo movido después: el saldo en `t` es `stock_hoy − Σ movimientos posteriores`, con las mismas reglas que `fn_aplicar_movimiento`. Una prenda que vendió 10 en los 5 días que tuvo stock y estuvo 25 agotada vende **2/día, no 0.33**. Con < 3 días en venta no hay velocidad («poco historial»); no se afirma «sin ventas» con < 14.
   DESCARTÉ el denominador «desde el primer ingreso» (ADR-0101): subestima la velocidad de toda prenda que se agotó y sobreestima la cobertura. Verificado con un **oráculo independiente** (muestreo cada 10 min desde el stock real): 107 de 107 pares variante×sede coinciden, diferencia máxima 0.004 días.
   SE ROMPE SI alguien escribe `stock` sin pasar por el ledger: el saldo reconstruido da negativo y la RPC devuelve `ledger_consistente = false`; entonces la capa TS **no se fía** de `dias_con_stock`, cae a los días desde que llegó y marca la velocidad con «≈». (Pasa hoy en el escenario sembrado de Trujillo: 27 ventas contra un lote de 25.)

3. **«En venta» es el piso; «utilizable» es piso + almacén.** Cobertura = utilizable ÷ velocidad (la pregunta es «¿cuánto dura lo que tengo aquí si lo voy bajando?»); pero los días en venta cuentan solo con piso > 0, porque el POS no vende del almacén. Cuarentena, «sin ubicar», la variante centinela y las inactivas quedan fuera. El tránsito no es stock: solo entra a la cobertura proyectada del motor. Bandas: agotado · ≤ 3 · 4–7 · 8–30 · 30+ · sin historial.

4. **El período mueve lo histórico; el stock es siempre el de ahora.** Presets 7/30/90/este mes/personalizado; comparación con el período anterior (mismos días corridos justo antes) o el mismo período del año anterior. La RPC recibe fechas pero el stock lo lee de `stock` sin filtro. Verificado en la ruta real con 8 combinaciones de período/comparación: el stock devuelto es **idéntico** en todas; las ventas de Casaca Luciana cambian 27 → 6 (7 d) → 18 (este mes) → 9 (agosto).

5. **Sell-through = ventas netas ÷ (stock utilizable al inicio del período + lo recibido de afuera)**, capado a 100 %. La definición clásica; el stock de inicio se reconstruye del ledger, así que un período de agosto mide agosto. Lo que salió por traslado o merma queda en «disponible» y por eso baja el número: no se vendió. Sin ledger consistente o sin base no hay número. Filtra en tres bandas (≥ 60 alto, < 20 bajo).

6. **Reserva de seguridad derivada, no configurada.** `reserva = max(1, ceil(velocidad × 3 días))` — lo que se vende mientras llega un traslado. **No** es `productos.stock_minimo` (por producto y red, avisa cuándo pedir al proveedor) ni `UMBRAL_REPOSICION_PISO/UMBRAL_STOCK_BAJO_ALMACEN` (política fija de Existencias): son tres cosas distintas y por eso no comparten nombre. Se ve como «↓ bajo reserva» y en el detalle; influye en el stock objetivo, en la prioridad y en cuánto puede ceder otra sede. Modelar una reserva por variante y sede es una decisión estructural de Felipe (no se tocó ninguna tabla).

7. **Motor de reposición: determinista, explicable, en este orden** (`planDeReposicion`):
   1. **Almacén de la misma tienda** → «Bajar X al piso» (cuesta nada; el POS vende solo del piso).
   2. **Mercadería ya en camino** → «Esperar llegada» si llega antes de agotarse lo que hay (un día de gracia); solo se descuenta lo que llega a tiempo, nunca lo atrasado.
   3. **Otras tiendas** → «Trasladar X desde …», solo lo que **pueden ceder**.
   4. **Taller** → «Pedir X al Taller» (cede todo: no vende a clientas).
   5. **Nadie puede** → «Revisar compra / producción» según cómo entró esa prenda al ledger (`origen_abastecimiento`).
   6. **Sobrestock** → no se repone: «Revisar liquidación».
   Cantidad: `objetivo = ceil(velocidad × 14 días) + reserva`; `faltante = objetivo − (utilizable + lo que llega a tiempo)`. La reposición externa solo se dispara bajo el punto de reposición (cobertura ≤ 7 d), agotada con demanda, o para tapar una talla. Sin historial para medir el ritmo **no se finge una cantidad**: «Revisar reposición» y explica por qué. Un producto descontinuado no se repone.
   **Cuánto cede una tienda** = el menor entre `almacén − (umbral de Existencias + 1)` (un traslado nunca vacía el piso y no la deja en «Stock bajo») y `utilizable − ceil(su velocidad × 10 días)` (su punto de reposición + su reserva). Una tienda sin historial suficiente no se toca. Así su propio Resumen no le pide la prenda de vuelta al día siguiente.
   DESCARTÉ «si tiene menos de 10 → llevar hasta 11»: no se puede explicar desde la demanda. SE ROMPE SI Felipe cambia `UMBRAL_STOCK_BAJO_ALMACEN`: las cesiones cambian con él (es lo buscado).

8. **Curvas rotas.** La curva de un producto+color en esta sede son las tallas con variante dada de alta que alguna vez pasaron por ella. Una talla **falta** cuando no queda stock utilizable y además hay un hueco entre tallas con stock, o se vendió en el período y todavía queda otra talla con stock (también las puntas). Un producto descontinuado no tiene curva que completar. La tarjeta cuenta **curvas** (producto+color); el filtro muestra las tallas.

9. **Capital en inventario: solo si el costo se puede verificar; si no, la tarjeta pasa a unidades.**
   *Hallazgo:* la garantía de ADR-0067 («el costo solo se mueve por `fn_recalcular_costo_variante`») **está rota**: `catalogo_actualizar_producto` pisa `variantes.costo` con lo que mande el formulario (o con 0), y la política `variantes_write_lider` deja a cualquier líder escribirlo por la API. En producción `costo_historial` tiene **0 filas** (ninguna variante tiene costo respaldado por el cálculo oficial) y 1 variante con stock sin costo.
   *Por qué no se cerró acá:* cerrarla exige decidir cómo se **corrige** un costo mal cargado (un flujo nuevo de «ajustar costo» con auditoría, y sacar el campo editable de `ProductoForm`) y modificar `catalogo_actualizar_producto`, que tiene deriva repo↔producción y es territorio de otras sesiones. No es un cambio acotado.
   DECIDÍ: **medir en vez de garantizar.** La RPC clasifica cada variante — `oficial` (coincide con el último `costo_historial` y la cadena no está rota), `declarado` (sin historial y sin cambios registrados: el costo de alta), `alterado` (cambió por fuera), `sin_costo` — y la pantalla muestra «Capital a costo» **solo si ninguna prenda con stock está `alterada` ni `sin_costo`**. Si no, la tarjeta cuenta unidades y un clic explica por qué y lista las prendas a corregir. Capital = stock físico no dañado (piso + almacén + sin ubicar) × costo vigente; **cuarentena queda fuera** y se informa aparte; el tránsito no es stock de la sede. Nunca se usa precio de venta ni se presta para margen o EERR. El costo solo viaja a líderes.
   SE ROMPE SI alguien deja de registrar los cambios de costo (`variantes_registrar_cambio`): el estado `declarado` dejaría de detectar ediciones a mano.

10. **El estado vive en la URL y el servidor analiza toda la sede.** Período, comparación, búsqueda, filtros, orden y página son parámetros; el navegador recibe un resumen agregado y **una página de 15 filas** (verificado: una sede de 2 500 variantes envía 15). La lectura pagina con `Range` (nunca depende de una consulta que `max_rows = 1000` pueda truncar en silencio). Los filtros tienen dos capas: **alcance** (categoría y búsqueda: mueven tarjetas, gráficos y tabla) y **vista** (cobertura, sell-through, estado, orden: solo la tabla — si tocar «Cobertura crítica» colapsara las demás tarjetas, la pantalla dejaría de servir).

11. **Búsqueda determinista, sin IA.** Cada palabra es una condición y todas se cumplen, en cualquier orden, sobre nombre, código de producto y de variante, SKU, código de barras, categoría, color y talla. Normaliza mayúsculas, acentos y separadores, y género/número («blanca» = «Blanco», «blusas» = «blusa»). Una o dos letras solo cuentan como palabra entera («l» no encuentra «lino»).

12. **Las acciones prellenan el flujo real y nunca ejecutan** (`resumen-acciones.ts`): traslados y «pedir al Taller» → `/inventario/mover?origen&destino&variante&cantidad` (el formulario de `iniciar_traslado`, con su confirmación); «bajar al piso» → el `ReponerPisoModal` de Existencias (`mover_interno`) con la cantidad prellenada — solo escribe al apretar «Confirmar»; «esperar llegada» → el traslado que viene en camino. No hay una segunda implementación de traslados. Sin recomendación no hay botón: hay un texto quieto «Sin acción».

## Corrección de una rama muerta heredada

El `WHERE` de `demanda_filas` (ADR-0101) exigía `venta_item_id`, `cambio_id` o `devolucion_item_id`, así que la rama «salida de `venta` sin `venta_item_id` cuenta» — que el comentario prometía para las importaciones históricas — **nunca se ejecutaba**: una importación de 12 meses que solo cargara el ledger daba velocidad cero en todo. Se agregó `or (tipo = 'salida' and motivo = 'venta')`. Lo destapó la prueba de integración.

## Verificado (local)

- `pnpm lint`, `pnpm typecheck`, `pnpm build` en verde; `pnpm test`: **637 pruebas / 39 suites**, de las cuales 180 son del Resumen (período 23, búsqueda 29, reglas 87, filtros 15, mapeo 8, acciones 10, armado 8).
- `scripts/pruebas/fn_resumen_variantes.mjs`: **38 verificaciones** contra Postgres real, cada caso en su propia transacción con `ROLLBACK` (0 filas de prueba quedan en la base compartida): 10 vendidas en 5 días con stock = 2/día; almacén ≠ en venta; anuladas fuera; devolución vendible resta y a cuarentena no; cambios; ventana y comparación; centinela/inactivas/descontinuados; costo solo para líderes y sus cuatro estados; ledger inconsistente; una sola firma, `anon` sin EXECUTE, llamada vieja compatible.
- Oráculo independiente de días con stock: 107/107 pares.
- Ruta real autenticada (Safari del panel) con datos de Trujillo/Lima/Taller: búsqueda («blusa blanca L», SKU, «pantalon 30»), 8 períodos/comparaciones con stock idéntico, tarjetas y leyenda del donut que filtran, detalle, «Bajar 3 al piso» con 3 prellenado (sin confirmar), capital verificado y sin verificar, sede vacía, Taller; 1440 / 1280 / ~1024 / móvil sin desbordes.

## Limitaciones y decisiones de Felipe

- Los parámetros de negocio son **valores por defecto** en `inventario-reglas.ts` (uno por constante): objetivo 14 días, reserva 3 días, piso 7 días (alerta < 3), «alta cobertura» > 60 días, evidencia mínima 3/14 días, sell-through 20/60 %, alta demanda = el 20 % más rápido (≥ 0.5/día), tendencia ±25 %.
- La garantía de costo sigue abierta (decisión 9): hoy «Capital» depende de que nadie edite costos a mano. BACKLOG.
- `Vista matriz` y `Online` de la imagen **no se construyeron**: no hay flujo detrás.
- «Revisar liquidación» y «Revisar reposición» abren el detalle (no hay flujo propio); «Revisar compra/producción» enlazan a `/compras` y `/produccion` sin prellenado.
- En el Taller (no vende a clientas) las cuatro señales de tienda dicen «No aplica».
