# Etiqueta de precio — maquetas (2026-09-23, ADR-0180)

`etiquetas.html` se abre en cualquier navegador. Carga las fuentes y un generador de QR desde CDN y trae el colibrí
embebido. Las etiquetas están en milímetros reales sobre el rollo de 62 mm, en negro puro (la QL-1110NWB no imprime otro
color). Los botones cambian entre normal y con campaña, entre blusa, pantalón y talla única, y entre tamaño real y ampliado.

Cuatro rondas con Felipe:

1. **A · Clásica, B · Atelier, C · Compacta.** Le gustó la A.
2. **D · Editorial (Zara), E · Talla primero (H&M), F · Maison (lujo)**, más la A con tallas. Eligió la **D**.
3. **D · Editorial, corregida — APROBADA.** Tras una crítica que separó lo que sirve a la clienta de lo que sirve a la
   colaboradora: colibrí, campaña protagonista («−20 %» en bloque negro y el motivo), QR de 25 mm, color en su línea,
   «Tallas del modelo», código con 0 distinto de la O y fecha de impresión.

4. **El cartón de 5 × 8 cm** (`etiquetas-carton.html`): la etiqueta pasa a 44 × 62 mm. Dos arreglos: «QR arriba» y
   «QR abajo». Felipe eligió **«QR abajo»** y pidió el QR lo más grande que entre: quedó en 22 mm (20 con campaña). La
   maqueta muestra también cómo sale del rollo (de lado, cortes cada 44 mm).

La implementación vive en `apps/web/components/EtiquetaPrecio.tsx` y `.etiqueta-precio` en `globals.css`. Si cambian,
la maqueta queda como historia, no como fuente.
