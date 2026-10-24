# ADR-0501 · El tipo de proveedor: mercadería o servicios

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local; migración `20261024222000` (ver «Cómo se pega»).
- **Pedido:** Felipe, 2026-10-24: Proveedores vive dentro de Compras y todo en él asume ropa, pero también hay proveedores de teléfono (Entel), luz, agua.

## El problema primero

Lo único que separaba a Entel de un fabricante de polos era una costumbre: el rubro de texto libre «Gastos» (ADR-0452). La ficha le mostraba
«prendas», «entregas atrasadas» y «devoluciones» a la luz, la lista las contaba en «Sin compras en 90 días» (11 de 13 «proveedores sin
compras» eran servicios) y nadie podía decir «muéstrame solo a quien le compro ropa» sin depender de que alguien hubiera escrito «Gastos».

## Decisión

1. **`proveedores.tipo`** (`'mercaderia'` | `'servicios'`, de fábrica `'mercaderia'`), no el rubro. El rubro sigue diciendo qué vende o presta.
2. **Siembra y coherencia con el camino viejo:** quien tenía solo «Gastos» pasa a `'servicios'`; un disparador sube a `'servicios'` a quien quede
   con solo «Gastos» (el «¿No está? Súmalo» de Finanzas) y **nunca baja** a nadie. Los sin rubro quedan en mercadería, como siempre; Felipe decide.
3. **Sin reemplazar funciones vivas.** `registrar_proveedor`, `actualizar_proveedor` y `fn_proveedores` no cambian de firma: el tipo se lee de la
   tabla (`grant select (tipo)`: la tabla no tiene `select` entero, 20261013161000) y se fija con `cambiar_tipo_proveedor` (permiso: el módulo
   Proveedores, como desactivar). Si el alta falla a medias, el proveedor queda como mercadería, un estado válido.
4. **La web:** `esDeServicios` manda el tipo y, si la lista no lo trae, cae a «solo Gastos» (así Órdenes, Recibir y Marcas siguen filtrando igual).
   La lista se parte en pestañas Mercadería / Servicios (con una búsqueda que mira en las dos); las cifras de arriba solo cuentan mercadería
   (`resumenSoloMercaderia`); el alta pregunta primero el tipo (no en Recibir/Órdenes/Marcas, donde solo se registra ropa).
5. **La ficha de servicios** no tiene prendas, entregas ni devoluciones: muestra lo que se le paga (`fn_proveedor_servicio_resumen`: comprobantes
   de `naturaleza = 'gasto'`, total de 12 meses, promedio por mes con pago, saldo, vencido, mes a mes y últimos 6).

## Lo que se descartó

- **Un tercer tipo (activos, honorarios):** no hay quien lo pida; `compras.naturaleza` ya distingue 'activo'. Se agrega cuando haga falta.
- **Ampliar `registrar_proveedor`/`actualizar_proveedor` con `p_tipo`:** obliga a reemplazar dos funciones que usa todo Compras.
- **Que el disparador también baje a mercadería:** pisaría una decisión de quien edita.

## Cómo se pega en producción

Una sola parte, sin políticas, re-pegable, con `lock_timeout`; termina con un `select` «QUEDÓ BIEN». **La base antes que la web:** la ficha y la lista
degradan sin la columna (leen el tipo aparte y caen a «Gastos»), pero el alta falla al fijar el tipo si la función no existe.
