# 2026-10-09 · Catálogo ▸ Productos en el celular

- **Qué:** a 375 px la primera prenda empezaba a ~630 px (cabecera en dos filas, «Ordenar» y «Tamaño» con fila propia). Ahora empieza a ~470 px: la frase bajo el título se esconde (queda el «!»);
  Grilla/Tabla y Rótulos quedan en su ícono junto a «Nuevo producto» (una fila); «Ordenar» y «Filtros» son dos cuadrados junto al buscador;
  el conteo, el enlace y «Tamaño» (dibujos de 1 · 2 · 3 columnas) comparten una fila. Desde `sm` todo conserva su palabra.
- **Cómo:** `SegmentoEnlaces soloIconoEnCelular`, `DesplegablePildora soloIconoEnCelular`, `FiltrosProductos junto` (lo que acompaña al conteo).
  El tamaño pasó de estado de `ProductosGrilla` a `useTamanoGrilla` (`components/SelectorTamanoGrilla.tsx`) para que el control viva en la barra
  y las tarjetas en la grilla. En escritorio «Tamaño» también sube a la fila del conteo.
- **Verificado:** navegador a 375 px (claro y oscuro) y 1280 px: tamaño, orden (con punto si no es el de fábrica) y la hoja de Filtros.
  El aviso de React «key … passed a child from ProductosPage» ya estaba antes de este cambio (sale igual sin el selector).
