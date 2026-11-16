# 2026-11-16 · Proveedores en las terminales de Almacén

Rama `claude/suppliers-module-loading-issue-daf6f0`. Bitácora: `docs/bitacora/2026-11-16-suppliers-module-loading-issue-daf6f0.md`.

## Esperan a Felipe

- [x] **Pegar `20261116223000_proveedores_permiso_una_vez.sql` en producción** (2026-11-16, con OK de Felipe, por `apply_migration`: registrada
  como `20261116224020 proveedores_permiso_una_vez`). «QUEDÓ BIEN»; la función quedó idéntica a la del local (md5 `1d4f9305…`). Con la sesión de la
  terminal: la lista en 157 ms y el resumen en 212 ms (antes, cortados a los 8 s).
- [ ] **Probar con la terminal de verdad** (Almacén Trujillo ▸ Compras ▸ Proveedores carga) y marcar resueltos en Sentry CAYLA-RETAIL-9 (el
  directorio) y CAYLA-RETAIL-Q (el resumen), abiertos desde el 23 y el 26 de octubre.
- [ ] **La cadena de permisos sigue siendo cara por pregunta** (`fn_es_lider` → `fn_capacidad_por_modulos` → `fn_mi_rol_id` → `fn_terminal_actual`,
  cada una con `security definer` y `set search_path`, que impiden incrustarla en la consulta). Con este arreglo ya no se nota en Proveedores, pero
  cualquier función nueva que pregunte un permiso por fila vuelve a pagarlo. Quitar esos ajustes de las funciones de apoyo toca la seguridad de
  todos los módulos: decisión de Felipe, con medición antes (ver el caso de Tráfico del 2026-10-31).

## Sin decisión, para hacer

- [ ] **Una guardia general:** que una prueba recorra las funciones de `retail` y falle si una pregunta un permiso (`fn_ve_*`, `fn_puede_*`,
  `fn_es_lider`, `fn_capacidad_por_modulos`) dentro de cada fila en vez de en `(select …)`. Hoy solo lo vigila la prueba de `fn_proveedores()`.
