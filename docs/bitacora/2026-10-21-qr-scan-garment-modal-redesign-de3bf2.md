# 2026-10-21 · Maqueta: escanear para agregar prendas a una etiqueta

- Hecho: `docs/maquetas/etiqueta-escanear-2026-10/` con tres direcciones tocables para la hoja Campañas ▸ Etiquetas ▸ Prendas (A · el lector en la caja, B · la etiqueta que se llena, C · ráfaga): pistola de verdad, cámara simulada o real (`BarcodeDetector`), revisar → aplicar con antes/después, claro/oscuro y 375 px.
- Decide Felipe: qué dirección; si una lectura marca la talla leída o el producto entero; que leer dos veces no quite; y las tres señales de movimiento nuevas (punto «Lector listo», láser del visor, etiqueta que se asienta).
- Sin código del ERP ni migración: al elegir, la pistola entra con `usePistola` + `resolverCodigoV2` y la cámara generalizando la bandeja de `EscanerCamara`; `etiquetar_variantes` no cambia.

# 2026-10-22 · Construida la B en el ERP: «la etiqueta que se llena»

- Hecho: `PrendasDeEtiquetaModal` es ahora dos columnas (catálogo · etiqueta colgada con su mosaico, total que cuenta y caja antes → después) del alto de la pantalla, sin scroll propio de 1024×768 a 1920×1080 ni a 375 px (la lista corre por dentro y el mosaico dibuja solo las piezas que caben). La pistola lee esté el cursor donde esté (`usePistola fuera="leer"`), marca solo la talla y color leída y nunca alterna (`leerCodigo`, con «Al escanear: Poner | Quitar»); la cámara sale solo en un aparato táctil y lee en ráfaga (`EscanerBusqueda continuo`). Probado en local: escanear 3 prendas → revisar → aplicar guardó exactamente esas 3 variantes, y quitarlas con el lector las liberó.
- Movimiento sin excepciones nuevas a ADR-0136: el vuelo a la etiqueta (480 ms), su asiento (420 ms) y el reacomodo del mosaico (300 ms) responden a marcar; no se hizo el punto que late ni el láser en bucle de la maqueta.
- Falta: probar la pistola real y la cámara en un teléfono de verdad, y correr `/chaos` sobre la hoja (guarda). Sin migración: `etiquetar_variantes` no cambió.
