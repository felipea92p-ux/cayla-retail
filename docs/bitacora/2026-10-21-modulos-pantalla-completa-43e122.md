# 2026-10-21 · Tienda web a todo el ancho y «Conf. Tienda» con botón Guardar

- Tienda web sale de `CON_TOPE_DE_ANCHO` (AppShell): sus cinco pantallas van a ancho completo; `lib/ancho-completo.test.ts` la vigila como a Clientes y Producción.
- «Datos y plazos» pasa a llamarse **Conf. Tienda** (menú, título, enlace del Resumen y guía). El nombre del módulo en Roles y accesos sigue siendo «Datos y plazos de la tienda web»: cambiarlo es una migración sobre `retail.modulos`.
- Las tarjetas de las tiendas van en una sola fila (`.fin-sedes-fila`, 18 rem mínimo cada una).
- Cada tarjeta (y la de plazos) se guarda con su botón **Guardar**; ya no se guarda sola al salir de la casilla. Lo escrito y el interruptor «Se ve en la web» son borrador hasta apretarlo; el chip de arriba dice lo que ya está guardado. Guía y huella al día.
