## 2026-11-17 (El ERP en teléfonos de gama baja, Fase 1)
Qué hice: el cronómetro del clic anota la clase del equipo; modo liviano automático (2 GB, o 4 GB táctil, o ahorro de datos) con su botón;
aviso «Actualiza el navegador» sin `color-mix()`; 19 CSS de otros módulos llegan solo a su pantalla; el marco baja de 936 a 626 KB. ADR-0674.
Por qué así: Catálogo, Compras, Inventario y Ventas también se usan desde teléfonos baratos y el ERP solo se había medido en el Mac mini.
Felipe se lleva: reservar el ADR-0674 (el remoto no aceptó la etiqueta desde la nube); la ganancia del modo liviano se ve en un teléfono real.

## 2026-11-17 (Fase 1 en producción; Fase 2 empezada y traspasada)
Qué hice: la Fase 1 pasó por `/milimetro` (0 graves; la letra del aviso, corregida) y se publicó (PR #1916, `fe7bc7c8`). Fase 2: el ticket de Vender
sobrevive a que Android cierre la pestaña (foto en `sessionStorage`, vuelve a «En espera»; borrada al salir el cobro), en la rama, sin PR.
Por qué así: lo único que hoy hace perder una venta en un teléfono barato; reusa `retomar()` en vez de restaurar a ciegas.
Felipe se lleva: el traspaso para otra cuenta está en `docs/backlog/2026-11-17-confident-gauss-v6tzn7.md` (Mis compras diseñado, 7–9 pendientes).


## 2026-11-17 (Fase 2: Mis compras tampoco pierde lo anotado; 6a verificado con dos pestañas)
Qué hice: la compra que se anota en «Compré ropa» sobrevive a que Android cierre la pestaña (vuelve donde iba, con su mismo identificador);
si ya se había guardado, no se recupera y lo dice. Vender (6a) probado con dos pestañas. Rama `claude/confident-gauss-continue-f86c75`.
Por qué así: conservar el identificador es lo que impide que la compra se guarde dos veces; la base ya no repite uno que existe.
Felipe se lleva: abrir el PR (publica), decidir si un «cobro en duda» que no se registró devuelve el ticket a la espera, y el teléfono real.

## 2026-11-17 (Fase 2, actividad 7: Caja, Apartados y Mis compras ya no cargan la pantalla de Vender)
Qué hice: `money` y el ícono de cada medio salieron de la pantalla de Vender, y con ellos el arrastre: Compré ropa −33 % de JavaScript,
Caja −26 %, Apartados −21 %. En Vender, GSAP, «Cerrar caja» y «Prenda sin registrar» bajan recién cuando hacen falta (−10 %).
Por qué así: se midió antes de tocar y la causa era un import de una línea, no los modales; lo de cobrar sin conexión se queda fijo.
Felipe se lleva: los cortes que faltan (Caja: historial de cierres y registrar gasto; Existencias; Nuevo producto; Recibir) y el teléfono real.
