## 2026-11-09 (Tres funciones de producción vuelven al repo)
Qué hice: medí producción contra `main` por el conector, solo lectura. De `main` no faltaba pegar nada, pero cuatro funciones corrían en
producción con un texto que no estaba en ninguna rama, PR ni carpeta de trabajo. La migración `20261109171000` escribe en el repo tres de
ellas tal como corren hoy (`corregir_pagos_venta`, `tienda_looks`, `tienda_probador`, leídas con `pg_get_functiondef`). En una base con todas
las migraciones de `main` más esta, sus huellas son las mismas que en producción. Dos pruebas se ajustaron a ese texto:
- `vitrina_looks`: el mutante «los looks ignoran la tienda elegida» cambia ahora la línea que elige la tienda;
- `tienda_empresas`: antes de volver a pegar las migraciones del 21-oct, rehace el probador que ellas conocieron, como ya hacía con el catálogo.

Por qué así: una migración que recreara una de ellas desde el repo la habría devuelto a la versión vieja sin ningún error. En Historial de
ventas se habría perdido el candado del mes cerrado y la cuenta de cada pago. Se copió el texto de producción en vez de reescribirlo: es lo que
ya usan las tiendas. La cuarta, `tienda_catalogo`, no entra: copia adentro la regla de «lo nuevo» y la de «lo más vendido», y la prueba que
vigila que esas reglas vivan en un solo lugar (`pruebas:tienda-club`, N3) se pone en rojo con ella. Eso se decide aparte.
Cómo verificas tú: `pnpm migraciones:deriva` contra producción ya no lista esas tres. Siguen `tienda_catalogo` y lo que otras ramas aún no
suben (tickets compartidos, verificación de pagos web y el arreglo de `cerrar_produccion_con_motivo`).
