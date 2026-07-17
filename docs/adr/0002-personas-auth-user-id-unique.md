# ADR-0002 — Constraint UNIQUE en `personas.auth_user_id`

**Fecha:** 2026-07-17
**Estado:** Aplicado en producción

## Contexto

Al dar de alta a Felipe (`felipe.a92p@gmail.com`) como Líder, el INSERT se corrió más
de una vez (sin querer) contra la misma cuenta de Supabase Auth, y ya existían además
filas previas de prueba ("Felipe Alvarez", "Colibrí (prueba Integrante)") apuntando a
ese mismo `auth_user_id`. Resultado: 5 filas de `personas` para un solo login.

`requirePersonaActual()` (`apps/web/lib/persona.ts`) usa `.select(...).single()`, que
exige exactamente una fila — con más de una, Postgres/PostgREST devuelve un error, y
ese error caía en el mismo camino de `if (error || !data) redirect("/login?error=sin_persona")`
que "la cuenta no existe". Por eso el login de Felipe fallaba con el mismo mensaje de
"cuenta no vinculada" aunque sí hubiera una fila válida — el síntoma no distinguía
"cero filas" de "demasiadas filas".

Al intentar limpiar con un `DELETE ... WHERE auth_user_id = ...`, Postgres lo bloqueó:
una de las filas duplicadas (`bf3b92ff...`) ya tenía 2 movimientos de stock reales
asociados vía `movimientos.usuario_id`. Borrarla habría sido borrar auditoría real,
no un duplicado — el constraint de foreign key existente evitó ese error mayor.

## Decisión

1. Diagnosticar con un `count(*)` de movimientos por fila antes de borrar nada —
   nunca asumir cuál duplicado es "seguro".
2. Conservar la única fila con historial real (nombre/rol/sede ya correctos), borrar
   las 4 sin movimientos asociados.
3. Agregar el constraint que hace esta clase de estado imposible de repetir:

```sql
alter table personas
  add constraint personas_auth_user_id_unique unique (auth_user_id);
```

Ver `supabase/migrations/0006_personas_auth_user_id_unique.sql`.

## Alternativas descartadas

- Cambiar `.single()` por `.maybeSingle()` + lógica para elegir "la primera" fila
  cuando hay varias: parcha el síntoma (la app no crashea) pero no corrige la causa
  — seguiría siendo posible crear cuentas fantasma o ambiguas sin que nadie lo note.
  El principio 2 del rol ("cero estados inconsistentes... se corrige el esquema, no
  el código") pide exactamente lo contrario.

## Consecuencias

Un intento futuro de insertar una segunda fila de `personas` para el mismo
`auth_user_id` falla de inmediato con un error claro de constraint, en vez de crear
una cuenta silenciosamente rota que solo se descubre cuando esa persona intenta
entrar.
