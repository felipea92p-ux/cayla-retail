## Ventas sin registrar ▸ rescate de #788 (2026-10-12, rama `claude/inventario-788-rescate`)

- [x] Las dos migraciones de #788 (`20261004203000`, `20261004204000`) en el repo, byte a byte; **en producción desde el 2026-10-05** (verificado en
  vivo el 12-oct; también figuran en `docs/datos/generado/funciones-produccion.txt`). Reconstruida la base desde cero: 0 errores y
  `regularizar_prenda` con el mismo `md5(prosrc)` que producción. `pnpm pruebas:ventas-sin-registrar` (65 casos) en el CI.
- [x] Vender ▸ «Prenda sin registrar» sugiere la categoría que nombra lo escrito (`lib/sugerir-categoria-sin-registrar.ts`); probado a 375 px.
- [x] La mesa sugiere «¿Cómo estaba?» con el libro (`lib/por-regularizar-deduccion.ts`, `lib/por-regularizar-libro.ts`); probado a 1440 y 375 px.
- [ ] **Cerrar #788 sin fusionar**, con un comentario que remita a este PR (decisión de quien lo abrió: no la toma este PR).
- [ ] `fn_por_regularizar_sin_cargar` y el parámetro `p_categoria_de` de `fn_candidatas_por_regularizar` quedaron en producción sin pantalla que
  los lea (eran del modal de #788). No estorban; si en un mes nadie los pide, se pueden retirar en una migración propia (nunca editando estas).
- [ ] Los comentarios de `20261004203000` en producción llegaron con las tildes dañadas (Mac Roman). Es solo texto dentro de las funciones: el
  código es el mismo. Si algún día se recrean esas funciones, que sea desde el archivo del repo (así vuelven las tildes) y con un pegado en UTF-8.
- [ ] La deducción solo se ofrece para las prendas que trae `fn_candidatas_por_regularizar` (su categoría y talla, del mismo color o de su
  familia, con unidades libres, hasta 20 por venta). Una prenda elegida desde el buscador que no esté ahí no lleva sugerencia: se responde como
  antes. Si Felipe quiere la respuesta para cualquier prenda, es una lectura nueva por (venta, prenda), no un cambio a esta.
