# 2026-11-02 · tarjeta de prenda de Vender: de «Foto al aire» a «Placa»

- **Qué:** con fotos reales, la tarjeta «B · Foto al aire» (elegida ese mismo día) se veía rara: los fondos distintos de las fotos (blanco, beige, celeste) no daban un borde parejo y el texto quedaba suelto.
- **Cambio:** cada prenda vive en su placa de vidrio claro (`--vidrio-claro-*`, sin desenfoque por costo); la foto va dentro con un hilo de 1 px encima (`.pv-prenda-foto::after`); el texto, los colores y las tallas se apoyan en la placa; al pasar el mouse sube la placa entera. Todo en `apps/web/app/estilos/vidrio/vender.css`; no cambia qué hace la pantalla.
- **Verificado:** ERP local en escritorio (4 columnas) y a 375 px (2 columnas), claro y oscuro, sin desbordes; `tema-tokens`, `tema-colores`, `hover-con-mouse`, `unificar`. La base local no trae fotos reales de prendas (solo el mosaico de la categoría): falta mirarlo con las fotos de tu catálogo.
