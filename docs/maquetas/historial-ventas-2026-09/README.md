# Maqueta — Historial de ventas (`/vender/historial`), 2026-09-21

Referencia visual del rediseño propuesto en la auditoría `docs/pantallas/vender-historial.md`.
**Es una maqueta, no código de la app**: no se importa desde `apps/web`. Se abre `historial.html` en el navegador
(carga Tailwind y las fuentes desde CDN, hace falta conexión).

- Origen: Stitch, proyecto «CAYLA · Historial de ventas» (id `13520313933471370286`), sistema de diseño «CAYLA Atelier».
- **Los datos son ilustrativos** (nombres de vendedoras, boletas, montos por día, porcentajes de pago, «68 prendas»,
  «mejor día S/ 1,520»). Solo S/ 5,487.10, 17 ventas y 17 pendientes salen de producción (2026-09-21).
- Las fotos son imágenes de ejemplo de Stitch (`lh3.googleusercontent.com`); pueden dejar de cargar.

## Qué muestra de las 12 tareas
Búsqueda única (#2), atajos Hoy / Ayer / Pendientes de comprobante (#9), «Por día vendido» (#7, decisión de Felipe
pendiente), nombre de la prenda como título (#3), chip de comprobante pendiente (#1), chevron en la fila y objetivos
táctiles (#10), «Cargar más ventas» y panel «Ventas por día» con cómo se pagó.

## Ojo al llevarla al código
- Usar los tokens de `apps/web/app/globals.css` (crema `#f5f0e8`, papel `#fbf6ec`, tinta `#1a1a18`), no los hex de la
  maqueta (crema `#fef9f1` y tinta `#1f1b18` son de Stitch y difieren). La serif de la app es `--font-display`.
- El chip «Pendiente de enviar» sigue sin decir cuántos días lleva (tarea #1: «pendiente hace 7 días»).
- Filtros por monto, exportar CSV y el título con `descripcion` requieren código y datos, no solo estilo.
- El rojo `#b8412d` aparece una vez (cifra de pendientes): respeta el máximo de 2 por pantalla.
- Reutilizar `EncabezadoPagina`, `Chip` y la hoja de papel existentes; las barras lateral y superior de la maqueta son solo contexto.

---

## Variante B — «Línea de tiempo» (Dynamic × Retail)

Diseño hecho en Stitch (proyecto «CAYLA Retail — Historial de ventas», id `6225690117739006444`,
pantalla `7fcafb6373294f2ea6c7ddbb8e3543ac`, «Línea de tiempo»). Es una **maqueta**: no toca código de la pantalla.
Datos, nombres y fotos de prendas son de ejemplo; las fotos las inventó Stitch.

Archivos (esta variante): `historial-linea-de-tiempo.html` (abrir en el navegador) y `.png` (captura).

### Idea: lo mejor de Dynamic y de Retail
**De Dynamic** (marco, tipografía, organización): lateral con grupos en mayúsculas y chevron, títulos y cifras en serif
(EB Garamond), franja continua de 4 indicadores, búsqueda y desplegables rellenos de sand, chip de período activo relleno
de tinta, un solo acento rojo.

**De Retail** (se conserva): línea de tiempo con un nodo por día, fotos de las prendas apiladas con «+N», chip
«Pendiente de enviar» apagado (dorado pálido, no amarillo), gráfico «Ventas por día» con cifras y «Cómo se pagó».

### Cambios de fondo frente a la pantalla actual (de la auditoría, `docs/pantallas/vender-historial.md`)
- Una sola barra de búsqueda (boleta, clienta, prenda) — H7.
- Atajos «Hoy», «Ayer», «Pendientes de comprobante · N» y filtros como chips con «Limpiar filtros».
- Título de la venta = nombre de la prenda, no el código — H3.
- «Por día vendido» en vez de dividir entre todos los días del rango — H5 (divisor a confirmar con Felipe).
- Toda la fila abre el detalle (chevron tenue); sin botón invisible.

### Pendiente de pulir (visto en la captura)
1. Títulos y metadatos cortados con «…»: en la pantalla real, tope de 2 líneas.
2. Columnas de comprobante y total apretadas.
3. Lateral sin íconos de línea fina ni insignia de conteo (Dynamic sí los tiene).
4. Las fotos de ejemplo se repiten entre ventas.

### No decidido
- Si «Pendientes de comprobante» es un estado filtrable real depende de la auditoría (H2 y consulta E2, aún sin correr).
- Los colores por método de pago: la maqueta usa puntos de color apagados; Felipe decide si se quedan.
