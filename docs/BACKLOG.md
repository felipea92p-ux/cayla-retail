# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] `produccion`/`compras`: UI sobre `ordenes_produccion`/`ordenes_compra`
      Desbloquea: dejar de llevar producción/compras fuera del sistema. Depende de:
      tablas ya existen desde Fase 1, sin UI. Reversible: sí.
- [ ] `finanzas`: emisión de comprobante electrónico (Nubefact/SUNAT)
      Desbloquea: boletas/facturas reales desde una venta registrada. Depende de:
      cuenta de Nubefact creada (ver [[project-alegra-to-nubefact-decision]] en la
      memoria de CAYLA Inventario). Reversible: sí, se agrega sobre `ventas` sin
      tocar lo existente.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide `proxy.ts`)
      Qué duele hoy: nada, solo un warning en build. Qué dolerá en 6 meses: puede
      dejar de soportarse. Reversible: sí.
- [ ] `git`: identidad de commit auto-configurada por username/hostname de la Mac
      Qué duele hoy: nada. Qué dolerá: historial con autor "Diseño Macminiclaudia
      Producción" en vez de Felipe. Reversible: sí (`git config`).

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
