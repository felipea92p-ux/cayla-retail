## 🧾 Catálogo ▸ Costos: el costo de la prenda y el porqué de cada talla (2026-11-07, ADR-0631) — web + 1 función de solo lectura; rama `claude/costo-promedio-catalogo-49a6de`

- [x] Diagnóstico en producción (solo lectura) del Short Sohanna (SHO-0017). No había dato que arreglar: cada talla promedió lo que tenía
  con lo que llegó el 7-nov.
- [x] `20261107232000_costo_de_las_tallas.sql`: `fn_costo_de_las_tallas(p_producto_id)` devuelve la última entrada efectiva de cada talla:
  - lee `fn_costo_historial_efectivo`, así que trae la corrección aplicada y deja fuera los cierres revertidos;
  - junta las dos facturas de una misma compra;
  - devuelve null sin permiso de dinero.

  Se probó en un Postgres privado con las 1108 migraciones y el seed: re-ejecutable (pegada dos veces).
- [x] `pnpm pruebas:costo-de-las-tallas` (7 casos, en `scripts/ci/pruebas-postgres.mjs`): dos mutaciones de la función la ponen en rojo.
- [x] Web, en la pestaña Costos de la ficha:
  - la línea «Cada prenda te cuesta hoy S/ …» (de `fn_costo_de_la_prenda`, la misma del Historial), con su enlace «Ver la historia del
    costo» (`?ver=costo` abre el Historial en su pestaña Costo, también en ventana);
  - el «?» de cada talla gris con su cuenta, y el porqué en palabras si la cuenta no da o falta la función;
  - «Usar S/ …, el de la última compra» en «Cambiar en bloque»;
  - la columna Precio/Costo en dos líneas, sin «S/».

  La lógica está en `lib/costo-tallas-reglas.ts`, con sus pruebas.
- [x] Guía interactiva de Editar producto: dos pasos nuevos (`costo-prenda`, `sugerencia-costo`) y su huella aceptada.
- [x] Verificado en el navegador, contra la base privada, con una réplica del Short Sohanna:
  - escritorio (1440) y 375 px, claro y oscuro;
  - el «?», el botón (pone 48 en 6 tallas, deja las 3 grises y se descarta), el enlace al Historial;
  - la ficha sin la función nueva.

  Sin errores en consola. Pasan las 854 suites de la web, el chequeo de tipos, el lint y Knip en sus dos modos.
- [ ] **Por pegar en producción:** `20261107232000_costo_de_las_tallas.sql` (una parte, sin políticas, re-ejecutable). Verificación:
  `select to_regprocedure('retail.fn_costo_de_las_tallas(uuid)') is not null;` → `t`. Después, `pnpm datos:generar:produccion`.
- [ ] **Sin correr:** `/chaos` (el botón solo cambia la ficha en pantalla; guardar no cambió), `/formidable`, `guias:recorrer` y
  `tema:auditar` (los dos piden Playwright).
- [ ] **Decisión de Felipe:** ¿el costo de S/ 45 de la carga inicial del Short Sohanna era real o un estimado? Si era un estimado:
  - las 3 ventas de octubre se guardaron con un margen inflado;
  - el S/ 46.50 de Azul marino 30 mezcla ese dato;
  - desde la app no se corrige, porque esa talla ya tiene una compra.

## 🧾 Igualar las tallas sin stock en todas las prendas (2026-11-09, ADR-0631 act.) — script de una sola vez, misma rama

- [x] Felipe eligió «Solo sin stock». En producción (medido el 2026-11-07) son 45 de 60 tallas en 13 prendas. Las 15 con stock no se tocan.
- [x] Script `supabase/migrations/pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql`. Se ensayó en la base privada:
  - el ensayo no cambia nada;
  - la aplicación cambia solo las 3 tallas esperadas: no toca la talla con stock, la del traslado en camino ni la desactivada;
  - sube la versión de la prenda, deja «costo declarado» en el historial y una línea en Actividad;
  - el segundo pegado se detiene y el camino de vuelta devuelve los costos.
- [ ] **Por pegar en producción (Felipe):**
  1. pegar tal cual (es el ensayo): debe decir «ENSAYO_OK: N tallas de M prendas…»;
  2. revisar la lista;
  3. cambiar `false` por `true` en la línea APLICAR y pegar de nuevo.

  El conector de Supabase dejó de dar lectura de producción el 2026-11-09, así que las cifras de hoy las dice el ensayo, no esta nota.

## 🧾 El historial del costo se lee solo por funciones (2026-11-09, ADR-0631 act. b) — 1 migración, misma rama

- [x] Felipe eligió «Solo por funciones». `20261109140000_costo_de_compras_solo_por_funciones.sql`:
  - PARTE 1 quita el permiso de lectura de la tienda;
  - PARTE 2, sola, quita la regla de lectura de la tabla (RLS sigue encendido).
- [x] `pnpm pruebas:costo-de-compras-solo-por-funciones` (5 casos, en `scripts/ci/pruebas-postgres.mjs`):
  - antes de la migración falla y después pasa;
  - devolver el permiso la pone en rojo;
  - las 20 pruebas que tocan la tabla dan lo mismo que antes;
  - `roles_cobertura_modulos` sigue 32/32.
- [ ] **Por pegar en producción:** la PARTE 1 y después la PARTE 2, cada una por separado.
- [ ] Al refrescar el diccionario (`pnpm datos:generar:produccion`), mover la fila de `docs/datos/01-INVARIANTES.md` de «Local» a «Las dos».
- [ ] **Sin explicar:** en esta base privada, `eliminar_producto_con_historia` (15 ✗) y `purgar_producto_de_prueba` (58 ✗) ya fallaban
  antes de la migración. Probablemente por los datos de prueba que dejé en esa base, sin confirmar: falta correrlas en una base limpia.
