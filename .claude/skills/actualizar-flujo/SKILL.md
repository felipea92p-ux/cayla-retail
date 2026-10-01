---
name: actualizar-flujo
description: Actualiza el entorno de /flujo-de-negocio a lo último de main. Muestra primero el plan (simulación) y, solo con el ok de Felipe, respalda la base local, aplica las migraciones pendientes en orden, crea una rama nueva idéntica a origin/main con la skill copiada y registra la foto nueva. Úsala cuando Felipe diga «actualiza el flujo», «trae lo último de main» o «actualiza la base local». Nunca se corre sola.
---

Actualiza el entorno de `/flujo-de-negocio`: $ARGUMENTS

**Contrato.**
Promete: dejar la base local y el código en la misma versión de `origin/main` (la «foto»), con un respaldo de la base antes de tocarla y la skill copiada a una rama nueva e idéntica a `main`.
Asume: Docker con el Supabase local de este repo, el árbol sin cambios sin commit y red para consultar GitHub.
No hace: correr sin que Felipe lo ordene, parchar una migración que falla, tocar producción, ni cambiar la aplicación.

## Por qué existe aparte
`main` trae commits y migraciones todos los días, pero la base local la comparten otras sesiones: cambiarla a mitad de un trabajo lo rompe. Por eso `/flujo-de-negocio` trabaja sobre una **foto** congelada de `main`, y esta skill es la única forma de moverla. Decisión de Felipe, 2026-09-30.

## Qué hago, en orden

1. **Miro dónde estamos:** `node scripts/flujo-de-negocio/espejo.mjs verificar`. El `ℹ` de abajo dice cuántos commits y migraciones trajo `main` desde la foto.
2. **Simulo y se lo muestro a Felipe:** `node scripts/flujo-de-negocio/espejo.mjs actualizar --simular`. No cambia nada: dice qué migraciones se aplicarían, qué rama se crearía y de dónde se copia la skill. Leo con él las migraciones nuevas (un `grep` de `drop|delete|truncate` y qué tablas tocan); si alguna es destructiva o toca algo de otra sesión, se lo digo antes.
3. **Espero su ok explícito.** Sin él, no sigo. «Actualiza» es la orden de empezar; el ok es después del plan.
4. **Actualizo:** `node scripts/flujo-de-negocio/espejo.mjs actualizar` (con `--fuente <rama>` si la skill viene de otra rama). Respalda la base en `.flujo-de-negocio/respaldos/`, aplica las migraciones en orden (**si una falla, se detiene sin tocar git**), crea la rama `flujo/AAAAMMDD-HHMM` idéntica a `origin/main`, le copia **solo** la skill y registra la foto nueva en `.flujo-de-negocio/actualizacion.json`.
5. **Verifico:** `espejo.mjs verificar` debe dar ESPEJO: SÍ. Si no, lo digo y no sigo.
6. **Cierro:** una entrada en `docs/bitacora/` (qué migraciones entraron, el SHA nuevo y el respaldo).

## Reglas duras
- **Si una migración falla, me detengo y se lo cuento a Felipe.** No edito el archivo, no salto su «ancla», no la marco como aplicada. El 2026-09-30 la `20260929140000` falló porque la base ya traía a mano parte de su efecto; se resolvió a mano y con su ok, no en silencio.
- **`--sin-migraciones`** actualiza el código y deja las pendientes como «aceptadas»: solo si Felipe lo pide. **`aceptar`** registra el estado actual sin cambiar nada.
- **La skill se edita en su rama de origen** (la registrada en `fuente`, hoy `claude/cayla-business-skill-e4e733`), nunca en la de corrida, que es desechable. Si la skill ya está en `main`, no se copia nada.
- **Nunca toco `public`/Dynamic** en la base local: solo el schema `retail`.
- **Sin probar todavía:** la aplicación real de migraciones dentro de `actualizar` (usa la misma lógica que se aplicó a mano a las 22 del 2026-09-30, pero no se ejerció). **La primera vez que haya migraciones pendientes, se mira de cerca.**

Qué hace cada pieza y por qué: `scripts/flujo-de-negocio/espejo.mjs` (encabezado).
