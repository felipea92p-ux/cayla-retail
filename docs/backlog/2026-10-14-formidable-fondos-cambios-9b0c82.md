## Compras ▸ Fondos por rendir: los cambios 2 y 3 de /formidable (2026-10-14) — rama `claude/formidable-fondos-cambios-9b0c82`

ADR-0362, decisiones 81 y 82. Informe: `docs/formidable/compras-fondos.md` (tercera vuelta).

- [x] Cambio 2: la lista de lo rendido que no se lee lo dice («Volver a intentar»), y «Aprobar» espera a verla.
- [x] Cambio 3: el faltante dice en cuánto queda la deuda; «dice S/ X · por aprobar»; «Revisar» en secundario para quien no aprueba;
  «Ver tu rendición» con la explicación propia (`fn_mi_rendicion_abierta`); «Entregado», «1 gasto y 1 entrega», «Lo que entró y salió de
  su fondo», «otra persona que revise los fondos».
- [x] Producción: `20261014222000` pegada con el OK de Felipe (2026-10-14, versión de allá `20261014221906`); las huellas de
  `fn_rendicion_quien_no_aprueba` (`3e23b09d…`) y `fn_mi_rendicion_abierta` (`5a796044…`) iguales a las del banco.
- [ ] Felipe: la lista aparte del informe (a quién se le entrega plata, «Gastó» con el faltante, la cabecera de Compras, «viaje», el
  ejemplo del taxi, el pie cortado de «Tu fondo», los 35 px de los botones a 375 px, que «Debes S/ 25.00» se pueda tocar).
- [x] Felipe (plata, nueva de la ciega repetida): S/ 380 en la tabla contra S/ 375 en «Registrar devolución». Decidió explicarlo en la hoja
  (decisión 83): «Los libros dicen S/ 380.00, pero a su rendición por aprobar le faltan S/ 5.00: puede devolver hasta S/ 375.00». Hecho, con
  los montos de las frases sin cortarse (`solesSinCorte`).
- [x] Fuera de esta obra: el resto del ERP escribía montos en frases con `soles` (espacio normal) y se podían partir igual. Hecho en #1093
  (ADR-0413): todo monto del ERP va con el espacio que no se parte, y `lib/montos-sin-corte.test.ts` lo vigila.
- [ ] Felipe: en la tabla de movimientos de un fondo no se ve quién hizo cada entrega (de la ciega repetida).
