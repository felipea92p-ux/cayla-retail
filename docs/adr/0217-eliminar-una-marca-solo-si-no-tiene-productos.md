# ADR-0217 — Eliminar una marca solo si ningún producto la tiene

**Fecha:** 2026-09-26
**Estado:** Construido y verificado contra un Postgres desechable. **Migración EN PRODUCCIÓN desde el 2026-09-26** (Felipe dio el «dale»; se aplicó por MCP como
`eliminar_marca` con ensayo previo revertido) — verificada por efectos: firma, `security definer`, `search_path`, `authenticated` sí / `anon` no, una sola versión y
md5 del cuerpo idéntico al archivo. Quedó **antes que la web**, como debe (sin la función, el botón llamaría a algo que producción no tiene).
**Decide:** Felipe, 2026-09-26: «"Cayla 2" no existe, quiero eliminarla; sería más útil tener una opción para eliminarla».
**Afecta:** `supabase/migrations/20260926213000_eliminar_marca.sql` (una función, `retail.eliminar_marca`), `apps/web/components/MarcasLista.tsx`,
`lib/marcas.ts` (`sePuedeEliminarMarca`), `lib/confirmar-catalogo.ts` (acción «eliminar»), `packages/database/src/types.ts`,
`scripts/pruebas/eliminar_marca.mjs` (sumada al CI). No toca `productos` ni `marca_proveedores` como estructura.

## Contexto

Una marca creada por error (aquí «Cayla 2», tecleada al dar de alta un producto) solo se podía **desactivar**. Desactivar no la quita: queda
en «Desactivadas» para siempre, sigue ocupando su nombre (crear otra igual responde «existe pero está desactivada») y el catálogo no se limpia.

La regla del repo es no borrar lo que tiene historia (`CLAUDE.md`; `movimientos` es inmutable por trigger; ADR-0159 archiva datos de prueba en vez de
borrarlos). Pero una marca **sin ningún producto** no tiene historia que perder: en producción solo dos tablas la citan —`productos` y
`marca_proveedores`, verificado en `pg_constraint` el 2026-09-26— y ambas con `NO ACTION`.

## Decisión

**DECIDÍ:** `retail.eliminar_marca(p_marca_id)`: borra la marca y sus vínculos con proveedores, todo o nada, **solo si ningún producto —de cualquier
estado, incluidos los descontinuados y los archivados como prueba— la tiene**. Con un solo producto se rechaza con su nombre y cuántos, y sugiere
cambiarles la marca o desactivarla. La pantalla ofrece «Eliminar» únicamente cuando la regla se cumple (`sePuedeEliminarMarca`), con la misma
confirmación con «Responsable» que ya usan Desactivar y Reactivar. El botón vive también en la franja «Desactivadas».

**DESCARTÉ:**
- *Borrar la marca aunque tenga productos, dejándolos sin marca.* Ganas: un solo botón para todo. Pagas: `productos.marca_id` es obligatorio y su llave
  compuesta con el proveedor lo impide; aflojarlo abre el estado imposible «producto sin marca» que ADR-0109 cerró a propósito.
- *Que Eliminar arrastre a los productos (los pase a otra marca, o los archive).* Ganas: cero pasos previos. Pagas: mover ventas ya hechas de marca
  en silencio; Top Aurora tiene una venta completada el 25-sep. Cambiar la marca de un producto es una decisión de negocio que ya tiene su pantalla.
- *Solo contar productos activos, como hace el candado de desactivar.* Ganas: menos fricción. Pagas: un descontinuado sigue citando la marca en su
  ficha y en las ventas hechas; la llave de la base lo frenaría igual, pero con un error crudo en vez de decir qué hacer.
- *Guardar un registro de quién eliminó qué (tabla nueva).* Ganas: rastro. Pagas: una tabla para guardar el nombre de una marca que nunca tuvo un
  producto; el rastro que importa —los productos que alguna vez la tuvieron— ya vive en `historial_producto_cambios`.

**SE ROMPE SI:** dos personas hacen a la vez «asignar un producto a la marca» y «eliminar la marca». No se rompe: la fila de la marca se toma `for update`
antes de contar y la llave foránea del producto toma la misma fila `for key share`. Probado con `COMMIT` reales en ambos órdenes: si el producto llega
primero, «eliminar» espera, lo ve y se rechaza; si «eliminar» llega primero, la asignación espera y la llave la frena (0 productos huérfanos).
Sí se rompería si algún día otra tabla cita `marcas` sin llave foránea (un uuid suelto): el conteo miraría solo `productos`. Hoy no hay ninguna.

## Lo que no deja rastro (dicho, no escondido)

La fila eliminada no guarda quién ni cuándo: `marcas` no tiene historial propio. Los cambios de marca de un producto sí quedan
(`historial_producto_cambios`, `marca_id` anterior → nuevo, en texto y sin llave), pero **ninguna pantalla resuelve hoy ese uuid a un nombre**; tras
eliminar una marca, esas filas viejas apuntan a un nombre que ya no existe. Es el precio de dejar el catálogo limpio, y es la razón de que Eliminar sea
solo para marcas sin productos.

## Cómo se retira una marca puesta por error (el caso «Cayla 2»)

1. Cambiar la marca de cada producto que la tenga (Productos ▸ editar ▸ «Marca y proveedor»), a una marca que **traiga a ese mismo proveedor**.
2. Recargar Catálogo ▸ Marcas: aparece «Eliminar» en la tarjeta. Confirmar con el responsable.

**Archivar un producto como prueba (`archivar_producto_prueba`, ADR-0159) o descontinuarlo NO libera la marca:** el producto sigue apuntándole. Un
producto con ventas nunca se borra; se re-marca.

## Verificación

- `pnpm pruebas:eliminar-marca` **21/21** en Postgres 17 desechable (300 migraciones + seed); `pruebas:editar-marca` sigue en 23/23.
- **Mutación:** sin el conteo → 17/21; sin el candado de permiso → 20/21; sin borrar los vínculos → 10/21. Las tres se detectan.
- **Carrera real con `COMMIT`** en los dos órdenes (arriba): 0 productos huérfanos.
- `marcas.test.ts` y `confirmar-catalogo.test.ts` con los casos nuevos; `tsc` y `eslint` limpios sobre los archivos tocados.

## Producción

Solo crea una función: sin `alter` ni políticas (ADR-0195), una sola parte. **Orden seguido:** SQL primero, luego el PR (lección del #444, 2026-09-26).
**Numeración (dos renombres, 2026-09-26):** el archivo nació como `20260926200000_eliminar_marca.sql`, chocó con `mover_interno_intentos_tabla`; pasó a
`…210000` y chocó con `colores_lujo_piedra_indigo_nude`; quedó en **`20260926213000`**. El ADR nació como 0216 y cedió ante
`0216-inventario-sin-fotos-de-cabecera`. En producción la migración está registrada con la versión de aplicación `20260926063402`, así que ningún renombre
de archivo la toca. Los dos choques los habría evitado correr `scripts/migraciones/versiones.mjs` y `scripts/adr/numeros.mjs` justo después de cada merge.
Ensayo previo contra la base real en un solo lote con `set local role authenticated` y la cuenta de un Admin Líder, terminado en excepción a propósito
(nada quedó escrito; comprobado: 80 marcas / 80 vínculos antes y después): eliminar una marca de ensayo la borró con su vínculo y dejó al proveedor;
«Cayla 2» se rechazó con su mensaje y siguió intacta; marca inexistente y sesión sin permiso dieron su mensaje.
