## 2026-11-13 (Fusionar productos: la hoja «La ficha que se arma», ADR-0650 act.)
Qué hice: rehíce la hoja de fusión con la dirección B que eligió Felipe: las fichas lado a lado en vidrio, la que queda en gota con su ✓ y sin cambiar de lugar; «Así va a quedar» a la derecha con la matriz color × talla (ya estaba, pasa, se junta +N); «Ver ficha» abre una hoja para comparar (galería, ventas, stock por sede, tallas, precio y alta); «Revisar y fusionar» y el sello «Fusionado». Sin migraciones: el stock por sede sale de `fn_existencias(null, ids)`.
Por qué así: Felipe vio que lo elegido era un bloque sólido que desentonaba y que las tarjetas se movían al elegir; decidió 10 preguntas y eligió B mirando la maqueta. La lógica nueva es pura y probada (`lib/fusionar-productos-ficha.ts`).
Felipe se lleva: probar la hoja en local con un par real; mirar dónde quedó «Fotos que quedan» (no estaba en la maqueta B).

## 2026-11-13 (b) (Fusionar: tallas vacías fuera de la venta, migración 20261113175000)
Qué hice: al fusionar, un color × talla sin prendas ni nada en curso se puede sacar de la venta: se muda con su historia y queda apagado; la hoja lo ofrece en «Tallas sin prendas» y la matriz deja de dibujarlo. Probado con 6 tallas en la base aislada (28/28 en la suite).
Por qué así: Felipe no quería tallas vacías en la ficha final; apagar en vez de borrar conserva las ventas.
Felipe se lleva: dar el OK para pegar `20261113175000` en producción.
