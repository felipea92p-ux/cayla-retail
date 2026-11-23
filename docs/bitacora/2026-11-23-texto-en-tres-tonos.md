
## 2026-11-23 (El texto del ERP en tres tonos: tinta, secundario y tenue, y el café fuera del texto)
Qué hice: apliqué en todo el ERP la «B · Tinta en tres tonos» que Felipe eligió mirando la lámina de escalas (ADR-0694). Dos tokens nuevos,
`secundario` (tinta al 80 %) y `tenue` (al 64 %), y `taupe-profundo` pasa a valer lo mismo que `secundario`; `tema.css` traduce las 13
opacidades de antes y el café (`text-taupe`) a esos tonos en un solo lugar, en vez de los dos pisos de ADR-0336.
Por qué así: con la traducción no hubo que tocar ninguna pantalla y se ve igual que la foto que Felipe eligió (medido: 0 textos bajo 4,5:1 y,
en oscuro, 46 débiles para APCA contra 94). El texto escrito a mano en los CSS de pantalla no lo alcanza, como en la lámina: se pasa al tocar
cada archivo.
Felipe se lleva: en oscuro el texto que acompaña se lee mejor y ya no compiten el gris y el café; en claro casi no cambia. Código nuevo
escribe `text-secundario` o `text-tenue`. No cambia nada en CAYLA Dynamic.
