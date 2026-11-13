## ⚡ «Quién eres» en un viaje + reglas por fila (2026-11-13, ADR-0657) — web + 2 migraciones SIN pegar; rama `claude/identidad-en-un-viaje`

- [x] `fn_modulos_de` (regla por fila) + `fn_mis_modulos` con la identidad en un CTE, candado md5 (`20261113195000`).
- [x] `fn_mi_sesion()` (`20261113200000`) y la web en un solo viaje, con vuelta a las seis si falta (PGRST202) o falla.
- [x] Marcadas como reglas `fn_precios_en_sedes`, `fn_trafico_web_personas`, `fn_trafico_web_prendas`.
- [x] Vigía `pruebas:reglas-por-fila` y prueba de igualdad `pruebas:mi-sesion` en las tandas del CI.
- [ ] **POR PEGAR (2026-11-13), con el OK de Felipe:** `20261113195000_mis_modulos_identidad_una_vez.sql` y después
      `20261113200000_mi_sesion_en_un_viaje.sql`, cada una de una vez (solo funciones, permisos y comentarios). La web da igual antes o después.
- [ ] A las 24 h de pegar: `pg_stat_statements` de `fn_mi_sesion` contra las seis de antes (media y llamadas). Si el reloj empeora, `revoke execute
      on function retail.fn_mi_sesion() from authenticated;` devuelve la web a las seis sin publicar nada. Refrescar el diccionario.
- [ ] #15 paso 2 (guardar la sesión 60 s): espera la decisión de Felipe (cambia cuándo se ve un cambio de rol).
- [ ] `fn_ve_modulo` repite la regla de `fn_modulos_de` por clave y la llaman casi todas las funciones que guardan: pasarla a la regla, con su
      propia medición (no se hizo aquí para no tocar el candado de todas a la vez).
- [ ] Siguientes candidatas a regla por fila (ADR-0622): `fn_item_es_de_claure`, `fn_dueno_de_la_linea`, `fn_cuenta_de_cobro` — medirlas en
      producción con `scripts/rendimiento/diagnostico-produccion.sql` antes de tocarlas; las que leen `public.personas` no pueden.
