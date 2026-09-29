## 🧾 Veintiocho acciones sin combo «Responsable» (2026-09-29, ADR-0280) — web + 1 migración; rama `claude/quitar-30-combos-responsable`

**Estado:** hecho en la rama, **a probar en local por Felipe**; la migración NO está en producción. Si no le sirve: «volver»
(`git revert` del commit «quita 30 combos» y, si ya se pegó, `delete from retail.acciones_sin_responsable;`).

- [x] Migración `20260929230000_acciones_sin_responsable.sql`: tabla `retail.acciones_sin_responsable` (28 claves, RLS sin
      políticas) y `fn_actor_persona_id` que respeta el encabezado `x-responsable-omitido` solo para esas claves.
- [x] Prueba `pnpm pruebas:responsable-omitido` (18 casos, ROLLBACK) y su paso en `ci.yml`.
- [x] Web: `lib/responsable-omitido.ts` (+ prueba que compara con la migración) y 28 pantallas sin combo; las rutas `/api/productos/*` reenvían la clave.
- [ ] **Probar en local, con una persona y con una terminal:** alta de producto con un color nuevo, aprobar y rechazar un
      color, cerrar un conteo, recibir un traslado, adjuntar un archivo a una factura, aviso de un apartado, regularizar.
- [ ] **Pegar la migración en producción** (una sola parte) ANTES o junto con el despliegue de la web: sin ella, las 28
      acciones quedan sin combo y la base las rechaza. Luego `pnpm datos:generar:produccion` (tabla nueva en el diccionario).
- [ ] **Dos filas de las 30 no se soltaron** (mi etiqueta las describía mal): #40 (el combo es el «Quién cuenta» de todo
      el conteo) y #106 (era el modal «Nuevo color»; aprobar un color sí se soltó). Felipe decide si quiere algo distinto.
- [ ] **Pregunta abierta:** apartar una prenda desde una TERMINAL sigue pidiendo responsable (`separaciones.creado_por` NOT NULL).
      Soltarlo exige decidir quién queda como creadora del apartado o aflojar esa columna.
- [ ] Decidir si en una terminal debe quedar al menos «el último responsable elegido en este turno» para las 28 acciones
      (hoy quedan sin nombre de persona).
