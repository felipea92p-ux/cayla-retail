## Recibir — Contar modelo por modelo (2026-11-02, ADR-0604)
Hecho en esta rama, solo en local (sin PR ni producción): categorías sin repetir, filtro por proveedor y marca, Dial por modelo, placa compacta, las fotos de facturas en un botón y sin los pasos de arriba. Sin migración.
La maqueta del boceto ya está en el ERP (tres columnas, resumen, tallas en la misma pantalla). **Antes de confiar del todo:** probarlo con quien recibe de verdad.
**Decide Felipe:**
- ¿Cerrar también junta cada categoría una sola vez y se acorta? Hoy sigue por proveedor + categoría + marca (ahí las causas y los costos son por línea) y con 75 líneas son 54 filas y casi 16.000 px.
**Recomendaciones para seguir (2026-11-02, sin decidir; se revisó el código y se midió en local):**
- Acortar Cerrar: con 75 líneas son 54 filas y casi 16.000 px. Lo que cuadra plegado y lo que pide una decisión primero.
- Ver lo que cuentan los demás: varias personas pueden contar a la vez, pero la pantalla no se refresca sola con lo de otra persona.
- «Llegaron todas» por categoría: bajaría de 146 toques a unos 22 en un envío de 73 modelos que cuadra, pero invita a no contar. Es decisión de negocio de Felipe.
**Deuda chica, sin decisión:**
- En Cerrar, lo decidido («No vino», un costo) se pierde al recargar la página: al ir y volver a Contar ya no. Cerrar sigue siendo largo con muchas líneas (ver arriba).
- Abrir otra categoría cambia lo que se está contando: la segunda ciega se sorprendió una vez. Es lo que pidió Felipe; se podría abrir sin moverlo.
- `/formidable`, ley 8 en 5: la misma cifra sale cuatro veces (fila, cifra, Dial, botón). Lo pidió Felipe mirando la maqueta; ver `docs/formidable/recibir-envio.md`.
- Una celda de la tabla de tallas llega hasta 9.999 (`leerCantidad`): un modelo con más de una sola talla y un solo color no se puede repartir (ADR-0604, límite 6).
- La tabla de tallas no se entera de lo que otra persona guarda en el mismo modelo hasta recargar (ADR-0604, límite 7).
- Una prenda en dos líneas con tallas puestas vuelve a quedar entera en la primera línea: al cerrar pregunta qué pasó (ADR-0604, límite 4).
- Base local: quedaron ENV-003055 (contado), ENV-003056 (intacto, para probar a mano), ENV-003057 (cerrado), las marcas «ZZ Marca Norte/Sur» y una ronda de compras abierta de Sandra (prueba). La foto `antes-contar-modelos` las borraría junto con todo lo demás escrito desde entonces.
- Escribir «1.5» en el número del Dial da 15 y «-5» da 5 (`leerContadas` solo se queda con los dígitos); ya pasaba antes de este cambio y también lo usan otras pantallas.
- En un envío a medias con un conteo de antes, un modelo en 0 puede decir «No llegó» sin que nadie lo dijera (ADR-0604, límite 1). Al cerrar sale como faltante y pide su causa.
- `docs/maquetas/recibir-editable-2026-11/`: sus pantallas de Contar son de antes de este cambio; hay que recapturarlas si se sigue usando.
