# ADR-0556 — El estándar de nombres de prenda: «Tipo + nombre», primero el del proveedor si sirve, si no una flor

- **Fecha:** 2026-10-28 · **Estado:** **construido en la rama `claude/fashion-naming-standards-3bd259`**; la migración
  `20261028184000_nombre_del_proveedor.sql` está aplicada en la base local y **no está en producción** (la pega Felipe, una sola parte; puede ir antes o
  después de publicar la web: sin la columna, la web sigue funcionando sin el dato).
- **Nace de:** la investigación `docs/investigacion/2026-10-28-como-nombran-sus-prendas-las-grandes-tiendas.md` y tres decisiones de Felipe el mismo día:
  el proceso propuesto («me gusta ese proceso»), el tema de los nombres (flores, en vez de ciudades del Perú) y la prioridad del nombre del proveedor
  («Proveedor si sirve»).
- **Toca:** ADR-0260 (Nuevo producto en cuatro preguntas), ADR-0284 (guía de foco), ADR-0290 (sugerencias coherentes), ADR-0294 (un nombre es único por
  marca), ADR-0536 («Pregúntale a CAYLA»: una regla de tienda nueva, en borrador).

## El problema

Cada quien inventaba el nombre de una prenda: nombres de mujer («Blusa Emma»), de naturaleza («Brisa»), descripciones metidas en el nombre («Falda
Plisada Luna», «Blusa Negra Aurora») y lo que traía el proveedor escrito a mano dentro del nombre o de la descripción («Krisstell Polo Evaluna», «SS25
311»). Así el color vive en dos lugares, nadie puede pedir una prenda por su nombre y la misma prenda se carga dos veces con nombres distintos (el aviso de
parecidas compara nombres, y dos nombres distintos no se parecen). Y el nombre que pone el proveedor —que el comprador necesita para volver a pedir— no
tenía dónde vivir.

## La decisión

**El nombre que se dice es `<Tipo> <Nombre propio>`; lo demás va debajo, en una línea que se arma sola; el color y la talla nunca van en el nombre.**

1. **El tipo lo pone la categoría** (`TIPOS_POR_CATEGORIA`, por `categorias.prefijo`): nadie escribe «Blusa» y nadie escribe «Blusa» dentro de Casacas.
   Una categoría que junta dos cosas ofrece las dos («Camisas y Blusas»: Blusa o Camisa). «Otro nombre» deja escribirlo entero a mano, para lo que no
   calza. Solo la moda (indumentaria, calzado, accesorios, bisutería) lleva nombre propio; belleza, papelería, el empaque y una categoría nueva quedan
   libres y se describen («Bolsa de papel mediana»).
2. **Primero, el nombre del proveedor, si sirve** (Felipe: las colaboradoras ya lo copian y así el comprador sabe qué pedir). `nombreDelProveedorComoNombre`
   le quita el tipo, la marca, los códigos y lo que solo describe («dama», «básico», «wide leg»); si queda un nombre de una o dos palabras que no rompe la
   regla, se ofrece primero: «Evaluna 311» → «Polo Evaluna». Si no sirve («SS25 311», «Blusa dama»), no se ofrece.
3. **Si no, una flor** de `FLORES` (55, de 3 a 9 letras, sin las que también son colores: Rosa, Violeta, Lila, Lavanda, Fucsia, Malva), la primera que
   ninguna prenda de la categoría usa todavía. Determinista y sin red. Felipe eligió flores porque el colibrí de la marca vive de ellas; con dos guiños
   peruanos, Cantuta y Amancae.
4. **«Cómo lo llama el proveedor» se guarda siempre aparte**, en `productos.nombre_proveedor`, aunque la prenda termine llamándose con una flor: es el dato
   de compras.
5. **Antes de bautizar, se mira si ya existe.** El paso 2 de Nuevo producto va: marca → «¿Ya existe?» (las fotos de la categoría; la misma prenda en otro
   color no se crea: se abre y se le agrega el color) → tejido → patrón → detalle → nombre. El nombre va al final porque se bautiza cuando ya se sabe qué es.
6. **La línea de abajo** (`lineaDescriptiva`): «Manga globo, botones forrados · Lino · Rayas», con el detalle (el campo que antes se llamaba «Descripción»),
   el tejido y el patrón; «Liso» no se dice.

## Lo que avisa y lo que no frena

Los avisos del nombre (`avisosDelNombre`: un color, una talla, un número, «oferta» o «verano», el tipo repetido, el tipo de otra categoría, una primera
palabra de menos de 3 o más de 9 letras) son **sugerencias en ámbar, nunca un candado** (ADR-0284: lo recomendado no bloquea). «¿Ya existe?» es un campo
«sugerido» de la guía: la luz pasa por ahí, pero «Crear» no lo espera. Lo único que frena crear sigue siendo lo de siempre (el nombre vacío, el idéntico
que rechaza la base). Editar producto avisa lo mismo al renombrar; un nombre viejo que no se toca no dice nada.

## Por qué así

- **Dos escuelas, juntas** (la investigación): las cadenas de volumen (Zara, H&M, Mango) describen, y nadie pide una prenda por su descripción; las marcas
  con cliente que vuelve (Reformation, Aritzia, Levi's) bautizan. CAYLA vende conversando y su cliente vuelve: bautiza, y describe debajo.
- **El proveedor primero** ahorra inventar cuando el nombre ya existe y deja una sola palabra entre proveedor, comprador y tienda. **El costo, que Felipe
  aceptó:** si el mismo proveedor vende «Evaluna» a otras tiendas, un cliente puede buscarlo y comparar precio; con una flor, el nombre es solo de CAYLA.
  Por eso la regla deja el nombre del proveedor solo cuando sirve, y la flor queda a un toque.
- **Una función aparte para el dato del proveedor** (`fijar_nombre_proveedor`), y no un parámetro más de `crear_producto_con_stock_inicial` o
  `catalogo_actualizar_producto`: esas funciones preguntan el precio cero (ADR-0384) y se parchan solo con reemplazos anclados. Esta se llama después de
  crear o desde su propia fila en la ficha; si la base todavía no la tiene, la prenda se crea igual y la pantalla dice dónde completarlo.

## Lo que se descartó

- **Ciudades del Perú como tema** — Felipe no las quiso.
- **Un banco de nombres por temporada** (la primera propuesta): más trabajo de mantener para un beneficio (que el nombre diga la temporada) que la
  columna `temporada` ya da.
- **IA para nombrar o para comparar fotos** (Felipe 2026-10-28, después de verlo): elegir la flor es una cuenta exacta y la regla de `/sugerir` pide
  sugerencias deterministas y sin red; comparar fotos lo hace mejor la persona mirando la grilla. La IA de «Pregúntale a CAYLA» solo explica la regla
  (`nombre-prenda`, en borrador hasta que Felipe la apruebe).
- **Frenar «Crear» con los avisos o con «¿Ya existe?»** — sería una regla de negocio nueva disfrazada de guía; se avisa.

## Lo que queda pendiente

- **Pegar `20261028184000` en producción** (OK de Felipe). Hasta entonces la fila de Editar producto no se dibuja y el dato no se guarda (la prenda sí).
- **Sin conexión, el dato del proveedor no viaja** con el alta en cola: la pantalla lo dice y se completa en Editar producto.
- **Mostrar el nombre del proveedor en Compras** (órdenes, reposición) **y buscarlo** desde los buscadores del ERP: toca otro módulo; va en su propio paso.
- **Ordenar los nombres que ya existen** (los que llevan color, descripción o un número): un listado para que Felipe decida cuáles renombrar.
- **La tienda online** puede mostrar la línea descriptiva bajo el nombre.
