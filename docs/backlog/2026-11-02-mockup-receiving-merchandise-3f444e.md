## Recibir — Contar modelo por modelo (2026-11-02, ADR-0604)
Hecho en esta rama, solo en local (sin PR ni producción): categorías sin repetir, filtro por proveedor y marca, Dial por modelo, placa compacta, las fotos de facturas en un botón y sin los pasos de arriba. Sin migración.
**Antes de publicar:** correr `/chaos` y `/formidable` formales (hoy hay un recorrido propio: toques, teclado, dos pestañas, corte de red, recargar) y probarlo con quien recibe de verdad.
**Decide Felipe:**
- ¿Se pasa a local la maqueta del boceto (`docs/maquetas/recibir-boceto-2026-11/`)? Sin migración; su README dice qué costaría. Antes de hacerlo hay que decidir qué dicen Re stock y Nuevo en un envío sin aviso.
- ¿Cerrar también junta cada categoría una sola vez y se acorta? Hoy sigue por proveedor + categoría + marca (ahí las causas y los costos son por línea) y con 75 líneas son 54 filas y casi 16.000 px.
**Recomendaciones para seguir (2026-11-02, sin decidir; se revisó el código y se midió en local):**
- Contar sin soltar el teclado: hoy cada modelo son 4 acciones (tocar el número, escribir, Enter, «Listo, sigue»), porque Enter solo deja el número (`Dial.tsx`). Con el número abierto al llegar y Enter pasando al siguiente, son 2.
- Buscar un modelo en todo el envío, en la fila de los filtros: «Busca otra» solo busca en el catálogo de la categoría y marca que está en el Dial.
- Filtro por estado (por contar, con diferencia): un «−213» en la categoría no dice en cuál de sus modelos está.
- Acortar Cerrar: con 75 líneas son 54 filas y casi 16.000 px. Lo que cuadra plegado y lo que pide una decisión primero.
- «Se parecen» ofrece un modelo que ya está en la categoría con otro proveedor, y un toque le suma 1 como «No estaba anotada» (`prendasParecidas` solo mira el grupo; `sumarPrenda`). Debería llevar a ese modelo.
- Subir «Quién cuenta» a la fila de los filtros: a 1440 px está a unos 1.600 px de arriba, bajo todas las categorías.
- Avance en cada categoría plegada: una barra fina y «12 de 14 modelos», ahora que se pliegan y sobra ancho.
- Ver lo que cuentan los demás: varias personas pueden contar a la vez, pero la pantalla no se refresca sola con lo de otra persona.
- «Llegaron todas» por categoría: bajaría de 146 toques a unos 22 en un envío de 73 modelos que cuadra, pero invita a no contar. Es decisión de negocio de Felipe.
**Deuda chica, sin decisión:**
- Una prenda en dos líneas con tallas puestas vuelve a quedar entera en la primera línea: al cerrar pregunta qué pasó (ADR-0604, límite 4).
- Base local: quedaron ENV-003055 (contado), ENV-003056 (intacto, para probar a mano), ENV-003057 (cerrado), las marcas «ZZ Marca Norte/Sur» y una ronda de compras abierta de Sandra (prueba). La foto `antes-contar-modelos` las borraría junto con todo lo demás escrito desde entonces.
- Escribir «1.5» en el número del Dial da 15 y «-5» da 5 (`leerContadas` solo se queda con los dígitos); ya pasaba antes de este cambio y también lo usan otras pantallas.
- En un envío a medias con un conteo de antes, un modelo en 0 puede decir «No llegó» sin que nadie lo dijera (ADR-0604, límite 1). Al cerrar sale como faltante y pide su causa.
- `docs/maquetas/recibir-editable-2026-11/`: sus pantallas de Contar son de antes de este cambio; hay que recapturarlas si se sigue usando.
