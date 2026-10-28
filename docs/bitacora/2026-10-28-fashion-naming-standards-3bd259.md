## 2026-10-28 (El estándar de nombres de prenda: «Tipo + nombre», el del proveedor si sirve, si no una flor — ADR-0556)
Qué hice: investigué cómo nombran sus prendas las grandes tiendas (`docs/investigacion/2026-10-28-como-nombran-sus-prendas-las-grandes-tiendas.md`) y llevé el estándar elegido por Felipe a Nuevo producto: el paso 2 va marca → «¿Ya existe?» (fotos de la categoría) → tejido → patrón → detalle → nombre; el tipo lo pone la categoría, se sugiere primero el nombre del proveedor si sirve y luego las flores libres, con avisos en ámbar que no frenan. Nuevo dato «Cómo lo llama el proveedor» (`productos.nombre_proveedor`, `fijar_nombre_proveedor`, migración `20261028184000`), también en Editar producto. Regla `nombre-prenda` del asistente en borrador.
Por qué así: las marcas con cliente que vuelve bautizan y describen debajo; el nombre del proveedor ahorra traducir en compras, pero solo cuando es un nombre de verdad (un código o «Blusa dama» no lo es). Nada de esto frena «Crear»: es guía (ADR-0284).
Felipe se lleva: probado en el navegador con la base local (escritorio y 375 px) y la función en una transacción deshecha; la migración NO está en producción y espera su OK. Pendiente: mostrar y buscar el nombre del proveedor en Compras, y ordenar los nombres viejos.

## 2026-10-28 (Nuevo producto con la carga cerrada: lo que tienes entra como llegada — ADR-0328 act. 2026-10-28)
Qué hice: con la carga inicial de la sede cerrada, la tabla del paso 4 ya no se apaga: pasa a «Cuántas llegaron» y, al crear, `crear_producto_con_llegada` (migración `20261028221000`) da de alta la prenda y la recibe con `recibir_lote` del proveedor elegido, en una transacción. Sin proveedor, el paso 4 lo pide con «Elegir proveedor»; la pantalla de éxito dice «recibidas de <proveedor>».
Por qué así: Felipe no quiere mandar a la persona a otro módulo para escribir lo mismo dos veces; reabrir la carga inicial habría deshecho el cierre del 15-oct, y dos llamadas desde el navegador podían dejar la prenda sin sus unidades.
Felipe se lleva: probado en el navegador en Trujillo (dos altas: 5 y 4 unidades, «recepcion» al almacén con el lote del proveedor) y `pnpm pruebas:alta-con-llegada` en verde (15/15). La migración NO está en producción y va antes de publicar la web.

## 2026-10-28 (El nombre deja ver que el tipo queda fijo; «Temporada y etiquetas» plegado — ADR-0556 act. tarde)
Qué hice: en el paso 2 de Nuevo producto el tipo es una pieza con candado y «+» dentro de la caja, «Así se llamará: Polera Dalia» va siempre bajo ella, con un solo tipo la fila de chips se cambió por el enlace «¿No es una polera? Escribe otro nombre», y «Temporada y etiquetas» arranca plegado.
Por qué así: Felipe no entendía que «Polera» quedaba fijo: era un texto gris igual al ejemplo, y el chip «✓ Polera» lo repetía.
Felipe se lleva: probado en el navegador con Poleras (escritorio y 375 px, sin scroll lateral), el enlace va y vuelve, y la guía y su huella al día.

## 2026-10-28 (/chaos de Nuevo producto con la llegada y «Cómo lo llama el proveedor», semilla 2810)
Qué hice: 16 de 23 ataques en la base local y el navegador, con foto antes y la base restaurada idéntica después: doble clic, mismo token con otra cantidad, respuesta perdida, 10 sesiones a la vez, permisos, URLs torcidas y textos hostiles. 0 estados imposibles.
Por qué así: la llegada mueve stock; lo grave sería una prenda con dos llegadas o una llegada sin prenda, y no pasó.
Felipe se lleva: un hallazgo nuevo (costo ≥ precio bloquea el alta con «costo fuera de lo normal», en la función: decisión suya) y tres heredados («2,5» → 25 en una cantidad, cambiar de sede borra el alta, «S/ 59» pegado). Informe en `.chaos/informes/` (local).
