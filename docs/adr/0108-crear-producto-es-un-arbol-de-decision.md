# ADR-0108 — Crear un producto es un árbol de decisión (familia → categoría → atributos), y sus reglas viven en la base

**Fecha:** 2026-09-18
**Estado:** Pasos 1-4 construidos (mapa de datos, esquema, formulario nuevo, pantalla de éxito). Las
migraciones se probaron contra un Postgres 17 desechable con el esquema mínimo y el
formulario en el navegador con datos y red simulados. **NO probados** con `db reset`
(Docker caído ese día) ni contra la base real, y **NO aplicados en producción**: Felipe
pega los 4 SQL. **El formulario no se puede desplegar antes que el SQL** (ver
"Orden de despliegue").
**Afecta:** `productos` (trigger + índice único nuevos), `categoria_tallas.habitual`,
`familias.exige_tejido_patron`, `crear_producto_con_variantes`,
`actualizar_categoria_ejes`, `censo_crear_variante`, función nueva
`buscar_productos_parecidos`, `lib/error-escritura.ts`, tipos de `packages/database`.
Migraciones `20260918200000`, `200100`, `200200` y `200300`; `NuevoProductoForm.tsx`,
`components/alta-producto/*`, `lib/alta-producto*.ts`, `/productos/nuevo`.

## El problema

"Nuevo producto" mostraba **"Sin tejidos habilitados para esta categoría"** en toda
categoría. Diagnóstico en producción (solo lectura): el vocabulario existe (25 tallas,
17 tejidos, 7 patrones, todos aprobados) pero **ninguna de las 40 categorías tiene
tejidos ni patrones asignados**, y 15 no tienen tallas. El formulario estaba bien;
estaba desconectado del catálogo. Además la familia no participaba (lista plana de
categorías), y la base **no impedía duplicados**: `productos.referencia` no tenía
ningún candado, solo `codigo`.

## Lo que se decidió (Felipe, 20 preguntas, 2026-09-18)

| Tema | Decisión |
|---|---|
| Forma | Una sola página que se va revelando (cada bloque se desbloquea al resolver el anterior), no asistente por pasos: mismo candado con menos toques |
| Elegir rama | Tarjetas de familia → categoría, con caja de búsqueda como atajo |
| Al elegir categoría | Viene marcada la **curva habitual** (`categoria_tallas.habitual`) |
| Categoría sin tallas | Panel para configurarla ahí mismo; se guarda aparte, nunca dentro de la transacción del alta |
| Tejido/patrón | Obligatorios en Indumentaria (`familias.exige_tejido_patron`), opcionales en el resto |
| Falta un valor | "+ Nueva talla/color/tejido/patrón" dentro del bloque (propone y, como Líder, aprueba) |
| Etiquetas | Bloque opcional al final |
| Colores | Agrupados por familia de color + los más usados de la categoría al frente |
| Nombre | Tipo título automático ("blusa camila" → "Blusa Camila"); bloquea idéntico o 1 letra de diferencia, con salida deliberada del Líder; parecido mayor solo avisa |
| Precio/costo | Precio obligatorio; costo sugerido desde el último producto de la categoría, con margen % |
| Fotos | Fuera del alta: pantalla de éxito que invita a subirlas por color |
| Después de crear | Pantalla de éxito: Agregar fotos · Crear otro parecido · Ir a productos |
| Código | Vista previa antes de guardar |
| Quién / dónde | Solo Líder, desde el terminal de cada caja (PC/Mac mini; táctil también) |
| Curvas | Ropa S-M-L; Pantalón/Jeans 28-30-32 (26 y 34 disponibles, sin 36); Calzado 35-40 |
| Estándar / Único | Se quedan las dos: "Estándar" para ropa, "Único" para todo lo demás. Se reparten por familia y nunca conviven en una categoría |

## Por qué las reglas del nombre viven en la base

Hay **tres** caminos que insertan en `productos`: `crear_producto_con_variantes`,
`catalogo_crear_producto` y `censo_crear_variante`. Una regla que viva solo en el
formulario deja los otros dos abiertos. El censo era el peor: crea **un producto por
escaneo**, sin buscar si ya existe (escanear "Blusa Aurora" en S y luego en M dejaba
dos productos, con el stock partido).

- **Trigger** `productos_referencia_biu`: normaliza a tipo título. Solo actúa cuando
  `referencia` cambia — los 44 nombres existentes no se tocan.
- **Índice único parcial** sobre `fn_clave_referencia(referencia)` donde
  `estado_alta <> 'rechazado'`: idéntico imposible (ignora tildes, mayúsculas,
  espacios y puntuación). Un producto rechazado en el censo no bloquea recrearlo bien.
- **`buscar_productos_parecidos`**: alimenta el aviso en vivo. Niveles `identico`,
  `una_letra`, `parecido` (trigram ≥ 0.5).
- **`censo_crear_variante`**: si el nombre ya existe en la MISMA categoría, cuelga la
  variante de ese producto; en OTRA categoría, error (un nombre, un producto).

## Alternativas descartadas

- **Cambiar `fn_clave_texto`** para que ignore puntuación: la usan colores, tallas y
  familias como candado único; alterarla cambiaría en silencio qué es "el mismo
  nombre" en tres tablas. Se creó `fn_clave_referencia`.
- **Extensión `fuzzystrmatch`** para medir "una letra": un comparador lineal de 20
  líneas hace lo mismo sin dependencia nueva en el proyecto compartido con Dynamic.
- **Tipo oración estricto** ("Blusa camila"): pierde la mayúscula del nombre propio y
  obliga a reescribir los 44 productos.
- **Validar solo en el formulario**: el censo (300-900 prendas) se lo salta.
- **`categoria_curva` como tabla aparte**: la curva es siempre un subconjunto de las
  tallas de la categoría; una columna booleana lo garantiza sin FK extra.

## Lo que no estaba en el pedido y pesó más

`actualizar_categoria_ejes` **borra y reinserta** todas las tallas de la categoría en
cada guardado. Sin tocarla, cada edición de categoría por un Líder habría borrado la
curva habitual en silencio. Ahora, si quien llama no manda una curva, conserva la
existente; si la manda, debe estar dentro de las tallas enviadas.

## Compatibilidad hacia atrás (por qué el SQL puede ir antes que el código)

Las dos RPC cambian de firma **solo agregando un parámetro opcional al final**
(`p_confirmo_distinto`, `p_talla_habitual_ids`) y se borra la firma vieja para no dejar
dos sobrecargas (ya rompieron producción dos veces en este repo). PostgREST resuelve
las llamadas de 7 y 4 argumentos contra la firma nueva. La pantalla actual sigue
funcionando entre que se pega el SQL y que se despliega el formulario nuevo — con un
cambio de comportamiento a propósito: en Indumentaria la base ya rechaza una prenda sin
tejido o sin patrón (con frase clara), y un nombre repetido también; antes se guardaban.

## Orden de despliegue (esto sí puede romper las tiendas)

`pnpm datos:comparar` lo confirmó el 2026-09-18: contra producción, el formulario nuevo
llama a `buscar_productos_parecidos` (no existe) y manda `p_confirmo_distinto` y
`p_etiqueta_ids` a `crear_producto_con_variantes` (no los acepta). Si el código se
despliega primero, "Nuevo producto" falla siempre. Por eso: **1) pegar los 4 SQL en orden
(`200000` → `200100` → `200200` → `200300`), 2) recién ahí mergear/desplegar.** Al revés
no pasa nada: la pantalla vieja sigue funcionando contra el SQL nuevo (parámetros
opcionales al final). Al cerrar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`
deben terminar sin esas dos alarmas.

## Decisiones del formulario que no estaban en la tabla de arriba

- **Rojo casi nunca.** El brandbook (`globals.css`) reserva el rojo como acento, máx. 2
  por pantalla. Lo elegido se marca con tinta y ✓; ámbar = avisa y deja seguir; rojo =
  bloquea.
- **Mientras se comprueba el nombre, el paso 3 sigue cerrado.** Descubierto probándolo:
  la primera versión abría el paso 3 al escribir y lo cerraba de golpe si el nombre
  resultaba duplicado, con la persona ya eligiendo tallas. Tope de 6 s: una red colgada no
  deja el formulario esperando para siempre; si la comprobación falla, se dice y la base
  vuelve a verificar al guardar.
- **Colores NO se proponen dentro del formulario** (sí tallas, tejidos y patrones): un
  color necesita código, tono, familia de color y tipo. Se enlaza a Atributos en otra
  pestaña, con «actualizar los colores» sin perder lo llenado.
- **«Más usados» y «último costo» son sugerencias** sobre las últimas 2.000 variantes
  creadas, no un dato contable. El margen se calcula sobre el precio sin descontar IGV: es
  una alerta, no contabilidad.
- **El código previsto puede cambiar** si otra persona crea un producto de la misma
  categoría a la vez (el correlativo lo asigna la base al guardar).

## Pantalla de éxito (paso 4)

Al guardar no se vuelve a la lista: aparece una pantalla con tres salidas. **Las fotos son
la principal** (sin foto, la grilla de Productos muestra solo el tono del color) y enlazan
a `/productos/{id}/editar#fotos`; no se suben desde ahí porque el archivo sube al elegirlo
y quedaría huérfano si se cerrara la pantalla. **«Crear otro parecido»** conserva
categoría, tallas, tejido, patrón, precio, costo y etiquetas (una colección son ~10
prendas casi iguales) y limpia nombre, descripción y colores; el token de idempotencia se
renueva, porque un producto nuevo es una operación nueva y no un reintento (con el mismo
token la base devolvería el producto anterior). Probado: el segundo guardado sale con
token distinto y con los datos copiados.

## Se rompe si

- Dos prendas legítimas difieren en una sola letra (Top Lily / Top Lili): el aviso
  bloquea; por eso existe `p_confirmo_distinto`.
- Alguien renombra una categoría, talla o tejido antes de correr el mapa
  (`20260918200200`): el bloque de verificación aborta TODO en vez de cargar la mitad y
  dice qué nombre no encontró.
- Se agrega un cuarto camino de creación: imposible saltarse el trigger, pero **no**
  el aviso de "una letra" (vive en la RPC). Si el camino nuevo no llama
  `buscar_productos_parecidos`, solo tendrá el bloqueo de idéntico.
- Una familia que exige tejido/patrón tiene una categoría activa sin opciones: el
  producto sería imposible de crear. La migración del mapa lo comprueba al final y
  falla si ocurre; `crear_producto_con_variantes` lo dice con `hint =
  'categoria_sin_tejidos'` / `'categoria_sin_patrones'`.

## Cómo se verificó y qué NO

Postgres 17 desechable en puerto propio (sin tocar Docker ni los puertos compartidos),
con tablas mínimas y los nombres reales de las 44 categorías/25 tallas/17 tejidos/7
patrones: funciones puras (título, clave, una edición), trigger, índice, aviso,
idempotencia del token, exigencias por familia, censo (mismo nombre → misma variante
colgada; otra categoría → error; variante repetida → error de índice), preservación y
reemplazo de la curva, y el mapa (idempotente, dentro y fuera de una transacción, y
aborta si un nombre no coincide). Con control negativo de los `assert`.
Formulario: en el navegador con `zz-harness` (andamio temporal, ya borrado) y `fetch`
interceptado — árbol y búsqueda con tildes, aviso idéntico/una letra/parecido con su
confirmación, paso 3 cerrado mientras se comprueba, curva marcada, configurar categoría
sin tallas y sin tejidos, «+ Nueva talla», colores más usados, matriz 3×2, margen,
payload exacto a la RPC, celular sin desborde horizontal.
**No verificado:** `db reset` completo, RLS reales, la RPC de alta contra la base real
(solo contra el esquema mínimo), aviso de parecidos con `pg_trgm` de producción,
sesión de Líder real, y accesibilidad con lector de pantalla (solo `aria-pressed`,
`role=alert` y `inert`, sin probar con uno).
