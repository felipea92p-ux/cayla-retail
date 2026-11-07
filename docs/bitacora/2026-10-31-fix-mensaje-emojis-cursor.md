## 2026-10-31 (Tienda web ▸ Pedidos: los emojis del mensaje se insertan donde está el cursor)
Qué hice: en «Mensaje predeterminado», los botones de Nombre, Tienda, Código y emojis insertaban siempre al final del texto. Al apretar un botón la caja pierde el foco y el código solo respetaba el cursor si la caja seguía enfocada. Ahora recuerda la última posición del cursor (`onSelect`/`onBlur`/`onChange`) y inserta ahí.
Qué se verificó: `eslint` y `tsc` limpios sobre el archivo. No se probó a mano en el navegador.
Qué queda: probarlo con un clic en medio del mensaje; sin migración ni cambio de reglas.
