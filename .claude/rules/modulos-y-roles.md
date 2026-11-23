---
paths:
  - "supabase/**"
  - "apps/web/lib/modulos.ts"
  - "apps/web/lib/menu.ts"
  - "apps/web/lib/**/*rol*"
  - "apps/web/app/**/layout.tsx"
  - "apps/web/components/**/*Rol*.tsx"
  - "apps/web/components/**/*Responsable*.tsx"
  - "scripts/pruebas/roles*"
---

## Módulos y roles (regla — ADR-0161, Felipe 2026-09-22)

**Lo que ve cada cuenta (persona o terminal) lo decide su ROL, módulo por módulo («ve / no ve»), en Colaboradores ▸ Roles y
accesos.** Quien ve un módulo hace todo lo que hay en él, salvo lo «siempre solo del líder» (que vive en cada función con
`fn_es_lider()`). Por eso **todo módulo nuevo que se desarrolle tiene que aparecer en Roles y accesos, y nace disponible SOLO
para el líder**: el líder decide después a qué rol se lo da. Nunca se asigna un módulo a un rol desde el código.

**Un módulo es una entrada del menú izquierdo — lo de adentro no es otro módulo (ADR-0306, Felipe 2026-10-02).** Si es una pantalla
u opción del menú, es módulo y aparece en Roles y accesos. Si es un botón o una acción DENTRO de una pantalla (reponer, bajar al piso,
retirar, ajustar stock, apartar desde Existencias…), es una función del módulo donde vive su botón y **no se da de alta como módulo**:
quien ve el módulo la hace, sin pedir otro. Nació del 2026-10-02: «Bajada al piso» y «Ajustar stock» eran módulos sin menú y sin rol;
el Terminal de ventas tenía Existencias y no podía reponer, así que bajaba prendas sin registrarlo y Vender no las dejaba vender.
Las únicas pantallas con módulo FUERA del lateral son Colaboradores, Roles (menú de Administración), Configuración y Actividad (botones
de la cabecera); `lib/modulos.test.ts` («un módulo es una entrada del menú») falla si aparece otro. Lo que sí sigue siendo «solo del
líder» vive en la función con `fn_es_lider()`. Una acción delicada no se protege con un módulo escondido: se protege con `fn_es_lider()`
a la vista, o se acepta que quien ve el módulo la hace.

Al crear un módulo nuevo (pantalla o grupo de pantallas nuevas), en el mismo PR:
1. **Base:** una migración propia con `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)`
   — `incluye` en palabras del negocio; `delegable = false` si sus funciones todavía exigen `fn_es_lider()` (sale como «Solo
   líder por ahora»). **Sin** `insert into retail.rol_modulos`: el módulo nace sin rol.
2. **Web:** agregarlo a `CLAVES_MODULO` y `MODULOS` en `apps/web/lib/modulos.ts` (mismo `orden` que en la base); su nodo en
   `lib/menu.ts` declara `modulo: "<clave>"`; y su ruta tiene un `layout.tsx` con `await exigirModulo("<clave>")` (URL directa
   sin el módulo → «Sin acceso»).
3. **Funciones que guardan:** TODAS (no solo las de tienda: Compras, Producción, Colaboradores y Roles también, Felipe
   2026-09-23) firman con `retail.fn_actor_persona_id(true)` (el responsable del combo, ADR-0162) —nunca con `(false)` ni con
   `select id into … from personas where auth_user_id = auth.uid()`— y su pantalla usa el combo «Responsable»
   (`useResponsable` + `<ComboResponsable>`), con el mismo candado de asistencia en todas partes. Los permisos se preguntan
   a la cuenta (`fn_ve_modulo`, `fn_es_lider`), no al responsable; `fn_actor_persona_id(false)` queda SOLO para comparar con
   la cuenta en un permiso («no te quites a ti mismo», `fn_alcanzo_a`). Detalle: ADR-0161, «Actualización 2026-09-23 (c)».
4. **Guía de foco:** cada pantalla y cada modal del módulo con campos o pasos trae su guía y se declara en `lib/guia-de-foco-pantallas.ts`
   (regla «Guía de foco», `guia-de-foco.md`): `lib/guia-de-foco.test.ts` falla si una `page.tsx` o un modal nuevo no está declarado.

**Escalón Admin y «solo das lo que tienes» (ADR-0178):** por encima de Líder está el **Admin**, que no se marca en retail: se
lee de Dynamic (`public.personas.rol = 'admin'` y Líder activo aquí, `fn_es_admin()`). Solo un Admin sube a alguien a Líder o
le cambia el rol, la sede o el acceso a un líder; todo lo demás del líder sigue en `fn_es_lider()`. Quien no es líder solo da
los módulos que él mismo ve (`fn_exigir_rol_dentro_de_lo_mio`, `fn_exigir_modulos_dentro_de_lo_mio`) y no edita su propio rol.
Una función nueva que toque a un líder llama a `fn_exigir_puede_tocar_colaborador`; una que asigne un rol, a
`fn_exigir_rol_dentro_de_lo_mio`. El rango laboral de Dynamic (colibrí…archicaylo) **no** da accesos. Y **solo alcanzas a quien
está por debajo de ti** (como Dynamic): quien no es líder solo suspende, reactiva, quita, mueve o cambia el rol de una persona
cuyos módulos ve él y que tiene menos que él (`fn_exigir_alcanzo_a`; entre pares, un líder).

Lo vigilan las pruebas: `lib/modulos.test.ts` (toda pantalla del menú declara un módulo que existe; el catálogo de la web es el
de TODAS las migraciones; **ninguna migración fuera de la siembra de roles escribe en `rol_modulos`**) y
`pnpm pruebas:roles` (un módulo recién creado solo lo ve el líder).
