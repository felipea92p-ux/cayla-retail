
## 2026-11-23 (El texto del ERP en tres tonos: tinta, secundario y tenue, y el café fuera del texto)
Qué hice: apliqué en todo el ERP la «B · Tinta en tres tonos» que Felipe eligió mirando la lámina de escalas (ADR-0694). Dos tokens nuevos,
`secundario` (tinta al 80 %) y `tenue` (al 64 %), y `taupe-profundo` pasa a valer lo mismo que `secundario`; `tema.css` traduce las 13
opacidades de antes y el café (`text-taupe`) a esos tonos en un solo lugar, en vez de los dos pisos de ADR-0336.
Por qué así: con la traducción no hubo que tocar ninguna pantalla y se ve igual que la foto que Felipe eligió (medido: 0 textos bajo 4,5:1 y,
en oscuro, 46 débiles para APCA contra 94). El texto escrito a mano en los CSS de pantalla no lo alcanza, como en la lámina: se pasa al tocar
cada archivo.
Felipe se lleva: en oscuro el texto que acompaña se lee mejor y ya no compiten el gris y el café; en claro casi no cambia. Código nuevo
escribe `text-secundario` o `text-tenue`. No cambia nada en CAYLA Dynamic.

## 2026-11-23 (Las cifras de DM Sans en Inter, solo los dígitos)
Qué hice: puse delante de DM Sans una Inter recortada a los dígitos 0–9 (`app/fuentes/inter-cifras.woff2`, 7 KB, OFL), cargada con
`next/font/local`, `unicode-range` y sin fuente de respaldo. Es la «B · Inter en las cifras» de la lámina (ADR-0694, act. 2026-11-23).
Por qué así: DM Sans no trae cifras tabulares, así que `tabular-nums` no alineaba ninguna columna en DM Sans. Con el recorte, las letras, los
signos y la Garamond no cambian, y alinean también las cifras que lo piden desde un CSS (162 en las 9 pantallas medidas al armar la lámina), no solo las de la clase. Medido en 38 pantallas a 1440 px y 5 a 375 px:
nada se corta, desborda ni baja de línea, salvo el N.° de documento de Compras (columna de 7,5 a 8 rem, ya no cabía «F001-00000000»).
Felipe se lleva: los montos de una columna quedan con los decimales en la misma vertical. En el texto corrido los dígitos también son de
Inter, más que en la lámina, que solo cambió las columnas; en las fotos casi no se nota. No cambia nada en CAYLA Dynamic ni en la tienda.
