# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] `catalogo real`: cargar los 300-900 SKUs físicos — el desbloqueador más grande
      que queda. El sistema ya tiene todo (categorías, fotos, etiquetas, ubicaciones,
      mínimos); falta el conteo físico. Preparar plan de carga por tienda con Felipe.
- [ ] `finanzas F3`: comprobante electrónico (Nubefact/SUNAT) con la Epson TM-T20III.
      Depende de: cuenta Nubefact. Reversible: sí.
- [ ] `produccion`: UI sobre `ordenes_produccion` (el Taller sigue fuera del sistema).
      Reversible: sí.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide `proxy.ts`).
      Solo un warning en build, no rompe nada. Reversible: sí.

> Cubo casi vacío — las tres deudas grandes de la revisión nocturna (concurrencia,
> estancado, seguridad de RPCs) se cerraron el 2026-07-17/18. Ver CERRADO.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [ ] `inteligencia`: umbral de estancado (45d) y lead time (14d) son constantes
      globales, no por categoría/sede. Estamos en "profesional sólido". Para "clase
      mundial" falta: datos reales de venta para justificar afinar por categoría —
      no vale la pena adivinar sin evidencia.
- [ ] `catalogo`: cargar el catálogo real (300-900 SKUs). No es código — falta el
      conteo físico primero (ver auditoría de catálogo en CAYLA-Inventario).

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **RLS (Row Level Security)** — vivido hoy con el bug de traslados invisibles;
      Felipe ya vio el síntoma, falta el modelo mental completo.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento` puede saltarse RLS y
      por qué eso es seguro *solo* porque valida todo adentro.
- [ ] **Constraint UNIQUE / integridad referencial** — vivido hoy con las 4 filas
      duplicadas de `personas` y el `.single()` que las convirtió en un error.

## ✅ CERRADO (últimos, con fecha)

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
      "Vender" es la única fuente de verdad para registrar una venta.
- [x] 2026-07-17 — Fase 3: ingreso de mercadería y almacén — un almacén hermano por
      tienda (TRU-ALM/AQP-ALM/LIM-ALM), contenedores, `/almacen/recibir` (lotes),
      `/almacen` (stock + "Bajar a tienda"), devolución con motivo estructurado
      reutilizando `traslado`. Diseñado tras 24 preguntas de descubrimiento (no
      adivinado). Verificado en producción por Felipe. Pendiente: rediseño de UX del
      formulario de recepción (ver 🔨 CONSTRUIR).
- [x] 2026-07-17 — Taxonomía real de catálogo: `productos.categoria` (texto libre)
      → 6 familias fijas (Indumentaria/Calzado/Accesorios/Bisutería/Belleza/
      Papelería) + 30 categorías en tabla `categorias`, editable por Líder sin
      deploy. Tallas sugeridas por categoría (ej. Zapatillas → 34-42) ya alimentan
      un `<select>` de talla en "Recibir mercadería" en vez de texto libre — menos
      "estados imposibles" (categoría mal escrita/duplicada, talla inconsistente).
      Diseñado con Felipe comparando cómo LVMH separa "Perfumes & Cosmetics" y Zara
      trata "Beauty" como categoría propia. Migración `0009_categorias.sql` corrida
      en Supabase y verificada en vivo.
- [x] 2026-07-17 — Endurecimiento de stock contra concurrencia (`0010`): `for update`
      al validar + `check (cantidad >= 0)` + FK de `movimientos.venta_id`. Cierra la
      condición de carrera que dejaba el stock en -1 con dos ventas simultáneas de la
      última unidad. Encontrado en la revisión nocturna, aprobado y corrido por Felipe.
- [x] 2026-07-18 — "Estancado" mide días sin venta real (`0011`): columna
      `stock.ultima_venta` sellada solo con motivo='venta', para que las bajadas de
      almacén no reinicien el contador. Indicador renombrado a "Días sin venta".
- [x] 2026-07-18 — Las 5 RPCs security-definer validan la sede del que llama (`0012`,
      helper `fn_puede_operar_sede`). Cierra la puerta de atrás: nadie mueve stock ni
      cajas de otra sede por API directa. Cumple lo que 0003_rls.sql ya prometía.
