# Spike visual · Módulo «Producción» (2026-09-19)

> **Corrección del mismo día (Felipe):** Producción y Compras son **módulos distintos**, no uno dentro del otro. Lo que este spike agrupa como
> «Abastecer» (Proveedores, Comprobantes, Por pagar, Recibir) es el **abastecimiento propio de Producción** —tela, avíos y maquila—, con sus
> propios proveedores y sus propios datos. **No es una copia de las pantallas de Compras** (esas conservan su diseño aprobado en
> `../compras-2026-09/`). Ver `docs/adr/0133-produccion-modulo-propio-conectado-con-compras.md`.

`produccion-modulo-spike.html` — autocontenido, ábrelo en el navegador. Datos de ejemplo, nada se guarda.
Se arma desde `src/` con `python3 src/construir.py` (estilos, datos, y una vista por archivo).
Tokens reales de `apps/web/app/globals.css`; sin colores ni gradientes nuevos. Sustituye al spike
anterior (`../produccion-spike-2026-09/`), que solo cubría el tablero y los insumos.

## La propuesta de estructura

Producción pasa a ser un grupo del lateral que sigue el orden real del trabajo:

| Etapa | Pantallas | Quién |
|---|---|---|
| **Decidir** | Resumen | líder |
| **Abastecer** | Proveedores · Comprobantes · Por pagar · Recibir | líder (Recibir también el colaborador del Taller) |
| **Fabricar** | Órdenes · Insumos | líder y colaborador del Taller |
| **Medir** | Eficiencia del Taller | líder |

«Compras» deja de ser un grupo aparte. Los botones de arriba permiten «Ver como» líder o colaborador
del Taller (sin ningún monto en soles) y «Mostrar de dónde sale cada dato».

## Qué se prueba (el ciclo completo funciona)
1. **Resumen** → decisiones calculadas: faltan 16 m de lino, *pero* la factura F004-0905 ya llegó.
2. «Recibir F004-0905» → **Recibir** → se abre el lote, el saldo sube, la decisión desaparece y
   Pantalón Sol y Falda Brisa «ya se pueden cortar».
3. **Nueva orden** (Short Kuntur, «Producir ya»): cantidad y curva por talla desde ventas y stock,
   y antes de abrir: tela, avíos, costo, margen, fabricar-o-maquilar, entrega y capital.
4. **Órdenes** → cierre por talla y color; el costo real se reparte entre las buenas.
5. **Insumos** → «Pedir» → **Registrar comprobante** → aparece en Recibir y en Por pagar.
6. **Por pagar** → marcar varios → «Pagar juntos». **Comprobantes** → clic en una fila: de la factura al lote
   y de ahí a las órdenes que lo consumieron.

## Información para decidir (y de dónde sale)
| Pantalla | Responde | Fuente |
|---|---|---|
| Resumen · Para decidir | ¿qué necesita mi decisión hoy? | derivada (todo lo de abajo) |
| Resumen · ¿Qué producir? | semanas de ventas que cubre el stock por modelo | ventas + stock por talla: **deriva** |
| Resumen · ¿Alcanza la tela? | tela que hay + en camino contra lo que piden las órdenes sin cortar, con merma | **deriva** |
| Nueva orden | curva por talla, cobertura de insumos, costo, margen, entrega | **deriva** + cotización de maquila (**nuevo**) |
| Órdenes | ¿llega a tiempo? (días que faltan contra días de entrega) | **deriva** de las etapas |
| Por pagar | qué vence y cuándo hace falta caja | **existe hoy** |
| Proveedores | precio por metro, puntualidad, saldo | **deriva** de comprobantes y recepciones |
| Eficiencia | gastado contra absorbido; fabricar o maquilar; rendimiento de tela | **nuevo**: gastos del Taller y cotización |

## Lo que hoy NO existe y este spike da por supuesto (decisiones de Felipe)
1. **Renglones de insumo en un comprobante.** `compra_items.producto_id` es obligatorio: hoy una factura
   de tela no puede entrar por Compras. Se necesita `insumo_id` opcional con «uno u otro» (cambio de
   esquema; toca Compras y Taller). Es lo que permite que la factura cree la deuda *y* el lote.
2. **Destino del comprobante** (Taller / Tiendas): columna nueva. Es lo que separa la compra de tela de
   la de prenda terminada dentro del mismo módulo.
3. **Cotización de maquila externa** por modelo (D-31, hueco 3): no tiene dónde guardarse.
4. **Gastos del Taller** (sueldos fijos, servicios): `gastos` hoy no recibe filas (D-31, hueco 4).
5. **Rendimiento estándar por modelo** (metros por prenda): el spike lo trata como dato por modelo; hoy
   `bom_items` está muerta. Alternativa sin tablas: medir el rendimiento real al cerrar cada orden.
6. **Regla del menú.** El 2026-09-17 se decidió que Producción se ve solo parado en el Taller. Con Compras
   dentro, el grupo tendría que verse para el líder desde cualquier ubicación. Esta maqueta lo asume.
7. **Recibir mercadería** para quien no es líder sigue viviendo en Inventario (regla actual del lateral).

## Gestos de movimiento nuevos (prefijo `nv-`, a aprobar como ampliación)
Los del spike anterior (trazo, destello, pulso, aviso con temporizador, FLIP entre columnas, cifras y
barras que cuentan) más: **barras que crecen** en cobertura y vencimientos, y **trazo del gráfico de
línea**. Con «Reducir movimiento» todo llega al estado final sin viaje.

## Fuera de alcance
Muestras (patronaje → escalado), el traslado de lo cerrado hacia las tiendas, el formulario de alta de
proveedor, y el detalle de pagos parciales.
