## 2026-10-20 (Los looks de la tienda online son por tienda)
Qué hice: la base ahora decide qué look se ve según la tienda elegida: sale solo si todas sus prendas, en su color, tienen algo libre ahí. Migración `20261021010000` (reemplazo de `fn_tienda_looks_json`), vacío nuevo en «Arma tu look» y pruebas: 75/75 en `pruebas:vitrina-looks`, `tienda_ficha` 48/48.
Por qué así: antes el look salía en Lima aunque su falda solo estuviera en Trujillo, y la bolsa recién avisaba al final. Es la misma regla de «hay» de la ficha, por color, no una copia (ADR-0468).
Felipe se lleva: nada cambia en producción hasta que pegues la migración.
