# Maqueta — Historial de ventas (`/vender/historial`) · 2026-09-21

Diseño hecho en Stitch (proyecto «CAYLA Retail — Historial de ventas», id `6225690117739006444`,
pantalla `7fcafb6373294f2ea6c7ddbb8e3543ac`, «Línea de tiempo»). Es una **maqueta**: no toca código de la pantalla.
Datos, nombres y fotos de prendas son de ejemplo; las fotos las inventó Stitch.

Archivos: `historial-linea-de-tiempo.html` (abrir en el navegador) y `.png` (captura).

## Idea: lo mejor de Dynamic y de Retail
**De Dynamic** (marco, tipografía, organización): lateral con grupos en mayúsculas y chevron, títulos y cifras en serif
(EB Garamond), franja continua de 4 indicadores, búsqueda y desplegables rellenos de sand, chip de período activo relleno
de tinta, un solo acento rojo.

**De Retail** (se conserva): línea de tiempo con un nodo por día, fotos de las prendas apiladas con «+N», chip
«Pendiente de enviar» apagado (dorado pálido, no amarillo), gráfico «Ventas por día» con cifras y «Cómo se pagó».

## Cambios de fondo frente a la pantalla actual (de la auditoría, `docs/pantallas/vender-historial.md`)
- Una sola barra de búsqueda (boleta, clienta, prenda) — H7.
- Atajos «Hoy», «Ayer», «Pendientes de comprobante · N» y filtros como chips con «Limpiar filtros».
- Título de la venta = nombre de la prenda, no el código — H3.
- «Por día vendido» en vez de dividir entre todos los días del rango — H5 (divisor a confirmar con Felipe).
- Toda la fila abre el detalle (chevron tenue); sin botón invisible.

## Pendiente de pulir (visto en la captura)
1. Títulos y metadatos cortados con «…»: en la pantalla real, tope de 2 líneas.
2. Columnas de comprobante y total apretadas.
3. Lateral sin íconos de línea fina ni insignia de conteo (Dynamic sí los tiene).
4. Las fotos de ejemplo se repiten entre ventas.

## No decidido
- Si «Pendientes de comprobante» es un estado filtrable real depende de la auditoría (H2 y consulta E2, aún sin correr).
- Los colores por método de pago: la maqueta usa puntos de color apagados; Felipe decide si se quedan.
