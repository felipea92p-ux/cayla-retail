# ADR-0106 — Crear un producto es un árbol de decisión (familia → categoría → atributos), y sus reglas viven en la base

**Fecha:** 2026-09-18
**Estado:** Paso 1 (mapa de datos) y paso 2 (esquema) escritos y probados contra un
Postgres 17 desechable con el esquema mínimo. **NO probados con `db reset`** (Docker
caído ese día) y **NO aplicados en producción**: Felipe pega los 3 SQL. Pasos 3
(formulario nuevo) y 4 (pantalla de éxito) siguen pendientes — ver BACKLOG.
**Afecta:** `productos` (trigger + índice único nuevos), `categoria_tallas.habitual`,
`familias.exige_tejido_patron`, `crear_producto_con_variantes`,
`actualizar_categoria_ejes`, `censo_crear_variante`, función nueva
`buscar_productos_parecidos`, `lib/error-escritura.ts`, tipos de `packages/database`.
Migraciones `20260918200000`, `20260918200100`, `20260918200200`.

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
funcionando entre que se pega el SQL y que se despliega el formulario nuevo.

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
**No verificado:** `db reset` completo, RLS reales, la pantalla en navegador.
