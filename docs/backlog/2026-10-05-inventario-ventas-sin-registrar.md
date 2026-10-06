## 🧾 Ventas sin registrar: categoría sugerida, candidata con respuesta deducida y «nadie regulariza su propia venta» (ADR-0328 act. 5, PR #788) — **parte 1 YA EN PRODUCCIÓN; parte 2 SIN PEGAR**; rama `claude/inventario-ventas-sin-registrar`

- [x] **(a) Vender sugiere la categoría** desde lo que escribe la asesora (`lib/sugerir-categoria-sin-registrar.ts`).
- [x] **(b) Por regularizar:** «Probable: …» con la respuesta deducida; el tramo exacto sale de `fn_candidatas_de_venta` (#800) y los hechos
  de `fn_candidatas_por_regularizar` (D1); el buscador mira la tienda de la venta, con «Buscar en todo el catálogo» (D2).
- [x] **(c) Nadie regulariza su propia venta, salvo el líder firmando él mismo**; una prenda sin movimiento en la sede no se regulariza; el
  lote del líder de #800 sigue funcionando encima (D3). `acciones_sin_responsable` = 33 (D4).
- [ ] **Pegar en producción** `supabase/migrations/20261004204000_nadie_regulariza_su_propia_venta.sql`, solo y tal cual, **copiada del
  archivo crudo de GitHub o del editor** (no desde la terminal: la parte 1 llegó con las tildes dañadas), después de la sonda de solo lectura
  del PR (tres filas con `veces = 1` y `tildes_bien = true`; el md5 del cuerpo vivo, `32f2ac4d…`, es el del repo). Después:
  `regularizar_prenda` con md5 `df6dace6250cf2f39ecd693dda825e1a` y la lista en 33.
- [ ] **(Recomendado) Volver a pegar `20261004203000` entera por el mismo medio correcto:** su lógica en producción es la del repo, pero los
  comentarios de sus 4 funciones llegaron dañados (UTF-8 leído como Mac Roman) y el próximo `pnpm datos:generar:produccion` los copiaría al
  diccionario. Es idempotente (solo `create or replace`, `comment`, `grant`/`revoke`). Comprobar: la consulta de tildes dañadas del PR da 0.
- [ ] **Fusionar #788** (borrador hasta el pegado) y marcar «SQL pegado en producción».
- [ ] **Vender a 375 px con base real** (PL-105): la del andamio sin base está; falta la de la pantalla real.
- [ ] **Preguntas para Felipe:** ¿un líder que vende desde la terminal regulariza su venta desde ella? ¿La limpieza la hace la cuenta
  Almacén y conviene recordar el nombre unos minutos? ¿Revisa los sinónimos de tienda (`SINONIMOS_POR_CATEGORIA`)?
