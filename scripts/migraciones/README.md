# Verificador de migraciones

**Para qué.** El repo tiene 75 scripts SQL entre `supabase/migrations/` y
`supabase/unificacion/`, y hasta hoy ninguna forma de saber cuáles corrieron en
producción: el historial de Supabase no conoce la segunda carpeta, y la primera se
pega a mano en el SQL Editor. Es lo que el BACKLOG llama *"la deuda que produce todas
las anteriores"* — ya cobró dos veces, con la `0030` y con las `20`/`21`/`22`.

## Cómo se usa

**Contra la base local** (levanta `npx supabase start` antes):

```bash
pnpm migraciones:verificar
```

**Contra producción.** Pega `inventario.sql` entero en el SQL Editor del proyecto de
cayla-dynamic, guarda el JSON que devuelve en `inventario-produccion.json` y corre:

```bash
pnpm migraciones:verificar scripts/migraciones/inventario-produccion.json
```

Ese archivo **no se commitea**: es una foto de un momento, y una foto vieja miente con
cara de dato. Se genera cuando se necesita.

## Candado de versiones repetidas

`pnpm migraciones:versiones` falla si dos archivos de `supabase/migrations/` comparten
prefijo numérico: Supabase lo usa como llave del historial y `db reset` / `migration up`
revientan con llave duplicada. No necesita base de datos y corre en CI (paso «Versiones
de migración»). Si sale rojo, renombra la que **aún no corrió en producción** — nunca la
que ya se pegó allá — y actualiza sus referencias con `git grep`.

## Qué significa cada resultado

| Resultado | Qué puedes afirmar |
|---|---|
| `✗ falta X` | **Certeza.** Ese objeto no está: el archivo no corrió, o corrió a medias. |
| Archivo sin faltantes | Solo que **existe algo con esos nombres**. `create or replace` se repite entre archivos, así que no dice *cuál versión* está viva. |
| `? sin promesas detectables` | El verificador **no supo qué buscarle** (suele ser un archivo de solo `insert` o `grant`). No está aprobado. |
| `! sobrecargas vivas` | Hay dos funciones con el mismo nombre y distinta firma. Ver abajo. |

La regla que gobierna el diseño: **lo que no entendió, lo dice.** Un verificador que
aprueba lo que no leyó enseña a confiar en un verde que no significa nada — la misma
razón por la que `traducirError` (ADR-0022) no se traga las huellas que no reconoce.

## Sobrecargas: la trampa de ADR-0009

`create or replace function` con un argumento **nuevo** no reemplaza nada: crea una
segunda función. Si la vieja no se borra, quedan las dos, y una llamada que solo nombra
los parámetros comunes no resuelve — Postgres responde `function is not unique` y la
pantalla falla.

Para comprobar si una está rota, en el SQL Editor (`explain` no ejecuta nada):

```sql
explain select retail.registrar_movimiento(
  p_variante_id => null::uuid, p_sede_id => null::uuid,
  p_tipo => null::text, p_cantidad => null::int
);
```

Si responde `is not unique`, esa llamada está rota hoy.

**La regla que sale de esto:** toda migración que le agregue un argumento a una función
existente lleva su `drop function` de la firma vieja, con los tipos explícitos. Ver
ADR-0026.

**El candado en CI (2026-09-25): `pnpm pruebas:una-sola-firma`**, paso del job
`pruebas-postgres`. Le pregunta a la base real —`pg_proc`, esquema `retail`, con todas las
migraciones y el seed aplicados— y falla nombrando cada función con más de una firma, con
sus firmas a la vista (`scripts/pruebas/una_sola_firma.mjs`). Es contra el motor y no contra
el texto de las migraciones a propósito: una migración que reescribe una función con
`DO` + `EXECUTE` (pasó cinco veces en cinco días) es invisible para un análisis de texto, que
obligaba a mantener a mano una lista de excepciones y daba rojos falsos. Solo mira `retail`:
`public` es de Dynamic y sus sobrecargas no las causa este repo. Lleva un caso de control que
crea una sobrecarga a propósito (con `ROLLBACK`) para que nadie afloje la consulta sin que se
note. Dos avisos: ese job es piloto (`continue-on-error`), así que hoy avisa pero no bloquea
el merge; y el informe `! sobrecargas vivas` de `pnpm migraciones:verificar` es solo eso, un
informe (mezcla `retail`, `public` y `storage` y no hace fallar nada). Para correrlo en tu
máquina: `npx supabase start` y `pnpm pruebas:una-sola-firma`.
