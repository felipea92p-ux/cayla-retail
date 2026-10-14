# ADR-0404 · La prenda de más de un traslado queda como sobrante a revisar, fuera del stock

- **Fecha:** 2026-10-14 · **Estado:** construido y verificado en local (suite de base con control, vitest completo, la pantalla en un
  Chrome sin cabeza en escritorio, 375 px y oscuro, la guía interactiva recorrida y un ataque de concurrencia). **Las dos migraciones
  están en producción** desde el 2026-10-14 (con el OK de Felipe), verificadas por md5. Rama `claude/traslado-sobrante-5c56e1`, PR #1076.
- **Decisión de Felipe (2026-10-14):** «que la prenda de más entre como sobrante a revisar». Al preguntarle: tres salidas para la
  revisión, y mientras espera, la prenda queda **fuera del stock** (no se vende).
- **Cambia:** ADR-0173 (el cierre con diferencia metía al stock todo lo contado, D-129). **Complementa:** ADR-0356 y ADR-0401 (`/chaos` de
  Inventario: la «prenda de más» era el único hallazgo de gravedad 1 que quedaba, INV-08), ADR-0161 (permisos por módulo), ADR-0284 (guía
  de foco), ADR-0389 (guías interactivas).

## El problema

Lima envía 2 blusas a Trujillo y Trujillo cuenta 3 (o encuentra en la caja una prenda que no venía). Al cerrar el traslado con la
diferencia, las 3 entraban al stock de Trujillo y Lima seguía con su número: aparecía una prenda que no salió de ninguna sede. Además
se podía vender antes de que nadie supiera de dónde vino. En producción no había pasado nunca (4 traslados al 2026-10-14), pero
`/chaos` lo dejó como estado imposible (INV-08).

## La decisión

**Al cerrar con diferencia** (`cerrar_traslado_con_diferencia`), de cada prenda entra al stock hasta lo **enviado**. Lo contado de más
(y una prenda que no venía en la caja, entera) queda en `retail.traslado_sobrantes` como **por revisar**: no suma a Existencias ni se
puede cobrar. Lo que faltó (de menos) sigue igual: se da por perdido.

**La revisión** (`resolver_sobrante_traslado(sobrante, decisión, nota)`), de a una prenda, en el pase del traslado:

| Decisión | Qué pasa con el stock | Cómo lo leen los reportes |
|---|---|---|
| Salió de [origen] sin anotarse | Sale del origen (donde la tenga libre, primero su lugar de envío; nunca de la cuarentena) y entra al destino | Dos movimientos del traslado (`traslado_salida` / `traslado_entrada`): Movimientos los muestra con el número del traslado y Pérdidas no ve ni pérdida ni aparición, porque la prenda viajó |
| No sé de dónde salió | Entra al **almacén** del destino como «Encontré prendas», por `registrar_movimiento` (la única puerta de ese motivo: solo suma, pide nota) | Pérdidas: «apareció, a mano», igual que Ajustar |
| Me equivoqué al contar | Nada | Nada |

Pide una nota (5 a 200 letras) y quién lo decide (el combo Responsable, ADR-0162). Si el origen no tiene la prenda libre en el
sistema, «salió de allá» se rechaza y dice que se elija «No sé de dónde salió». Pedir dos veces lo mismo devuelve lo mismo
(`ya_registrado`); otra decisión sobre una ya revisada se rechaza diciendo qué se decidió. Dos personas a la vez: la segunda espera
a la primera y recibe «ya se revisó».

**Quién revisa:** el mismo permiso que cierra la diferencia (`fn_puede_ajustar_inventario`: un líder, o quien tiene Existencias,
Conteos o Traslados, ADR-0161), en la sede que recibió. La sede que envió lo ve («Llegó de más · la revisa TRU») pero no decide.

**En la pantalla:** el pase dice «Llegó de más · revísala», queda en *Te llegan* con su botón «Revisar lo que sobró» y suma al
número del menú; al reverso, la sección «Llegó de más» (`components/traslados-pases/SobrantesPase.tsx`) con la guía de foco. Antes de
cerrar, la consecuencia ya no dice que lo de más «también entra»: dice que queda por revisar, sin entrar al stock.

## Lo que cambia en la base

- `20261014175000` (parte 1): la tabla `traslado_sobrantes`, con un candado que hace imposible una decisión sin los movimientos que la
  cumplen (o con movimientos que no le tocan). RLS encendido sin políticas: solo la tocan funciones `security definer`.
- `20261014180000` (parte 2): los dos movimientos de «salió del origen» viven en una función interna (`fn_sobrante_viaja`), aparte de
  la revisión: una función que escribe «Encontré prendas» no puede tener su propio `insert into movimientos` (lo vigila
  `pruebas:cierre-carga-inicial`). El cierre nuevo (reemplazo entero con candado de md5: si alguien cambió la función, se detiene sin tocar
  nada), la revisión, las lecturas `fn_sobrantes_de_traslado` y `fn_sobrantes_por_revisar`, y un reemplazo anclado en
  `fn_perdidas_de_traslados` para que lo enviado cuente la salida de una prenda que no venía en la caja.
- INV-08 de `/chaos` pasa a vigilar que **lo que entra por un traslado salió por él** (contar de más ya no es una violación).

## Descarté

- **Que salga sola del origen** (la otra opción que se le mostró a Felipe): da por cierto lo que muchas veces es un error de conteo.
- **Que entre al stock y la revisión solo corrija:** el stock queda inflado mientras nadie revisa, y se puede vender una prenda que
  después resulta no ser de esa sede.
- **Una sububicación «por revisar» (como la cuarentena de las dañadas):** más piezas para el mismo resultado; la prenda está físicamente
  en la tienda, pero para el sistema no existe hasta revisarla, y eso alcanza.
- **Agregar la prenda a la línea del envío al decir «salió del origen»:** reescribía lo que dice la guía impresa y disparaba «Para
  enviar» (`trg_para_enviar_al_salir`). Basta con enlazar los movimientos.

## Se rompe si

- Un conteo de la sede que recibió encuentra la prenda antes de que se revise: la registra como hallazgo y, si después se revisa como
  «salió del origen», entraría dos veces. Es raro (el pase lo pide primero, con número en el menú); si pasa, la revisión correcta es
  «Me equivoqué al contar».
- Alguien vuelve a pegar una versión vieja de `cerrar_traslado_con_diferencia`: lo de más volvería a entrar al stock. Lo vigila
  `pruebas:traslado-sobrantes` (con control) y la INV-08.

## Cómo se pega en producción

Dos partes, en orden, cada una sola: `20261014175000` (crea una tabla nueva, ninguna en uso) y después `20261014180000` (solo
funciones). Sin políticas ni `drop trigger`. Antes: comprobar que `cerrar_traslado_con_diferencia` y `fn_perdidas_de_traslados` siguen
con el md5 del 2026-10-14 (`96c5a2…` y `6d7973…`, iguales en local y producción ese día). **Se pegan ANTES de fusionar la web:** la
web nueva pide `fn_sobrantes_de_traslado` y `fn_sobrantes_por_revisar` (si faltan, el pase se abre igual, sin la sección), y la web de
hoy funciona igual con la base nueva. Después: el volcado de `docs/datos/generado/` (tabla nueva) y su pájaro.
