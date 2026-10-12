## Ventas sin registrar ▸ rescate de #788 (2026-10-12, rama `claude/inventario-788-rescate`)

- [x] Las dos migraciones de #788 (`20261004203000`, `20261004204000`) en el repo, byte a byte; **en producción desde el 2026-10-05** (verificado en
  vivo el 12-oct; también figuran en `docs/datos/generado/funciones-produccion.txt`). Reconstruida la base desde cero: 0 errores y
  `regularizar_prenda` con el mismo `md5(prosrc)` que producción. `pnpm pruebas:ventas-sin-registrar` (65 casos) en el CI.
- [x] Vender ▸ «Prenda sin registrar» sugiere la categoría que nombra lo escrito (`lib/sugerir-categoria-sin-registrar.ts`); probado a 375 px.
- [x] La mesa sugiere «¿Cómo estaba?» con el libro (`lib/por-regularizar-deduccion.ts`, `lib/por-regularizar-libro.ts`); probado a 1440 y 375 px.
- [x] Revisión adversarial (2026-10-12): el puente dice ANTES del botón lo que la base va a rechazar —una prenda que nunca entró a la tienda,
  con la frase de la base (`prendaSinCargar`, comparada al carácter con la migración), y la venta propia (`motivoPropiaVenta`)—; «Escribiste
  «…»» solo cita lo que la persona escribió (ni la descripción armada ni el color elegido); el porqué de «Sugerida» se trae a la vista si
  quedó bajo el pie fijo; la hoja del celular se queda quieta con movimiento reducido; el porqué ya no le dice «ese conteo» a una recepción;
  y `lib/sugerencia-nunca-elige.test.ts` vigila que nada elija solo la forma ni la categoría (15 de 15 mutantes muertos).
- [x] **#788 cerrado sin fusionar** (2026-10-12), con un comentario que remite a #975; su rama se conserva.
- [ ] **Para la sesión principal (no es de este PR):** `retail.acciones_sin_responsable` tiene 36 claves en producción y 35 en `main`. Sobra
  `producto_confirmar_cambios`, que `20261006180100` (ADR-0354) borra: esa migración no está pegada en producción (o se revirtió con su «PARA
  VOLVER»). Su cabecera pide pegarla después de publicar la web que manda el responsable en Editar producto, que ya está en `main`. Las
  pruebas cuentan bien la de `main`; lo que falta es la paridad con producción.
- [ ] `fn_por_regularizar_sin_cargar` y el parámetro `p_categoria_de` de `fn_candidatas_por_regularizar` quedaron en producción sin pantalla que
  los lea (eran del modal de #788). No estorban; si en un mes nadie los pide, se pueden retirar en una migración propia (nunca editando estas).
- [ ] Los comentarios de `20261004203000` en producción llegaron con las tildes dañadas (Mac Roman). Es solo texto dentro de las funciones: el
  código es el mismo. Si algún día se recrean esas funciones, que sea desde el archivo del repo (así vuelven las tildes) y con un pegado en UTF-8.
- [ ] La deducción solo se ofrece para las prendas que trae `fn_candidatas_por_regularizar` (su categoría y talla, del mismo color o de su
  familia, con unidades libres, hasta 20 por venta). Una prenda elegida desde el buscador que no esté ahí no lleva sugerencia: se responde como
  antes. Si Felipe quiere la respuesta para cualquier prenda, es una lectura nueva por (venta, prenda), no un cambio a esta.
