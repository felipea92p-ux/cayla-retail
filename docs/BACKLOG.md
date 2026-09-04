# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] **`almacen interno` (BLOQUEA `catalogo real` de abajo): "Recibir mercadería" es
      HOY el único camino para crear un producto — no hay pantalla "+ Nuevo
      producto" aparte — y esa pantalla no tiene a dónde escribir.** Confirmado
      2026-09-03: la unificación nunca recreó las sedes-almacén (TRU-ALM/AQP-ALM/
      LIM-ALM existían en el retail original, `0008_almacen.sql`, pero no se
      migraron — `retail.sede_meta` solo tiene tienda/fabrica/corporativo). Recibir,
      Almacén y "Bajar a tienda" buscan una sede `tipo='almacen'` que no existe en
      ninguna de las 4 sedes operativas (TRU/AQP/003/LIM) → bloqueadas las tres.
      Diseño ya decidido con Felipe (no una sede hermana nueva en Dynamic — un
      contenedor `tipo='almacen'` + tabla `retail.stock_almacen` dentro de la misma
      sede) y migración completa ya escrita en
      `supabase/unificacion/12_almacen_interno.sql` (sin commitear, SIN APLICAR).
      **No pegar todavía**: dos verificaciones adversariales la marcaron insegura —
      hace `CREATE OR REPLACE` sobre `fn_aplicar_movimiento`/`recalcular_stock`
      asumiendo que coinciden con el repo, sin confirmarlo contra producción (a
      diferencia de `retail.sedes`, que sí se verificó con un SELECT real), y
      `retail.recibir_lote` YA se sabe que diverge (el frontend le manda
      `p_orden_compra_id`/`p_orden_produccion_id` que el archivo del repo no
      tiene). Próximo paso: pedirle a Felipe `select pg_get_functiondef(...)` de
      esas 3 funciones en producción antes de tocar nada. El Taller (LIM) queda
      con su contenedor creado pero SIN integrar — `registrar_produccion`/
      `cerrar_produccion` siguen sin usarlo — decisión pendiente de Felipe: si lo
      terminado del Taller debe pasar por el almacén interno o seguir directo al
      piso como hoy.
- [ ] `catalogo real`: cargar los 300-900 SKUs físicos — el desbloqueador más grande
      que queda. Arrancado 2026-09-03: taxonomía alineada a compras reales
      (5 categorías nuevas, `0030_categorias_captura_real.sql`, ADR-0003) escrita,
      pendiente de correrla en producción — es el paso 0 antes de capturar nada,
      para no re-taxonomizar cientos de prendas después. Con eso corrido, sigue el
      plan de captura real de `docs/PLAN-DE-TRABAJO.md` §5 (por semana, sin parar
      la venta) usando `docs/GUIA-CARGA-CATALOGO.md`. Sin esto, Comercial e
      Inteligencia trabajan con datos de juguete. Reversible: sí (son datos, no
      esquema). **Depende de `almacen interno` de arriba** — sin almacén no hay
      cómo recibir, y sin recibir no hay cómo crear un producto nuevo.
- [ ] **`finanzas F3` — parte 1 construida 2026-09-04 (ADR-0005), parte 2 sin
      empezar.** Felipe pidió facturación electrónica hablando directo con la
      API de SUNAT (SEE del Contribuyente), no vía OSE/Nubefact como asumía
      este ítem originalmente. Construido y verificado (Postgres local
      aislado, sin tocar el stack de cayla-dynamic): `0032_comprobantes.sql`
      — tablas `comprobantes`/`series_comprobantes`, RPCs
      `emitir_comprobante`/`registrar_serie_comprobante` (candado `for update`
      por serie, factura sin RUC es imposible por constraint), pantalla
      `/finanzas/facturacion` con su entrada en `FinanzasNav`. El comprobante
      queda "Pendiente de enviar" — el envío real a SUNAT (XML UBL 2.1
      firmado, SOAP, CDR) es la parte 2, sin empezar: depende de que Felipe
      decida con Claude SEE propio (certificado digital + homologación SUNAT,
      semanas) vs. OSE (Nubefact, días) — ver ADR-0005 para el trade-off
      completo. También depende de la Epson TM-T20III para imprimir el
      comprobante ya aceptado. Reversible: sí, es una tabla nueva sin datos
      reales todavía.
- [ ] `produccion — insumos del taller`: la receta de costo (`0024`-`0029`) calcula
      con tela+avíos como costo directo declarado a mano, pero sigue sin inventario
      real de materia prima (decisión de julio: "insumos después"). Sin esto, el
      Taller no sabe cuándo se queda sin tela hasta que pasa. Depende de: decidir
      con Felipe si ya toca retomarlo o sigue postergado. Reversible: sí.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] **`recibir_lote`: arreglo pegado en producción 2026-09-03, pendiente de
      confirmar el resultado (ADR-0004).** Dos sesiones paralelas llegaron a
      esta función el mismo día por caminos distintos y convergieron en el
      mismo arreglo — buena señal, no ruido: `pg_get_functiondef` contra
      producción + `RecibirLoteForm.tsx` mostraron que la unificación migró
      una copia de `recibir_lote` más vieja que la `0018` local, perdiendo
      tres cosas — no valida sede (mismo hueco que `0012_rpc_valida_sede.sql`
      ya había cerrado), no guarda `categoria_id` (cada producto nuevo por
      "Recibir mercadería" quedaba sin categoría, pese a que el formulario sí
      la manda — rompía lo de `0030`), y no aceptaba `p_orden_compra_id`
      (recibir ligado a una orden de compra fallaba). Versión local (idéntica
      a 0018) en `supabase/migrations/0031_recibir_lote_completo.sql`; cuerpo
      schema-calificado para producción en
      `supabase/unificacion/14_recibir_lote_produccion.sql` — el archivo
      `13_recibir_lote_valida_sede.sql` quedó marcado SUPERADO (mismo
      hallazgo de sede, alcance más angosto). Felipe pegó la versión completa
      en el SQL Editor — falta confirmar el mensaje de resultado antes de
      cerrar este ítem.
      Agravante relacionado, sin arreglar todavía: `retail.puede_operar_sede`
      (`03_candados.sql:53-55`) tampoco tiene la cláusula `tienda_asociada_id`
      que sí tenía la versión local (`0012`) — hoy solo Líder/admin pasaría ese
      candado para una sede que no es la propia.
- [ ] **`producción`: reconciliar `ordenes_produccion` (modelo viejo) con
      `producciones` (modelo vigente desde `0025`-`0029`) — nunca se propagó.**
      Encontrado al intentar arreglar `recibir_lote`: `inventario/recibir/
      page.tsx:52,57` todavía consulta `retail.ordenes_produccion` y una
      columna `retail.lotes.orden_produccion_id` que **no existe** en
      producción (verificado: `retail.lotes` solo tiene `orden_compra_id`).
      El frontend manda `p_orden_produccion_id` a `recibir_lote`
      (`RecibirLoteForm.tsx:218`) y siempre falla cuando se usa. Deliberadamente
      fuera de `0031` — decidido con Felipe 2026-09-03. Necesita: decidir si
      `producciones` reemplaza del todo a `ordenes_produccion` (¿se puede
      dropear la vieja?), una columna nueva en `lotes` para el vínculo, y
      reescribir la consulta de "producciones pendientes de recibir" contra el
      modelo nuevo. Reversible: sí, nada de esto se ha tocado todavía.
- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide
      `proxy.ts`). Solo un warning en build, no rompe nada. Reversible: sí.
- [ ] `pruebas`: un solo archivo de test (`registro-contable.test.ts`) para todo el
      núcleo de dinero e inventario — `registrar_venta`, `cerrar_caja`,
      `fn_aplicar_movimiento`, las RPCs de producción, no tienen prueba
      automatizada, solo verificación manual en vivo por Felipe. Cayla Dynamic
      (proyecto hermano) corre 302 pruebas pgTAP sobre su propio dinero; acá el
      principio 7 ("pasos verificables") se cumple con el navegador pero no queda
      capturado para que no se repita un bug ya resuelto.
- [ ] `unificación retail↔dynamic`: confirmada aplicada y con datos (ver CERRADO),
      pero sin documentar formalmente — falta el ADR que debió escribirse en
      julio (principio 8) y el `02_*.sql` que crea el schema en sí nunca quedó en
      el repo (se infiere solo de la cabecera de `03_candados.sql`). Deuda de
      documentación, no de funcionamiento. Reversible: sí, es solo escribir.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [ ] `inteligencia`: umbral de estancado (45d) y lead time (14d) siguen siendo
      constantes globales, no por categoría/sede. Sigue sin justificarse afinarlo:
      no hay datos reales de venta todavía (depende de `catalogo real` arriba).
- [ ] `almacen/recibir`: rediseño de UX pendiente desde el 17-jul — talla/color/
      categoría quedan escondidos hasta buscar y crear un producto nuevo. Pedido
      explícito de Felipe, nunca agendado en una sesión propia.
- [ ] `finanzas`: el costo de lo vendido usa el costo VIGENTE de cada prenda, no el
      costo del día de la venta. Inofensivo mientras los costos sean estables (nota
      del 17-jul); si algún día se mueven, distorsiona el histórico de EERR pasados.

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **Schema de Postgres como "cajón" aislado** — el hallazgo de arriba no se
      entiende sin este modelo mental: `public` y `retail` pueden vivir en el
      MISMO proyecto Supabase sin verse entre sí a menos que algo los conecte a
      propósito (las vistas puente del paso 3 de unificación). Es la pieza que
      explica por qué "cambiar una palabra en el cliente" puede romper todo.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento` y las RPCs de venta/
      producción pueden saltarse RLS y por qué eso es seguro *solo* porque validan
      todo adentro (sede del que llama, cuadre de asiento, etc.).
- [ ] **Costeo por margen de contribución** (introducido en `0024`) — por qué la
      mano de obra y los gastos fijos del Taller NO entran al costo por prenda y sí
      al resultado mensual del Taller; es una decisión contable, no un descuido.

## ✅ CERRADO (últimos, con fecha)

- [x] 2026-07-19/23 — Producción del Taller construida de punta a punta más allá de
      lo registrado en BITACORA: costeo por margen de contribución (`0024`),
      registrar producción por corrida (`0025`), producción a nivel de modelo
      (`0026`), variantes estilo Shopify + "marcar terminado" → inventario
      (`0027`), corrección de producciones mal registradas (`0028`), y la orden de
      producción unificada con 6 etapas y 2 tipos (muestra/producción) en `0029` —
      reemplaza los dos mecanismos que se pisaban entre sí. **Commiteado, sin
      confirmación explícita de Felipe en producción todavía** (no hay entrada de
      bitácora que lo confirme, a diferencia de todo lo anterior).
- [x] 2026-07-16 — Fase 2 pivotada de finanzas a "Inventario Inteligente" (decisión de Felipe)
- [x] 2026-07-17 — Inventario Inteligente commiteado (`feat(inventario)`, `fix(movimientos)`, `docs`)
- [x] 2026-07-17 — Fix RLS: traslados visibles para la sede que los recibe → ADR-0001
- [x] 2026-07-17 — Fix: 4 filas duplicadas en `personas` bloqueaban el login de Felipe;
      agregado `unique(auth_user_id)` para que no se repita → ADR-0002
- [x] 2026-07-17 — Repo conectado a GitHub (`felipea92p-ux/cayla-retail`, privado) —
      antes solo existía en esta Mac, sin respaldo. Vercel conectado al repo para
      deploy automático en cada push; deploy de Inventario Inteligente confirmado
      en `cayla-retail.vercel.app`.
- [x] 2026-07-17 — Fase 2 financiera: Diario de Caja (apertura/cierre con conteo
      ciego), Gastos, Estado de Resultados (mermas como COGS). Verificado por Felipe
      en local. "Venta" se retiró del modal de movimiento genérico — el botón
      "Vender" es ahora la única fuente de verdad para registrar una venta.
- [x] 2026-07-17 — Fase 3: ingreso de mercadería y almacén — un almacén hermano por
      tienda (TRU-ALM/AQP-ALM/LIM-ALM), contenedores, `/almacen/recibir` (lotes),
      `/almacen` (stock + "Bajar a tienda"), devolución con motivo estructurado
      reutilizando `traslado`. Diseñado tras 24 preguntas de descubrimiento (no
      adivinado). Verificado en producción por Felipe.
- [x] 2026-07-17 — Taxonomía real de catálogo: `productos.categoria` (texto libre)
      → 6 familias fijas + 30 categorías en tabla `categorias`, editable por Líder
      sin deploy. Tallas sugeridas por categoría alimentan un `<select>` real en
      "Recibir mercadería". Migración `0009` corrida en Supabase y verificada en vivo.
- [x] 2026-07-17 — Endurecimiento de stock contra concurrencia (`0010`): `for update`
      al validar + `check (cantidad >= 0)` + FK de `movimientos.venta_id`. Cierra la
      condición de carrera que dejaba el stock en -1 con dos ventas simultáneas de la
      última unidad. Encontrado en la revisión nocturna, aprobado y corrido por Felipe.
- [x] 2026-07-18 — "Estancado" mide días sin venta real (`0011`): columna
      `stock.ultima_venta` sellada solo con motivo='venta'. Indicador renombrado a
      "Días sin venta".
- [x] 2026-07-18 — Las 5 RPCs security-definer validan la sede del que llama (`0012`,
      helper `fn_puede_operar_sede`). Cierra la puerta de atrás: nadie mueve stock ni
      cajas de otra sede por API directa.
- [x] 2026-07-18/19 — Identidad visual CAYLA aplicada (brandbook v3.0: Rojo #B8412D,
      Crema #F5F0E8, Tinta #1A1A18, EB Garamond + DM Sans) y rediseño UX total v3
      (AppShell, navegación lateral/móvil, catálogo agrupado, selector de sede del
      Líder). Verificado en vivo por Felipe.
- [x] 2026-07-19 — F1 núcleo financiero (jubilación de SINATRA): proveedores,
      depósitos, ajustes de efectivo, históricos, patrimonio (`0013`-`0014`). Fase B:
      etiquetas Brother con código de barras Code 128 propio, fotos por modelo,
      stock mínimo por sede (`0015`-`0016`). F2: órdenes de compra formales, export
      Excel, modelo de gastos corregido (`0017`). Producción del Taller v1: etapas,
      receta de costo (`0018`). C1: los 4 estados financieros completos por lectura,
      sin tocar money paths (`lib/contabilidad.ts`). Ayudas (!) educativas regadas
      por toda la app. Todo desplegado y verificado el mismo día.
- [x] 2026-07-19 — Motor contable de doble partida (`0019`-`0023`): plan de cuentas
      PCGE, `registrar_asiento` con cuadre forzado, activos fijos con depreciación
      NIIF/SUNAT automática, fix de recursión infinita en RLS de identidad.
- [x] ~2026-07-20/23, confirmado en producción 2026-09-03 — Unificación de
      identidad: retail deja de tener sus propias `sedes`/`personas` y pasa a
      leerlas de Dynamic vía un schema `retail` dedicado dentro del proyecto
      Dynamic, con vistas puente y RPCs migradas (`supabase/unificacion/01`-`11`).
      Verificado con Felipe contra el SQL Editor de producción: el schema
      `retail` existe, tiene 28 tablas (más que las ~22 originales — las
      migraciones de producción `0024`-`0029`, posteriores a la unificación,
      sumaron tablas nuevas encima), y `retail.sedes` devuelve 5 filas reales, no
      vacío. Descarta el riesgo que abrió esta auditoría: la app NO llevaba 6
      semanas rota. Pendiente solo la documentación (ver ARREGLAR).

## 📎 De sesiones previas de Claude Code (contexto, no repetir)

- `docs/CHECKLIST-MANANA.md` (17-jul) y `docs/PLAN-DE-TRABAJO.md` (19-jul): ya
  incorporados arriba, todo lo accionable de ahí quedó cerrado o migró a este
  backlog. Se conservan como registro histórico, no como pendientes activos.
