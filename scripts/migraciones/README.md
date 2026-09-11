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

## Qué significa cada resultado

| Resultado | Qué puedes afirmar |
|---|---|
| `✗ falta X` | **Certeza.** Ese objeto no está: el archivo no corrió, o corrió a medias. |
| Archivo sin faltantes | Solo que **existe algo con esos nombres**. `create or replace` se repite entre archivos, así que no dice *cuál versión* está viva. |
| `? sin promesas detectables` | El verificador **no supo qué buscarle** (suele ser un archivo de solo `insert` o `grant`). No está aprobado. |
| `! sobrecargas vivas` | Hay dos funciones con el mismo nombre y distinta firma. Ver abajo. |
| `✗ … su cuerpo no coincide` | **Certeza, y de la seria.** Esa función existe pero su código no lo produce ningún archivo del repo: alguien la escribió a mano contra la base. Ver abajo. |

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

## Cuerpos: el drift que no falla nunca

Desde el 2026-09-10 el verificador compara el **código** de cada función de `retail`, no
solo su nombre. Normaliza el cuerpo —le quita comentarios, prefijos de schema y
espaciado— y lo busca entre **todas** las definiciones que el repo tiene de ese nombre. Si
no coincide con ninguna, ese código no lo produce ningún archivo.

Nació de un caso real: `retail.recalcular_stock` en producción traía un arreglo con su
propio comentario que no existía en ningún archivo del repositorio. Alguien lo aplicó a
mano en el SQL Editor y no quedó escrito.

**Por qué este drift es peor que el otro.** El que todos vigilan es «producción está atrás
del repo»: falta algo, y tarde o temprano una pantalla se rompe y lo delata. Éste es al
revés — producción está ADELANTE — y por eso **no falla nunca**. Todo anda bien allá, así
que nada avisa. Lo que se pierde en silencio es que `npx supabase db reset` más
`unificacion/` deje de reproducir el sistema.

Se compara contra TODAS las definiciones, no contra «la última», a propósito: un gemelo de
`unificacion/` puede ser legítimamente distinto del archivo de `migrations/` —pasó con
`27_ajuste_con_signo.sql`, que en producción es más grande— y coincidir con cualquiera de
las dos es suficiente para decir que el repo lo explica.

Solo se comparan las funciones de `retail`. `public` en producción es el schema entero de
Dynamic y sus funciones no son nuestras.

