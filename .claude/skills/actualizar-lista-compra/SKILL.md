---
name: actualizar-lista-compra
description: "Renueva los datos del tablero «Qué comprar esta semana» desde la base del ERP con dos consultas de solo lectura que se comprueban entre sí. Úsala cuando Felipe diga «actualiza la lista de compra», «renueva el tablero de compras» o cada lunes."
---

## Qué hace y cuándo se usa

Renueva los datos del tablero «Qué comprar esta semana» (artefacto de claude.ai) desde la base del ERP. Corre las dos consultas de solo lectura, comprueba que cuadran y reemplaza la copia que lee el tablero, para que cualquiera con el enlace vea la lista al día. Sirve desde cualquier cuenta de Claude que tenga el conector de Supabase y permiso de editar el tablero. Úsala cuando Felipe diga «actualiza la lista de compra», «renueva el tablero de compras» o cada lunes.

Renueva el tablero «Qué comprar esta semana»: $ARGUMENTS

**Contrato.**
Promete: dejar en el tablero una copia nueva de la lista de compra y de las preferencias, sacada en este momento de producción y comprobada contra sus propias sumas de control.
Asume: el conector de Supabase de esta cuenta llega al proyecto de producción (schema `retail`) y esta cuenta puede EDITAR el tablero.
No hace: escribir en la base (solo `SELECT`), cambiar la página ni las reglas de la lista, ni guardar cifras en el repositorio.

## Por qué existe

El tablero no puede leer la base por su cuenta para quien entra por el enlace: cada consulta en vivo corre con la llave de quien lo abre, y el equipo no tiene esa llave. Por eso lee una **copia** (un archivo adjunto al tablero) y alguien con llave la renueva. Para que no dependa de una sola cuenta ni de sus tokens, el procedimiento vive aquí y lo corre cualquiera de las cuentas de Felipe.

## Reglas que no se saltan

1. **Las cifras no entran al git.** El repositorio es público. Los archivos de trabajo van al directorio temporal de la sesión (scratchpad), nunca a una carpeta versionada.
2. **La dirección del tablero tampoco se escribe aquí** (quien tenga el enlace ve las cifras). Está en la memoria de Claude de la máquina («Lista de compra viva y guía»); si esta cuenta no la tiene, pídesela a Felipe.
3. **Las consultas se pasan tal cual**, sin editar. Si una falla, se copia el error textual y se para: no se «arregla» sobre la marcha.
4. **Si las sumas no cuadran, no se publica.**

## Pasos

1. **Ubica el tablero** (su dirección) y lee con `ArtifactData` los documentos `datasets/motor` y `datasets/gustos`: anota su `version` y la `source.url` de cada uno (el archivo viejo, `/_blob/<id>`).
2. **Corre las dos consultas** con el conector de Supabase (`execute_sql`, solo lectura), cada una entera y sin cambios:
   - `consultas/lista.sql` → una fila con la columna `motor`.
   - `consultas/gustos.sql` → una fila con la columna `gustos`.
   Las respuestas son largas (unos 50 KB cada una): que las corra un subagente o que el arnés las deje en un archivo; no se copian a mano.
3. **Guarda cada respuesta** en el scratchpad:
   `node .claude/skills/actualizar-lista-compra/guardar.mjs <respuesta> lista <scratchpad>/lista-compra`
   `node .claude/skills/actualizar-lista-compra/guardar.mjs <respuesta> gustos <scratchpad>/lista-compra`
4. **Comprueba:**
   `node .claude/skills/actualizar-lista-compra/comprobar.mjs <scratchpad>/lista-compra/lista.json <scratchpad>/lista-compra/gustos.json`
   Tiene que terminar en «todo cuadra». Si no, para y dile a Felipe qué descuadró.
5. **Sube los dos archivos** al tablero como adjuntos (`Artifact` con `asset: true`, la dirección del tablero y `copia-lista.json`, luego `copia-gustos.json`). Cada uno devuelve su `/_blob/<id>` nuevo.
6. **Apunta el tablero a los archivos nuevos** con `ArtifactData`, `update` y la `version` anotada:
   - `datasets/motor`: `{"source": {"url": "/_blob/<nuevo>"}, "updated": {"at": "<ahora en ISO>", "by": "Claude"}}`
   - `datasets/gustos`: lo mismo con su archivo.
   No cambies `kind`, `name`, `format` ni `consultaViva`.
7. **Borra los dos adjuntos viejos** (`Artifact` con `action: "delete"`, la dirección y el id viejo como `path`), recién después de que el paso 6 quedó escrito.
8. **Dile a Felipe** en dos líneas: la fecha de los datos y lo que cambió de la lista contra la copia anterior (prendas por comprar, por traer de otra tienda). Si el tablero estaba abierto, lee `data/users/me/check` para ver que pasó su revisión; si nadie lo tenía abierto, dilo: no se pudo ver.

## Si las reglas de la lista cambian

Las consultas de `consultas/` son la fuente. Un cambio de regla (días de meta, cuándo es «registra primero», etc.) se hace ahí, con su commit, y se le cuenta a Felipe qué cifras movió. La misma cuenta, ya dentro del ERP, es la pantalla «Qué comprar» de Compras: cuando exista, este tablero se puede retirar.
