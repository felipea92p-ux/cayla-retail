## 🎨 El dibujo de una insignia, elegible o propio (2026-10-23, ADR-0490) — migraciones `20261023203000` y `20261023213000` PEGADAS en producción el 2026-10-23 (y la `20261023221000` de la silueta, también); PR #1300 fusionado el 2026-10-23 (sin la silueta; ésta va en su PR de seguimiento); rama `claude/insignia-icono-elegible-6dc77a`

- [x] Columnas `retail.etiquetas.icono` (clave de un dibujo) e `icono_imagen` (ruta de una imagen propia), excluyentes y con candados; `fijar_icono_etiqueta` con la llave de cada
      etiqueta (ADR-0476) y `fn_tienda_insignias` con `{id, nombre, icono, imagen, descuento}`; bucket público `retail-insignias` (WebP, 100 KB) con política por
      `fn_puede_campanas()`. `pnpm pruebas:insignia-icono` 40/40; `pruebas:tienda-insignias` 20/20 ajustada.
- [x] Retail: campo «Dibujo» (21 dibujos + «Subir tu imagen», sin «Según el nombre») en la hoja de nueva insignia / campaña, botón «Dibujo» en cada pase (`CambiarDibujoModal`, con el
      combo «Responsable»), el sello de tinta, la tarjeta de la campaña, Nuevo producto y Editar producto dibujan lo elegido; ruta `/api/productos/etiquetas` (POST y PATCH
      `icono` o `imagen`). Guía de foco del modal nuevo, paso «Su dibujo» de la guía de Insignias y sus dos huellas aceptadas.
- [x] Tienda: la ficha lee `icono`, `imagen` y `descuento`; el chip del descuento toma el dibujo o la imagen de su campaña. En el navegador, de punta a punta con la subida real al
      almacén local, a 1440 y a 375 px, claro y oscuro.
- [x] **Pegadas en producción el 2026-10-23, ANTES de publicar la web, en este orden:** (1) `supabase/migrations/20261023203000_insignia_con_dibujo_elegido.sql` (una parte); (2)
      `supabase/migrations/20261023213000_insignias_almacen_de_imagenes.sql` en DOS pegados, uno por PARTE (la segunda lleva la política, ADR-0195). Verificar con
      `retail.fn_tienda_insignias(<modelo con Halloween>, null)` y `select id from storage.buckets where id = 'retail-insignias'` (verificado, con `md5(prosrc)` igual al archivo).
      Pendiente: refrescar el volcado de `docs/datos/generado/` si se pide (columnas nuevas).
- [x] PR #1300 fusionado por Felipe el 2026-10-23 (publicó la web sin la silueta).
- [ ] **Fusionar el PR de seguimiento de la silueta** (publica la casilla «Pintar con el color del sello»): lo decide Felipe. La migración ya está en producción.
- [ ] **Sin probar:** `guias:recorrer` (esta Mac no tiene el navegador de Playwright), `/chaos` sobre las dos hojas que guardan, la subida desde un teléfono real, el chip rojo del descuento con
      imagen mirado en el navegador (probado solo con datos).
- [ ] **No cubierto a propósito:** el papel de la etiqueta de precio (sigue por el nombre), la insignia que se propone al vuelo dentro de Nuevo producto (nace por el nombre), el borrado de
      imágenes viejas (cada cambio deja una de ≤ 100 KB sin dueño en el almacén) y el modo oscuro de una imagen propia.
- [ ] **Para la sesión de las tarjetas del catálogo** (migración `20261023205000`): cuando muestren insignias, que usen `dibujoResuelto` de `packages/shared/src/insignia-imagen.ts`
      (imagen propia → dibujo elegido → nombre) y no `iconoDeInsignia` a secas.
- [x] **Silueta (act. b del ADR-0490):** casilla «Pintar con el color del sello» al subir una imagen; `lib/silueta-de-imagen.ts`; columna `icono_imagen_silueta`; el sello, las tarjetas, el selector y el chip de la tienda
      la pintan con el color del lugar. `pnpm pruebas:insignia-icono` 47/47.
- [x] **`supabase/migrations/20261023221000_insignia_imagen_como_silueta.sql` PEGADA en producción el 2026-10-23, antes de publicar la web** (una parte, idempotente), con el OK puntual de Felipe; verificada contra producción
      (columna, 5 candados, una sola firma de cuatro datos, `md5(prosrc)` igual al archivo). Detalle en el ADR-0490.
- [ ] **Sin probar:** el chip rojo del descuento con silueta en el navegador (probado con datos) y la silueta con una foto de un teléfono real.
