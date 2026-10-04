# ADR-0330 · Recibir mercadería: la llegada manda, la factura se une después

- **Fecha:** 2026-10-04 · **Estado:** Aprobado por Felipe (dos preguntas: «Una puerta, factura después» y «Por regularizar en
  Existencias», las dos recomendadas; y la lista de seis actividades de `/construir`).
- **Origen:** Felipe, 2026-10-04, con la captura de `/recibir` vacía: «esta parte de recibir mercadería es tan complejo e inútil que
  ni yo, que soy el fundador y que estoy programando a la vez, lo entiendo». Análisis previo: `docs/pantallas/recibir.md`
  (2026-10-03, 5,0/10).
- **Producción:** **la fase 1 no tiene migración.** Usa `recibir_lote` y `recibir_envio` tal como están. La fase 2 (abajo) sí
  cambia la base y se propone aparte.
- **Reemplaza:** de ADR-0035, la regla «la factura es el eje de la **recepción**». La parte del **pago** (la deuda sale de la factura)
  no cambia.
- **Complementa:** ADR-0111 (Ingreso sin comprobante: deja de ser la excepción y pasa a ser la puerta), ADR-0113 (recibir por envío:
  queda como la rama «viene con factura»), ADR-0139 (reparto por tienda: vive dentro de esa rama), ADR-0179 (prendas sin registrar),
  ADR-0299 (los traslados se reciben en Traslados: no cambia), ADR-0328 (lo recibido entra primero al almacén; las ventas sin
  registrar son limpieza de arranque).

## Problema

Producción, en solo lectura, el 2026-10-04:

| Forma de meter stock a una tienda | Dónde vive | Uso real |
|---|---|---|
| Recibir mercadería (contra factura) | Compras / Inventario | **0** (`compras`, `envios`, `lotes` en 0) |
| Ingreso sin comprobante | enlace gris dentro de Recibir → `/inventario/recibir` | **0** |
| Nuevo producto con su stock (`carga_inicial`) | Catálogo | **571 filas, 789 prendas** |
| Ajustar stock «reposición» / «otro» | Existencias | 35 filas (el atajo) |
| Recibir un traslado | Traslados | 196 filas |

1. **La pantalla empieza por el papel, no por la caja.** Para recibir, alguien que ve Compras tenía que registrar antes la factura;
   sin factura, `/recibir` decía «No hay comprobantes con mercadería pendiente de recibir» y la salida real era un enlace de 12 px a
   otra pantalla de otro módulo. En la tienda la pregunta es otra: «llegó una bolsa, ¿cómo la meto?». R-07
   (`docs/datos/15-COMO-OPERA-CAYLA.md`) ya decía que más del 30 % de las compras llega sin factura y que la factura «se le pega
   después si llega»; la implementación no siguió esa receta.
2. **Diez ideas para recibir una caja:** comprobante, envío, guía, reparto por tienda, prendas fuera de comprobante, faltante, cierre
   con motivo, nota de crédito por reclamar, «Recibiendo en» y montos visibles o no.
3. **La tercera pestaña no era de recibir.** «Por regularizar» son ventas de prendas que no estaban en el sistema (247 pendientes, 0
   regularizadas; AQP con 14 prendas cargadas y 170 ventas sin registrar). Es una diferencia de stock que deja Vender.

## Decisiones

```
DECIDÍ: una sola puerta, «Llegó mercadería», en /recibir. Dos preguntas —¿de quién? (proveedor) y ¿qué llegó? (escanear o
        buscar, cada lectura suma 1)— y se recibe en la sede de la cabecera. Lo recibido entra al almacén (ADR-0328: primero
        al almacén) y la pantalla ofrece después «Imprimir etiquetas» y «Bajar al piso». El motor es `recibir_lote`, sin cambios:
        una transacción, token contra el doble clic, cola sin conexión.
DESCARTÉ: (a) pulir la pantalla actual —contadores en las pestañas, un estado vacío que explique, sin jerga—: seguía exigiendo
        que el papel existiera antes que la caja y dejaba dos puertas para lo mismo; (b) esconder Recibir hasta el primer envío
        real: ese día no habría puerta lista y se seguiría usando Ajustar stock como atajo.
SE ROMPE SI: una sola factura trae prendas para TRU y AQP y cada tienda recibe su parte sin factura: el líder tendrá que unir una
        factura a dos llegadas de dos sedes. La fase 2 tiene que aceptar una factura ↔ varias llegadas desde el primer día.
```

```
DECIDÍ: la factura es una opción de la puerta, no un requisito. Si el proveedor elegido tiene facturas pendientes para esta
        sede, la puerta pregunta «¿Viene con la F001-123?»; «Sí» abre el conteo contra factura de hoy (`RecepcionEnvio` y
        `recibir_envio`, sin cambios: reparto, faltante con motivo y nota de crédito viven ahí); «No» sigue sin factura.
DESCARTÉ: borrar la recepción contra factura: es lo mejor construido del módulo (una transacción, no deja recibir más de lo
        facturado con `compras_no_sobrerecibida`) y será la rama normal cuando las facturas se registren a tiempo.
SE ROMPE SI: quien recibe contesta «No» a una factura que sí venía y después otra persona recibe esa misma factura: la caja entra
        dos veces. Lo frena el aviso de la actividad 3 (el mismo proveedor ya entró hoy en esta sede) y, del todo, la fase 2.
```

```
DECIDÍ: el costo por prenda lo escribe solo quien ve el dinero de Compras (`verDineroCompras`, ADR-0126); los demás reciben sin
        costo. Una línea sin costo no toca el costo de la prenda (`recibir_lote`, 20260930122000); el costo llega con la factura.
DESCARTÉ: pedirle el costo a quien recibe en la tienda: no lo conoce, no debe verlo, y un cero de más contamina la prenda en las
        tres sedes.
SE ROMPE SI: la factura nunca se une a la llegada: esas prendas quedan con el costo que tenían antes (o sin costo) y su margen es
        desconocido. La fase 2 es la que lo cierra; mientras no exista, el líder puede recibir con costo desde la misma puerta.
```

```
DECIDÍ: «Por regularizar» se muda a Existencias: /inventario/por-regularizar, con la misma lista, un botón con el número en la
        cabecera de Existencias, y los avisos del Inicio y del Observatorio apuntando ahí. /recibir?vista=por-regularizar
        redirige.
DESCARTÉ: ponerla en Ventas junto a Caja: quien vendió terminaría cuadrando su propia venta (ADR-0328: nadie regulariza su
        propia venta, salvo el líder); y dejarla en Recibir: mezclaba ventas con recepción.
SE ROMPE SI: la portada «Para hoy» de ADR-0328 (actividad 8) reescribe la cabecera de Existencias y se pierde el botón: la cola
        vuelve a ser invisible. Se le avisa a esa sesión para que «Para hoy» se quede con la entrada; el Inicio sigue avisando.
```

```
DECIDÍ: la sede de Recibir es la de la cabecera (el selector de sede de arriba). Se quitan el selector «Recibiendo en» y el
        parámetro ?ubicacion=.
DESCARTÉ: mantener los dos: dos reglas para lo mismo, y la puerta sin factura ya usaba la sede de la cuenta (análisis, tarea #8).
SE ROMPE SI: un líder recibe para otra tienda sin cambiar la sede de arriba: entra donde está parado. La puerta dice la sede en
        el botón («Recibir en Tienda TRU»), que es lo último que se lee antes de confirmar.
```

## Fase 2 · unir la factura a una llegada ya recibida (por proponer)

No se construye en este ADR. Lo que tiene que cumplir, para que la fase 1 no la vuelva imposible:

- **Una tabla nueva** que une llegada (`lotes`) y línea de factura (`compra_items`). No se puede rellenar
  `movimientos.compra_item_id` después: `movimientos` solo crece y nunca se edita (ADR-0042, ADR-0055).
- **Una factura ↔ varias llegadas, de varias sedes** (el reparto de ADR-0139), con el mismo candado de no recibir más de lo
  facturado (`compras_no_sobrerecibida`).
- **Recalcula el costo** de la prenda al unir, todo o nada, y la firma quien ve el dinero de Compras.

## Lo que no cambia

`recibir_lote`, `recibir_envio`, `regularizar_prenda` y la lista de Por regularizar. Traslados (ADR-0299). El Recibir de Producción
(`/produccion/recibir`). El módulo `recibir` y sus dos entradas del menú (Compras para quien ve el dinero, Inventario para quien
no). La deuda con el proveedor sigue saliendo de la factura (ADR-0035).

## Orden de construcción

0. Este ADR y la fila de la sesión.
1. La puerta «Llegó mercadería» en `/recibir`.
2. La factura como opción.
3. «Llegó esta semana» debajo, y el aviso de la misma caja dos veces.
4. Por regularizar en Existencias.
5. Cerrar las puertas viejas: `/inventario/recibir` redirige, sin pestañas, sin «Recibiendo en», registros de las pruebas.

## Cómo se verifica

Cada actividad, en el navegador local con la base local: recibir 3 prendas de un proveedor en TRU sube 3 en el almacén con su
movimiento de entrada; con una factura de prueba la puerta la ofrece y sin factura no; el enlace viejo de Por regularizar llega a
Existencias; `pnpm test` en verde.
