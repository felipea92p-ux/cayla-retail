# ADR-0308 — La barra de filtros de Productos dice la verdad

**Fecha:** 2026-10-02 · **Estado:** aplicada. Tanda 1 (PR #723, sin migración) y tanda 2 (PR #724) fusionadas y publicadas el 2026-10-02;
**SQL en producción desde el 2026-10-02** (`20261002200000`, `20261002200100`, huellas verificadas) ·
**Decide:** Felipe (las 19 decisiones de negocio y de forma, en preguntas del 2026-10-02); Claude (lo técnico) ·
**Rama:** `claude/filtro-pantalla-mejora-dba838` · **Análisis:** `docs/pantallas/productos-filtros.md`

## 1. El problema, primero

Felipe mostró la barra con el panel abierto y una pregunta: «si ningún producto llega a 999, ¿por qué mostrarlo así?». El
análisis (`/pantalla`, con datos de producción del 2026-10-02) encontró que la barra le mentía a quien la usa en cuatro lugares:

1. **Precio inventado.** El control iba de S/ 0 a S/ 999 escrito a mano; la prenda más cara cuesta S/ 119. El 88 % del
   recorrido no filtraba nada, cada píxel valía unos S/ 10 y en el tope el filtro no tenía techo aunque dijera «999».
2. **Píldoras sin nombre.** La pieza compartida mostraba el valor elegido, y el de fábrica es «Todas»: se leía «TODAS · TODAS ·
   TODOS…», distinguibles solo por el ícono. Pasaba en seis pantallas.
3. **El 63 % de las opciones llevaba a una lista vacía** (179 de 284: 44 categorías activas, 14 con prendas).
4. **«Sin stock» medía la red y la tarjeta, la sede.** Lima tenía 0 prendas y «Sin stock» le devolvía 0 resultados.

Y, en el código, un estado que se separaba de la URL (el chip «Hasta S/100» seguía a la vista con la lista sin filtrar),
dos controles para el mismo orden (flechas ↑↓ y «Ordenar») dentro del panel de filtros, y el panel naciendo cerrado.

## 2. Decisiones de Felipe (2026-10-02)

| Tema | Decisión |
|---|---|
| Apertura | Abierto en la computadora; en el celular, plegado y en una hoja con «Ver N productos». Si alguien lo cierra, en ese equipo vuelve cerrado |
| Píldoras | «Categoría ▾» sin elegir, «Categoría: Blusas ✕» elegida, **en las seis pantallas** que usan la pieza compartida |
| Orden | Un solo «Ordenar por», fuera del panel, junto a «N productos». Abre con **«Más recientes»** (Felipe eligió esto en vez de la recomendación, Nombre A–Z) |
| Precio | Cajas «Desde / Hasta», control con límites reales y tramos con conteo. Los límites, de lo que se está viendo sin el propio precio |
| Opciones vacías | Esconderlas y mostrar el conteo («Blusas (12)») |
| Stock | Las dos medidas, rotuladas: Hay en [sede] · Sin stock en [sede] · Sin stock en ninguna sede · Pedir a proveedor |
| Filtros nuevos | Talla, Temporada, Color agrupado por familia (no un filtro aparte) y «Por completar» (sin foto, temporada, marca o proveedor) |
| Varias opciones | Sí en Talla y Color; una sola en el resto |
| Estado | «Activos» por defecto; los descontinuados con un clic |
| Buscador | Sin tildes, por categoría y color, «%» literal, atajo «/» |
| Disposición | Dos filas con nombre: «Prenda» y «Gestión» |
| Atajos fijos (pestañas) | No por ahora: repetirían los filtros y hoy «Stock bajo» y «Pedir a proveedor» darían siempre 0 |
| Compartir | «Copiar enlace» |
| Entrega | Dos tandas: primero la pantalla (sin migración), después la base |

## 3. Decisiones técnicas

```
DECIDÍ:    la URL es la única fuente de verdad de la barra; las cajas (buscador y precio) guardan solo lo que se está escribiendo,
           caja por caja (la que tiene el cursor no se suelta hasta salir), y todo cambio se aplica sobre la URL vigente: la
           pedida que aún no llega, o la del navegador en el momento de usarla. Cualquier URL que llega cierra lo pedido
           (Next descarta la navegación pendiente cuando empieza otra); un enlace de afuera de la barra hace esperar al
           temporizador del buscador, que se rearma al llegar la URL y manda lo que la caja todavía dice.
           Lógica pura en lib/productos-filtros.ts.
DESCARTÉ:  (a) copiar la URL a un estado local al montar (lo que había): se separaba al navegar desde fuera (A quién pedirle,
           Atrás) y volvía a mandar un precio que ya no estaba; (b) leer `params` del momento en que se programó el temporizador:
           un clic dentro de los 350 ms se perdía (medido: el orden elegido desaparecía); (c) soltar la caja apenas la URL dice
           lo mismo recortado: el espacio antes de la palabra siguiente se borraba bajo el cursor («blusaroja»; lo encontró
           la revisión adversaria).
SE ROMPE SI: la navegación ajena no es un enlace (<a>) ni nace en la barra —un router.push de otro componente— dentro de los
           350 ms de una tecla: el temporizador la puede descartar. Hoy el único caso es «A quién pedirle», que conserva los
           filtros y la búsqueda.
```

```
DECIDÍ:    la píldora compartida lee su nombre y, si tiene, su valor; `valorPorDefecto` dice qué vale sola (casi siempre «todos»;
           en Historial, la tienda de la cabecera), y solo distinta de eso se marca y lleva ✕.
DESCARTÉ:  un rótulo encima de cada píldora (dos líneas de alto) y «Categoría: Todas» siempre (ruido); arreglarlo solo en
           Productos (dos formas de leer la misma pieza en el ERP).
SE ROMPE SI: una pantalla pasa un `valorPorDefecto` que no está entre sus opciones: la píldora se marca sin ✕ (no hay a qué volver).
```

```
DECIDÍ:    los límites del precio salen de los precios reales de lo que se está viendo, sin el propio filtro de precio,
           redondeados hacia afuera a 10; el control avanza de a S/ 5 en rangos cortos y en sus puntas manda «sin tope».
           Tanda 1: dos páginas de UN producto de fn_productos (precio_asc / precio_desc), en paralelo con la lista.
DESCARTÉ:  límites de todo el catálogo (lo que hacen Zara y H&M): dentro de una categoría barata, medio control vacío; un tope
           fijo «o más»: sigue siendo inventado; calcularlo en la web leyendo variantes: incluiría el producto de «Monto manual»
           y las variantes desactivadas.
SE ROMPE SI: una prenda tiene tallas a precios distintos y otra con precio mínimo menor tiene el máximo más alto: el tope
           provisional se queda corto (el control igual manda «sin tope» en su punta). La tanda 2 lo vuelve exacto.
```

```
DECIDÍ:    el panel se abre en la computadora según una cookie (`cayla_filtros_panel`, leída en el servidor); en el celular vive
           en una hoja <Modal> que aplica cada cambio al momento. Con el panel abierto, los chips no se repiten.
DESCARTÉ:  localStorage (el panel aparecería y desaparecería al hidratar); abrirlo también en el celular (a 375 px empuja los
           productos bajo el pliegue y Baymard muestra que los controles fuera de la vista no se descubren).
SE ROMPE SI: alguien usa la tablet en vertical a menos de 768 px: ve la hoja, no el panel (es lo mismo que el celular).
```

Una revisión adversaria (4 lentes y un escéptico por hallazgo) confirmó 6 defectos de la propia tanda y ninguno se refutó;
están corregidos y reproducidos en el navegador (commit `fix(catalogo): lo que encontró la revisión adversaria…`).

Medido sin desborde horizontal a 375, 768, 1024, 1280, 1440 y 1920 px. A 768 el menú lateral deja ~420 px: el bloque de
precio se parte en dos líneas y el nombre de la fila va arriba.

## 4. Tanda 2: la base (rama `claude/filtro-productos-tanda2`)

Funciones **nuevas** al lado de `fn_productos`/`fn_productos_resumen`, no reemplazos: así la web publicada sigue funcionando en el
rato entre que Felipe pega el SQL y se fusiona el PR (el error del #444). Las viejas se borran en una limpieza posterior, cuando
nada las llame (`fn_productos_resumen` ya no la llama esta pantalla).

```
DECIDÍ:    una sola definición de qué cumple cada filtro, `fn_productos_filtro`: una fila por variante visible con una marca por
           filtro. Una prenda pasa si UNA MISMA variante cumple color, talla, precio, temporada y «hay en la sede». La leen el
           listado (`fn_productos_listado`) y los conteos (`fn_productos_facetas`), así un número nunca contradice a la lista.
DESCARTÉ:  (a) evaluar cada filtro de variante por separado, como `fn_productos` (∃ negra ∧ ∃ hasta S/ 80): trae una blusa cuya
           negra cuesta S/ 120 — con conjuntos, la intersección tiene que ser sobre la misma variante, no sobre la prenda;
           (b) calcular los conteos con una consulta por filtro: 10 pasadas sobre las mismas filas por lo que una da en ~4 ms;
           (c) contar cada opción con su propio filtro puesto: al elegir «Blusas» las otras categorías dirían 0 y no se podría
           cambiar sin limpiar (por eso el conteo es disyuntivo: todos los filtros menos el suyo).
SE ROMPE SI: el catálogo pasa de ~3 000 prendas con stock en varias sedes y se pide «sin stock en ninguna» / «reponer»: el stock
           de la red (~340 ms a 3 000 productos) se calcula para la lista y para los conteos. Ahí, los conteos de disponibilidad
           se piden aparte, después de la lista.
```

```
DECIDÍ:    tramos de precio cortados en los cuartiles del precio más bajo de cada prenda, redondeados a 10; con menos de 4
           prendas, sin tramos. Cada tramo cuenta exactamente lo que trae como filtro (el primero «hasta», el último «desde»).
DESCARTÉ:  tramos de igual ancho (como Ripley/Uniqlo): con 21 precios distintos y 17 prendas a S/ 39,90, un tramo queda lleno y
           otro vacío; los cuartiles reparten las prendas parejo (es la idea del `variable_width_histogram` de Elastic, sin el
           motor). Y la escalera fija de Falabella (50/100/250…): pensada para miles de precios, aquí deja casi todo en un tramo.
SE ROMPE SI: casi todas las prendas tienen el mismo precio: los cuartiles coinciden, se deduplican y quedan 1 o 2 tramos (no se
           inventan cortes donde no hay precios).
```

- **Buscador** (`fn_productos_buscar_palabras`): cada palabra en cualquier campo (nombre, código, marca, proveedor, categoría, sku,
  código y color de cada variante), sin tildes con `fn_clave_texto` (la del repo, sin extensiones), con `strpos` (los símbolos son
  literales) y quitando el -a/-o/-as/-os final de las palabras de 4 letras o más («negra» encuentra «Negro»).
- **Disponibilidad**: Hay en [sede] · Sin stock en [sede] (las de la sede, por variante) · Sin stock en ninguna sede · Stock bajo ·
  Pedir a proveedor (las de la red, como siempre). Sin sede elegida (CAYLA Global) solo las de la red.
- **Pruebas**: `pruebas:productos-listado` (34 casos, con controles contra `fn_productos` que prueban cada defecto corregido) y
  `pruebas:productos-facetas` (17 casos: cada conteo es el total del listado al elegir esa opción, en nueve escenas). En el CI.
- **Revisión adversaria** (4 lentes y escépticos): 3 defectos confirmados, ninguno refutado. El grave: Postgres copiaba el CTE del
  buscador en cada fila y la búsqueda corría **dos veces por variante** (~5 s con 86 prendas; más de 8 s, el límite de PostgREST,
  con ~130: la pantalla se caía al buscar). Con el CTE `materialized`, 31 ms; la prueba exige UNA llamada al buscador por listado
  y por conteo, sin depender del volumen (con 11 prendas de prueba no se veía). Los otros dos: la «variante visible» pasa a ser la
  de la pantalla (las activas; todas si no queda ninguna) y Talla/Color de varias suman los clics seguidos. Los 6 casos nuevos
  fallan con el SQL anterior (mutación comprobada).

```
SE ROMPE SI: el catálogo llega a ~3 000 prendas y se busca seguido: el buscador por palabras normaliza el texto de TODAS las
           prendas en cada búsqueda (medido en la revisión: ~390 ms el listado y ~610 ms los conteos con 3 000 prendas). Ahí se
           guarda el texto normalizado en una columna con índice trigram (`pg_trgm` ya está en producción), no antes.
```

**Pegado en producción** (Felipe, ANTES de fusionar el PR de la tanda 2): `20261002200000` y después `20261002200100`, cada uno en
una sola pegada (solo crean funciones: sin `alter` de tablas en uso ni políticas). Una sonda de solo lectura del 2026-10-02 confirmó
que todo lo que usan existe en producción y que los nombres nuevos aún no.

## 5. Referentes

Verificados por agentes de la sesión el 2026-10-02 (fuentes en el análisis, §9): Zara, H&M, Amazon, Uniqlo, Falabella y Ripley
en navegador; Baymard, NN/g, Shopify Polaris y Search & Discovery, Odoo 17, Lightspeed, Square, NetSuite, Zoho, Linear, Notion,
Stripe en su documentación. MercadoLibre no se pudo leer (pide sesión a un navegador automatizado): no se usó para decidir.

## 6. Archivos

`components/FiltrosProductos.tsx` · `components/ui/FiltrosPildora.tsx` (`DesplegablePildora` con `valorPorDefecto` y ✕,
`PanelPildoras filas`, `FilaPildoras`) · `lib/productos-filtros.ts` · `lib/productos-filtro-precio.ts` · `lib/pildora-reglas.ts` ·
`lib/panel-filtros.ts` · `lib/productos-orden.ts` · `lib/catalogo-v2.ts` (`getPreciosExtremos`, estado por defecto) ·
`lib/productos-stock.ts` (aviso de descontinuadas) · `app/(app)/productos/page.tsx` · `components/FiltrosHistorialVentas.tsx`
(la «Tienda» con `valorPorDefecto`) · `components/AQuienPedirle.tsx` (la píldora dice «Proveedor»).
