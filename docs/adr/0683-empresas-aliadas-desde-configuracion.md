# ADR-0683 — Empresas aliadas: se crean, se editan y se dan de baja desde Configuración

- **Fecha:** 2026-11-21 · **Decidió:** Felipe · **Estado:** actividades 1 a 3 de 8 construidas y probadas en local; las migraciones `20261121152000`, `20261121160000` y `20261121162000` **no están en producción** (se pega con las de las actividades 2 a 7: sola, una aliada nueva rompería el Balance con su primera venta).
- **Relacionados:** ADR-0463 (empresas CAYLA y CLAURE), ADR-0505 (CLAURE solo en Lima), ADR-0542 (stock por dueño), ADR-0558 / ADR-0560 / ADR-0638 (la cuenta con Claudia y su Yape), ADR-0008 (padrón).
- **Investigación y maqueta:** `docs/investigacion/2026-11-21-empresas-aliadas-y-boleta-por-ruc.md`, `docs/maquetas/empresas-aliadas-2026-11/`.

## El problema primero

Una empresa que no es CAYLA pero vende en sus tiendas (hoy CLAURE en Lima) solo podía nacer con una migración. Felipe quiere poder sumar otra
(por ejemplo, una futura CAYLA KIDS en Trujillo) él mismo, «y que no me dé problemas cuando haga ventas»; también poder borrarla, con doble
confirmación y una semana de plazo.

## Lo que se decidió

1. **Se llaman «empresas aliadas»** (Felipe): otro negocio que trabaja junto a CAYLA. «Ramas» decía lo contrario (que son parte de CAYLA).
2. **Dónde (opción D, Felipe):** la banda de CAYLA sigue como está, arriba y de solo lectura; debajo, «Empresas aliadas» con una tarjeta por
   empresa y el botón «Agregar empresa aliada» solo ahí, a un lado del título. Las tiendas no muestran quién vende en ellas (Felipe: «Nada»).
3. **Qué se guarda:** nombre, RUC (módulo 11 de SUNAT, único, nunca el de CAYLA), razón social (del padrón o a mano), régimen, tiendas, y como
   opcionales correo, teléfono y **cuentas para cobrar** (Yape, Plin o cuenta bancaria; varias). Nunca la clave SOL.
4. **Una sola función guarda todo** (`guardar_empresa_aliada`, solo el Admin): datos, tiendas y cuentas en una transacción.
5. **Sus cuentas son de su empresa** (banco 104, saldo 0, como el Yape de Claudia): no suman a CAYLA. `cuentas_dinero.medio_ajeno` dice con qué
   se le paga en cada una.
6. **Al sumar una aliada a una tienda sin filas en `empresa_sedes`, se escribe también la de CAYLA**: si no, `fn_empresas_de_sede` dejaba de
   ver a la casa en esa tienda.
7. **Un Nuevo RUS va a una sola tienda** (el régimen opera en un establecimiento; confirmar con el contador, relajarlo es una línea).
8. **La baja (Felipe: doble confirmación y una semana):** «Dar de baja» en su hoja → una segunda hoja donde se escribe su nombre → queda para
   dentro de 7 días y se deshace desde su tarjeta. Pasada la semana, el trabajo diario `/api/empresas/bajas` (3:50 de Lima) la aplica:
   - **sin historia** (ni prendas ni movimientos, y nada la apunta): se borra de verdad, con sus tiendas y cuentas;
   - **con historia:** deja de estar activa y sus cuentas se archivan; lo que vendió y su cuenta pasada se quedan;
   - **con prendas en una tienda:** no se pide (ni se aplica), y su tarjeta dice por qué.
   Registrar otra vez el RUC de una dada de baja la trae de vuelta con su historia.

DECIDÍ «dar de baja» con borrado real solo si nunca tuvo historia.
DESCARTÉ borrar siempre (lo que se pidió al pie de la letra): una aliada con ventas dejaría sus líneas, movimientos y pagos apuntando a nada, y
los meses ya cerrados cambiarían de cifra (CLAUDE.md: nunca se borran datos con historia).
SE ROMPE SI una función que decide «¿esto es de una aliada?» pregunta `activo`: al darla de baja, su pasado volvería a contarse como de CAYLA.
Hoy `fn_item_es_de_claure` lo pregunta; la actividad 2 lo quita (la regla mira la fecha de su cuenta, no si sigue activa).

DECIDÍ un trabajo diario de Vercel para aplicar las bajas.
DESCARTÉ calcular «activa» en cada lectura: decenas de funciones leen `empresas.activo` y habría que tocarlas todas.
SE ROMPE SI el cron no corre: la aliada sigue vendiendo hasta la próxima corrida; no se pierde nada (la baja sigue anotada).

## Las 8 actividades (aprobadas por Felipe el 2026-11-21)

1. **Crear, editar y dar de baja una aliada desde Configuración** — esta.
2. Que el Balance y el Diario no se rompan con cualquier aliada (hoy la reclasificación es solo de CLAURE).
3. La cuenta con cada dueña (deuda, pagos, efectivo al cierre), una por aliada; la baja exigirá su saldo en cero.
4. Vender con cualquier aliada: cobro partido por dueña y su propio Yape o cuenta.
5. Campañas y reparto de gastos por aliada.
6. Las cifras de CAYLA sin ninguna aliada (Inicio, metas, Rendimiento, Club, Análisis, Impuestos).
7. Filtros por empresa en toda tienda con más de una (Productos, Existencias, Historial, Comprobantes, Pedidos web, Reportes).
8. Producción (Felipe pega las migraciones en orden), y el PR.

## Actividad 2 (2026-11-21): el Diario y el Balance con cualquier aliada

El Balance ya sacaba el stock de cualquier dueña que no fuera CAYLA (`fn_bal_stock`), pero el Diario reclasificaba solo lo de CLAURE: la venta de otra
aliada bajaba la 201 por una prenda que el Balance ya no contaba, y el Balance no se dibujaba. Y las reglas preguntaban `activo`.

- `fn_aliada_ventas(p_empresa, …)` y `fn_aliada_cambios(p_empresa, …)`: la lógica vigente de `fn_claure_ventas` / `fn_claure_cambios`, copiada sin tocar,
  para cualquier aliada y **sin mirar `activo`**. `fn_aliadas_ventas` / `fn_aliadas_cambios` juntan las de todas las aliadas con cuenta: las lee el Diario
  (`fn_asientos_claure`, reemplazo anclado de dos nombres).
- `fn_claure_ventas` / `fn_claure_cambios` quedan con su firma y lo mismo que devuelven, pidiéndoselo a la versión por aliada: Impuestos y la cuenta con
  Claudia no cambian hasta la actividad 3.
- `fn_movimiento_es_de_claure` (pérdidas, conteos, producción, carga inicial) responde por cualquier aliada con cuenta; el nombre se queda por sus 7 llamadores.
- **A una aliada no se le quita una tienda donde ya tiene historia** (vendió, recibió o contó ahí): el Diario la reconoce por sus tiendas, y su pasado allí
  volvería a ser de CAYLA. Si ya no vende ahí, se le da de baja.
- La migración no compara huellas md5 (las migraciones pegadas con la herramienta de Supabase pierden sus comentarios): busca trozos de la lógica que copia
  y, si no los encuentra, no aplica nada.

DECIDÍ una función por aliada y envolturas para CLAURE. DESCARTÉ que `fn_claure_ventas` devuelva las de todas: la línea «de eso, CLAURE» de Impuestos y la
cuenta con Claudia sumarían ventas de otra dueña. SE ROMPE SI una migración posterior redefine `fn_asientos_claure` entera con `fn_claure_ventas`: el Diario
vuelve a ver solo a CLAURE (lo ve `pnpm pruebas:aliadas-balance`, cuya autoprueba deshace justo eso).

Verificación: en una copia desechable de la base local puesta al día con `main` (`ensayo_aliadas`; la compartida no se tocó), `pnpm pruebas:aliadas-balance`
11/11, `pruebas:balance-claure` 16/16, las 18 `pruebas:claure-*`, `fuera-de-cayla` 52/52 e `igv-ventas` 26/26. `finanzas-alcance` y `redondeo-efectivo`
fallan igual con y sin esta migración en esa copia (le faltan migraciones de producción), así que no son de aquí; el CI las corre contra la base completa.
`claure_igv_lo_pone_cayla.mjs` suma el deshacer de este cambio antes de volver a pegar la suya.

## Actividad 3 (2026-11-21): la cuenta con cada dueña

Lo que CAYLA le debe a una aliada se calculaba solo para CLAURE, y los pagos (`movimientos_dinero` 'pago_claure') y el efectivo que se queda la dueña al cerrar
(`caja_traslados` 'claudia') no decían a quién: con dos aliadas, pagarle a una bajaba la deuda de la otra.

- `movimientos_dinero.empresa_id` y `caja_traslados.empresa_id` (los de antes, de CLAURE) con un candado: un pago o un efectivo de la dueña sin su aliada no se
  guarda. Los llena un disparador **«siempre»** (también con los disparadores apagados, como en una carga o una prueba) con la aliada que manda la pantalla
  (`x-aliada`, `conAliada` en la web) o, si no manda ninguna, la única con cuenta (en esa tienda, para el efectivo). Con dos y sin elegir: «Elige a qué empresa
  aliada». `cerrar_caja` y `registrar_movimiento_dinero` no cambian de firma.
- `fn_aliada_filas / _cuenta / _cuenta_desde / _pagos / _gastos / _gastos_base / _saldo_a / _cierre (p_empresa, …)`: la lógica vigente de las de CLAURE,
  copiada, con pagos y efectivo filtrados por su aliada; `fn_aliadas_saldo_a` (la proyección de caja descuenta lo de todas), `fn_aliadas_cierre` y
  `fn_aliadas_con_cuenta`. **Las de CLAURE no se tocan:** la pantalla publicada hoy y sus 18 pruebas siguen igual; cuando la web nueva esté publicada quedan
  sin uso y se borran aparte.
- No se da de baja una aliada con su cuenta fuera de cero (ni al pedirla ni al aplicarla).
- **Web:** Cuentas y dinero tiene una pestaña por aliada con cuenta (`/finanzas/dinero/claure?empresa=<clave>`) con su cuenta, «Pagar a <nombre>» (el pago
  viaja con su `x-aliada`) y sus textos con su nombre (`deAliada`: con CLAURE no cambia nada). El cierre de caja muestra un bloque por aliada de la tienda y
  ofrece «Se queda con <dueña>» por cada una. Si la base todavía no tiene las funciones por aliada, todo se lee de CLAURE como antes.
- **Cambia una cosa a la vista:** «Pagar a CLAURE» ya no está en el «Registrar movimiento» general de Dónde está (no sabría a qué aliada): se paga desde la
  pestaña de cada una (y desde el cierre de caja, que lleva a ella).

DECIDÍ un encabezado y un disparador «siempre» para decir de qué aliada es un pago. DESCARTÉ un parámetro más en `cerrar_caja` y `registrar_movimiento_dinero`
(dos firmas a la vez son ambiguas para PostgREST, y son de las más usadas) y DESCARTÉ leer un pago sin aliada como de CLAURE (volvería a escribir «claure» en
lógica general). SE ROMPE SI alguien inserta un pago con un rol que se salta los disparadores «siempre» (no existe en la app): el candado lo rechaza.

Verificación: en la copia de la base al día con `main`, `pnpm pruebas:aliadas-cuenta` 12/12 (dos aliadas a la vez), las 18 `pruebas:claure-*`,
`balance-claure`, `aliadas-balance` y `fuera-de-cayla`; `_deshacer_aliadas.mjs` deja que las de CLAURE vuelvan a pegar sus migraciones encima. Toda la suite de
`apps/web` y Knip en verde. En el navegador, con la base local compartida (que no tiene las funciones por aliada), la pestaña de CLAURE se ve como siempre.
**No verificado en el navegador:** la pestaña de una segunda aliada y el cierre con dos aliadas (la base compartida no tiene la migración del 2026-11-15 sobre
la que se apoyan estas; la prueba de la base sí los cubre).

## Actividad 4 (2026-11-21): el cobro al número de cada dueña

**El problema.** La regla de ADR-0638 es que lo de una aliada por Yape o Plin se le paga a su dueña, pero el pago se sellaba siempre en la cuenta de
CAYLA y la pantalla solo decía qué número dar (y solo sabía de CLAURE). Una aliada que cobra por transferencia ni siquiera podía recibirla: una cuenta
ajena solo aceptaba Yape y Plin.

**Lo que hace.** Felipe pidió «tener las dos opciones»: en un ticket con prendas de una aliada, cada pago de Yape, Plin o transferencia pregunta
«¿A qué número pagó?» con la cuenta de la dueña ya marcada si todo es de ella (o si el pago es justo su parte), y la cajera la cambia con un toque;
lo que entró mal se sigue corrigiendo con «Corregir pagos». Si la clienta igual pagó a CAYLA, se anota lo que pasó (Felipe, 2026-11-21).
- Base (`20261121164000`): la pantalla manda lo elegido en el encabezado `x-cuentas-pagos`; el disparador que sella cada pago lo usa si la cuenta es
  de una aliada de esa tienda y recibe ese medio; si no, sella como siempre. Una cuenta de aliada acepta transferencias. `fn_cuentas_de_aliadas_en_sede`
  le da a la caja los números.
- Web: `lib/cobro-por-dueno-reglas.ts` reparte el ticket por empresa (cualquier aliada) y propone la cuenta; `HojaDeCobro` dibuja la pregunta como
  «¿Con qué máquina?»; el aviso «Dale el número de …» dice el nombre de la aliada (Claudia para CLAURE, igual que antes).

DECIDÍ un encabezado leído por el disparador del pago. DESCARTÉ aceptar la cuenta en `registrar_venta` (la función más parchada del ERP, con doce
pruebas que fijan su texto) y una columna nueva en el JSON de pagos (cambia el contrato de la venta en línea y sin conexión). SE ROMPE SI un mismo
medio se parte en dos números (la hoja tiene una línea por medio: un ticket de dos empresas pagado todo por Yape a dos números se corrige con
«Corregir pagos») o si la venta se sube sin conexión (llega sin el encabezado y se sella en CAYLA, como hoy).

## Actividad 5 (2026-11-21): las campañas y el reparto de gastos con cualquier aliada

**El problema.** Ocho funciones de ofertas decidían «salvo que sea de CLAURE» con su id escrito a mano: las prendas de una aliada nueva pasaban
como si fueran de CAYLA y una campaña les bajaba el precio sin que su dueña lo supiera. Y el reparto de gastos (qué parte de la luz o del
alquiler es de la aliada) existía solo para CLAURE.

**Campañas.** Cada aliada tiene «Entra a las campañas de CAYLA» (`empresas.entra_a_campanas`), un interruptor en su tarjeta de Configuración que
solo cambia un Admin. **Nace apagado**: una aliada nueva queda fuera de toda campaña, también de las ya activas. CLAURE queda encendida (ya
entraba). La casilla de la oferta pasa a «Incluir las de <aliada>» (o «las de las aliadas» si entran varias). La regla vive en una función,
`fn_campana_alcanza_empresa(empresa, incluye)`, que las ocho llaman; en la web, `entraALaOferta`.

DECIDÍ un interruptor por aliada más la casilla de siempre en cada oferta. DESCARTÉ una lista de aliadas por oferta: cambia la firma de las
cuatro `guardar_oferta*` y el JSON de las ofertas, las funciones más parchadas del ERP. SE ROMPE SI se quiere una campaña con CLAURE pero no
con otra aliada encendida en la misma tienda: hoy se limita la campaña a una tienda o se apaga a la otra mientras dure.

**Gastos.** `gasto_reparto_aliadas (empresa_id, categoria, pct)` guarda el reparto de todas (CLAURE se copió). Una aliada nueva empieza en 0 %.
En una tienda, entre todas no pasan de 100 % por categoría. El Diario, la cuenta de cada dueña y «lo que falta del mes» leen esta tabla.
Configuración ▸ Gastos muestra un bloque «Reparto con <aliada>» por cada una. `gasto_reparto_claure` se mantiene igual para CLAURE mientras
existan las `fn_claure_*` (se borran juntas).

SE ROMPE SI a una aliada se le suma una tienda donde otra ya tiene su parte: la suma puede pasar de 100 % hasta que alguien la corrija (el
candado está al guardar el reparto).

## Actividad 6 (2026-11-21): las cifras de CAYLA sin ninguna aliada

**El problema.** La regla «¿esta línea vendida es de una aliada?» (`fn_item_es_de_claure`, `fn_lineas_de_claure`) y las cifras que la usan (calidad de
lo vendido, compras del Club, Observatorio, «lo que falta del mes») preguntaban por CLAURE **activa**. Una aliada nueva habría inflado las cifras de
CAYLA con sus ventas, y al dar de baja a una aliada todo su pasado habría vuelto a ser de CAYLA: meses cerrados cambiando solos.

**Lo que hace (`20261121173000`).** «De una aliada» es de cualquier empresa que no es CAYLA, con cuenta, desde su arranque, activa o dada de baja. El
mismo trozo se reemplazó en las seis funciones, con su cuenta comprobada contra producción. «Lo vendido de aliadas en un período» (Impuestos, Estado de
resultados) suma a todas (`fn_aliadas_ventas`), y «lo de hoy» que el Inicio deja fuera (`fn_claure_de_hoy`) se rehízo sobre la regla de línea. Los
nombres de las funciones no cambian. En la pantalla, «De eso, S/ X es de …» (Dónde está) suma lo que se le debe a todas, y los textos nombran a la
única aliada o, si hay varias, a «las empresas aliadas».

DECIDÍ cambiar la regla y dejar los nombres. DESCARTÉ renombrar a `*_de_aliada`: veinte llamadas y sus pruebas, sin cambiar un número. SE ROMPE SI
alguien registra como «aliada» una sede de la propia CAYLA: sus ventas saldrían de las cifras de CAYLA.

## Verificación

- `pnpm pruebas:empresas-aliadas` — 35/35 en Postgres local (cada caso en su transacción, con ROLLBACK).
- `lib/empresas-aliadas-reglas.test.ts` — 16/16; la guía de foco coincide con la validación.
- En el navegador (local, cuenta Admin del seed): crear una aliada en Trujillo con su Yape, verla en su tarjeta, pedir la baja escribiendo su
  nombre, ver «Se da de baja el 28-nov» y deshacerla. Claro, oscuro y 375 px.
- Toda la suite de `apps/web` en verde con las guías y la huella de Configuración al día; Knip limpio.
- **No verificado:** producción; el cron en Vercel; una aliada con historia dada de baja de punta a punta en la pantalla (sí en las pruebas de la base).
