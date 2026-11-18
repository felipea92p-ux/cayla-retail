## 2026-11-02 (P11 completo: el lote dice a quién se le compró y trae su nota a la vista)
- **QUÉ HICE.** En Insumos, la fila de cada lote ahora dice «compra a <proveedor>» (antes solo «compra») y muestra su nota debajo, sin esconderla: «1343 kg × 3.21 m/kg (ancho 133 cm, gramaje 234 g/m²)» cuando se compró por kilo, o «Encontré tela». El proveedor lo lee quien ve los proveedores del Taller (el líder); a los demás el lote sigue diciendo «compra». Si los proveedores no se pueden leer, nada se cae.
- **POR QUÉ ASÍ.** P11 del análisis del Taller: «s/c» y «compra» solos no dejaban revisar de dónde salió la tela. No hay migración: `insumo_lotes.proveedor_id` y `nota` ya existían y se pueden leer. La frase sale de una regla pura con prueba (`origenDeLote`).
- **QUÉ SE ROMPERÍA SIN ESTO.** Quien revisa un costo raro no sabría a quién se le compró ni cómo se convirtió de kilos a metros.
- **Se ve a propósito.** Los 9 lotes de «compra» sin proveedor (P03) siguen diciendo solo «compra»: es lo que P03 va a resolver.
- **Verificación.** `tsc`, `eslint`, vitest, y en el navegador local (sede Taller, cuenta del seed) la nota aparece en el lote de kilos. Sin ver a 375 px ni en oscuro.
