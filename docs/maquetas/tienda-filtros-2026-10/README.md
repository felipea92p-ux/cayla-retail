# Filtros de color y talla de la tienda: dos maneras (2026-10-26)

**Qué es:** dos maneras de agregar filtros por COLOR y por TALLA a la lista de la tienda online (`apps/tienda`), hechas como maqueta
tocable para que Felipe elija mirando. Las dos usan **la misma lista de hoy, los mismos datos reales de Trujillo y la misma lógica**;
lo único que cambia es cómo se ve y se toca. **Una maqueta no cambia la tienda:** nada de esto existe todavía en `apps/tienda` ni en la base.

Nació de comparar la tienda con Onitsuka Tiger (25-oct): su lista filtra por categoría, modelo, color, talla…; la nuestra, solo por
grupo, categoría y orden (`app/(catalogo)/catalogo/page.tsx`). Con los datos de Trujillo, el color es lo que más pesa (ver abajo).

## Cómo se abre
Hace falta un servidor local (abierta como archivo suelto, la vista previa no deja tocarla). Desde la raíz del repo:

```bash
python3 -m http.server 3033 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://127.0.0.1:3033/tienda-filtros-2026-10/`. `index.html` compara las dos; `opcion-1.html` y `opcion-2.html` son las pantallas.
La barra negra de arriba cambia de opción y entre escritorio y celular (`?vista=celular`); no es parte del diseño. Las fotos se leen de
`tienda.cayla.pe` (no se copian a este repo, que es público): sin internet las tarjetas muestran la percha.

## Qué es real y qué es de propuesta
- **Real** (rastreado el 2026-10-25 de `tienda.cayla.pe/catalogo?sede=trujillo`, solo lectura): las 235 prendas del listado, su categoría, su foto, sus
  colores y **cuántas unidades hay de cada color y talla en Trujillo**. Tres de las 235 no tienen ni una unidad y no se muestran (quedan 232).
- **De propuesta:** las 13 familias de color para quien compra (`famDe` en `datos-filtros.js`), juntar «Estándar» y «Única» en una opción,
  y el nombre de cada grupo de tallas. Precios de lista (el −10 % de Aniversario termina el 25-oct y no se muestra).
- `datos-filtros.js` lo **genera un script** a partir del rastreo; no se edita a mano (el rastreo no se guarda en el repo).

## Lo que no cambia en ninguna
La lista de hoy (cabecera, categorías en dos niveles, orden, tarjeta con foto, colores y «Hay / Quedan 2 / Última en Trujillo»); lo que
quedó en `logica.js` (abajo); y la identidad «A · Muro» (solo los tokens de `base.css`, que son los de `apps/tienda/app/globals.css`).

## Las cifras que mandan (Trujillo, 232 prendas con unidades)
| | |
|---|---|
| Colores distintos | **80** (agrupados en 13 familias: Negro 76, Blanco y crudo 87, Gris 32, Beige y arena 92, Marrón y café 109, Rosado 38, Rojo y vino 69, Naranja y terracota 15, Amarillo y dorado 11, Verde 18, Celeste 65, Azul 51, Morado y lila 9) |
| Prendas en 2 o más colores | **71 %** |
| Prendas con una sola talla | **70 %** (116 «Estándar» y 14 «Única» entre las 232) |
| Tallas | letras (XS a XXL) y cinturas (26 a 34, de pantalones, jeans, faldas y shorts); bolsos, bisutería y otros accesorios no tienen tallas de verdad |
| Prendas de más si color y talla se filtraran por separado | **177** (suma de los 156 pares color × talla) |

## La lógica (`logica.js`): ocho reglas
1. **La unidad es la variante.** «Negro y M» exige UNA variante negra en M con unidades. Si se filtraran por separado, saldría una prenda con
   negro en S y beige en M, y al abrirla el negro no estaría en M.
2. Dentro de una faceta se **suma** (Negro o Blanco); entre facetas se **cruza** (y, en la misma variante).
3. Cada opción dice cuántas prendas **daría**, contando lo demás elegido pero no su propia faceta. (Con Negro puesto, «Blanco 87» cuenta las
   prendas que vienen en blanco; no es lo que suma a la lista.)
4. Una opción que daría 0 **no se puede elegir** (la pantalla la apaga y no responde). La elegida siempre se puede quitar.
5. Una opción elegida puede quedar **«muerta»** (elegiste Morado y luego XL, y no hay morado en XL): se ve elegida pero marcada, dice por qué
   y se quita con un toque; nunca desaparece sola. Si al quitar la última opción viva quedaran solo muertas, se sueltan también.
6. **La talla solo se pide donde hay tallas de verdad** (dos o más entre letras y cinturas). En bolsos, bisutería u otros accesorios no se dibuja
   y no puede quedar ninguna elegida (un filtro invisible cambiaría los números sin que nadie sepa por qué).
7. Al **cambiar de grupo o de categoría**, lo elegido que ahí no existe se suelta y se avisa con «Deshacer».
8. El estado va en la dirección (`#c=negro&t=M&g=blusas&o=menor&p=2`): se puede compartir y se vuelve a leer sin creerle (una dirección
   rara no rompe nada).

`verificar/logica.prueba.mjs` la prueba contra un cálculo independiente hecho directo sobre los datos: **51.439 comprobaciones** (cada
par color × talla, los números de cada opción, una caminata de 6.000 toques al azar, el cambio de grupo desde cualquier estado, las
direcciones raras). Correr: `node docs/maquetas/tienda-filtros-2026-10/verificar/logica.prueba.mjs`. La prueba encontró tres
fallos míos mientras se escribía la lógica (una opción elegida que quedaba sin prendas con lo que se sumó después, quitar la última talla
viva que dejaba la lista en 0, y una dirección con un `%` mal escrito que hacía caer la página). **La talla única invisible en Bolsos no la
vio la prueba**: la encontraron, por separado, tres verificadores de las opciones; recién entonces la regla 6 pasó a la lógica y a la prueba.

## Las dos opciones
| | Opción 1 · Filtros que se abren | Opción 2 · La paleta a la vista |
|---|---|---|
| Idea | Dos palabras en la barra (COLOR, TALLA) abren un panel; en el celular, un botón «Filtros» abre una hoja desde abajo con «Ver N prendas» | Los 13 colores siempre a la vista como muestras y las tallas en una fila de cajitas; nada se abre |
| «Negro y M» desde cero | 4 clics en escritorio; 3 toques y un desplazamiento en celular | 2 toques |
| Primera prenda en un celular de 844 px (sin filtros / con «Negro y M») | **388 px / 550 px** | **749 px / 777 px** |
| Barra pegada a 1440 px (sin grupo) | 100 px | 103 px |
| Líneas de HTML, CSS y JS | ~860 | ~590 |
| Escala si crecen los colores | Sí (panel y hoja) | No (fila única con 27 px de holgura a 1400 px) |
| Se rompe si | 6 colores y 3 tallas elegidos empujan la lista; cambios en vivo con consultas lentas | La tienda real tiene su barra fija abajo (bolsa, cookies); una 14.ª familia de color |

El comparativo completo, con Ganas / Pagas / Se rompe si de cada una y las preguntas para Felipe, está en `index.html`.

## Cómo se verificó (y qué no)
- Cada opción la construyó un agente, la revisaron **dos verificadores independientes** (uno con clics reales sobre el contrato y los estados,
  otro que simulaba a una persona sin contexto) y la corrigió su autor. Hallazgos (alta / media / baja): opción 1 contrato 0/2/12 y persona
  simulada 3/4/4; opción 2 contrato 0/4/8 y persona simulada 0/7/7. Se corrigieron 24 de 25 y 18 de 26; el resto vive en la base o es una
  decisión de Felipe (lo de la base y el motor lo arreglé yo después: aviso con redacción única, zonas de toque de 44 px, cabecera sin
  desborde, fila de categorías con pista de que hay más, tarjeta angosta).
- Con clics reales: 1.550 acciones al azar en la 1 y 1.230 en la 2 sin una sola lista vacía, opción apagada que respondiera o total que no
  coincidiera; sin desbordes horizontales a 1440, 1280, 1024, 768, 390 y 360; sin errores de consola; contraste y objetivos táctiles medidos.
- **No se probó:** iPhone ni Safari reales (el bloqueo del scroll de la hoja y la zona segura de abajo pueden comportarse distinto),
  lector de pantalla real (VoiceOver, NVDA), ni con colaboradoras o clientes de verdad. La «persona sin contexto» es un agente: sus tiempos
  son estimaciones, no cronómetro. El modo oscuro no está (la tienda lo tiene derivado y Felipe no lo ha mirado).

## Dos hallazgos que valen más que elegir entre una y otra
1. **La foto de la tarjeta no cambia con el color, y hoy casi nunca se sabe de qué color es.** De las 200 prendas con foto en la tarjeta,
   **137 no tienen anotado el color de esa foto** (`producto_fotos.color_codigo` está vacío). Entre las que sí lo tienen, la foto coincide con
   el color filtrado en 50 de 162 casos (31 %). Quien filtra «Negro» y ve un corsé rojo cree que el filtro falló (las personas simuladas de
   las dos opciones lo marcaron). Ninguna opción lo arregla: pide anotar el color de cada foto y que la tarjeta use la foto del color
   elegido. Mientras tanto las dos dicen «En Negro · talla M» bajo el nombre. 59 % de las prendas con stock tiene una sola foto (producción, 25-oct).
2. **En el celular las categorías quedan encajonadas desde antes de los filtros.** Con el orden a su lado, la fila de grupos mide unos
   205 px de 358: para llegar a «Bolsos» hacen falta 6 deslizamientos y «Faldas» y «Shorts» no se ven. Pasa igual en la tienda de hoy
   (visto en `tienda.cayla.pe` a 375 px: «BLUSAS/T…» cortado). Aquí la base baja el orden a su línea y los grupos ocupan todo el ancho.

## Si se elige una, esto costaría construirla (nada de esto está hecho)
- **La base:** una columna nueva para la familia de color **de la tienda** (no tocar `colores.familia_color`, que es del ERP y mete negro,
  blanco y gris en «neutro»; ADR-0312) y **una función nueva de solo lectura** que devuelva, para la tienda elegida, las variantes con
  unidades (prenda, color, talla, unidades): unas 1.000 filas para 232 prendas. **Mejor no parchar `tienda_catalogo`**: 17 migraciones del
  repo la mencionan y varias la parchan (parches vivos: se pierden al recrear; ver CLAUDE.md «Cómo aplicar SQL a producción»); una función
  nueva y aparte no arriesga eso. Es una migración que Felipe ve por partes antes de pegar.
- **La tienda:** el filtro va por la dirección (`?color=negro,blanco&talla=M`), como la categoría y el orden, que ya viajan así, y se
  calcula en el servidor. `lib/filtros-color-talla.ts` nace de `logica.js` y su prueba de `logica.prueba.mjs`. La ficha ya lee `?color=`;
  falta `?talla=`.
- **Lo que decide Felipe antes** (están en `index.html`): una u otra; las 13 familias; «Estándar / única» como una opción; si la categoría
  cuenta como filtro; si «Atrás» deshace un filtro; qué cuenta la cifra de cada opción; en vivo o con botón.
- **Un ADR** con lo elegido, lo descartado y en qué escenario se rompe.

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | La comparación, con vistas previas vivas |
| `opcion-1.html`, `opcion-2.html` | Las dos pantallas (cada una con su CSS y su JS dentro) |
| `base.css`, `motor.js` | La lista de hoy replicada (tokens y piezas reales) y el motor que la conecta con la lógica; los comparten las dos |
| `logica.js` | La lógica pura de los filtros (ocho reglas arriba) |
| `datos-filtros.js` | Los datos reales de Trujillo (generado; no se edita) |
| `verificar/` | `logica.prueba.mjs` (la prueba), `chrome.mjs` (abre la maqueta con Chrome sin ventana, para medirla) y `base.html` (la base sin filtros, para probar el motor) |
