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

## Fase 2 · unir la factura a una llegada ya recibida (diseño decidido el 2026-10-04, se construye después)

**Decisión de Felipe (2026-10-04):** primero el aviso «Llegadas sin factura» (solo web, ya construido, ver abajo); la unión se construye
con el diseño A cuando llegue la primera factura tarde (hoy hay 0 facturas registradas en producción); y una unión **se puede deshacer**
(solo la unión, no el costo).

Hoy «lo recibido» de una factura es UNA suma: los movimientos con `compra_item_id`. La leen **36 funciones, 4 vistas y 1 disparador**
de producción (consulta de solo lectura del 2026-10-04): la foto en `compras` (`movimientos_compra_foto`), el reparto por sede
(`compra_item_reparto_resumen`, `fn_compra_item_reparto_cuadra`), `cerrar_linea_compra`, `reasignar_reparto_compra`, la nota de
crédito pendiente, Por pagar… El diseño tiene que dejar esa suma como única fuente.

```
DECIDÍ: un movimiento nuevo `union_factura`, sin efecto en el stock (como `apartado`/`liberacion_apartado`), con la línea de la
        factura (`compra_item_id`), la llegada (`lote_id`), la prenda y la sede de la llegada. Lo escribe una sola función,
        `unir_llegada_a_factura(factura, llegada, pares, token)`, todo o nada, con la llegada bloqueada (`for update`) para que dos
        líderes no unan la misma llegada a la vez. Las 41 lecturas lo cuentan como recibido sin tocarlas. Deshacer = el mismo
        movimiento con cantidad negativa (el CHECK de `movimientos_cantidad_valida` lo permite solo para este tipo, como al ajuste):
        la suma sigue siendo una sola y el libro muestra las dos.
DESCARTÉ: (a) una tabla puente llegada↔línea (el esbozo de este ADR del mismo día, equivocado): parte en dos el conjunto «lo
        recibido» (movimientos ∪ puente) y las 41 lecturas tendrían que unirlos; la que se olvide muestra la factura pendiente y deja
        recibirla dos veces. (b) un cierre «ya llegó» en `compra_item_cierres`: ninguna de las 11 funciones que leen cierres distingue
        el motivo (solo `cerrar_linea_compra` lo valida al escribir), así que lo tratarían como faltante y pedirían una nota de crédito por mercadería que sí llegó.
SE ROMPE SI: una lectura nueva suma TODOS los movimientos de un lote sin nombrar el tipo y cuenta dos veces lo unido. Hoy las lecturas
        de stock nombran sus tipos (`tipo in ('entrada','salida','ajuste')`, verificado en `fn_bal_causas_mercaderia` y
        `fn_frescura_sede`); la excepción conocida es `getRecepcionesRecientes` (TypeScript), que se ajusta al construir, con una
        prueba que falla si una lectura de movimientos por lote no nombra los tipos.
```

**Rechaza:** unir más de lo que entró en la llegada sin factura (por prenda, contando las uniones anteriores: candado en la base, no
solo en la pantalla), más de lo que le falta a la factura en esa sede, una prenda que la línea no trae (variante exacta o línea
agrupada del mismo producto), otro proveedor, factura anulada. Quién: quien ve el dinero de Compras, firmando con el combo Responsable.

**El costo.** `fn_recalcular_costo_variante` es un promedio que se acumula sobre el stock del momento. Las prendas de la llegada ya
están DENTRO de ese stock, así que la fórmula de una compra las contaría dos veces: 10 Body Bonita a S/ 20 (2 de la llegada) y una
factura a S/ 30 darían (10×20 + 2×30)/12 = S/ 21,67 en vez de (8×20 + 2×30)/10 = **S/ 22,00**. La unión revalora las que siguen en
stock: `costo nuevo = costo + k·(costo de factura − costo)/stock`, con `k = mín(unidas, stock)`, en `numeric` y redondeado una sola
vez; queda en `costo_historial` con un origen nuevo (su CHECK hoy acepta solo `compra` y `produccion`). Lo ya vendido conserva su costo
(las ventas no se reescriben). Deshacer una unión no revierte el costo: otras entradas pueden haberlo movido después; queda anotado.
El balance de mercadería de Finanzas tiene que nombrar esa revaloración como causa.

**Producción, en 2 partes (ADR-0195):** 1) el tipo nuevo, el CHECK de cantidad y el origen de costo (`alter` sobre `movimientos`,
tabla en uso: va sola, `lock_timeout`, sin políticas); 2) las funciones (`security definer`, sin políticas).

### El aviso «Llegadas sin factura» (construido el 2026-10-04)

Sin un aviso, la unión sería un botón que nadie aprieta: las facturas no se registran, el IGV no se descuenta y el costo queda
adivinado. En el Inicio de quien ve «Facturas de proveedor»: las llegadas sin factura de **más de 7 días**, la más antigua en el
detalle, y lleva al historial «Sin factura». Solo cuenta las de los **últimos 60 días**: más del 30 % de las compras no trae factura
nunca (R-07, talleres de Gamarra), y un aviso que no se apaga jamás se deja de leer. Es ocultable. Marcar «esta no tendrá factura»
pide guardar algo y entra con la unión.

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

## Construido (2026-10-04, cinco commits, uno por actividad)

Todo lo de arriba, sin migración. Lo que se ajustó en el camino:

- **La pregunta de la factura es «sugerida» en la guía de foco**: la luz la marca después del proveedor, pero se puede recibir sin contestarla.
- **El historial (`?vista=recibidas`) suma «Sin factura»**: solo mostraba lo recibido contra factura, y todo lo que entra por la puerta era
  invisible ahí. Hereda la lista que tenía «Ingreso sin comprobante».
- **«Sin costo» se ve en la puerta y en el historial**, solo para quien ve el dinero de Compras (`recepciones_sin_comprobante`): es lo único
  de la pantalla vieja que valía la pena conservar, porque hasta la fase 2 lo recibido sin factura queda sin costo. La cifra mensual
  (`getResumenSinComprobante`) salió: nunca tuvo datos y nadie más la leía.
- **La página nueva se llama «Ventas sin registrar»** (el nombre con que la nombra ADR-0328); la lista de adentro conserva sus textos.
- **El botón de Existencias cuenta con el mismo alcance que su lista** (`contarPorRegularizar`, solo cuenta): un número que no coincide con la
  pantalla a la que lleva es lo que le pasó al botón de Apartados.

## Cómo se verifica

Cada actividad, en el navegador local con la base local: recibir 3 prendas de un proveedor en TRU sube 3 en el almacén con su
movimiento de entrada; con una factura de prueba la puerta la ofrece y sin factura no; el enlace viejo de Por regularizar llega a
Existencias; `pnpm test` en verde.
