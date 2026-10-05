## 🧾 Ventas sin registrar: categoría sugerida, candidata con respuesta deducida y «nadie regulariza su propia venta» (ADR-0328 act. 5, PR #788) — **parte 1 YA EN PRODUCCIÓN; parte 2 SIN PEGAR**; rama `claude/inventario-ventas-sin-registrar`

- [x] **(a) Vender sugiere la categoría** desde lo que escribe la asesora (`lib/sugerir-categoria-sin-registrar.ts`).
- [x] **(b) Por regularizar:** «Probable: …» con la respuesta deducida; el tramo exacto sale de `fn_candidatas_de_venta` (#800) y los hechos
  de `fn_candidatas_por_regularizar` (D1); el buscador mira la tienda de la venta, con «Buscar en todo el catálogo» (D2).
- [x] **(c) Nadie regulariza su propia venta, salvo el líder firmando él mismo**; una prenda sin movimiento en la sede no se regulariza; el
  lote del líder de #800 sigue funcionando encima (D3). `acciones_sin_responsable` = 33 (D4).
- [ ] **Pegar en producción** `supabase/migrations/20261004204000_nadie_regulariza_su_propia_venta.sql`, solo y tal cual, después de la
  sonda de solo lectura del PR (tres filas con `veces = 1`; el md5 del cuerpo vivo, `32f2ac4d…`, es el del repo). Después: `regularizar_prenda`
  con md5 `df6dace6250cf2f39ecd693dda825e1a` y la lista en 33. `20261004203000` ya está pegada: no se vuelve a pegar.
- [ ] **Fusionar #788** (borrador hasta el pegado) y marcar «SQL pegado en producción».
- [ ] **Vender a 375 px con base real** (PL-105): la del andamio sin base está; falta la de la pantalla real.
- [ ] **Preguntas para Felipe:** ¿un líder que vende desde la terminal regulariza su venta desde ella? ¿La limpieza la hace la cuenta
  Almacén y conviene recordar el nombre unos minutos? ¿Revisa los sinónimos de tienda (`SINONIMOS_POR_CATEGORIA`)?
