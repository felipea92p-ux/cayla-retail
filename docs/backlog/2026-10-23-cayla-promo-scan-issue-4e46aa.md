## Lecturas que pasarán de 1.000 filas y todavía no se pagina (2026-10-23)

Salen de la auditoría del tope de PostgREST (ver la bitácora del mismo día). Hoy no fallan porque el módulo no tiene datos; el día que los tenga, cortan sin error. Receta: `leerTodas` con un orden que desempate, o `leerRpcPorPaginas` (`lib/rpc-por-paginas.ts`) si es una RPC.

- **Recibir mercadería** — `lib/compras.ts` `getLineasCompra`: `lineas_compra_operativo` y `compra_items_resumen .in("compra_id")` con hasta 50 facturas por página; 50 facturas × decenas de líneas pasan de 1.000. Hoy `compra_items` está vacía. Se rompe: faltan líneas en las facturas del final, «Todo llegó» y el valor por recibir salen mal.
- **Taller ▸ Insumos** — `lib/insumos.ts`: `insumo_lotes` y `movimientos_insumo` sin paginar, y el saldo (`saldoDeInsumo`) se suma en la app: al pasar de 1.000 movimientos se cortan los más viejos y el saldo de tela sale mal. Alternativa: leer el saldo de `v_insumo_saldos`. Hoy 0 filas.
- **Calidad de ventas** — `lib/calidad.ts` `fn_calidad`: una fila por producto vendido más tallas, orígenes y un «total» al final del orden; un corte a 1.000 se llevaría primero el total. Hoy 44 productos en la ventana.
- **Exportar clientas** — `lib/clientas-acciones.ts` `exportar_clientas` (`SETOF clientas`): hoy 58 filas. No paginar por PostgREST (cada página anotaría «exportó N» en Actividad): devolver `jsonb` cuando se acerque a 1.000.
- **Ventas del Equipo de hoy** — resuelto leyendo el día completo con el cursor de `fn_actividad` (hasta 2.000 filas); lo ideal es una agregación en SQL (`fn_comercial_colaboradoras`) en vez de sumar actividad en el navegador.
- **Una pregunta de diseño para Felipe:** `fn_diario` trae ~8.000 líneas al navegador solo para «De dónde sale» de una cifra. Ahora se leen por páginas (funciona), pero lo sano es una RPC que agrupe por regla y devuelva las 6 mayores.
