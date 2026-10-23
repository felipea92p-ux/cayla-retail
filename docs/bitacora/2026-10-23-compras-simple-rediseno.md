## 2026-10-23 (Compras simple: rediseño visual, pago ahora o después y la ronda de compras — ADR-0480)
Qué hice: el rediseño de la maqueta `docs/maquetas/compras-formidable-2026-10/`, en 8 actividades. Mi plata pasa a ser una billetera con una sola lista. «Compré ropa» abre una hoja por prenda, con la tienda elegida por prenda. Revisar compras es una bandeja con el detalle al lado. Recibir pregunta «¿Son estas?» con el papel fijo a la izquierda. Encima, tres pedidos de Felipe mirando, cada uno con su migración:
- la foto del papel, opcional (`20261023180000`);
- «Pagar ahora / Pagar después» con Yape, efectivo o transferencia, y pagar una parte (`20261023181000`);
- la **ronda de compras** con serie RC (`20261023183000`): la abre la compradora y, al cerrarla, reemplaza a «Terminé por hoy».
Por qué así: Felipe aprobó la maqueta «tal cual». El pago y la ronda los decidió con el cuadro: lo que falta lo paga Compras desde Por pagar. La ronda se llama «Ronda» porque «orden de compra» ya es el pedido a un proveedor (ADR-0362), y lleva serie y número, no «Ronda 3». La función de cierre conserva su nombre para que la web vieja no falle entre la migración y la publicación.
Qué se rompería sin esto: sin ronda, Compras no puede revisar «todo lo de este viaje» (un viaje dura días y el cierre era por día). Sin «pagar después», una compra a crédito bajaba de la plata de la compradora como si la hubiera pagado.
Estado: commits en `claude/compras-simple-rediseno`; las tres migraciones, en producción desde el 2026-10-23 (verificadas por md5). Lo verificado:
- 592 archivos de vitest en verde, Knip limpio;
- `pruebas:compras-simple-dia` 14/14 y `responsable_omitido` 18/18 en el banco;
- en `compra`, `recibir` y `revisar` solo fallan cifras que arrastra la suciedad conocida del banco: el fondo de 60 de Sandra y compras de prueba;
- guías recorridas y auditor de oscuro en 0, a 1440 y 375;
- en el navegador: compra con pago parcial en efectivo, abrir ronda → gasto → cerrar ronda.
