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
