# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] `finanzas`: Fase 2 financiera (Diario de caja, Gastos, Estado de Resultados)
      Desbloquea: reportes reales de rentabilidad por sede. Depende de: decidir cómo
      capturar ventas (formulario simple sin Nubefact, o extender el modal de
      movimiento con método de pago). Reversible: sí (módulo nuevo, no toca lo demás).
      Por qué importa: hoy Felipe no tiene forma de ver utilidad neta por sede.
- [ ] `deploy`: subir Inventario Inteligente a `cayla-retail.vercel.app`
      Desbloquea: que el equipo real use esto, no solo Felipe en local. Depende de:
      nada — ya está commiteado y verificado. Reversible: sí.
- [ ] `produccion`/`compras`: UI sobre `ordenes_produccion`/`ordenes_compra`
      Desbloquea: dejar de llevar producción/compras fuera del sistema. Depende de:
      tablas ya existen desde Fase 1, sin UI. Reversible: sí.

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
