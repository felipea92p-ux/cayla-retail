# ADR-0024 — El color deja de ser texto libre

**Fecha:** 2026-09-09
**Estado:** aplicado y verificado en local (`supabase/migrations/0046_colores.sql`);
pendiente de pegar en producción (`supabase/unificacion/28_colores.sql`)

## Contexto

`variantes.color` es `text` nullable y sin ninguna restricción. Hasta hoy no
importó, porque el catálogo real está prácticamente vacío y quien creaba prendas
era una sola persona.

El censo cambia eso: cuatro Encargadas van a capturar 900 prendas en paralelo
durante dos semanas. De ahí salen, sin falta, "Azul marino", "azul marino",
"AZUL MARINO", "Azul Marino" y "marino" — cinco colores para la base, uno para
la clienta.

**Lo que cuesta arreglarlo después es lo que decide esto.** Unificar dos colores
no es un `update` de texto: es una **fusión de variantes**. Son dos filas de
`variantes` distintas, cada una con su `stock` por sede y con `movimientos`
colgando. Fusionarlas significa mover stock, y mover stock significa escribir
movimientos — o sea, **reescribir historia para arreglar una falta de
ortografía**. Y mientras tanto no se puede responder la pregunta que un fundador
de moda hace todas las semanas: cuántas unidades azul marino hay entre las tres
boutiques.

Ahora cuesta una tarde. Es la pieza con mayor costo de postergación del proyecto.

## Decisión

**Una tabla `colores` de 29 filas, con código de 3 letras** (`AZM` Azul marino),
revisada y aprobada por Felipe.

**FK dura en columna nueva, texto desnormalizado en la vieja:**

- `variantes.color_id` → FK contra `colores`. O es NULL (legado) o es un color
  real. Sin excepciones.
- `variantes.color` (texto) se conserva y se llena con `colores.nombre` en cada
  escritura nueva. Sirve para mostrar y para no romper `lib/catalogo.ts`, el
  export CSV ni `EtiquetasGenerator.tsx:90`, que hoy leen `color`.

**Se descartó** poner la FK sobre `variantes.color` directamente: obligaría a
limpiar todos los datos existentes *antes* de poder crear la restricción — que es
exactamente el trabajo que el censo va a generar. Con una columna nueva, lo que
no calza queda visible y contable en vez de bloquear la migración.

**El candado real** no es la FK, es esto:

```sql
create unique index colores_clave_unica on colores (fn_clave_texto(nombre));
```

Hace **imposible** que coexistan "Azul marino" y "azul marino". Lo rechaza la
base, no un `if` en el cliente que alguien va a olvidar en la próxima pantalla
(principio 2).

`fn_clave_texto` usa `translate()` y no `unaccent()`: unaccent vive en el schema
`extensions`, y las funciones de retail declaran `set search_path = retail,
public`; usarla obligaría a tocar el search_path de cada RPC. `translate` es
builtin, `IMMUTABLE` (requisito para indexar sobre ella) y cubre exactamente los
acentos del castellano.

**El backfill no adivina.** Solo resuelve lo que calza exactamente por clave
normalizada. Lo que no, queda `color_id is null` — visible, contable
(`select color, count(*) … where color_id is null group by color`) y resoluble
por la Líder. Nada se pierde y nada se inventa.

## Lo que NO se hizo: tabla de tallas

Deliberado. Las tallas ya están acotadas por `categorias.tallas_sugeridas`
(0009), son de baja entropía (XS…XXL, 26…34, Único, Estándar) y son cortas, así
que las variantes de escritura son pocas y obvias.

La asimetría que justifica tratarlas distinto: **agregar tallas tarde es barato**
(talla no es FK de nada, un `update` de texto alcanza); **agregar colores tarde
es caro** (fusionar variantes con stock e historial). Si dentro de un año hay 60
grafías de talla, se agrega la tabla entonces.

## Consecuencias

- Se puede preguntar "cuánto azul marino tengo" y que la respuesta sea cierta.
- El código de variante (`BLU-0042-AZM-M`, ADR-0025) depende de esto: el token de
  color sale de `colores.codigo`. Sin vocabulario cerrado no hay código estable.
- Verificado en local: los 29 entran, y `insert into colores (…) values ('AZZ',
  'azul marino', 'azul')` con "Azul marino" ya existente es **rechazado por la
  base**.
- Los tres colores no-lisos (`EST` Estampado, `MUL` Multicolor, `ANI` Animal
  print) son los que más importan de la lista: si no existieran, el primer día
  alguien escribiría el estampado como texto libre y el vocabulario se rompería
  antes de empezar.
- **Queda un agujero declarado:** la policy `variantes_insert_lider` permite que
  una Líder inserte una fila con `color` sucio por PostgREST directo. No se cierra
  con un CHECK sobre `variantes.color` porque exigiría limpiar todos los datos
  antes del censo. Para 3 boutiques con una sola Líder técnica, es un riesgo
  aceptable y dicho en voz alta.
