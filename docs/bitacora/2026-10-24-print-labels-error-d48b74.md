# 2026-10-24 · Etiquetas de precio caída («Esta pantalla no está mostrando datos»)

- **Causa:** la migración de ofertas (20261023232000, ADR-0496, PR #1310), pegada en producción el 2026-10-23 18:59, hizo que `fn_campanas_en_sede` leyera `campana_reglas` sin volverla security definer; a esa tabla `authenticated` no tiene permiso → `42501` en toda llamada desde la web (14.177 errores en ~16 h). Cae Etiquetas de precio y todo lo que pregunta qué campaña rige (Vender, Productos, Inventario); `registrar_venta` no, porque es definer.
- **Arreglo:** `20261024154000_campanas_en_sede_security_definer.sql` (un `alter`, sin políticas). Probado en Postgres local en una transacción revertida: antes, el mismo error de producción; después, responde a `authenticated` y `anon` sigue sin acceso.
- **Pendiente:** pegarla en producción (espera OK de Felipe) y que el archivo de #1310 declare `security definer` para que un re-pegado no vuelva a romperlo.
