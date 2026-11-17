# 2026-11-17 · Lo que respondió SUNAT lo escribe el servidor (ADR-0675)

Rama `claude/brave-goldstine-30992d`. Bitácora: `docs/bitacora/2026-11-17-brave-goldstine-30992d.md`.

## Esperan a Felipe

- [ ] **Publicar la web** (este PR). Va primero: funciona con la base de antes y con la nueva.
- [ ] **POR PEGAR (2026-11-17), después de fusionar y publicar la web: `20261117141000_transmision_la_escribe_el_servidor.sql`**
  (una parte, idempotente). Pegarlo antes rompería el guardado desde la pantalla de la web de hoy (ADR-0675, «Orden»). Huella antes
  `d80791c0…` (copia de producción del 2026-11-16), después `e20ebf49…`. Se comprueba con
  `select md5(pg_get_functiondef('retail.actualizar_transmision_comprobante(uuid,text,text,jsonb,text)'::regprocedure))` y con
  `has_function_privilege('authenticated', …, 'execute') = false`.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción y el volcado se refresque.
