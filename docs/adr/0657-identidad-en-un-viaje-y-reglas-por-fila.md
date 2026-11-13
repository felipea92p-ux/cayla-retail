# ADR-0657 — «Quién eres» en un viaje, y la convención de dos capas: la puerta y la regla por fila

**Fecha:** 2026-11-13 · **Estado:** aprobado por Felipe (propuestas #15, paso 1, y #9 del informe `/innovar` «cambiar de módulo», 2026-11-13).
Construido en la rama `claude/identidad-en-un-viaje` (PR #1823). Dos migraciones, **pegadas en producción el 2026-11-13** con el OK de Felipe y
verificadas por md5: `20261113195000_mis_modulos_identidad_una_vez.sql` y `20261113200000_mi_sesion_en_un_viaje.sql`, en ese orden.
**Sigue a:** ADR-0622 (rendimiento medido; el backlog de «juntar las 6 RPC del marco»), ADR-0161/0178 (módulos y roles), ADR-0450 (la base caída
no es «sin acceso»), ADR-0533 (`fn_mi_persona_id`).

## El problema

Cambiar de módulo tarda. El 2026-11-13 se midió producción con `pg_stat_statements` (22 h): cada render del servidor paga seis preguntas de
identidad antes de dibujar nada (`requirePersonaActualV2`, `apps/web/lib/persona-actual.ts`), cada una ~6.375 veces al día:

| Función | Media en producción | Qué pregunta |
|---|---|---|
| `fn_mis_modulos` | 34 ms | qué módulos ve la cuenta |
| `fn_persona_actual_resumen` | 20 ms | nombre, si es líder, su sede |
| `fn_mi_pantalla_principal` | 18 ms | a qué módulo aterriza |
| `fn_mi_persona_id` | 11 ms | el id de la persona (null en una terminal) |
| `fn_es_admin` | 10 ms | si es Admin |
| `fn_mi_terminal` | 8 ms | si la sesión es un aparato |

Son dos problemas distintos:

1. **Seis viajes donde basta uno.** Seis peticiones a PostgREST, seis transacciones, seis conexiones del pool por render; y dentro, las mismas
   preguntas repetidas («¿es una terminal?» cuatro veces, «¿es líder?» y «¿es admin?» en funciones distintas). ~38.000 llamadas al día.
2. **Una regla que Postgres no puede meter en la consulta.** Casi toda función de `retail` lleva `security definer` y `set search_path`. Con
   cualquiera de los dos, Postgres no puede *inlinear* la función: la ejecuta aparte, y si está en un `where`, una vez por fila. `fn_mis_modulos`
   pregunta `fn_es_lider()` y `fn_mi_rol_id()` dentro de su consulta; el planificador copia `rm.rol_id = fn_mi_rol_id()` a la tabla de roles y
   la evalúa fila por fila. EXPLAIN ANALYZE en una copia local, integrante de Trujillo: **75 llamadas a `fn_mi_rol_id()`** para 15 módulos, 3,2 ms
   contra 0,4 ms del líder. El repo ya había arreglado este patrón a mano tres veces (`20261030170000`, `20261031161000`: 13×; `20261101004000`:
   100× en producción), y nada impedía que una migración que recrea la función desde un archivo viejo le devolviera los ajustes.

**Analogía CAYLA.** La vendedora iba seis veces a la oficina a preguntar quién es, y la oficina, para responder «qué módulos ves», volvía a
buscar su ficha una vez por cada módulo de la lista. Ahora va una vez, la oficina saca la ficha una vez y le devuelve un sobre con todo.

## Decisión

### 1. `retail.fn_mi_sesion()`: las seis respuestas en un viaje (#15, paso 1)

Una **puerta** (`security definer`, la llama `authenticated`) que devuelve un jsonb con lo mismo que las seis:
`{ resumen: [filas], terminal, modulos: [{clave, completo}], persona_id, es_admin, pantalla_principal }`.

- **«¿Es líder?», «¿es admin?» y «¿qué rol tiene?» se calculan una vez** (CTE materializado) y sirven para `es_admin` y para los módulos.
  `es_admin` se pregunta solo si es líder: `fn_es_admin` exige todo lo de `fn_es_lider` más `personas.rol = 'admin'`. El rol, solo si no lo es.
- **El resto se compone, no se copia:** `fn_persona_actual_resumen()`, `fn_mi_terminal()`, `fn_mi_persona_id()` y `fn_mi_pantalla_principal()`
  se llaman una vez cada una. La regla de cada respuesta sigue viviendo en un solo lugar (principio 4); las seis funciones no se tocan ni se
  borran (la web publicada antes las sigue llamando).
- **La web** (`lib/mi-sesion-reglas.ts`, lógica pura con su prueba) traduce el sobre a las MISMAS seis respuestas, con sus errores, y el resto
  de `requirePersonaActualV2` no cambia ni una línea. `resumen` viaja como lista para conservar lo de `.maybeSingle()`: ninguna fila = sin acceso,
  una = la persona, dos = el error PGRST116.
- **Principio 9.** Si la función no existe en esa base (PGRST202: web publicada antes de pegar) o falla por algo que no es «la base no responde»,
  la web hace las seis de siempre. Si la base no responde, no pregunta seis veces más: manda a `/sin-base` como siempre (ADR-0450).
  Para volver atrás en producción basta `revoke execute on function retail.fn_mi_sesion() from authenticated;`.

### 2. La convención de dos capas: la puerta y la regla por fila (#9)

| | **Puerta** (capa 1) | **Regla por fila** (capa 2) |
|---|---|---|
| Qué es | Lo que llama la web (`.rpc`) o una política | Lo que una puerta evalúa *dentro* de su consulta, a veces por fila |
| Ajustes | `security definer` + `set search_path = retail, public, extensions` | **Ninguno**: SQL `stable` (o `immutable`), no `strict`, sin `security definer` ni `set` |
| Nombres | Los resuelve su `search_path` | **Todos calificados** (`retail.modulos`): corre con el search_path de quien la llama |
| Identidad | La resuelve (`fn_es_lider()`, `auth.uid()`…) | **La recibe como parámetro**; nunca lee `public.personas` |
| Quién la ejecuta | `authenticated` (y lo que la pantalla necesite) | Nadie de afuera: `revoke all … from public, anon, authenticated, service_role` |
| Cómo se reconoce | — | Su comentario empieza con **`[regla por fila]`** |

Por qué funciona: una función SQL `stable` sin ajustes la inlinea el planificador dentro de la consulta de la puerta, y corre con el rol de la
puerta (el dueño, `postgres`), así que lee lo mismo que antes. Por qué la identidad queda en la puerta: `public.personas` es de Dynamic y tiene
su propia RLS; una regla sin `security definer` que la leyera le respondería «sin acceso» a toda la tienda. `fn_es_lider`, `fn_es_admin`,
`fn_mi_rol_id` y `fn_terminal_actual` **siguen siendo puertas**.

**Cómo se marca una regla nueva:** en la misma migración que la crea,
`comment on function retail.fn_x(…) is '[regla por fila] Qué decide, quién la llama…';`, `revoke all …`, y se suma a `MARCADAS_HOY` en
`scripts/pruebas/reglas_por_fila.mjs`.

### 3. El vigía del CI: `pnpm pruebas:reglas-por-fila`

Mira `pg_proc` en la base del CI (todas las migraciones aplicadas) y falla si una función de `retail` marcada `[regla por fila]`:
lleva `security definer`; lleva cualquier `set`; no es `language sql`; es `volatile`; es `strict`; menciona `personas`; o no compila con
`search_path = pg_catalog` (un nombre sin calificar). Además exige que las marcadas a la fecha sigan existiendo y marcadas (quitar la marca
para callarlo también falla). **Controles que muerden:** dentro de un ROLLBACK crea reglas falsas con cada ajuste prohibido y una sana; el
vigía tiene que acusar cada mala con su motivo y callar con la sana. Probado además a mano: con `alter function fn_modulos_de security
definer` + `set search_path`, sale en rojo con los dos motivos.

### 4. `fn_mis_modulos` reescrita (#9, primera regla)

- `retail.fn_modulos_de(es_lider, es_admin, rol_id)` (nueva, **regla**): el texto de siempre de «qué módulos ves», con las tres preguntas
  cambiadas por sus respuestas. La usan `fn_mis_modulos` y `fn_mi_sesion`: la regla de qué módulos ves está en un solo lugar.
- `retail.fn_mis_modulos()` sigue siendo la **puerta** (misma firma, columnas y permisos), con la identidad en un CTE materializado.
- Marcadas como reglas las tres que el repo ya había dejado sin ajustes: `fn_precios_en_sedes`, `fn_trafico_web_personas`,
  `fn_trafico_web_prendas` (se antepone la marca a su comentario sin borrar lo que decía).

## Mismas respuestas (lo que se comprobó)

`pnpm pruebas:mi-sesion` (en el CI) arma, dentro de un ROLLBACK, las cuentas de `apps/web/tema/cuentas.mjs` —admin (dos), integrante,
terminal de ventas, terminal administrativa, rol personalizado— y once casos raros: líder que no es Admin, líder sin sede asignada, terminal
desactivada, terminal de una sede cerrada, cuenta sin fila, sin sesión, persona cesada en Dynamic, colaborador pendiente, rol archivado, rol
«limitado como hoy», y una cuenta que es persona y terminal a la vez. Para cada una: `fn_mi_sesion()` = las seis (igualdad de jsonb), y
`fn_mis_modulos()` = la regla de antes escrita como consulta (el oráculo). 37/37. Con controles: rompiendo a propósito la regla (sin ocultos
del líder, sin filtro de archivado) o el `es_admin` de la sesión, la prueba sale en rojo en la cuenta que corresponde.

Además, en una copia local de la base con las migraciones de main (`cayla_euler`): el md5 de las seis respuestas de las 17 cuentas, **antes y
después** de las dos migraciones, es idéntico. `pnpm pruebas:roles` 70/70, `pruebas:roles-cobertura` 32/32, `pruebas:roles-lider-editable`
13/13, `cayla_global` 10/10. `terminales_sin_persona` 54/55: el caso rojo («jornada abierta sin marcas») falla igual en la base compartida sin
estos cambios.

## Medido en local (antes → después)

`fn_mis_modulos`, mediana de 500 llamadas, misma copia:

| Cuenta | Antes | Después |
|---|---|---|
| Admin (Felipe) | 439 µs | 186 µs |
| Integrante (Micaela) | 3.205 µs | 257 µs (12×) |
| Terminal de ventas | 1.653 µs | 255 µs |
| Rol personalizado (Lucía) | 1.362 µs | 258 µs |

Las seis contra `fn_mi_sesion()`:
- **Dentro de la base** cuestan lo mismo (≈0,72–0,92 ms contra 0,76–0,94 ms de las seis sumadas, con `fn_mis_modulos` ya reescrita).
- **Por PostgREST local** (contenedor temporal apuntado a la copia, mediana de 200): 1,6–2,3 ms las seis en paralelo contra 1,6–1,7 ms el
  sobre.

En local casi no se nota: no hay red ni CPU compartida. Lo que cambia con certeza es la **carga**: por render, 6 sentencias, 6 transacciones y
6 conexiones del pool pasan a 1 (≈38.000 → ≈6.400 llamadas al día con el uso medido). **No se promete un número de milisegundos en
producción:** se mide allá después de pegar (abajo).

## Alternativas descartadas

- **Guardar la sesión 60 s** (#15, paso 2). Cambiaría cuándo se ve un cambio de rol: a una integrante a la que le quitan un módulo lo seguiría
  viendo hasta un minuto en el menú. Espera la decisión de Felipe.
- **Reescribir las seis en una sola consulta**, leyendo la ficha de la persona una vez. Más rápida dentro de la base, pero copiaría las reglas de
  identidad (quién es líder, qué sede le toca) en un segundo lugar.
- **Ampliar `fn_persona_actual_resumen`.** Cambiar su forma rompería a la web publicada que la lee con `.maybeSingle()`.
- **Quitar `security definer` en masa.** Las preguntas de identidad leen `public.personas` (RLS de Dynamic): responderían «sin acceso».
- **Reescribir `fn_ve_modulo` en este mismo paso.** Repite la regla de `fn_modulos_de` por clave y la llaman casi todas las funciones que
  guardan; va aparte, con su propia medición (backlog).

## Se rompe si

- Alguien cambia una de las seis y no `fn_mi_sesion` (la respuesta dependería del camino): lo frena `pnpm pruebas:mi-sesion`.
- Alguien le pone `security definer` o `set search_path` a una regla marcada (no da error, vuelve la lentitud): lo frena
  `pnpm pruebas:reglas-por-fila`.
- Una regla lee `public.personas` (respondería «sin acceso» a todos): lo frena el vigía.
- **Riesgo que no se puede probar en local:** si en producción las seis corrían de verdad en paralelo en CPUs libres, el sobre (que las hace en
  fila dentro de una sentencia) podría tardar algo más de reloj aunque cargue menos a la base. Se ve en la primera medición (abajo); si pasa, el
  `revoke` devuelve la web a las seis sin publicar nada.

## En producción (esperar el OK de Felipe)

1. Pegar `20261113195000_mis_modulos_identidad_una_vez.sql` tal cual, de una vez (solo funciones, permisos y comentarios; el candado md5
   aborta sin tocar nada si `fn_mis_modulos` tiene otro cuerpo vivo).
2. Pegar `20261113200000_mi_sesion_en_un_viaje.sql` tal cual, de una vez.
3. La web puede publicarse antes o después: sin la función, hace las seis de siempre.
4. Medir con `pg_stat_statements` a las 24 h: `fn_mi_sesion` (media y llamadas) contra las seis de antes, y la media de `fn_mis_modulos`
   (con la web nueva ya publicada, solo la llama el camino de respaldo). Refrescar el diccionario (`pnpm datos:generar:produccion`).
