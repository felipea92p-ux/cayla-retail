# ADR-0025 — Código corto al lado del SKU, y varios códigos de barras por prenda

**Fecha:** 2026-09-09
**Estado:** aplicado y verificado en local (`supabase/migrations/0047_codigos.sql`);
pendiente de pegar en producción (`supabase/unificacion/29_codigos.sql`, después
de la `28`)

## Contexto

El SKU se genera en el cliente como slug de la referencia
(`NuevoProductoForm.tsx:31-37`, `RecibirLoteForm.tsx:55-61`). "Blusa manga larga
escote V" talla M color Azul marino →
`BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO`, 40 caracteres.

### El argumento que cierra la discusión no es estético: la etiqueta no entra

`EtiquetasGenerator.tsx:66-71` dibuja el Code 128 con `preserveAspectRatio="none"`
y `style={{ width: "100%" }}` — **el código se estira al ancho de la etiqueta sin
importar cuántos módulos tenga**. Code 128 usa 11 módulos por carácter, más start
(11), checksum (11) y stop (13):

| texto | módulos | mm/módulo sobre ~50 mm útiles | puntos a 300 dpi |
|---|---|---|---|
| `BLUSA-MANGA-…-AZUL-MARINO` (40 ch) | 475 | 0.105 | **1.2** |
| `BLU-0042-AZM-M` (14 ch) | 189 | 0.265 | **3.1** |

La regla de impresión térmica es ≥3 puntos por módulo. A 1.2 la impresora
redondea a 1 punto, con ~20% de error en el ancho de cada barra — y Code 128 se
decodifica por **proporción** de anchos. **Ésta es la razón real de que la pistola
"a veces no lea" y haya que acercarla mucho.** No es una preferencia: es un
requisito de la Brother QL que ya está comprada. (Verificar el dpi exacto del
modelo; a 203 dpi es peor.)

### Y dos problemas más

- **El código cambia si corriges un typo.** Al derivarse de la referencia,
  arreglar "escote V" → "escote en V" cambia el SKU de una prenda cuya etiqueta
  ya está pegada. Un identificador que se mueve no es un identificador.
- **No existe `unique (producto_id, talla, color)`.** Nada impide dos variantes
  idénticas del mismo modelo. Con cuatro Encargadas capturando en paralelo, el
  censo nace duplicado el primer día.

## Decisión

### 1. `codigo` al lado del SKU, no en su lugar

`productos.codigo` = `BLU-0042` (prefijo de categoría + correlativo de 4
dígitos). `variantes.codigo` = `BLU-0042-AZM-M`.

`sku` **no se toca**: hay etiquetas físicas impresas con él.

**El contra-argumento clásico y por qué no aplica.** La ortodoxia dice que un
identificador que codifica atributos miente cuando el atributo cambia. Es
correcto — **para claves**. `productos.id` y `variantes.id` (uuid) siguen siendo
las únicas claves: toda FK, todo join, toda policy. `codigo` no es clave: es un
**nombre**. Los nombres pueden cargar significado y volverse históricamente
inexactos (alguien apellidado Herrero no forja).

Tres invariantes que mantienen esto honesto y que hay que respetar:

1. `codigo` se asigna **una vez** y nunca se recalcula — ni al reclasificar, ni
   al renombrar la categoría, ni al corregir el color.
2. Ninguna consulta deriva significado del prefijo. "Todas las blusas" es
   `where categoria_id = …`, **nunca** `where codigo like 'BLU-%'`.
3. `codigo` es `unique` pero no es PK ni destino de ninguna FK.

Si mañana una prenda pasa de Blusas a Tops y sigue diciendo `BLU-0042`, no es un
bug: se compró y se etiquetó como blusa, y la etiqueta ya está pegada. **El
almacén manda sobre la taxonomía.**

### 2. Tabla contadora, no `create sequence`

- Las secuencias de Postgres son no-transaccionales: un insert que hace rollback
  quema el número y deja huecos. Felipe va a leer `BLU-0042` como "el modelo 42
  de blusas", y los huecos lo van a hacer desconfiar del sistema.
- Una secuencia por prefijo obligaría a ejecutar DDL dentro de una función cada
  vez que se crea una categoría — privilegios que no queremos regalar.
- `insert … on conflict do update … returning` toma el lock de fila: atómico y
  sin huecos en una sola sentencia. Descartado también `max(numero)+1`: es la
  misma idea sin el lock, o sea con carrera.

### 3. Cuando el color no está normalizado, no se inventa un código

`fn_asignar_codigo_variante` devuelve NULL y no asigna nada si la variante tiene
un color escrito a mano sin resolver. Derivar un token de 3 letras del texto
libre produciría colisiones entre colores distintos y ensuciaría el código con la
misma mugre que ADR-0024 vino a limpiar. Esas variantes se listan y se resuelven
poniéndoles color.

Y cuando la prenda **no tiene color** (una correa, un gorro), el segmento
simplemente no existe: `CIN-0001-U`, en vez de meter un relleno que no significa
nada.

### 4. `codigos_barras`: varios códigos, una prenda

**Ésta es la pieza que más cambia el censo.** Felipe confirmó que **casi todas
las prendas ya traen código de barras de fábrica**. Una tabla donde una variante
puede tener varios códigos convierte el censo de "imprimir y pegar 900 etiquetas
antes de poder escanear nada" a "escanear lo que ya está en la percha".

**Se descartó** adoptar el código del proveedor **como** `sku`: dejaría los SKU
heterogéneos (`BLUSA-…-AZUL` conviviendo con `7501234567890`) y perdería el
código corto, que es lo que se dicta por teléfono y lo que entra en la etiqueta.
Una tabla de seis columnas resuelve las dos cosas a la vez.

**Y de yapa resuelve la compatibilidad hacia atrás**: el backfill registra
también el `sku`, así que toda etiqueta ya impresa —que codifica `sku`,
`EtiquetasGenerator.tsx:224`— sigue encontrando su prenda el día que cambiemos de
nomenclatura. Sin eso, el primer día del censo la pistola dejaría de reconocer
todo lo ya etiquetado y el sistema perdería credibilidad de entrada.

## Consecuencias

- Verificado en local: `BLU-0001` para el primer modelo de blusas, `BLU-0002`
  para el segundo, `JEA-0001` para el primer jean; volver a llamar a la función
  **no renumera**; una correa sin color queda `CIN-0001-U`; una variante con
  color "turkeza" **no recibe código** hasta que se normalice; y
  `variantes_identidad_unica` rechaza el duplicado de (producto, talla, color).
- **Tres formas de encontrar la misma prenda**, todas resolviendo a
  `BLU-0001-AZM-M`: el código corto, el sku viejo, y `7501234567890` registrado
  como código de proveedor.
- **Un bug que encontró la prueba, no la revisión:** la primera versión hacía el
  backfill de `codigos_barras` como un `insert … select` al final. Cubría el
  pasado y nada mantenía el futuro — una variante creada después quedaba con
  código pero **sin ser escaneable**. Se movió el registro dentro de
  `fn_asignar_codigo_variante`, que es la única función que acuña códigos, así
  que el invariante "todo código encuentra su prenda" se sostiene solo. La
  lección repite la de ADR-0023: el backfill es la mitad fácil; la difícil es que
  el invariante siga valiendo mañana.
- El correlativo se va a leer como "cuántos modelos de blusa tengo", y **no es
  exacto**: cuenta también los descontinuados y los que nacieron blusa y hoy son
  otra cosa. Hay que decirlo en la pantalla, no dejar que se asuma.
- Queda deuda visible: los productos sin categoría reciben prefijo `GEN`. Es una
  lista de trabajo, no un estado final.
- **Pendiente antes de producción:** los tres pre-flight de `unificacion/29`
  (categorías desconocidas, variantes duplicadas, SKUs repetidos). Si el de
  duplicados devuelve filas, se resuelve una por una con Felipe — nunca borrando.
