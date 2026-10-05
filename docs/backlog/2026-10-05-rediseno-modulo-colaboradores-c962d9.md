## 👥 Colaboradores rediseñado en 4 entregas (propuesta del 2026-10-05, ADR-0340) — rama `claude/rediseno-modulo-colaboradores-c962d9`, sin migraciones

Propuesta tocable: https://claude.ai/artifact/NDwNY6514UhVBDGQBYp5hq (privada; datos inventados).

- [x] **Entrega 1 · Equipo + ficha** (ADR-0340): lista por sede, «Esperan tu ok», ficha con cambiar rol, sede, suspender o reactivar, «Deshacer» y su menú.
- [x] **Quitar «Comparar roles»** de Roles y accesos (Felipe, 2026-10-05).
- [ ] **Verla con cuenta real**: un líder Admin, un líder sin Admin y alguien con el módulo Colaboradores sin ser líder (las acciones que no le tocan no deben salir).
- [x] **Entrega 2 · Dar acceso** (ADR-0341): una hoja con guía (quién, sede, rol, quién lo da). Felipe decidió que **el alta de un líder entra directo**; la de quien no es líder sigue esperando el ok de un líder.
  - [ ] **POR PEGAR en producción ANTES de fusionar** (2026-10-05): `supabase/migrations/20261005190000_dar_acceso_lider_entra_directo_con_rol.sql`. Una sola parte, en su propia transacción del SQL Editor; se puede pegar dos veces. Verificación (debe dar 2 filas, cada una con `p_rol_id`):
    `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('agregar_colaborador', 'agregar_colaboradores');`
- [ ] **Entrega 3 · Roles y qué ve**: roles en tarjetas y módulos como baldosas con su menú al lado.
- [ ] **Entrega 4 · Aparatos y Actividad**: aparatos por tienda con «Deshacer» al desactivar, y una línea de tiempo que sume `roles_historial`. Más una lectura única `fn_equipo()`.
- [ ] (Opcional) Que `fn_colaboradores_inactivos` devuelva la sede de retail, para que quien está de baja en Dynamic salga en su sede y no en un grupo aparte.
