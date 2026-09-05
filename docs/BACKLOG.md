# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [x] **`almacen interno`: aplicado y verificado en producción 2026-09-03 —
      backend completo, frontend adaptado, falta la prueba en vivo por Felipe.**
      "Recibir mercadería" era el único camino para crear un producto y no
      tenía a dónde escribir (la unificación nunca recreó las sedes-almacén
      TRU-ALM/AQP-ALM/LIM-ALM del retail original). Decisión: el almacén deja
      de ser una sede hermana — pasa a ser un contenedor `tipo='almacen'`
      dentro de la misma sede + tabla `retail.stock_almacen` aparte.
      `supabase/unificacion/12_almacen_interno.sql` pegado y verificado: 4
      contenedores (TRU/AQP/003/LIM, CCO sin ninguno — confirmado con
      `select` real). Las 3 funciones que reescribe (`fn_aplicar_movimiento`,
      `recalcular_stock`, `puede_operar_sede`) se verificaron byte por byte
      contra producción ANTES de pegar, no se asumieron. Frontend actualizado
      en 7 archivos (`inventario/recibir`, `RecibirLoteForm`,
      `inventario/almacen`, `AlmacenStockList`, `BajarATiendaModal`,
      `inventario` catálogo, `InventarioAgrupado`) — ya no buscan una sede
      `tipo='almacen'`, usan el contenedor de la propia sede. Tipos de
      `packages/database` regenerados contra el proyecto correcto
      (`--project-id` de cayla-DYNAMIC, `--schema retail`) — el script de
      `gen-types` en `package.json` sigue apuntando al proyecto viejo de
      retail y hay que corregirlo a mano la próxima vez (ver ítem de tipos
      abajo). **Sin decidir todavía:** si lo terminado del Taller (LIM) debe
      pasar por el almacén interno (con su propio "bajar a piso") o seguir
      directo al piso como hoy — su contenedor ya existe, pero
      `registrar_produccion`/`cerrar_produccion` no lo usan. Y "Devolver a
      almacén" (piso → almacén) quedó con su RPC (`retail.devolver_a_almacen`)
      pero sin conectar en el frontend — pregunta de UX abierta con Felipe
      (¿botón propio, o dentro de `MovimientoModal`?). **Falta lo único que
      de verdad lo cierra: que Felipe entre un producto real por la pantalla
      y confirme que aparece.**
- [ ] **`tipos de TypeScript`: regenerar contra el proyecto correcto sacó a la
      luz 30 errores en 14 archivos que nadie tocó hoy — deuda real, no
      ruido de esta sesión.** `retail.sedes`/`retail.personas` son VISTAS
      (join contra `public` de Dynamic) — Postgres no le garantiza a Supabase
      que sus columnas nunca sean nulas, así que el tipo real es
      `string | null` donde el proyecto viejo (con el que se generaban los
      tipos hasta hoy) decía `string`. Afecta `finanzas/*`, `produccion/page.tsx`,
      `producto/[varianteId]/page.tsx`, `layout.tsx`, `actions/sede.ts`,
      `api/export/inventario`, `PatrimonioEditor.tsx`, `lib/finanzas-nucleo.ts`,
      `lib/panel.ts`, `lib/persona.ts`, `lib/sedes.ts` — ninguno tocado en esta
      sesión. `next build` (sin `ignoreBuildErrors` en `next.config`) fallaría
      hoy con estos 30 errores. Necesita su propia sesión, revisando caso por
      caso si el `null` es real (¿puede una sede no tener código?) o si basta
      con filtrar/asegurar como se hizo en `inventario/page.tsx` esta sesión.
      Aparte: `packages/database/package.json` (`gen-types`) sigue apuntando al
      proyecto viejo de retail — corregirlo al de Dynamic + `--schema retail`
      para que esto no se repita.
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
- [ ] **`reemplazo total de Alegra` (antes "finanzas F3") — proyecto propio con
      plan de 8 fases aprobado (Fase 0.5 sumada después). Fase 0 CERRADA Y
      CONFIRMADA EN PRODUCCIÓN 2026-09-05; Fase 0.5 en construcción.** Felipe
      decidió reemplazar Alegra por completo (facturación + contabilidad +
      gastos + ingresos + resumen ejecutivo), no solo conectar SUNAT. Plan
      completo en `~/.claude/plans/cozy-gathering-nova.md`.
      **Corrección importante (ADR-0005, actualizado 2026-09-05):** el
      proveedor de transmisión SUNAT NO es Nubefact — es **Lucode**
      (`app.apisunat.pe`), con quien Felipe ya tenía relación comercial y
      credenciales de sandbox emitidas; más barato que Nubefact (S/30/mes vs
      S/70/mes al mismo volumen). El mecanismo es tercerización **PSE** (sí es
      término oficial SUNAT — la investigación original se equivocó en eso),
      no homologación OSE: CAYLA sigue como "SEE - Del Contribuyente" pero
      autoriza a Lucode a transmitir en su nombre. **Trámite pendiente, hace
      Felipe, no requiere código:** alta como PSE tercero en SUNAT SOL
      (RUCs GIOR TECHNOLOGY `20515809822` / VIDA SOFTWARE `20600337832`, fecha
      de inicio mañana o posterior — SUNAT no permite el mismo día). Mientras
      no se dé de alta, no se puede transmitir en producción aunque el código
      esté listo.
      **Fase 0 (ADR-0007) — verificada en producción:** `17_facturacion_completa.sql`
      pegado; confirmado con `pg_proc`/`information_schema.tables` que las 6
      funciones y las 3 tablas (`comprobantes`, `series_comprobantes`,
      `proformas`) existen. Proforma en tabla separada (nunca se "promociona"
      con UPDATE), NC/ND con referencia obligatoria a un comprobante aceptado
      (CHECK + trigger), `nota_debito` agregado.
      **Fase 0.5 (tokens de diseño) en construcción:** `packages/shared/src/
      design-tokens.ts` (espejo tipado de `globals.css`) y `TarjetaIndicador.tsx`
      ya creados por una sesión paralela; radios corregidos a 0px en toda la
      app (brandbook pedía esquinas rectas, se habían desviado a 8-18px).
      **Aparte, ya construido 2026-09-05 (ADR-0008):** verificación de cliente
      contra RENIEC/SUNAT antes de emitir (`packages/shared/src/documento.ts`,
      `apps/web/lib/padron.ts`, `ConsultaDocumento.tsx`) — encontró y corrigió
      2 bugs reales (middleware bloqueaba rutas de API, estado de tipo de
      documento desincronizado del tipo de comprobante).
      **Aparte, ya construido 2026-09-05:** `supabase/seed.sql` renombra
      `public`→`retail` después de migrar en local — el stack local nunca
      había podido correr con el mismo schema que producción hasta ahora.
      **Pendiente, sin bloquear el proyecto:** preguntarle al contador si
      CAYLA ya cruzó el umbral SIRE (75 UIT, ~S/412,500/año) — obligación
      distinta del PLE (300 UIT) que probablemente ya aplica hoy.
- [ ] **`crear_producto_con_variantes`: construido y verificado (build/lint,
      `next build` limpio) 2026-09-04 — falta que Felipe pegue la RPC en
      producción.** "Recibir mercadería" crea un `producto` nuevo por CADA
      ítem agregado con "+ Agregar prenda nueva": pedir la misma referencia
      varias veces (una por talla/color) dejaba varios productos duplicados
      en vez de un modelo con N variantes. Nueva pantalla
      `/inventario/producto/nuevo` (solo Líder): referencia + familia/
      categoría + chips de talla/color + matriz generada con precio/costo/
      SKU editable por fila → un solo INSERT a `productos` + N a `variantes`,
      sin tocar `stock`/`movimientos` (el modelo nace con 0 unidades hasta el
      primer lote real). Mismo patrón dual que `recibir_lote` (ADR-0004):
      versión local sin prefijo en `0033_crear_producto_variantes.sql`,
      versión schema-calificada para pegar en el SQL Editor de producción en
      `supabase/unificacion/16_crear_producto_variantes.sql`. **Pendiente:
      que Felipe pegue el archivo 16 en producción y cree un producto real
      (ej. varias tallas/colores) para confirmar que aparece en Catálogo** —
      cierra además la verificación que le faltaba a `almacen interno` de
      arriba ("que Felipe entre un producto real por la pantalla").
- [ ] **`padrón RENIEC/SUNAT`: construido y verificado 2026-09-05 — falta que
      Felipe contrate un proveedor y ponga dos variables de entorno.** El modal
      de emisión ya lee el DNI/RUC y muestra a quién pertenece antes de emitir
      (nombre o razón social, y para RUC además estado y condición, porque una
      factura a un RUC de baja o "no habido" la rechaza SUNAT con el correlativo
      ya quemado). Adaptadores para tres proveedores intercambiables — ADR-0008.
      **Pendiente:** contratar `decolecta`, `apisnetpe` o `factiliza`, y poner
      en Vercel `PADRON_PROVEEDOR` (uno de esos tres nombres) y `PADRON_TOKEN`.
      Sin eso la pantalla funciona igual, avisando que la consulta automática no
      está activada y dejando escribir el nombre a mano. Reversible: sí (no
      toca el esquema).
- [x] **`la app nunca ha corrido contra el Supabase local` — RESUELTO
      2026-09-05 (ADR-0010).** Eran tres causas: healthchecks que abortaban
      `supabase start` entero, el schema `retail` que en local no existía, y
      `lib/persona.ts` sin reconocer el rol `lider`. Ahora `npx supabase start`
      + `pnpm dev` levanta la app completa contra local (instrucciones en el
      README). Verificado emitiendo una boleta real. Precio: Storage apagado en
      local — subir fotos de producto no funciona ahí.
- [ ] `migraciones duales (local sin prefijo / producción con prefijo retail.)`:
      la causa raíz de ADR-0004 y ADR-0006 sigue viva — cada cambio de esquema
      se escribe dos veces y las dos copias se desincronizan. Ahora que el local
      corre en el schema `retail` (ADR-0010), la ruta para matarlo es más corta:
      escribir las migraciones una sola vez, ya calificadas. Requiere revisar
      las 32 funciones con `set search_path` y las vistas puente sobre dynamic.
      No urgente, pero es la deuda que más caro ha salido hasta hoy.
- [ ] `produccion — insumos del taller`: la receta de costo (`0024`-`0029`) calcula
      con tela+avíos como costo directo declarado a mano, pero sigue sin inventario
      real de materia prima (decisión de julio: "insumos después"). Sin esto, el
      Taller no sabe cuándo se queda sin tela hasta que pasa. Depende de: decidir
      con Felipe si ya toca retomarlo o sigue postergado. Reversible: sí.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] **`patrimonio_items.categoria` no existe en producción (ADR-0006,
      2026-09-04) — mismo patrón que `recibir_lote` (ADR-0004), sin arreglar
      todavía.** La unificación de julio copió `patrimonio_items` desde la
      migración `0013`, antes de que `0019` le agregara `categoria`.
      `PatrimonioEditor.tsx` inserta esa columna en cada ítem — el insert
      falla en producción hoy. Migración lista en
      `supabase/unificacion/15_patrimonio_categoria.sql`
      (`alter table retail.patrimonio_items add column if not exists
      categoria text;`), **falta que Felipe la pegue en el SQL Editor**.
      Mientras tanto, `packages/database/src/types.ts` se corrigió a mano
      (no regenerado) para reflejar que la columna SÍ debe existir —
      `next build` ya no falla por esto, pero el bug de producción sigue
      vivo hasta que se corra el SQL. Reversible: sí, un `alter table`
      aditivo.
- [x] **`recibir_lote`: arreglado y confirmado en producción 2026-09-03
      (ADR-0004) — cerrado, con un susto en el camino que vale registrar.**
      Dos sesiones paralelas llegaron a esta función el mismo día por caminos
      distintos y convergieron en el mismo arreglo: la unificación había
      migrado una copia de `recibir_lote` más vieja que la `0018` local, sin
      validar sede, sin guardar `categoria_id` (rompía la taxonomía de
      `0030`) y sin aceptar `p_orden_compra_id`. Cuerpo schema-calificado
      pegado en `supabase/unificacion/14_recibir_lote_produccion.sql`
      (7 parámetros); `13_recibir_lote_valida_sede.sql` quedó SUPERADO (mismo
      hallazgo, alcance más angosto). **Lo que salió mal al pegar:**
      `CREATE OR REPLACE` con un parámetro nuevo (`p_orden_compra_id`) no
      reemplaza la función vieja de 6 parámetros — Postgres las trata como
      dos funciones distintas y crea una segunda, dejando **dos versiones de
      `recibir_lote` conviviendo a la vez** (la vieja insegura + la nueva
      completa). Se detectó regenerando `packages/database/src/types.ts`
      contra el proyecto correcto (el generador mostró un tipo unión con dos
      firmas) — no por una revisión manual. Cualquier "Recibir mercadería"
      sin orden de compra ligada (la mayoría) habría fallado con
      "function is not unique". Verificado con
      `select oid::regprocedure from pg_proc where proname='recibir_lote'
      and pronamespace='retail'::regnamespace` (2 filas), corregido con
      `drop function retail.recibir_lote(uuid,text,jsonb,text,text,text)`
      (la de 6), reverificado (1 fila, la de 7). Lección para la próxima
      migración que le agregue un parámetro a una función existente: un
      `CREATE OR REPLACE` que cambia la firma no reemplaza nada — hay que
      `DROP` la firma vieja explícitamente, o verificar con
      `pg_proc`/`regprocedure` que no quedó una sobrecarga fantasma.
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
