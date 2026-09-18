# ADR-0101 — Resumen de Inventario: quinta pantalla, capa analítica por variante × sede

> Renumerado de ADR-0097 el 2026-09-18 al fusionar con `main`: `activar-tienda-lima-eff087`
> (otra sesión, ya en producción) también usó 0097, para una decisión sin relación con esta
> ("activar Tienda Lima" — ver `0097-activar-tienda-lima.md`). `main` ya llegaba hasta el
> ADR-0100; este pasó a ser el 0101. El contenido no cambió, solo el número.

**Fecha:** 2026-09-17 (primera versión a nivel producto/red el mismo día, más temprano;
esta es la definitiva por variante y sede, contra la referencia visual que dio Felipe).
**Estado:** Aplicado en LOCAL únicamente. No aplicado a producción ni a GitHub — Felipe pidió
explícitamente desarrollo 100% local para esta pieza; el push/PR y la migración a
producción quedan para cuando él lo indique (protocolo de "actualización supabase" /
"actualización github" acordado en la sesión).
**Enmienda a:** `ADR-0071` decisión 1 (Inventario pasa de cuatro a cinco pestañas).
**Afecta:** `retail.fn_resumen_variantes` (RPC nueva) + índice `movimientos_created_at_idx`;
`apps/web/lib/{resumen-reglas,resumen-inventario,inventario-reglas,conteo-varianza,tallas}.ts`;
`components/{ResumenInventarioPanel,ResumenDetalleModal,AppShell,MoverMercaderiaFormV2}.tsx`,
`components/ui/{TarjetaCifra,PrendaCelda}.tsx`; rutas `/inventario/resumen` (+`loading.tsx`)
y `/inventario/mover` (prellenado por URL). **Ninguna tabla de stock ni `movimientos`
cambia de forma; ninguna RPC de escritura cambia; ningún traslado se crea solo.**

## Contexto

Felipe pidió analizar ocho ideas para Inventario (cobertura, sell-through, variantes rotas,
búsqueda, venta online, Matrix View, Inventory Velocity Report —urgente—, safety stock),
contrastarlas con un análisis externo (ChatGPT, que solo vio las pantallas) y construir
"Resumen": una pantalla de **análisis + excepciones + decisiones** para una sede, con la
referencia visual que adjuntó (cabecera, cuatro tarjetas de estado, cuatro de excepciones,
tabla de decisiones, productos a vigilar, cómo leer). Requisitos que fijó y gobiernan este
ADR: datos reales sin mocks; funciona con el dataset presente y con cualquiera futuro
(importación de 12 meses, empresa nueva sin historial); traslados, movimientos internos,
conteos, ajustes, recepciones y carga inicial NO son demanda; devoluciones la corrigen;
en camino ≠ disponible; safety stock detrás de la UI pero consultable; toda recomendación
explicable; nunca mover stock automáticamente y reutilizar el flujo de Traslados;
Existencias y Resumen con las MISMAS definiciones; nada de sedes/tallas/colores
hardcodeados; viable con miles de variantes y años de ledger.

La inspección previa (siete lectores en paralelo, todo verificado contra el Postgres
local con `pg_get_functiondef`) fijó los hechos sobre los que se construye:
`fn_productos` y la primera `fn_resumen_inventario` ya tenían dos definiciones distintas de
"demanda" (bruta vs. neta, ambas por texto de `motivo`, sin filtrar ventas anuladas);
un traslado son DOS filas (`traslado_salida`/`traslado_entrada`) y entre medio la
mercadería no está en `stock` de nadie; `anular_venta` repone al bucket `sububicacion_id
NULL`; `fn_stock_por_sede()` suma cuarentena y el cargo especial; no existe mínimo por
variante ni por sede (`fijar_stock_minimo` es V1, no está en la base); `stock` no tiene
`created_at`; la exactitud de Conteo es por LÍNEAS de conteos cerrados
(`exactitudConteos`); `fn_resumen_inventario` (v1 de hoy) era ejecutable por `anon`.

## Decisiones

1. **Resumen es la quinta pestaña, al final, solo líder, por sede** — enmienda a
   `ADR-0071`. Responde "¿cómo está mi inventario en conjunto y qué decido hoy?" para la
   sede seleccionada (mismo `SelectorUbicacion` y misma regla `?ubicacion=` que
   Existencias). El lateral (`AppShell.tsx`) la muestra solo a líderes, como Compras.
   - DESCARTÉ meter las métricas dentro de Existencias (recomendación del análisis
     externo): Existencias responde "qué hay en ESTA fila" para el piso; Resumen
     responde por quien decide. Dos preguntas en una pantalla rompe integridad conceptual
     y la tabla de Existencias ya está al límite de columnas.
   - DESCARTÉ una vista de red completa (v1 de hoy): "Riesgo de quiebre" y "Reponer piso"
     solo tienen sentido por sede; la red aparece como columna "En la red".
   - SE ROMPE SI `SelectorUbicacion` deja de navegar por `?ubicacion=` — hoy pisa
     cualquier otro query param, por eso Resumen no lleva filtros en la URL.

2. **La RPC agrega números; las reglas viven en un solo archivo TS.**
   `fn_resumen_variantes(p_ubicacion_id, p_ventana_dias)` devuelve, por variante activa de
   producto activo (sin el cargo especial): stock por sububicación (cuarentena aparte,
   `sububicacion_id NULL` como bucket real: Taller entero y reingresos de anulación),
   primer ingreso a esa sede y días observables, ventas/devoluciones de la ventana,
   entradas/mermas, en camino hacia esa sede, y `en_red` (jsonb) con lo mismo de las
   otras sedes activas. No decide nada. `resumen-reglas.ts` decide con
   `calcularEstado`/`necesitaReponerPiso` de Existencias (mismos umbrales
   `UMBRAL_STOCK_BAJO_ALMACEN`/`UMBRAL_REPOSICION_PISO`) más los de cobertura, que se
   mudaron a `inventario-reglas.ts` para tener una sola casa.
   - DESCARTÉ poner los umbrales en SQL (como hacía la v1 con 7 y 90 hardcodeados):
     era la misma regla escrita dos veces; ahora un umbral se cambia en una constante.
   - DESCARTÉ extender `fn_productos`: paga dos `LATERAL` por producto en cada carga del
     catálogo de venta y hoy está rota en `main` local (`v.talla` no existe) — ver
     "Limitaciones".
   - SE ROMPE SI alguien inserta en `movimientos` sin `perform fn_aplicar_movimiento`
     (RLS lo permite, no hay trigger): `stock` y ledger divergen y Resumen lee `stock`.

3. **Demanda = por FK y estado real, nunca solo por el texto de `motivo`.** Suma: salida
   con `venta_item_id` cuya venta está `completada` y motivo `venta`; salida con
   `cambio_id` (la prenda que se llevó la clienta). Resta: entrada con
   `devolucion_item_id` que NO fue a cuarentena; entrada con `cambio_id`. Neutro: todo lo
   demás (traslados en sus dos filas, interno, recepción, producción, carga inicial,
   conteo, ajuste, `cuarentena_liquidada`). La corrección se atribuye a la sede de la
   VENTA original (`devoluciones → venta_items → ventas.ubicacion_id`, ídem cambios):
   una devolución en otra sede no deja demanda negativa.
   - DESCARTÉ restar `anulacion_venta`: solo existe si la prenda volvió "vendible";
     filtrar por `ventas.estado` descarta la anulada entera, con o sin reingreso.
   - DESCARTÉ contar `cuarentena_liquidada` como demanda: es plata real (ADR-0071) pero
     no demanda de prenda sana ni consume stock vendible.
   - DESCARTÉ restar la devolución dañada: la clienta sí la quiso; la unidad se perdió.
   - SE ROMPE SI una RPC nueva escribe una venta sin `venta_item_id` (hoy todas lo
     llevan) — quedaría fuera de la demanda en silencio. `motivo` sigue sin CHECK.

4. **Ventana observable, no calendario.** `dias_observables = min(30, días de Lima desde
   el primer ingreso de esa variante a ESA sede)` (entrada, ajuste positivo o destino de
   traslado interno). Con menos de `MIN_DIAS_HISTORIAL` (7) no se calcula velocidad:
   "Historial corto". Sin primer ingreso: "Sin historial". Con 30 días y cero ventas:
   "Sin ventas". Nunca se divide entre 30 lo que se observó 8 días. Una importación de
   12 meses entra sola: la ventana mira `created_at`, no la fecha de despliegue.
   - DESCARTÉ "días con stock > 0" como denominador (más exacto): exige reconstruir el
     saldo con una ventana acumulada sobre el ledger — anotado como segundo paso.
   - SE ROMPE SI (documentado, no resuelto) una variante pasó 10 de los 30 días en cero:
     la velocidad se subestima y la cobertura se sobreestima. Se muestra siempre
     "observado N días" para que se lea con esa cautela.

5. **Situaciones, en orden de prioridad (la primera que calza gana):**
   riesgo de quiebre (sin stock con ventas en la ventana, o cobertura ≤ 7 días, comparada
   sin redondear) → mejora con en camino (lo que viene A TIEMPO, y que llega antes de que
   se agote lo que hay, saca a la prenda del riesgo; un traslado que llega en 13 días para
   1.5 días de stock NO es mejora, y lo atrasado no se cuenta ni se descuenta) → curva
   incompleta (talla en cero entre hermanas con stock, por producto+color, en esta sede;
   si esa talla ya viene en camino, se espera) → posible sobrestock por toda la ventana
   sin ventas con stock (antes que "reponer tienda": pedir más de lo que no se mueve es
   fabricar sobrestock) → **reponer tienda** (reserva de almacén ≤ umbral de Existencias o
   sin stock: pedir a otra sede/Taller — pero solo se SUGIERE cuánto traer con ventas
   observadas; sin evidencia la acción es "Revisar", nunca un traslado a ciegas; unidades
   "sin ubicar" por una anulación no son "sin stock") → **reponer piso** (bajar del
   almacén sano al piso: reposición interna) → posible sobrestock por cobertura ≥ 12
   semanas → normal. En el Taller (no vende a clientas) no aplican riesgo, reponer ni
   sobrestock. "Reponer tienda" y "reponer piso" son dos cosas distintas a propósito
   (pedido de Felipe): `necesitaReponerPiso` sigue apareciendo como recordatorio en el
   detalle aunque el chip diga otra cosa.
   - SE ROMPE SI Felipe cambia `UMBRAL_STOCK_BAJO_ALMACEN` en Existencias: Resumen cambia
     con él — es lo buscado, pero hay que saberlo.

6. **Sugerir traslado: explicable y sin vaciar al origen.** Necesidad según el motivo:
   por demanda (llegar a 14 días de cobertura contando solo lo que viene a tiempo), por
   reserva (volver sobre el umbral de almacén, o la demanda si es más), por curva (1
   unidad). Capacidad del origen: el Taller cede todo (no vende a clientas); una tienda
   cede solo lo que le SOBRA en el almacén por encima del umbral de reserva de Existencias
   (si no, su propio Resumen pediría la prenda de vuelta) y, si vende, conserva además
   ≥ 7 días de cobertura propia; una tienda sin historial suficiente no se toca. Gana
   quien más puede ceder; a igualdad, el Taller. La columna "En la red" muestra cuánto
   tiene el origen; la cantidad a mandar va en la acción. "Crear traslado" enlaza a
   `/inventario/mover?origen=&destino=&variante=&cantidad=` — el formulario existente,
   prellenado y validado en la página (origen por URL solo para un líder; si el origen no
   es el que esa persona puede usar, no se prellena nada), con fecha y confirmación
   humana. Ningún stock se mueve desde Resumen.
   - DESCARTÉ un botón que llame a `iniciar_traslado` desde el modal: sería un segundo
     camino de escritura para lo mismo; y la fecha estimada la decide quien despacha.
   - SE ROMPE SI `iniciar_traslado` incorpora un candado nuevo que la sugerencia no mira
     (hoy ya ignora `sedes_permitidas` de etiquetas — hueco previo, anotado en BACKLOG).

7. **Exactitud = la de Conteo, literal.** `getConteosResumen(ubicacion) + exactitudConteos`
   — el mismo número que la pestaña Conteo, con `tonoExactitud` extraído a
   `conteo-varianza.ts` para que las dos pinten igual. Sin conteos cerrados: "—" y "Aún
   no hay conteos cerrados". No se inventa nada.

8. **Safety stock detrás de la UI.** Lo que existe es `productos.stock_minimo` (por
   producto y red) y los umbrales por sede de Existencias; no hay mínimo por variante ni
   por sede en V2. Influyen en "reponer tienda"/"riesgo" y se muestran en el detalle
   ("Stock mínimo (producto, red)"), nunca como columna. Crear un mínimo por variante+sede
   es una decisión estructural de Felipe, no de este ADR.

9. **Sell-through: de ventana, no de campaña.** `vendido / (vendido + disponible +
   merma)` sobre la ventana observable (conservación de unidades; corrige el bug de V1 que
   ignoraba mermas). CAYLA no modela colección/temporada, así que NO se inventa un
   sell-through por campaña: vive solo en el detalle, no decide nada.

10. **El número siempre a la vista junto al estado** (decisión de Felipe): "1 crítica en
    los próximos 3 días", "2.9 días", "1.5 días → 5 días"; el desglose completo (piso/
    almacén, venta media con días observados, en camino con fecha, sell-through, en la
    red con la velocidad de cada sede, "por qué") está a un click en el modal.

## Revisión adversarial (2026-09-17, 4 lentes + verificación por hallazgo)

51 agentes: 47 hallazgos, 45 confirmados contra el código real. Corregidos en esta misma
pieza: `en_red` como subconsulta correlacionada (O(N²): 5,5 s con 5.048 variantes → CTE
agregada, ~100 ms, equivalencia probada con `EXCEPT`); tope silencioso de PostgREST
(`max_rows = 1000`) → paginación con Range sobre orden estable; `en_red` visible para
integrantes → solo líder (`fn_es_lider()`); `transferir()` viva, ejecutable por `anon` y
contada doble como "en camino" → drop; universo con `productos.estado='activo'` distinto
al de Existencias → mismo universo (`variantes.activo`); primer ingreso contaba entradas
a cuarentena; demanda de una importación sin `venta_items` daba 0 → `motivo='venta'`
sin FK cuenta; en camino atrasado teñía todo el traslado y se descontaba de lo pedido;
"mejora en camino" sin mirar la fecha de llegada; Taller como sede caía entero en
sobrestock; "reponer tienda" sugería traslados sin ninguna venta observada; origen que
quedaba bajo su propio umbral; umbrales contra la cobertura redondeada; sell-through sin
traslados salientes; pestaña visible a integrantes en `InventarioNav`; enlace de
exactitud a Conteo desde otra sede; `analisis` completo viajando al cliente; unidades
"sin ubicar" leídas como "sin stock"; textos ambiguos en "En la red"; voseo suelto.
Documentados sin corregir (fuera de alcance o decisión de Felipe): ventana observable vs
días con stock; `en_camino` cuenta lo enviado también en `recibido_con_diferencia` (misma
definición que Existencias, a propósito); orden de tallas hardcodeado en `tallas.ts` sin
columna `orden` en `retail.tallas`; `primer_ingreso` recorre todo el ledger (crece lineal
con los años; candidato a materializar); `fn_productos`/`fn_prioridad_conteo` rotas en
`main`; `fn_stock_por_sede()` con cuarentena; `anular_venta` al bucket NULL;
`iniciar_traslado` sin `fn_variante_permitida_en_sede`.

## Verificado en local (2026-09-17)

- `supabase db reset --local` limpio; RPC probada en psql como líder (Trujillo, Lima) y
  sin sesión (0 filas); ~10 ms con el seed; `explain analyze` usa
  `movimientos_created_at_idx` para la ventana.
- Escenario local (scratchpad, no commiteado) con historial real en Trujillo — ventas con
  `created_at` pasado + `venta_items` + movimientos aplicados, traslados en tránsito —:
  riesgo crítico (2.9 días, sugiere Taller → Trujillo · 10), mejora con en camino (6.5 →
  17.3 días, llega mañana → esperar recepción), curva incompleta (talla M en cero entre S
  y L, Taller la tiene → revisar redistribución · 1), posible sobrestock (135 sem.),
  posible sobrestock por 30 días sin ventas (y NO pide traslado), historial corto con
  ventas (no calcula nada), 12 reservas bajas sin ventas observadas → "Revisar" (2
  traslados sugeridos en total, ambos con evidencia). Un integrante (Micaela) recibe sus
  16 filas sin `en_red` y 0 filas de otra sede.
- `pnpm --filter web typecheck` limpio; `eslint` limpio; `vitest` 358/358 (51 en
  `resumen-reglas.test.ts`, 10 en `curva-variantes.test.ts`); `pnpm --filter web build` OK.
- Navegador (desktop, tablet 768, móvil 375): cinco pestañas con Resumen activa y el
  lateral iluminando "Resumen"; las 5 zonas de la referencia; cambio de sede; modal de
  detalle con el "por qué"; lista por tarjeta; "Crear traslado" abre `/inventario/mover`
  prellenado (Taller → Trujillo, Casaca Luciana M, 10 de 10) sin mover nada.
- Con el seed puro (todo cargado hoy): "Historial corto" en todo, riesgo 0, exactitud
  80 % en Lima (4 de 5, igual que Conteo), "—" en Trujillo — estados honestos, no ceros
  disfrazados.

## Limitaciones reales encontradas (no inventadas por este ADR)

- `retail.fn_productos` y `fn_prioridad_conteo` están ROTAS en `main` local ("column
  v.talla does not exist"): la taxonomía cerrada borró `variantes.talla` y dos migraciones
  de otra rama las redefinieron leyéndola. `/productos` no carga en local. Fuera de
  alcance aquí; anotado en BACKLOG como bug de `main`.
- `movimientos.motivo` sigue sin CHECK. Este ADR lo esquiva clasificando por FK, pero
  `fn_productos` y otras lecturas siguen dependiendo del texto.
- `fn_stock_por_sede()` incluye cuarentena y el cargo especial: Existencias ("en la red")
  y Vender la usan. Resumen no la usa; conviene alinearla en una migración propia.
- `anular_venta` repone al bucket `NULL` (ni piso ni almacén): esas unidades cuentan como
  disponibles pero no se pueden vender desde el POS. Resumen las muestra como "sin
  ubicar" en el detalle.
- Ventana observable vs. días con stock (decisión 4).
- La primera versión de este mismo archivo de migración (`fn_resumen_inventario`, nivel
  producto) se reemplaza: nunca salió de este worktree.

## Preguntas abiertas para Felipe (no bloquean lo construido)

- ¿Ventana fija de 30 días o elegible (7/14/30/60/90)?
- ¿Mínimo por variante y por sede (hoy solo `productos.stock_minimo` por red)?
- ¿Cuándo llevar `fn_resumen_variantes` a producción? Depende de aplicar antes
  `20260916100000_punto_reorden.sql` y la taxonomía cerrada (todavía "solo local").
