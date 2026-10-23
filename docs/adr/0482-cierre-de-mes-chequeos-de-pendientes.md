# ADR-0482 · Cierre de mes: cuatro chequeos de pendientes por sede (avisan en octubre, frenan desde noviembre)

- **Fecha:** 2026-10-22 · **Estado:** CONSTRUIDO en la rama `claude/cierre-chequeos-diferencias`, sin subir. Decidido por Felipe el 2026-10-22.
- **Número:** ADR-0482, reservado con `pnpm reservar adr` (ADR-0381).
- **Migración:** `20261023011000_cierre_mes_chequeos_de_pendientes.sql` (versión reservada con `pnpm reservar migracion`).
- **Prueba:** `pnpm pruebas:cierre-diferencias` (100 casos) y `apps/web/lib/cierre-reglas.test.ts` + `cierre-pulso-reglas.test.ts` (los textos de la pantalla).
- **Revisión del 2026-10-22:** un revisor independiente pidió cuatro cambios (quién ve la cifra, el modal de cierre, el mes cerrado, pruebas que no mordían); están aplicados y descritos abajo.

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
            no tiene diferencias vigentes y este chequeo no lo ve (ver «Preguntas abiertas»).
```

### Una factura con la mercadería en camino SÍ frena (Felipe, 2026-10-22)

Al contestar la revisión, Felipe confirmó que `facturas_sin_recibir` frena igual que los otros tres desde noviembre. Queda como está construido.

```
DECIDÍ:     Una factura de compra cuya mercadería aún está en camino FRENA el cierre de esa sede desde la fecha de corte (noviembre de 2026),
            igual que un envío con faltantes, un conteo abierto o un sobrante de traslado. En octubre solo avisa.
DESCARTÉ:   Dejar `facturas_sin_recibir` siempre como aviso, sin frenar nunca. Costo: el diario ya debe esa factura (201 / 4011 / 421, por la fecha de
            la factura) pero la prenda no está en el stock; cerrar así congela un mes donde lo que se debe y lo que hay no cuadran, y una factura
            cuya mercadería nunca llega no se descubre jamás.
SE ROMPE SI: una compra de los últimos días del mes cuya mercadería llega después del cierre deja a la sede sin poder cerrar hasta que se reciba. Es el
            costo que Felipe aceptó. La salida normal es registrar la recepción o, si la mercadería no va a llegar, cerrar la línea a propósito
            (`estado_recepcion` la cuenta como resuelta); NO es mover la fecha de corte para ese mes.
```

## Qué cuenta cada chequeo (y por qué así)

Todos miden el estado de AHORA, filtrado por la FECHA del hecho (cuándo se abrió el conteo o el envío, cuándo se creó el sobrante, la fecha de emisión
de la factura). Lo que ocurre después de terminar el mes no frena ese mes (si no, cerrar octubre esperaría las operaciones de noviembre y nunca
cerraría). Pero la fecha del hecho no es la fecha en que se grabó: un envío abierto el 30 de junio y cerrado el 1 de julio, o una factura de junio
registrada en julio, aparecen en junio DESPUÉS de terminado. Por eso un mes viejo puede **crecer** mientras siga abierto (y frena); cuando ya se cerró,
solo se muestra (ver «Un mes ya cerrado no se frena»).

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
2. `retail.fn_cierre_mes_estado(date)` y `retail.fn_cierre_panel(date)`: reemplazos ANCLADOS sobre la definición VIVA (el panel solo en el filtro del aviso guardado). Función nueva
   `retail.fn_cierre_avisos_sin_plata(jsonb)` (pura, de uso interno).
   `fn_cierre_mes_estado`: `diario` pasa de orden 9 a 13 y `huella` de 10 a 14 (solo cambia
   el orden en que se muestran). Se conservan dos parches ajenos: la puerta `fn_puede_cerrar_mes()` (ADR-0253) y `cerrada_sin_prenda` (ADR-0337).
3. `retail.cerrar_periodo(date, text, uuid)`: solo su mensaje «Todavía no se puede cerrar … falta …» aprende a nombrar los cuatro. La cuenta de bloqueantes
   no cambia: ya contaba solo `bloquea and not ok`, así que un chequeo nuevo con `bloquea = true` frena solo, y con `false` va a los avisos.
4. Web (`apps/web/lib/cierre-reglas.ts`): las cuatro claves, sus títulos, su frase con la sede («… en LIM») y su enlace; la frase cambia según el chequeo
   avise («Puedes cerrar octubre igual: el aviso queda guardado en el cierre») o frene («… para poder cerrar noviembre»), o la unidad ya esté cerrada
   («Junio ya está cerrado: esto no frena nada»). `textoChequeo` recibe la unidad como tercer parámetro OPCIONAL: los chequeos de siempre no la usan y su
   texto no cambia. Con `monto` nulo la frase se dice sin cifra. El aviso del modal «Cerrar el mes» sale de `resumenAvisos` (ver más abajo).

## Revisión del 2026-10-22: cuatro cambios

### 1. Quién ve la cifra (permisos)

Quien solo tiene el módulo delegable «Cierre de mes» cierra el mes, pero no ve la plata de Compras: los dos chequeos con plata (`envios_con_diferencia`:
lo que el proveedor nos debe, al costo; `facturas_sin_recibir`: el total de las facturas) entregaban el `monto` igual. La escena del revisor: el rol
`integrante` recibe `cierre_mes`; `fn_puede_ver_dinero_de_compras()` da `false` y `fn_cierre_panel` devolvía 9440. Al arreglarlo apareció la misma cifra por
otras dos puertas: el aviso que se guarda al cerrar (`periodo_cierres.avisos`), que `fn_cierre_panel` devuelve dos veces (la unidad y la historia del
mes). Se reprodujo (el líder cierra con una factura de S/ 9,440 sin recibir; la cuenta delegada la lee en el panel) y se cerró con el mismo gesto.

```
DECIDÍ:     `fn_cierre_mes_estado` pregunta `fn_ve_plata_de_proveedores()` (el líder, un módulo de plata de Compras o el módulo Proveedores; ADR-0387) y,
            si quien mira no la ve, devuelve `monto` nulo en esos dos chequeos. `n` y `unidades` no son plata y se quedan. Es el gesto de la planilla
            (`fn_planilla_visible()`): el chequeo se mide y se muestra, la cifra se calla. Vale por las TRES puertas por donde sale el dato: el chequeo
            vivo, el aviso guardado de la unidad (`cierre.avisos`) y la historia del mes de `fn_cierre_panel` (`historia[].avisos`); las dos últimas pasan
            por `fn_cierre_avisos_sin_plata` (nueva, pura, de uso interno), que reescribe el `monto` de esas dos claves y deja todo lo demás igual (el
            `monto` de `cerrada_sin_prenda` es plata de VENTAS y se queda). En la web, `monto == null` dibuja la frase SIN la cifra (`numero(null)` daría
            «S/ 0», que es una mentira).
DESCARTÉ:   (a) Esconder los dos chequeos a esa cuenta: cerraría el mes sin ver que hay pendientes (rompe «nada en silencio»). (b) Una pregunta distinta
            por chequeo (`fn_puede_ver_dinero_de_compras()` para las facturas, la plata de proveedores para los envíos): dos reglas para el mismo dato,
            y quien tiene Proveedores ya ve el saldo de cada factura (20261012204000). (c) `monto` en cero: la pantalla diría «S/ 0».
SE ROMPE SI: se agrega otra cifra de Compras a estos chequeos y se olvida de pasarla por `v_ve_plata` Y por la lista de claves de
            `fn_cierre_avisos_sin_plata` (viven en dos lugares); o una cuenta sin plata CIERRA un mes con avisos: el aviso se guarda con lo que ella ve,
            sin `monto`, y esa cifra no se recupera (leer filtra; guardar no puede completar). Ver «Preguntas abiertas».
```

### 2. El aviso del modal «Cerrar el mes» (palabras)

El modal armaba «Cierras con N avisos: …» con el título de cada chequeo, y esos títulos describen el estado BUENO («Mercadería facturada ya recibida»):
la frase se leía al revés. Ahora sale de `resumenAvisos` (`cierre-reglas.ts`), con un nombre por clave escrito en negativo y sin cifras
(«envíos recibidos con faltantes por resolver · conteos de inventario sin cerrar»). Un `Record<ClaveChequeo, string>` obliga a escribir uno por cada
clave nueva, y una prueba comprueba que el modal usa `resumenAvisos` y no el título. Los chequeos de siempre (gastos fijos, bancos, planilla…) tenían
el mismo defecto y quedan arreglados por el mismo camino.

### 3. Un mes ya cerrado no se frena (consistencia)

Un envío abierto el 30 de junio a las 10 de la noche y cerrado el 1 de julio con un faltante es «de junio» por su fecha de apertura, pero aparece DESPUÉS de
cerrar junio. Con el corte en junio, la unidad cerrada pasaba a `bloqueantes = 1` y la pantalla pintaba «falta (bloquea el cierre)» sobre un mes cerrado.

```
DECIDÍ:     En una unidad con estado `cerrado`, los cuatro chequeos salen con `bloquea = false` (CTE `pb` en `fn_cierre_mes_estado`): se siguen midiendo y
            mostrando, pero no impiden nada. Una unidad `reabierta` vuelve a frenar. La frase de la pantalla lo dice: «Junio ya está cerrado: esto no
            frena nada».
DESCARTÉ:   (a) No medirlos en una unidad cerrada: se perdería el ✓ y la señal de que algo apareció después. (b) Dejar `bloquea = true` y taparlo en la
            pantalla: la base diría «1 bloqueante» de un mes que ya no se puede cerrar, y quien lee `bloqueantes` (el semáforo, el pulso) se equivocaría.
SE ROMPE SI: alguien lee `bloquea` como «este mes tiene un problema grave» y no como «impide cerrar»: en un mes cerrado solo informa; lo que importa es `ok`.
```

### 4. Pruebas que no mordían

Dos mutaciones sobrevivían a la suite: cambiar `count(distinct s.transferencia_id)` por `count(*)` en sobrantes, y quitar `- c.cerrado_cantidad` de las
unidades de facturas sin recibir. Se agregaron los casos que las matan (un traslado con dos líneas sobrantes cuenta UNO; una factura recibida en parte con
tres prendas cerradas a propósito cuenta bien las unidades), más los de los tres cambios anteriores. Cada caso nuevo se comprobó rompiendo la función a
propósito: sin el arreglo falla, con él pasa.

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
**Antes de pegar**, correr el `select md5(pg_get_functiondef(…))` que está en el encabezado de la migración («Pasos para pegar») y comparar con las huellas de
producción al 22-oct-2026: `fn_cierre_mes_estado = ea9dede5a8c7a70191867b31bd1c6f73`, `cerrar_periodo = 79873c92c0cccfa313f1196ac567b93d`,
`fn_cierre_panel = 2cfa3733629189b5a35523fd4a27e8d6`, `fn_puede_cerrar_mes = ded0baa119c7b4632ce5011ebdad0d24` (esta última no se toca). Si alguna no coincide, producción cambió y hay
que revisar antes de pegar (las anclas también abortan solas, pero un cambio que no toca un ancla pasaría sin aviso). Orden: antes de cerrar octubre, y de preferencia antes de que alguien cierre un mes (un mes cerrado antes de pegarla no tiene
los avisos en su cierre).

## Preguntas abiertas

- **Un envío reabierto o abierto sin cerrar es invisible a estos chequeos (¿quinto chequeo?).** Mientras un envío está abierto —o se reabrió y no se
  volvió a cerrar— no tiene diferencias vigentes, y `envios_con_diferencia` no lo ve; un mes podría cerrarse con un envío a medias. No se construye aquí.
- **El `monto` de un aviso que cierra una cuenta sin plata.** `periodo_cierres.avisos` guarda el chequeo tal como lo vio quien cerró. Leerlo ya se filtra
  (quien no ve la plata de proveedores recibe `monto` nulo), pero guardarlo no puede completar: si cierra una cuenta que solo tiene «Cierre de mes», el aviso
  queda sin monto para siempre, también para el líder. Guardar el monto completo pediría que el cierre lo mida con la vista de un líder (un parámetro
  interno de `fn_cierre_mes_estado`). Decide Felipe si vale la pena o se acepta que ese aviso quede sin cifra.
