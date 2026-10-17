## 🎯 Panel comercial con la meta efectiva (2026-10-17) — rama `claude/adoring-greider-da57da`

- [x] **Ritmo y meta del mes por día:** `lib/comercial.ts` lee `fn_parametros_caja` de cada día del mes; `lib/comercial-reglas.ts` suma lo prometido día por día y consolida por día. Respaldo a `meta_venta_diaria` si la base no responde.
- [x] **«Meta del mes»** en la tarjeta de cada tienda y en «Ventas del mes» del total.
- [ ] **Una sola lectura en vez de ~31 por tienda:** una función de base que devuelva la meta de todos los días del mes (o de varias tiendas) de una vez; hoy son ~90 llamadas pequeñas en paralelo con 3 tiendas. Es migración: espera el OK de Felipe.
- [ ] **No probado contra una base con metas de mes/fecha:** depende de que `20261017020000` (ADR-0435) llegue a producción; sus pruebas de base son las de esa rama.
