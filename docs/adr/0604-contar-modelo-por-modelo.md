# ADR-0604 · Contar modelo por modelo, con cada categoría una sola vez

- **Fecha:** 2026-11-02 · **Estado:** construido y probado en local (base local con datos inventados). Sin migración. Sin tocar ninguna RPC. Sin publicar.
- **Decide:** Felipe, 2026-11-02: «agrupar por categorías sin que se repitan; al desplegar, cada producto uno por uno para contar modelo por modelo; filtrar por
  proveedor o marca; achicar la placa del contador y poner a su derecha las prendas que se especificaron o se parecen; y a la mano derecha, los papeles de la compra».
  Ante la pregunta de qué cuenta el Dial, eligió **el modelo**.
- **Toca:** ADR-0393 (contar primero, un número por categoría) y ADR-0575 (decisión 2, «el acordeón solo desglosa»): esta decisión las cambia en eso. Lo demás de ellas sigue.

## El problema primero

La persona tiene una prenda en la mano y sabe qué modelo es. La pantalla le pedía primero un número por categoría y después, en otra tarjeta más abajo, que dijera qué modelos
eran esas prendas: dos pasadas para lo mismo. Además una categoría salía repetida si el envío traía dos proveedores o marcas (el grupo es proveedor + categoría + marca), no se
podía mirar solo lo de un proveedor al abrir su fardo, y junto al Dial había un espacio vacío mientras lo que había que mirar quedaba bajo el pliegue.

## Qué se decidió

| Pieza | Antes | Ahora | Archivo |
|---|---|---|---|
| Lista de la izquierda | Una fila por proveedor + categoría + marca | Cada categoría una vez; al abrirla, sus modelos uno por uno, y cada fila dice de qué proveedor y marca si hay más de uno | `CategoriasAcordeon.tsx` |
| Filtro | No había | Proveedor y Marca (`DesplegablePildora`), solo si el envío trae más de uno; cada filtro ofrece lo que queda con el otro puesto | `CategoriasAcordeon.tsx` |
| El Dial | Contaba la categoría | Cuenta el modelo elegido; la categoría suma sola | `ContarEnvio.tsx` |
| La placa | Dial con un espacio libre a la derecha y «¿Qué … son?» en otra tarjeta abajo | Dial de 192 px con sus atajos debajo y, a su derecha, las prendas de la compra, las que se parecen, el buscador y las tallas | `PrendasDeLaPlaca.tsx` |
| Los papeles | Columna de 25 rem; a 1440 px el acordeón no cabía al lado | Columna de 18 rem (22 rem desde 1600 px), para que quepan las tres zonas | `RecibirContando.tsx` |

## Por qué así (y por qué Dial = modelo)

**La base no cambia, porque ya guardaba esto.** `despacho_conteos` tiene una fila por línea de la compra, y lo separado ya lleva la cantidad exacta por prenda. Contar un modelo es
escribir esa cantidad en su línea: contar es identificar. Por eso Cerrar, el Podio, los reclamos y «Hacer ahora» no se enteran.

**«Categoría» es solo una vista.** `agruparLineas` sigue juntando por proveedor + categoría + marca, y `categoriasDelEnvio` (`lib/recepcion-modelos-reglas.ts`) arma encima la
categoría sin repetir. Cada modelo sigue siendo de un grupo. Si el Dial contara la categoría, juntar dos proveedores obligaría a repartir un total entre ellos en el orden de la
compra, y un faltante podría quedar en el proveedor equivocado; contando el modelo no hay nada que repartir.

**Solo se escribe la línea del modelo que se tocó.** Las demás líneas sin contar siguen sin fila: la guía de foco puede pedir cada modelo y «por contar» no se confunde con «no
llegó». Por eso «No llegó nada» guarda la línea en 0, y eso sí queda dicho.

**Lo contado sigue a los modelos** (`repartirCambio`): si un modelo baja, baja el total; si sube, primero usa lo que estaba contado sin saber qué era y recién después sube el total.

## Lo que sigue funcionando como un total

Lo que no tiene modelo anotado (un envío sin aviso, lo de fuera de la guía, una compra que no dijo qué prendas eran, o que anotó solo una parte) se cuenta como antes: el Dial con
«Total de Vestidos» y después se identifica. `necesitaTotal` lo decide. La regla de ADR-0393 no se movió: **sin identificar toda prenda contada no se pasa a «Cerrar»**.

## Lo que queda dicho (límites)

1. **Envíos a medias con un número de antes.** El flujo anterior guardaba una fila en todas las líneas del grupo al primer toque, y un 0 ahí no significa «no llegó». Mientras quede
   algo contado sin identificar, el modelo dice «Por contar». Pero al identificar lo último, un modelo que quedó en 0 dice «No llegó» aunque nadie lo haya dicho. No hay cómo
   distinguirlo sin una marca nueva en la base y no vale una migración: al cerrar sale como faltante y pide su causa, que es la red de seguridad.
2. **Cerrar sigue por proveedor + categoría + marca.** Solo Contar junta las categorías. Si Felipe quiere lo mismo en Cerrar, es otra decisión (ahí cada causa y cada costo son por línea).
3. **A 1280 px la placa se apila** (Dial arriba, prendas abajo): con menú, acordeón y papeles no queda ancho. Desde 1440 px va lado a lado. Bajo `xl` los papeles van arriba, como antes.
4. **«Se parecen» compara palabras** del nombre contra hasta 30 prendas de esa categoría y marca (`fn_prendas_para_recibir`). Es una ayuda, no un dato: si la lectura falla, la
   placa sigue sin esa fila.

## Lo que se rompería sin esto / al tocarlo

- `lib/recepcion-modelos-reglas.ts` es la única definición de categoría, modelo, parada, filtro y guía; su prueba incluye una secuencia de toques que exige que **ninguna línea quede
  con lo separado por encima de lo contado** (el CHECK `separado_cabe` de la base) y que todo siga identificado.
- Reemplaza a `lib/recepcion-acordeon-reglas.ts`, `camposDelConteoPorGrupo`, `anotadasPorSepararDelGrupo` y `avisoDePrendasAgregadas`, que se borraron.
- `SepararPrendas` queda solo para «Hacer ahora» (lo cerrado), que sigue identificando con filas y cantidades.

## Cómo se verificó

Con un navegador sin ventana contra el ERP local: tocar modelos, «Llegaron las N», «Listo, sigue», doble clic y toques seguidos, escribir el número, Escape, recargar, sumar una parecida,
anotar una nueva, las sin nombre, tallas y pasar a Cerrar; filtro por marca con dos marcas (con datos temporales que se devolvieron); dos pestañas sobre el mismo modelo, corte de red y
recargar a mitad de un guardado. Sin errores en la página y sin filas inválidas. 375, 1024, 1280, 1440 y 1920 px sin desborde; claro y oscuro. Guía interactiva recorrida (15 pasos, sin
escribir nada), `/focus` y `/sugerir` conformes. **Falta:** el recorrido formal de `/chaos` y `/formidable`, y probarlo con quien recibe de verdad.
