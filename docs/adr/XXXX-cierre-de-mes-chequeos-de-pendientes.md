# ADR-XXXX · Cierre de mes: cuatro chequeos de pendientes por sede (avisan en octubre, frenan desde noviembre)

- **Fecha:** 2026-10-22 · **Estado:** CONSTRUIDO en la rama `claude/cierre-chequeos-diferencias`, sin subir. Decidido por Felipe el 2026-10-22.
- **Número provisional.** El nombre del archivo lleva `XXXX` a propósito: el número se reserva con `pnpm reservar adr` al abrir el PR (ADR-0381)
  y se renombra con `git mv`; el texto no se refiere a sí mismo por número.
- **Migración provisional:** `20261023121500_cierre_mes_chequeos_de_pendientes.sql` (se reserva con `pnpm reservar migracion`).
- **Prueba:** `pnpm pruebas:cierre-diferencias` (74 casos) y `apps/web/lib/cierre-reglas.test.ts` (los textos de la pantalla).

## El problema

El primer cierre de mes de Finanzas es el de octubre de 2026. Un mes cerrado congela su diario con una huella y es lo que recibe el contador.
Antes de cerrar, el semáforo (`fn_cierre_mes_estado`) mide el dinero y el diario (cajas, egresos, gastos fijos, bancos, planilla, diario), pero no
cuatro cosas del inventario y de Compras que dejan el mes "a medias" y que, una vez cerrado, ya no se pueden arreglar sin tocar un mes congelado:

| Pendiente | Por qué importa al cerrar |
|---|---|
| Un envío recibido con un faltante que el proveedor nos debe y nadie resolvió («Nos debe») | La deuda existe y no está resuelta; el mes se congela sin que nadie la haya mirado. |
| Un conteo de inventario sin cerrar | Su ajuste de stock entra con la fecha de CUANDO se cierra, no de cuando se contó. |
| Una prenda de más de un traslado «por revisar» (ADR-0404) | No está en el stock de nadie hasta que un líder decida de dónde salió. |
| Una factura de mercadería cuya mercadería no llegó | El diario ya la debe (cuentas 201 / 4011 / 421, por la fecha de la factura) pero la prenda no está en el stock. |

La regla de Felipe es **«nada en silencio»**: ninguna diferencia queda congelada en un mes cerrado.

## La decisión

```
DECIDÍ:     Cuatro chequeos por sede (alcance `ubicacion`) en `fn_cierre_mes_estado`: `envios_con_diferencia`, `conteos_abiertos`,
            `sobrantes_traslado` y `facturas_sin_recibir`, con la forma de los demás (`clave`, `ok`, `bloquea`, `datos`). Se miden
            SIEMPRE (con cero pendientes salen `ok = true`: un ✓ es la prueba de que se miró). `bloquea` es false si el mes es
            anterior a la fecha de corte y true desde ese mes. En octubre de 2026 AVISAN (el aviso se guarda en `periodo_cierres.avisos`);
            desde noviembre de 2026 FRENAN el cierre. La fecha de corte es un PARÁMETRO: `parametros_finanzas.cierre_pendientes_bloquean_desde`
            (date, NOT NULL, siempre día 1, de fábrica 2026-11-01), leído por `fn_cierre_pendientes_bloquean_desde()`; no está escrita en la función.
DESCARTÉ:   (a) Una fila en `parametros_tributarios`: es una tabla de VIGENCIAS (cifras que entran al diario con efecto hacia atrás, con el
            candado de «no alcanzar un mes cerrado»); la fecha de corte de un chequeo no es una cifra tributaria. (b) Escribir el corte en la
            función: cambiarlo sería pegar SQL en producción otra vez, y el primer cierre que frena es el de noviembre. (c) Una RPC
            `guardar_…` y un campo en Configuración: hoy se cambia a lo más una vez, sería una función sin llamador (Knip) y mover el candado
            quedaría a un clic. Se cambia con un UPDATE explícito que pega quien lo decide. (d) Que los chequeos aparezcan solo cuando fallan
            (como `regularizar`): el ✓ ausente no distingue "no hay nada" de "no se miró", y el anillo de «cuánto falta» no los contaría.
SE ROMPE SI: alguien mueve la fecha hacia adelante para poder cerrar sin resolver nada (el aviso igual queda guardado en el cierre, pero ya no
            frena); o un envío reabierto (`reabrir_envio` baja sus diferencias de `vigente`) queda abierto sin cerrar: mientras lo está,
            no tiene diferencias vigentes y este chequeo no lo ve.
```

## Qué cuenta cada chequeo (y por qué así)

Todos miden el estado de AHORA, pero solo de lo que ya existía al terminar el mes que se cierra. Lo creado después no frena un mes anterior (si
no, cerrar octubre esperaría las operaciones de noviembre y nunca cerraría). Por eso un mes viejo solo puede **bajar** con el tiempo, nunca crecer.

- **`envios_con_diferencia`** — `despacho_diferencias_vigentes` con `tipo = 'faltante'` y causa `no_vino` o `devuelta` cuya cantidad aún supera lo
  resuelto en `proveedor_deuda_resoluciones`: exactamente la definición de «Nos debe» (`fn_nos_debe_resumen`). `se_perdio`, `otra_sede` y los sobrantes ya
  traen su causa dicha al recibir y no tienen una resolución por hacer. Se mide de la tabla y no de `fn_nos_debe_deuda`: esa función une con la orden, el
  proveedor y la categoría con uniones internas, y una diferencia que no una desaparecería del conteo sin avisar. Sede = la que recibió el envío; el
  envío se fecha por `coalesce(abierto_en, creado_en)` y no por cuándo se grabó la diferencia (reabrir y volver a cerrar un envío graba diferencias
  nuevas con fecha nueva, y un faltante de octubre saldría de octubre). `datos`: `n` (envíos), `unidades`, `monto` al costo.
- **`conteos_abiertos`** — `conteos.estado = 'abierto'`, sin los de prueba (la base ya impide más de uno abierto por sede). `datos`: `n`, `desde`, `numero`.
- **`sobrantes_traslado`** — `traslado_sobrantes.estado = 'por_revisar'`. Sede = la que recibió (la prenda de más está en su piso). `datos`: `n`
  (traslados), `unidades`.
- **`facturas_sin_recibir`** — `compras` de mercadería vigentes con `estado_recepcion` `sin_recibir` o `parcial` (la columna que ya calcula Compras y que
  cuenta una línea cerrada a propósito como resuelta). Sede = la que GESTIONA la factura, que es donde el diario la registra. `datos`: `n`, `unidades`
  por recibir, `monto` (el total de esas facturas).

## Qué toca

1. `retail.parametros_finanzas`: la columna nueva (tabla de una fila; RLS encendido y sin permisos para `authenticated`).
2. `retail.fn_cierre_mes_estado(date)`: reemplazos ANCLADOS sobre la definición VIVA. `diario` pasa de orden 9 a 13 y `huella` de 10 a 14 (solo cambia
   el orden en que se muestran). Se conservan dos parches ajenos: la puerta `fn_puede_cerrar_mes()` (ADR-0253) y `cerrada_sin_prenda` (ADR-0337).
3. `retail.cerrar_periodo(date, text, uuid)`: solo su mensaje «Todavía no se puede cerrar … falta …» aprende a nombrar los cuatro. La cuenta de bloqueantes
   no cambia: ya contaba solo `bloquea and not ok`, así que un chequeo nuevo con `bloquea = true` frena solo, y con `false` va a los avisos.
4. Web (`apps/web/lib/cierre-reglas.ts`): las cuatro claves, sus títulos, su frase con la sede («… en LIM») y su enlace; la frase cambia según el chequeo
   avise («Puedes cerrar octubre igual: el aviso queda guardado en el cierre») o frene («… para poder cerrar noviembre»). `textoChequeo` recibe la unidad
   como tercer parámetro OPCIONAL: los chequeos de siempre no la usan y su texto no cambia.

## Lo que nunca debe existir (y quién lo impide)

- Un pendiente que bloquea y no frena el cierre → `cerrar_periodo` cuenta `bloquea and not ok`. Probado.
- Un pendiente que avisa y frena → con `bloquea = false` entra a `v_avisos`. Probado.
- Un `bloquea` nulo → sin fila de parámetros, `coalesce(…, true)` frena (un cierre frenado se arregla; una diferencia congelada en un mes que no se reabre, no).
- Un chequeo nuevo que mueva la huella → la huella es del DIARIO congelado y estos chequeos no lo leen ni lo escriben. Probado: aparecen pendientes nuevos
  después de cerrar y el cierre conserva huella, líneas, totales, avisos y diario congelado.

## Números

3 tiendas + 1 taller, < 5 000 diferencias y conteos al año, unas decenas de facturas al mes: cuatro agregados por sede sobre tablas chicas, sin índice nuevo.
La función ya recorría el diario del mes entero (`fn_asientos`); lo que se suma no se nota.

## Producción

Una sola ejecución en el SQL Editor, **con el OK de Felipe**; no se aplicó. Un `alter table` de una tabla de una fila con `lock_timeout = 3s`, sin políticas ni
`drop trigger` (ADR-0195). Re-ejecutable: cada reemplazo se salta si ya está, y cada ancla debe aparecer exactamente una vez o se aborta todo.
**Antes de pegar**, comparar la definición viva de `fn_cierre_mes_estado` y `cerrar_periodo` con la de la base local de la que salió: si producción cambió, el
ancla aborta sin tocar nada. Orden: antes de cerrar octubre, y de preferencia antes de que alguien cierre un mes (un mes cerrado antes de pegarla no tiene
los avisos en su cierre).
