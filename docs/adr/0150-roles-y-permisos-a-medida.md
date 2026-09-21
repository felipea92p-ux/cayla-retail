# ADR-0150 — Roles y permisos a medida: el rol nace en retail y se delega pantalla por pantalla

**Fecha:** 2026-09-22 · **Estado:** propuesto y aprobado por Felipe (F0). **Nada aplicado**: no hay migración ni cambio de código todavía · **Origen:** spike `docs/maquetas/roles-spike-2026-09/` (ajustado en esta sesión) y la pregunta «¿cómo se integra con los roles de Dynamic sin hacer doble trabajo?».

## Contexto

Hoy retail solo distingue `lider` y `colaborador` (`retail.colaboradores.rol`, check de la migración 0016). Eso no alcanza para un Almacén que solo mueve mercadería ni para unas Finanzas que solo ven Compras. El candado está en **dos capas**, y el spike solo mostraba una:

1. **Next:** 254 usos de `esLider` en 50 archivos, más `lib/produccion-menu.ts` y los `layout.tsx` que redirigen. El menú ya se calcula desde datos en `lib/menu.ts` (ADR-0144): `permisosDe(rol)` es el único lugar donde el rol se traduce a permisos (`administrar`, `verDinero`, `analizar`).
2. **Base de datos:** `retail.fn_es_lider()` aparece en 87 migraciones y unas 35 políticas de fila. Si el menú muestra «Por pagar» pero la RPC sigue exigiendo `fn_es_lider()`, la pantalla se abre y todo falla al guardar: un estado inconsistente (principio 2).

Además, `colaboradores` ya no se escribe a mano: solo por RPC (ADR-0145), con `check (rol = 'lider' or ubicacion_asignada_id is not null)`, y suspender **mueve la fila** a `colaboradores_suspendidos` (ADR-0148). El plan tiene que convivir con eso.

## Decisión

Las 8 decisiones de F0:

1. **Roles a medida en tabla**, no solo líder/integrante. Sin tabla, Almacén y Finanzas no existen.
2. **Granularidad V1: «ve o no ve» por pantalla**, sin separar ver de operar. El dinero de Compras es un permiso propio (ADR-0126, `fn_aplicar_candado_de_dinero()`).
3. **Solo el líder administra roles.** «Asignar rol» y «Roles y accesos» no se delegan: un rol con esa puerta podría darse más permisos a sí mismo.
4. **Facturación (SUNAT) no se delega en V1.** Es un documento legal y mueve dinero real.
5. **Un solo rol por persona.**
6. **Piloto: Inventario/Almacén**, porque no toca dinero.
7. **Roles de retail y de Dynamic son catálogos separados, sin derivación automática.** `rol_usuario` de Dynamic es de RRHH y planilla y no se toca. Si el rol de Dynamic diera permisos en retail, un ascenso de RRHH abriría Compras sin que nadie lo decida. Retail escribe solo en sus propias tablas (frontera D-33).
8. **Identidad una sola vez, acceso a retail explícito.** La cuenta y la persona se crean en Dynamic (misma cuenta de Supabase Auth, `auth_user_id`). Entrar a retail sigue exigiendo la fila en `colaboradores` **con ubicación** (ADR-0145): no puede ser automático, porque el candado de esquema exige sede fija. El alta desde Dynamic no se vuelve a teclear: `agregar_colaboradores` elige de las personas ya existentes y suma un selector de rol (por defecto «Integrante»). Si la persona pasa a inactiva en Dynamic, pierde el acceso sin más pasos. *(Corrige lo dicho en la conversación: «acceso mínimo automático» era incorrecto.)*

### Modelo (no toca `productos`, `variantes`, `stock` ni `movimientos`)

- `retail.roles` — nombre, descripción, `es_sistema`, `archivado_at`. Los roles **se archivan, nunca se borran**.
- `retail.permisos` — catálogo de claves (`ventas.caja`, `compras.porpagar`…) con `delegable`. Como es tabla con FK, no se pueden escribir claves mal.
- `retail.rol_permisos` — qué permisos tiene cada rol.
- `retail.roles_historial` — quién cambió qué y cuándo; solo se agrega (trigger que impide `update` y `delete`, como `colaboradores_historial`). Es distinto de `colaboradores_historial`, que cuenta accesos.
- `colaboradores.rol_id` **y** `colaboradores_suspendidos.rol_id`: al reactivar, la persona vuelve con el mismo rol. El texto `rol` se mantiene en la transición y `fn_es_lider()` no se reemplaza.
- `retail.fn_tiene_permiso(clave)` — `security definer`, `search_path` fijo: verdadera si la persona es líder o su rol incluye la clave. Cada RPC se migra a ella módulo por módulo.
- **`delegable` es un candado de coherencia:** un permiso solo se puede activar en un rol si todas sus RPC ya usan `fn_tiene_permiso`. Los demás salen en el editor como «Solo líder por ahora» y los de decisión 3 y 4 como «Solo líder». El menú nunca muestra algo que la base rechaza.
- **Roles de sistema** («Líder de equipo», «Integrante»): `es_sistema`, no se editan ni se archivan. Sin eso, alguien podría dejar sin permisos al rol del que depende `fn_es_lider()`.
- **Ubicación como eje aparte:** «Producción solo en el Taller» y «Compras no en el Taller» siguen igual. La pantalla se ve si el rol la permite **y** la ubicación lo deja.
- **Escritura solo por RPC** (ADR-0145): `asignar_rol_colaborador`, `crear_rol`, `guardar_permisos_rol`, `archivar_rol` (falla si quedan personas con el rol), `restaurar_rol`; todas solo líder y todas anotan `roles_historial`.

### Web

`lib/menu.ts` ya es el lugar: `permisosDe(rol)` pasa a leer la lista de la persona en vez de fijarla. Un `lib/permisos.ts` puro (`puede(persona, clave)` y el catálogo) sirve al servidor y al cliente, y un helper `exigirPermiso(clave)` sustituye los `redirect` sueltos de cada página. Los permisos de la persona llegan por una RPC nueva `fn_mis_permisos()` dentro de `requirePersonaActualV2`; **no se cambia la firma de `fn_persona_actual_resumen`** (un `create or replace` con otros parámetros crea una sobrecarga). Los tres permisos semánticos de hoy (`administrar`, `verDinero`, `analizar`) se convierten en claves del catálogo, sin cambiar lo que ve cada perfil.

### Fases

| # | Fase | Cómo se verifica |
|---|---|---|
| F0 | Este ADR y la entrada del BACKLOG | Leerlo |
| F1 | Migración: tablas, catálogo, `fn_tiene_permiso`, `fn_mis_permisos`; dos roles de sistema; comportamiento idéntico al de hoy | SQL: cada persona da los mismos permisos que su rol actual; `pnpm datos:comparar` |
| F2 | La web lee `fn_mis_permisos()` y `menuPara` arma el menú desde el catálogo. Sin cambios visibles | Capturas antes y después, líder e integrante; la fotografía `menu-hoy.golden.json` no cambia |
| F3 | Piloto Inventario/Almacén: RPC migradas, permisos delegables, pantallas «Asignar rol» y «Roles y accesos» | Se crea «Almacén», se le da a Diego y solo ve Inventario y Recibir; por URL directa a Compras sale «Sin acceso» |
| F4 | Catálogo (Ventas ya está abierto al colaborador) | Igual que F3 |
| F5 | Compras, con el candado de dinero (recrear las funciones de indicadores reaplica `fn_aplicar_candado_de_dinero()`) | «Finanzas» ve Por pagar y Notas de crédito; un integrante no ve montos |
| F6 | Producción con la regla de ubicación | Igual que F3 |
| F7 | Limpieza de `esLider` en lo migrado, `ARQUITECTURA.md`, diccionario, BACKLOG y BITACORA | `pnpm datos:generar:produccion` y `datos:comparar` |

Cada fase que toca producción es cambio de esquema: **se detiene y se confirma antes de pegar**. Las funciones se reescriben desde `pg_get_functiondef` de producción, no desde los archivos del repo (hay 87 migraciones y el repo puede haber quedado atrás), con prefijo `retail.` solo al pegar. Estimación: 10 a 12 sesiones; F1 a F3 ya dejan el sistema útil.

### Ajustes al spike (hechos en esta sesión)

Bloqueo «Solo líder por ahora» / «Solo líder» con un selector de **etapa** para ver cómo se destraban F3 a F6; «Roles y accesos» ya no se delega; **Archivar rol** con confirmación y sección «Archivados» con «Restaurar»; historial que solo se agrega; «Dar acceso» para quien ya está en Dynamic pero no en retail; personas inactivas en Dynamic sin acceso. El movimiento sigue ADR-0136 (velo con desenfoque, hoja que sube 18 px, cascada de 55 ms, salida corta) más respuestas a la acción: cifra que cuenta, «visto» que se dibuja, fila que aparece; sin rebote y todo se apaga con `prefers-reduced-motion`.

## Descartado

- **Derivar el rol de retail del `rol_usuario` de Dynamic.** Un ascenso de RRHH abriría dinero en retail; y tocaría el repo que paga planilla.
- **Migrar todo de una vez.** Dos capas de candado y 87 migraciones: una fase a medias deja pantallas que se abren y fallan al guardar.
- **Reemplazar `fn_es_lider()`.** Está en la ruta caliente de cada política RLS; `fn_tiene_permiso` convive con ella y la incluye.
- **Permisos por sede y por acción dentro de una pantalla.** Fuera de alcance de V1; `ubicacion_asignada_id` ya existe y sería el punto de partida para lo primero.

## Se rompe si

- Se delega un permiso cuyas RPC aún exigen `fn_es_lider()`: la pantalla abre y falla al guardar. Por eso `delegable` es dato, no opinión, y una prueba debe fallar si una RPC de un permiso delegable no llama a `fn_tiene_permiso`.
- Una migración recrea las funciones de indicadores de Compras sin reaplicar `fn_aplicar_candado_de_dinero()`: el dinero se filtra a roles que no debían verlo.
- Se archiva un rol con personas: la RPC lo rechaza; si no lo hiciera, esas personas quedarían con un rol que ya no aparece en ningún lado.
- Se agrega `rol_id` a `colaboradores` pero no a `colaboradores_suspendidos`: reactivar devuelve a la persona con otro rol.
- El número de este ADR puede chocar con otro que suba antes: numerar al subir, sin reemplazar en masa.
