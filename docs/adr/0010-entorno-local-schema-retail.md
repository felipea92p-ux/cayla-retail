# ADR-0010 — El entorno local existe: el schema se renombra en el seed, no en las migraciones

**Fecha:** 2026-09-05
**Estado:** Construido y verificado — login real, pantalla de Facturación real y
un comprobante emitido contra el Postgres local (B001-000001).

## Contexto

Al intentar demostrar en el navegador la consulta de DNI/RUC (ADR-0008) se
descubrió que **la app nunca había corrido contra el Supabase local**. Tres
causas encadenadas, ninguna evidente por separado:

1. **El stack local solo levantaba Postgres.** `supabase start` aborta y borra
   TODOS los contenedores si uno solo falla el healthcheck, y varios fallaban
   (`analytics`, `vector`, `realtime`, `storage`). Sus propios logs mostraban
   arranque correcto: lo que expiraba era el healthcheck, con dos stacks de
   Supabase —retail y cayla-dynamic— compitiendo en la misma máquina. Como la
   CLI ve el contenedor de Postgres y contesta "supabase local development setup
   is running", el fallo quedaba invisible.
2. **El schema no coincidía.** Producción vive dentro del proyecto de
   cayla-dynamic, en un schema `retail`, y la app pide `db: { schema: "retail" }`.
   Las migraciones se escriben sin prefijo —para que corran limpias contra el
   Postgres local, como manda CLAUDE.md— y eso las deja en `public`. La app
   pedía un schema que en local no existía.
3. **El rol no coincidía.** `lib/persona.ts` traducía a Líder solo el valor
   `admin` (el vocabulario de dynamic). En local, el CHECK de `personas.rol`
   solo admite `lider`/`integrante`, así que un Líder local se convertía en
   integrante y quedaba fuera de Finanzas, Facturación y Producción.

Consecuencia real acumulada: cada pantalla nueva se verificaba contra
producción, o no se verificaba.

## Decisión

**DECIDÍ: renombrar `public` → `retail` en `supabase/seed.sql`, después de que
corran las migraciones.** El seed solo se ejecuta en local (nunca se pega en
producción), así que las migraciones siguen escribiéndose sin prefijo —una sola
forma de escribirlas— y el local termina con la misma forma que producción. Cero
divergencia en el código de la app entre los dos entornos.

**DESCARTÉ: reescribir las 34 migraciones con prefijo `retail.`** Habría matado
de paso el archivo dual de `supabase/unificacion/` (la causa de ADR-0004 y
ADR-0006), que es tentador. Pero las 32 funciones llevan `set search_path` en su
definición, `retail.personas` y `retail.sedes` son **vistas puente sobre
dynamic** que en local no existen, y el riesgo de tocar todo el historial de
migraciones para arreglar un problema de entorno era desproporcionado. Sigue
siendo el arreglo de fondo del drift; queda en el backlog, no aquí.

**DESCARTÉ: hacer el schema configurable por variable de entorno**
(`NEXT_PUBLIC_SUPABASE_SCHEMA=public` en local). Es lo más corto, y es
exactamente el patrón que produce el bug que nadie reproduce: local y producción
ejecutándose por caminos distintos.

**SE ROMPE SI:** una migración futura crea objetos fuera de las tablas del repo
—por ejemplo en `storage` o `auth`— asumiendo que el schema de trabajo es
`public`. El renombrado solo mueve lo del repo. Ya pasó una vez: `0015` insertaba
en `storage.buckets` y reventaba con Storage apagado; ahora está guardada con
`to_regclass`.

## Lo que se apagó en local, y por qué

`analytics`, `vector`, `realtime`, `edge_runtime` y `storage`. Los cuatro
primeros **la app no los usa** (0 referencias a `.channel(` o
`supabase.functions` en todo el repo) — apagarlos no cuesta nada y quita justo
los contenedores que fallaban. `storage` sí se usa (fotos de producto, 2 sitios)
y apagarlo es una pérdida real y consciente: **subir fotos no funciona en
local.** Se aceptó porque era el último que impedía que el entorno existiera, y
un entorno sin fotos vale infinitamente más que ningún entorno. Para probar
fotos: ponerlo en `true` y apagar el stack de cayla-dynamic.

## Verificación (no "debería funcionar")

Contra `http://localhost:3000` con el Postgres local:

- Login con `felipe@cayla.local` → entra como **"Felipe Alvarez · Líder · AQP"**
  (el arreglo del rol, funcionando).
- `/vender/facturacion` carga con las series del seed (B001, F001).
- Se escribió un DNI incompleto → **"Falta 1 dígito"**; completo → **"Consultando
  RENIEC…"** → **"La consulta automática todavía no está activada"** (sin token).
- Se emitió una boleta real: **B001-000001, S/118.00, Pendiente de enviar**, con
  la RPC `emitir_comprobante` y su candado `for update` contra el schema `retail`.
- Se volvió a teclear el mismo DNI → **"MARIA FERNANDA ALVAREZ QUISPE — De un
  comprobante anterior"**, autorellenando el nombre. El camino de degradación de
  ADR-0008, probado de punta a punta sin proveedor y sin internet.

## Cómo se revierte

Borrar `supabase/seed.sql`, devolver `supabase/config.toml` a
`schemas = ["public", "graphql_public"]` con los servicios encendidos, y quitar
la guarda de `0015`. Nada de esto toca producción: el seed no corre allá y
`config.toml` es solo configuración local.
