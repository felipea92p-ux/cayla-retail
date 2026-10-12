# Maqueta · Historial de la prenda (2026-10-06)

Lo que pidió Felipe, con una captura de la vista rápida de «Vestido Summer · VES-0013» (Catálogo ▸ Productos ▸ Grilla): *un botón
entre «Etiquetas» y «Ver en Existencias», «Historia» o «Historial», donde se vean todos los cambios que tuvo la prenda —precios,
colores, etiquetas…— y quién los hizo, **sin las ventas**. Y tres maquetas de esa vista, sofisticadas, amigables y llenas de
animaciones, para reemplazar la de hoy.*

Abrir: `index.html` (las tres con pestañas) o cada archivo suelto. Con un servidor estático: la configuración `maquetas` de
`.claude/launch.json` (`python3 -m http.server --directory docs/maquetas`). La barra punteada de arriba no es parte de la pantalla:
cambia los datos, el tema, el ancho (escritorio o 375 px), el movimiento y dónde se abre la hoja.

## El nombre: «Historial»

1. **Ya es la palabra del ERP para esto.** La Tabla de Productos tiene un botón «Historial» (`ProductosTabla.tsx`, `aria-label` «Historial
   de …»), la ruta es `/productos/[id]/historial` y el botón «Ficha» de Existencias promete «Precio, descripción, historial». Otro nombre
   para lo mismo serían dos cosas en la cabeza de quien vende.
2. **«Historia» promete otra cosa:** suena a relato de la prenda (de dónde viene, cómo se hizo), lo que una marca cuenta en una etiqueta.
3. **«Cambios» no se puede:** en CAYLA «Cambios» es el módulo donde un cliente cambia una prenda (`/cambios`).

## Qué está mal hoy (verificado en el código y en producción, no solo en la captura)

| Lo que pasa | Por qué |
|---|---|
| **Salen las ventas.** | `HistorialProductoPanel` junta dos fuentes: `historial_producto_cambios` (la ficha) y `movimientos` (ventas, traslados, ajustes), con selector de sede y paginado. Lo segundo es lo que Felipe no quiere aquí. Sigue disponible en Inventario ▸ Movimientos (`?q=VES-0013`). |
| **El «quién» falta en casi todo lo que importa.** | Medido en producción el 2026-10-06: **los 40 cambios de precio guardados tienen `usuario_id` vacío** (también nombre, categoría, color y costo declarado). «Editar producto» es una acción «soltada» del combo (`acciones_sin_responsable.producto_confirmar_cambios`) y desde una terminal `fn_actor_persona_id(true)` devuelve null. Solo la temporada, que se asigna por otra función, guarda persona. |
| **Hay cambios que la base no anota.** | Etiquetas (`variante_etiquetas` no tiene disparador), un color o una talla **nuevos** (el disparador de `variantes` es solo `AFTER UPDATE`), las fotos que se cambian desde la ficha, el tejido y el patrón. |
| **Nombre, descripción y fotos se ven crudos.** | El disparador de 2026-10-02 anota `referencia` y `descripcion`, y `agregar_foto_producto` anota `foto`, pero `ETIQUETA_CAMPO` (`lib/historial-producto-reglas.ts`) no los conoce: la fila dice «referencia» en vez de «Nombre». |
| **Un cambio de precio a 5 variantes son 5 filas.** | El panel pinta una fila por variante. Actividad ya agrupa por guardado (mismo `created_at`, 20261002234500); el historial no. |

## Lo que las tres hacen igual

1. **La hoja no se cierra:** «Historial» da vuelta la página dentro de la misma vista rápida (lo de antes sale corto a un lado, lo nuevo
   entra del otro, el alto acompaña) y «← Vestido Summer» vuelve. Por eso hereda la excepción de movimiento que la vista rápida ya tiene
   (ADR-0136, act. 2026-10-05): rico, pero **sin rebote y sin bucle**, y todo se apaga con `prefers-reduced-motion` («Sin» en la barra).
2. **Un evento = un guardado:** «Lucía editó precio y descripción», no siete filas sueltas.
3. **Primero quién** (cara e iniciales, rol y sede), después **qué** (dibujado: el precio que cuenta hacia abajo, el color que aparece, la
   etiqueta que cae) y **cuándo**.
4. **Sin ventas ni stock**, y lo dice: una nota lleva a Movimientos.
5. **Honestas con los huecos.** «Lo que se guarda hoy» muestra la pantalla con lo que producción anota hoy: los cambios sin persona salen
   como «Nadie quedó anotado» con un «¿Por qué?», y lo que no se anota no aparece (o, en B y C, aparece marcado «sin registro»). En
   «Completo», lo que necesita registro nuevo lleva la marca punteada «hoy no se guarda» (solo de la maqueta).
6. **El costo** solo a quien ve el dinero de compras (`cambioVisible`, como hoy), con su candado.
7. Solo tokens de `globals.css` / `tema.css`, en claro y en oscuro; probadas en escritorio y a 375 px.

## A · Hilo del tiempo — `a-hilo.html`

Un hilo vertical (el hilo taupe de la cabecera del ERP) con cada guardado colgado de un nudo del color de su tipo; arriba lo último, abajo
«Nació». Píldoras por tipo (Precio · Colores y tallas · Etiquetas · Ficha · Fotos, con su cuenta) y caras para filtrar por persona. Un clic
abre el detalle: cuándo exacto, dónde, desde qué pantalla y qué variantes.

- **Movimiento:** el hilo se dibuja de arriba abajo, los nudos se encienden en orden, cada tarjeta llega desde la derecha cuando entra a la
  vista, lo viejo se tacha y lo nuevo entra, el precio cuenta (S/ 109.00 → S/ 99.00) y su diferencia aparece al final; al pasar el mouse
  sobre una tarjeta el resto baja.
- **A favor:** es la forma que todos ya saben leer (como las notificaciones del celular); responde la pregunta exacta —qué cambió y
  quién— en una pasada; escala con filtros; es la más barata de construir (las filas del ledger agrupadas por guardado).
- **En contra:** para «¿desde cuándo cuesta esto?» hay que buscar el último cambio de precio en la lista (el filtro «Precio» lo deja a la vista).

## B · Máquina del tiempo — `b-maquina.html`

A la izquierda, la **ficha viva**: la prenda tal como estaba en el momento elegido (nombre, precio, colores, etiquetas, temporada,
descripción, costo). Abajo, una cinta con un punto por guardado y la cara de quien lo hizo; se arrastra, se toca o se recorre con ← →.
A la derecha, quién y qué de ese paso, y «Comparar con hoy». «▶ Ver su historia» la recorre desde que nació, una vez, y se detiene en hoy.

- **Movimiento:** la cinta se traza, los puntos aparecen en orden, el mango viaja; en la ficha, lo que cambió en ese paso se enciende una
  vez, el texto viejo sube y sale mientras el nuevo entra, el precio cuenta, el color nuevo nace.
- **A favor:** responde «¿cómo era antes?» de un vistazo; es la más memorable.
- **En contra, y es serio:** reconstruye el pasado **hacia atrás desde hoy**, y el ledger solo existe desde el 2026-09-15 (temporada desde
  el 09-28, nombre y descripción desde el 10-02) y no tiene etiquetas ni variantes nuevas. Para una prenda anterior, «Así estaba» mostraría
  un estado que **nunca existió** (principio 2). En «Lo que se guarda hoy» se ve: «Aparecieron 2 colores… sin registro». Además, en el
  celular la cinta se desliza de lado y es la menos directa.

## C · Capítulos — `c-capitulos.html`

La historia contada **por tema**, como se pregunta en la tienda. Arriba, quién la tocó (tocar a una persona apaga lo que no es suyo en
todos los capítulos). Debajo: **Precio** como escalera en el tiempo, con la cara de quien hizo cada escalón y cuántos días duró cada
precio; **Colores y tallas** con la fecha en que llegó cada color y su corrección; **Etiquetas** como barras de cuándo estuvieron puestas;
**Ficha** campo por campo («antes Vestido Verano · hoy»); **Fotos** con quién subió cada una y cuáles faltan. «Ver los cambios» abre el
capítulo a todo el ancho con su lista y el resto se reacomoda deslizándose (View Transitions; sin ellas, salta).

- **Movimiento:** los capítulos suben en cascada, la escalera del precio se dibuja y su cifra cuenta, las barras de etiquetas crecen
  desde el día en que se pusieron, los colores aparecen en el orden en que llegaron.
- **A favor:** «¿desde cuándo cuesta esto?» y «¿cuándo se puso Oferta?» se ven sin leer; la escalera del precio no la da ninguna otra.
- **En contra:** parte una sola historia en cinco cajas (un guardado de precio + descripción aparece en dos); con pocas ediciones se ve
  vacía; es la más cara de construir y mantener (gráfico, barras, reacomodo).

## Recomendación

**A**, con la escalera del precio de C como cabecera del filtro «Precio» si Felipe la quiere. A es la única que responde exactamente lo que
se pidió («todos los cambios y quién los hizo»), se entiende sin explicación, no inventa nada que la base no sepa y sale de lo que ya
existe (el ledger agrupado por guardado, como Actividad). B es la más vistosa pero, con el ledger de hoy, mostraría pasados falsos de las
prendas viejas. C es excelente para el precio y fragmenta todo lo demás.

## Lo que hace falta en la base (necesita el OK de Felipe: es esquema de producción)

1. **Firmar «Editar producto».** Dos caminos (decisión de negocio): (a) sacar `producto_confirmar_cambios` de `acciones_sin_responsable`
   para que, en una terminal, guardar la ficha pida «Responsable» (firma siempre, un paso más); o (b) dejarla soltada y anotar al menos la
   terminal y la sede en el ledger («desde la terminal de TRU», sin persona). Recomendado: (a), porque el pedido es justamente «quién».
2. **Anotar lo que falta** en `historial_producto_cambios`, por disparador como todo lo demás (ADR del 2026-09-15: ninguna pantalla puede
   olvidarse): etiquetas (`variante_etiquetas` al poner y quitar), variante nueva (`AFTER INSERT` en `variantes`, sin contar las del alta,
   que ya cuenta `producto_origen`), fotos de la ficha (`producto_fotos`), tejido y patrón.
3. **Leer por guardado:** una función de lectura que devuelva los eventos ya agrupados (como hace Actividad), con la persona y la sede.

Lo que ya se escribió antes de estos registros no se puede reconstruir: el historial cuenta desde que existe cada disparador, y la pantalla
lo dice («Sin registro»), nunca lo inventa.
