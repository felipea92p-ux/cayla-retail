
## 2026-11-23 (El texto del ERP en tres tonos: tinta, secundario y tenue, y el café fuera del texto)
Qué hice: apliqué en todo el ERP la «B · Tinta en tres tonos» que Felipe eligió mirando la lámina de escalas (ADR-0694). Dos tokens nuevos,
`secundario` (tinta al 80 %) y `tenue` (al 64 %), y `taupe-profundo` pasa a valer lo mismo que `secundario`; `tema.css` traduce las 13
opacidades de antes y el café (`text-taupe`) a esos tonos en un solo lugar, en vez de los dos pisos de ADR-0336.
Por qué así: con la traducción no hubo que tocar ninguna pantalla y se ve igual que la foto que Felipe eligió (medido: 0 textos bajo 4,5:1 y,
en oscuro, 46 débiles para APCA contra 94). El texto escrito a mano en los CSS de pantalla no lo alcanza, como en la lámina: se pasa al tocar
cada archivo.
Felipe se lleva: en oscuro el texto que acompaña se lee mejor y ya no compiten el gris y el café; en claro casi no cambia. Código nuevo
escribe `text-secundario` o `text-tenue`. No cambia nada en CAYLA Dynamic.

## 2026-11-23 (Los tres tonos sobre la letra de ADR-0691)
Qué hice: revertí el commit de cifras de esta rama (ADR-0691 ya las trajo a `main`, igual y con el alto ajustado), traje `main` y pasé
los dos cambios de los tonos a `.claude/rules/paleta.md` y `modo-oscuro.md` (CLAUDE.md quedó corto con #1983). La prueba del fondo Seda
mide ahora `secundario` y `tenue`, y la columna del N.° de documento de Compras pasó a 8,5 rem.
Por qué así: con la letra más grande de ADR-0691, un número de SUNAT completo pide 127,9 px y la columna tenía 120: se partía en dos
líneas. Medido otra vez: 0 textos bajo 4,5:1 en claro y oscuro.
Felipe se lleva: los tres tonos de texto listos para fusionar sobre el `main` de hoy; nada de cifras duplicado.
