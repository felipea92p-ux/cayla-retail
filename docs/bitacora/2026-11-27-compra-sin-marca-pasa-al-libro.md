## 2026-11-27 (Una compra con prendas sin marca vuelve a pasar sola al libro)
Qué hice: aflojé el candado de las líneas del comprobante (`compra_items`) para que una prenda sin marca, con su categoría, entre al libro; la
migración `20261127152000` va con su prueba (`pnpm pruebas:compra-sin-marca-pasa-al-libro`) y la receta para destrabar los 5 papeles que
se quedaron en «por completar». Sin pegar en producción.
Por qué así: desde ADR-0646 y ADR-0660 «sin marca» es un valor legítimo (la categoría es obligatoria, la marca no); el candado de la tabla
quedó en la regla de octubre y era lo único que seguía pidiendo marca. Arreglarlo en la base destraba lo ya atascado; exigir la marca en la
pantalla habría revertido una decisión de Felipe y no destrababa nada.
Felipe se lleva: pegar la migración (una parte, re-pegable) y después el `select retail.fn_papel_pasa_solo(...)` del PR, que crea los
comprobantes de esas 5 compras y asienta lo que se pagó desde el fondo de quien compró.
