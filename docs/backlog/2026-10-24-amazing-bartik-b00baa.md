# 2026-10-24 · Historial de compras: una fila, tres pestañas (ADR-0504)

- [x] ~~Paso 1: el menú acepta varios módulos alternos~~ — hecho, sin cambio visual (`modulosAlternos`).
- [x] ~~Antes del paso 2: recorrer en local la cadena a crédito~~ — hecho en una base local privada (14/14 en `compras_simple_revisar.mjs`); vence a los 7 días, fijo.
- [x] ~~Paso 2: pestañas con `<Pestanas>`, cabecera A y una sola fila de menú~~ — hecho, con las tres guías y sus huellas.
- [ ] Con el ERP y la base locales arriba: `pnpm --filter web guias:recorrer`, `pnpm --filter web tema:auditar` (claro y oscuro) y un recorrido de clics por las tres pestañas con un líder y con un rol de solo Historial. No se pudo: Docker no respondía.
- [ ] El plazo de vencimiento a crédito es fijo (7 días): decidir si pasa a ser el plazo de cada proveedor (`proveedores.plazo_credito_dias` ya existe).
- [ ] Paso 3: textos y estados de Revisar compras (Todo al día, «Cierres», «quienes compran»). «Todas las tiendas» ya quedó en el paso 2, con la cabecera única.
- [ ] Paso 4: el Historial sin las vistas «Por pagar» y «Vencidos»; antes, ver qué pantallas enlazan a esos filtros.
- [ ] Paso 5 (PR aparte, con el OK de Felipe, toca la base): la lista de «Entregas y devoluciones» con el saldo inicial y una línea de cuadre; el saldo de cada cuenta en «Entregar plata» (decidir si solo avisa o también impide).
- [ ] Pregunta para Felipe: ¿puede Compras cerrar la ronda abierta de otra persona? Hoy las «Rondas abiertas» no tienen ninguna acción.
