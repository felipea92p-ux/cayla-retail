## Producto nuevo nace visible en la web (ADR-0457)

- [ ] **Pegar `supabase/migrations/20261019214000_vitrina_producto_nuevo_nace_visible.sql` en producción** (con el OK de Felipe): una sola parte, re-ejecutable, solo funciones y dos disparadores. **No está aplicada.**
- [ ] **Decisión de Felipe:** los modelos que hoy no tienen fila en la vitrina siguen apagados (no se rellenó nada). ¿Se encienden de una vez los que se pueden vender?
- [ ] Verlo con una alta real en «Nuevo producto»: crear una prenda con tallas y precio y comprobar que sale con el interruptor encendido en Tienda web ▸ Vitrina.
- [ ] 13 escenarios de `pruebas:vitrina-web` ya fallaban antes de este cambio en la base local (el precio de «Blusa Emma» en la base local no es el del seed); no son de esta rama.
