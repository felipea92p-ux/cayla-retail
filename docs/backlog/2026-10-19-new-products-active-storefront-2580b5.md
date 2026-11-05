## Producto nuevo nace visible en la web (ADR-0457)

- [x] **Migración `20261019214000` pegada en producción el 2026-10-19** con el OK de Felipe (ensayo revertido; función y dos disparadores verificados, mismo md5 que el archivo).
- [ ] **Decisión de Felipe:** los ~79 modelos que hoy no tienen fila siguen apagados (no se rellenó nada). ¿Se encienden de una vez los que se pueden vender?
- [ ] Verlo con una alta real en «Nuevo producto»: crear una prenda con tallas y precio y comprobar que sale con el interruptor encendido en Tienda web ▸ Vitrina.
- [ ] 13 escenarios de `pruebas:vitrina-web` ya fallaban antes de este cambio en la base local (el precio de «Blusa Emma» en la base local no es el del seed); no son de esta rama.
