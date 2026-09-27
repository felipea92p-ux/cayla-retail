# Pantalla — Movimientos (`/inventario/movimientos`)

> Modo: **rápido + spike** (sin SQL de producción: las cifras son las de las 8 capturas de Felipe) · Fecha: 2026-09-26 ·
> Rol/sede: líder, Tienda TRU (escritorio ~1.880 px; Felipe pide juzgarla también en celular: «la mayoría usará el
> teléfono gran parte del día»).
> SHA analizado: `9f0d2f3b` (origin/main). `git diff HEAD origin/main` sobre `inventario/movimientos/**`,
> `FilaMovimiento.tsx`, `MovimientosLista.tsx`, `FiltrosMovimientos.tsx` y `lib/movimientos-reglas.ts` está vacío.
> Viene justo después de ADR-0234/0235 (PR #496, fusionado hoy 20:20): **este análisis parte de esa versión**, no la
> rehace. Otra sesión tocándola: ninguna abierta (la fila de #496 en `SESIONES-ACTIVAS.md` ya se fusionó); PR #509
> (Traslados, ADR-0239) cambia cómo se recibe un traslado, no esta pantalla.
> Archivos: `app/(app)/inventario/movimientos/page.tsx` · `components/FiltrosMovimientos.tsx` · `MovimientosLista.tsx` ·
> `FilaMovimiento.tsx` · `MovimientoDetalle.tsx` · `MovimientosVacio.tsx` · `lib/movimientos-reglas.ts` ·
> `lib/movimientos-v2.ts` · ruta `exportar/route.ts`.
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[inferido]`.

## 0 · Veredicto

Después de ADR-0234 la pantalla **dice la verdad** (entró/salió desde la tienda, una fila por operación). Lo que le
falta ahora es **llevar a algún lado**: responde «qué pasó» pero no «¿y ahora qué hago?», y en el celular obliga a pasar
por cabecera, tres cifras, dos filas de píldoras y una línea de ayuda antes del primer movimiento. Tres bugs chicos
(apartados en «0», píldoras en cero que llevan a un vacío, instrucciones repetidas) le restan confianza.

## 1 · Finalidad

«Que cualquier integrante de la sede sepa **por qué** el stock es el que es —qué entró, qué salió, quién y contra qué
documento— y desde ahí llegue al proceso que lo originó.» Fuente: ADR-0127, ADR-0234, `docs/ARQUITECTURA.md` (Inventario
V2). Es una pantalla de **consulta**: no escribe (el trigger de inmutabilidad lo impide), y así debe seguir.

## 2 · Objeción (lo peor arriba)

1. **Los apartados agrupados dicen «0» y los sueltos «⇄ 1».** `[visto: capturas 1–2]` «Test de Produto 2 · 2 variantes ·
   Apartado · **0**» y «Apartado liberado · **0**». Causa: `resumirOperacion` solo suma `movidas` para `interno`
   (`lib/movimientos-reglas.ts:595`) y `textoCantidadOperacion` cae a `"0"` (`:624`); la fila suelta sí marca los
   apartados como internos (`FilaMovimiento.tsx:72`). Además el apartado **no tiene referencia** (`referenciaMovimiento`,
   `:329-363`, no lo contempla) ni píldora que lo filtre: aparece en «Todos» y en ningún otro lado. Con Apartados ya
   convertido en módulo propio (ADR-0196), es la conexión que más falta.
2. **Las píldoras en cero llevan a un callejón.** `[visto: captura 5]` «Traslados 0» se puede tocar y deja la pantalla
   en «Ningún movimiento coincide», con las tres tarjetas en «—». La cifra ya avisaba que no había nada.
3. **Nada lleva a actuar.** El detalle y la nota del pie dicen «se corrige con otro movimiento» `[código page.tsx:154]`,
   pero no hay camino a ese otro movimiento (Ajustar, Contar). Desde una venta no se llega a Cambio/Devolución; desde
   una entrada no se llega a Bajar al piso ni a Etiquetas, aunque esas pantallas ya aceptan la lista cargada
   (`/inventario/bajar?lineas=`, `/etiquetas-de-precio?variantes=`, ADR-0237).
4. **Ruido de piso↔almacén.** `[visto: capturas 1, 6, 7]` 27 de 84 operaciones son «Bajada al piso» que no cambian el
   total; en «Todos» ocupan los primeros lugares del día. Igual con 20 «Ajuste · reposición» de la misma prenda a la
   misma hora (10:05) `[visto: captura 8]`: son operaciones distintas (ADR-0234 D2, transacciones separadas) pero se
   leen como una sola tarea.

## 3 · Lo que está bien y no se toca

- Lectura desde la tienda y una fila por operación (ADR-0234): «Entró +427 · 377 de stock inicial · 50 de proveedor» es
  verdad y se entiende. `[visto]`
- Referencias vivas: Boleta abre la venta, Factura abre la compra, Traslado/Conteo abren su pantalla y vuelven con los
  filtros (`?volver=`). `[código FilaMovimiento.tsx:224-262]`
- Buscador que entiende «venta», «traslado»… y los vuelve filtro (`filtroDePalabra`). `[código]`
- Filtros en la URL (se comparten por WhatsApp), `?mov=` con «Copiar enlace», exportación con los mismos filtros.
- Sin edición ni borrado: la pantalla es historial, y eso es su valor.

## 4 · Redundancias (qué sobra o se repite)

| Qué | Dónde | Por qué sobra |
|---|---|---|
| Frase «Toca un movimiento para ver…» | `page.tsx:128-132` | Instrucción permanente; la flecha › y el cursor ya lo dicen. A la 3.ª visita es ruido. |
| «Filtrando: Entradas · Limpiar filtros» | `FiltrosMovimientos.tsx` | Repite la píldora negra apretada. «Limpiar» puede ser una × en la píldora. |
| Fila «Proceso: Todos» con una sola opción | captura 5 (Traslados), 4 (Salidas → Venta) | Elegir entre «Todos» y «Venta» cuando solo hay ventas no filtra nada. |
| Nota «Registro transparente» del pie | `page.tsx:154` | Repite la frase del subtítulo («No se edita ni se borra nunca»). |
| Tarjetas y píldoras cuentan lo mismo con otra unidad | cifras vs. píldoras | Tarjetas en unidades, píldoras en operaciones; son dos lecturas de lo mismo y las tarjetas no se pueden tocar. |
| «Exportar a Excel» como botón principal | cabecera | Acción de oficina (mensual); en el celular ocupa el único lugar de acción. |
| «13 movimientos en esta página» | pie | Dato de paginación; lo útil es «Ver más». |

## 5 · Qué hacen otros (referentes)

Ver la sección «Referentes» al final (investigación del 2026-09-26, fuentes marcadas).

## 6 · Ideas para la rapidez de la colaboradora (ordenadas por impacto)

1. **Acciones en el detalle según el proceso** (el movimiento lleva a la pantalla que ya hace el trabajo, con la lista
   cargada; no se hace nada aquí): Venta → Cambio · Devolución · Ver venta; Entrada/Recepción/Stock inicial → Bajar al
   piso · Imprimir etiquetas; Traslado → Ver traslado (y «Recibir» si está en camino); Apartado → Ver apartado; Ajuste
   → Contar esta prenda; cualquiera → Ver prenda en Existencias · Historial de la prenda; líder → Corregir con un ajuste.
2. **Escanear una etiqueta** para ver qué le pasó a esa prenda (cámara en el celular, pistola en la computadora):
   «¿por qué dice 3 si cuento 2?» es la pregunta con la que se llega. `EscanerBusqueda` ya existe.
3. **«Hoy» como período rápido** (y por defecto en el celular): la pregunta de la tienda es «qué pasó hoy».
4. **Piso ↔ almacén plegado en «Todos»**: una fila por día «Bajadas al piso · 14 prendas · 11:52–15:18» que se
   despliega; con la píldora «Piso ↔ almacén» se ven todas.
5. **Tarjetas que filtran** (tocar «Salió» = píldora Salidas) y **píldoras en cero apagadas**.
6. **Apartados con su referencia y su píldora**, y la cifra correcta.
7. **Celular:** buscador + escanear fijos arriba, cifras en una franja, filtros en una hoja («Filtros · 2»), «Ver más»
   en vez de paginar, detalle como hoja que sube con las acciones abajo al alcance del pulgar.
8. **«Lo que hice yo hoy»** (opcional, a decidir): la integrante confirma al cerrar su turno que lo que bajó/recibió
   quedó. ADR-0127 quitó el filtro por persona («no es para culpar»); esto sería solo la cuenta propia.

## 7 · Las 12 tareas

| # | Tipo | Tarea | Dónde | Esfuerzo |
|---|---|---|---|---|
| 1 | Corregir | Apartados: cifra «1 apartada» (no «0») y enlace a Apartados. **Ojo:** `movimientos` no tiene `apartado_id` (22 columnas, `DICCIONARIO-RETAIL.md:872`): «Apartado N» exacto pide una columna nueva (cambio de esquema, confirmar); sin ella, solo «Ir a Apartados» | `movimientos-reglas.ts:329,595,624` | S (M con columna) |
| 2 | Corregir | Píldoras en cero deshabilitadas (se ven, no se tocan) y fila de proceso solo si hay ≥ 2 procesos | `FiltrosMovimientos.tsx` | S |
| 3 | Conectar | Acciones por proceso en el detalle (lista de la idea 1), cada una solo si el rol ve ese módulo | `MovimientoDetalle.tsx` | M |
| 4 | Mejorar | Escanear etiqueta (cámara en celular, Enter con código exacto en la computadora) | `FiltrosMovimientos.tsx` + `EscanerBusqueda` | S |
| 5 | Mejorar | Período «Hoy» | `PERIODOS_RAPIDOS` | S |
| 6 | Mejorar | Plegar Piso ↔ almacén en «Todos» por día | `MovimientosLista.tsx` | M |
| 7 | Mejorar | Tarjetas que filtran | `page.tsx` `Cifras` | S |
| 8 | Eliminar | Quitar la frase de ayuda, «Filtrando: …» y la nota duplicada del pie | `page.tsx`, `FiltrosMovimientos.tsx` | S |
| 9 | Mejorar | Celular: filtros en hoja, «Ver más», buscador fijo | varios | M |
| 10 | Mejorar | Exportar pasa a un menú «⋯» junto a Actividad (computadora) / dentro de la hoja de filtros (celular) | `page.tsx` | S |
| 11 | Replantear | ¿«Lo que hice yo hoy»? Decide Felipe (choca con ADR-0127) | — | S |
| 12 | Futuro | Saldo después de cada movimiento (kardex) — ADR-0234 lo descartó; solo si se pide, con `fn_ledger_timeline` | — | L |

## Referentes (investigación del 2026-09-26)

Solo lectura de la documentación pública; lo no confirmado va marcado.

- **Shopify:** «Adjustment history» desde la ficha del producto (180 días): motivo, quién y, por estado, el cambio y el
  total nuevo. Para toda la tienda, el reporte «Inventory adjustment changes» filtra por SKU, sede, colaborador y motivo
  y trae la referencia al documento (orden, traslado). Fuente: help.shopify.com (adjustment-history; inventory-adjustment-reports).
- **Square for Retail:** historial global y por variante; filtros de fecha, sede, tipo (suma/resta/reconteo), motivo y
  producto; tocar un evento muestra quién, costo y sedes. No agrupa ni enlaza documentos. Exporta CSV (planes pagos).
  Fuente: squareup.com/help artículo 6061.
- **Lightspeed R-Series:** pestaña History del artículo; «Source» y «Customer» son enlaces a la venta, la orden de
  compra, el traslado o la clienta; muestra saldo y costo. Fuente: retail-support.lightspeedhq.com (40251772748955).
  X-Series: filtros por tipo y sede `[no verificado: solo fragmento del buscador]`.
- **Loyverse:** vista global y «View history» en la ficha; filtros período, tienda, colaborador y motivo; el motivo
  enlaza al documento de origen. Fuente: help.loyverse.com (inventory-history-and-valuation).
- **Odoo:** Moves History con filtros listos (entrante, saliente, interno), agrupa por operación («transferencia») y
  revierte un ajuste con un movimiento compensatorio desde el historial `[verificado parcial]`. Fuente: odoo.com/documentation.
- **Bsale / Alegra:** kardex por producto y mes, exportable; Alegra lo abre desde la ficha del ítem. Fuente: ayuda.bsale.io, ayuda.alegra.com.
- **Celular:** ninguno documenta un historial pensado para el teléfono (solo Shopify confirma que su app lo muestra).
  Escanear la etiqueta para ver la historia de una prenda sería propio de CAYLA.

Lo que CAYLA ya tiene de esto: referencia enlazada (Loyverse, Lightspeed), agrupar por operación (Odoo), historial por
prenda desde la ficha (`/productos/[id]/historial`). Lo que se copia en el spike: corregir desde el historial (Odoo),
filtros de un toque (Odoo) y el período corto. Lo que no: el saldo tras cada fila (ADR-0234 lo descartó) y el filtro
por colaborador (ADR-0127; ver tarea #11).

## Historial

| Fecha | SHA | Modo | Nota |
|---|---|---|---|
| 2026-09-26 | `9f0d2f3b` | rápido + spike | Primer análisis tras ADR-0234; spike en `docs/maquetas/movimientos-conectado-2026-09/` |
| 2026-09-26 | encima del #512 | ejecución | Felipe eligió las 4 recomendadas + los 4 atajos + apartado exacto + Conteo con lista; «Lo que hice yo» no. Construidas #1 a #10 (ADR-0241). **Corrección al análisis:** la #1 NO pedía columna nueva: `apartados.movimiento_id` ya existe. La nota «Registro transparente» se quedó (la pide ADR-0169); se quitó la frase repetida del subtítulo. |
