# ADR-0251 · SQL pegado en producción: la casilla, el candado de `drop trigger` y la deriva

- **Fecha:** 2026-09-28 · **Estado:** casilla, check y candado construidos; la revisión diaria, por decidir con Felipe.
- **Pedido:** Felipe, 2026-09-27 (eligió «casilla + revisión diaria»): que no se vuelva a publicar un cambio sin su SQL.
- **Sin migración.** Todo vive en `.github/` y `scripts/migraciones/`.
- **Complementa:** ADR-0195 («Políticas y deadlocks»: nunca `drop trigger`), `scripts/migraciones/verificar.mjs` (qué
  promete cada archivo) y la memoria de la auditoría del 2026-09-27.

## Problema

El SQL de producción lo pega Felipe a mano, y Vercel publica `main` apenas se fusiona un PR. Falla en las dos
direcciones, y nada lo avisaba:

- **SQL de `main` sin pegar.** El 2026-09-27 una auditoría encontró 6 cambios publicados sin su SQL: el botón «Pedir» de
  Traslados roto (#525), el nº de operación de Yape que se perdía en silencio (#488), el candado de datos de prueba, el
  costo (#520)… Antes, #409 dejó Roles y accesos sin poder guardar.
- **Arreglos que viven solo en producción.** Revokes y cuerpos de función que alguien corrigió directo en la base, y que
  una migración futura puede deshacer al recrear la función desde el repo (le pasó a Análisis con el PR 397).
- **`drop trigger` en una migración nueva.** Toma en exclusiva las tablas de `auth` y `storage` hasta el final de la
  pegada y choca con el Asesor de seguridad (40P01). La regla estaba escrita, pero igual llegó una a `main` (`20260927190000`,
  corregida en #538).
- **Fusionar con la revisión corriendo.** #542 y #544 se fusionaron antes de terminar su revisión; los arreglos tuvieron
  que ir en migraciones nuevas.

## Decidí

1. **Casilla en el formulario de PR** (`.github/pull_request_template.md`): «SQL pegado en producción» (se pega ANTES de
   fusionar) o «El SQL se pega después de fusionar» (con el porqué y la fila «POR PEGAR» en BACKLOG). Y la nota de que un
   PR con una revisión corriendo va en BORRADOR: GitHub no deja fusionar un borrador.
2. **Check «SQL pegado»** (`.github/workflows/sql-pegado.yml` + `scripts/migraciones/sql-pegado.mjs`): rojo si el PR agrega
   una migración y no marcó ninguna casilla, o si edita o borra una migración que ya está en la rama base (renombrar sin
   cambiar el contenido, para resolver un choque de versiones, sí se permite). Corre también al editar el cuerpo del PR:
   marcar la casilla lo pone verde sin volver a correr las pruebas.
3. **Candado de `drop trigger`** (`scripts/migraciones/sin-drop-trigger.mjs`, paso «Migraciones sin drop trigger» del CI):
   rojo si una migración fuera del legado lo usa, aunque sea dentro de un `execute '…'`. Las 22 que ya lo tenían quedan en
   un legado con su cantidad, así que sumarle uno a un archivo viejo también sale rojo.
4. **Deriva: ¿producción corre la MISMA versión que `main`?** (`scripts/migraciones/deriva.sql` + `deriva.mjs`). Una
   consulta de solo lectura saca huellas del catálogo de `retail` (cuerpo de cada función sin comentarios ni espacios,
   permisos, políticas, disparadores, columnas, candados, índices y vistas); se corre en las dos bases y el comparador dice,
   en palabras del negocio, qué falta pegar, qué vive solo en producción y qué tiene otra versión. El CI ya calcula las
   huellas de `main` en cada push y las guarda como artefacto `huellas-main`. Es la mitad que `verificar.mjs` no puede
   decir: él sabe si existe «algo con ese nombre», no cuál versión está viva.

**DESCARTÉ:**
- **Solo la casilla, sin check.** Una casilla que nadie mira no frena a nadie: el formulario ya tenía la de 375 px y el
  incidente del 27-sep pasó igual.
- **Leer el historial `supabase_migrations.schema_migrations` de producción.** Las pegadas en el SQL Editor no dejan fila
  con el nombre del archivo (verificado el 2026-09-22): diría que falta lo que ya está.
- **Comparar por nombre** (lo que hace `verificar.mjs`). No ve un `create or replace` sin pegar ni un arreglo en vivo, que
  son justo los dos casos que dolieron.

**SE ROMPE SI:**
- **Alguien marca la casilla sin pegar.** El check queda verde; lo atrapa la deriva (punto 4) al día siguiente.
- **`main` no está protegida** (hoy no lo está): un check rojo avisa pero no impide fusionar. Protegerla es otra decisión.
- **Producción cambia su forma de guardar un cuerpo** (otra versión de Postgres que reescriba el texto): la deriva diría
  «distinto» de todo. Se ve enseguida (cientos de líneas) y se corrige la normalización en `deriva.sql`.

## La primera corrida (2026-09-28)

`main` en `d6bb5a37` sin las tres migraciones del paso 3 de Frescura (todavía sin pegar) contra producción, solo lectura:
**14 diferencias reales y 53 conocidas** (la tabla vieja de gastos y su función, que Finanzas renombra solo en una base con
datos; los candados de `gastos` con sufijo `1`; la vista `planilla_por_sede`, que solo nace con las tablas de Dynamic).
- **En main y no en producción (1):** la política `clientas_fusiones.clientas_fusiones_select`. Se pegó sin ella a
  propósito (exponía DNI y WhatsApp de fichas unidas); se saca del repo en el PR de Clientas.
- **Solo en producción (1):** `fn_rentabilidad` (PR #168, abierto).
- **Con otra versión (12):** `compras_nota_pendiente`, `notas_credito_tablero`, `emitir_comprobante`, `emitir_nota`,
  `fn_aplicar_movimiento`, `recalcular_stock`, `fn_resumen_comparacion_json`, `fn_resumen_variantes_json`,
  `fn_stock_por_sede_json`, y los permisos de `movimientos` (service_role) y `stock` (authenticated y service_role). Van a
  `main` en el PR de «arreglos que solo viven en producción».

Cómo se repite: ver el encabezado de `scripts/migraciones/deriva.mjs`.

## La revisión diaria (por decidir)

Falta quién corre la deriva cada mañana y dónde avisa. El repo es público, así que importa dónde vive la llave de
producción. Lo que se midió el 2026-09-28 en producción: PUBLIC no entra al schema `retail`, pero sí ejecuta 192 funciones
de Dynamic en `public`. Una cuenta nueva de Postgres, aunque solo lea el catálogo, hereda ese acceso.
