## Recibir — Contar modelo por modelo (2026-11-02, ADR-0604)
Hecho en esta rama, solo en local (sin PR ni producción): categorías sin repetir, filtro por proveedor y marca, Dial por modelo, placa compacta y tres zonas. Sin migración.
**Antes de publicar:** correr `/chaos` y `/formidable` formales (hoy hay un recorrido propio: toques, teclado, dos pestañas, corte de red, recargar) y probarlo con quien recibe de verdad.
**Decide Felipe:**
- ¿Cerrar también junta cada categoría una sola vez? Hoy sigue por proveedor + categoría + marca; ahí las causas y los costos son por línea.
- A 1280 px la placa se apila: ¿se le da más ancho (papeles arriba desde 1440) o queda así?
**Deuda chica, sin decisión:**
- Escribir «1.5» en el número del Dial da 15 y «-5» da 5 (`leerContadas` solo se queda con los dígitos); ya pasaba antes de este cambio y también lo usan otras pantallas.
- En un envío a medias con un conteo de antes, un modelo en 0 puede decir «No llegó» sin que nadie lo dijera (ADR-0604, límite 1). Al cerrar sale como faltante y pide su causa.
- `docs/maquetas/recibir-editable-2026-11/`: sus pantallas de Contar son de antes de este cambio; hay que recapturarlas si se sigue usando.
