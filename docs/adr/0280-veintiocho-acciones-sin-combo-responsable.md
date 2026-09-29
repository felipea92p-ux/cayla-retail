# ADR-0280 · Veintiocho acciones sin el combo «Responsable»

- **Fecha:** 2026-09-29 · **Estado:** propuesto, **a probar en local** por Felipe antes de tocar producción. Nada de esto
  está en producción: la migración `20260929230000_acciones_sin_responsable.sql` **no se ha pegado**.
- **Pedido:** Felipe, 2026-09-29: «necesito eliminar cierta cantidad de veces que se pide [el combo Responsable]» y, tras
  repasar los 149 lugares uno por uno: «quita para todos, pero mantén un "volver" de respaldo, para así primero probarlo
  en local; si no es lo que quería, te diré "volver"».
- **Complementa:** ADR-0161 (el combo «Responsable»), ADR-0162 (terminales sin persona), ADR-0178 (el Admin firma sin
  asistencia).

## Qué había

Con `configuracion_empresa.exige_responsable = true` (producción), toda acción que guarda pedía elegir a una persona
presente en la tienda: **149 lugares** en la web, y `fn_actor_persona_id(true)` en 148 funciones de la base. El costo se
notaba en tres sitios: el alta de producto pedía el mismo nombre hasta 9 veces seguidas, aprobar o rechazar un valor del
Catálogo pedía un nombre por cada clic, y en tienda un mismo flujo (apartar → avisar → entregar) lo repetía en cada paso.

## Decisión de Felipe

Felipe marcó **30** de los 149 lugares con «Quitar»; los otros 119 conservan su combo tal cual. «Quita para todos»: también
con una **terminal** compartida. Al ejecutarlo, **28** quedaron sueltos: dos de las 30 filas no eran lo que decía su etiqueta
(ver «Las dos que no se soltaron»).

## Decidí

DECIDÍ: un solo punto en la base y una señal explícita desde la web.
- **Base:** `retail.fn_actor_persona_id` (la única función que decide quién firma) respeta el encabezado
  `x-responsable-omitido: <clave>` **solo** si la clave está en la tabla nueva `retail.acciones_sin_responsable` (28 filas).
  Con una PERSONA firma ella misma, sin exigir marca de asistencia (como ya hace el Admin). Con una TERMINAL devuelve
  `NULL`: la acción se guarda sin persona. **Ninguna de las funciones que guardan cambió.**
- **Web:** `lib/responsable-omitido.ts` (la misma lista, comparada con la migración por `responsable-omitido.test.ts`) y
  `firmar(consulta, firmaOmitida("clave"))`. Cada pantalla suelta quita su `<ComboResponsable>` y firma con su clave.

DESCARTÉ: cambiar de `fn_actor_persona_id(true)` a `(false)` en las ~28 funciones, porque `(false)` para una terminal sigue
exigiendo responsable (así es hoy) y porque obligaba a reescribir ~28 cuerpos de función que en producción ya difieren del
repo (ADR-0126); y un interruptor global «sin responsable», porque suelta también la caja y la venta, que Felipe conservó.
También descarté tolerar cualquier valor del encabezado: sin lista cerrada, una terminal podría mandar `x-responsable-omitido`
en la caja y quedar sin nombre.

SE ROMPE SI: (1) una clave de la web no está en la base → la base la ignora y la acción falla con «Elige quién hace esta
operación», sin combo para elegir (lo vigila `responsable-omitido.test.ts`); (2) una función de las 28 tiene, o gana, un
`if v_persona is null then raise` o escribe el actor en una columna `NOT NULL` → una terminal ya no puede hacer esa acción
(hoy solo pasa con `apartar_stock` / `separaciones.creado_por`); (3) se agrega una acción nueva a la lista sin decidir a nombre
de quién queda en una terminal.

## Lo que se pierde (dicho de frente)

- **En una terminal, esas acciones quedan sin nombre de persona** (`creado_por`, `registrado_por`, `aprobado_por`… vacíos).
  Queda la cuenta y, donde la tabla lo lleva, `terminal_id`. Con una diferencia de stock en un conteo cerrado desde la
  terminal del almacén, la historia diría «terminal», no «Rosa».
- **Una persona con cuenta propia ya no tiene que haber marcado su entrada** para hacer estas 30 acciones.
- **Excepción:** **apartar una prenda** desde una terminal **sigue pidiendo responsable** (`separaciones.creado_por` es NOT
  NULL y `apartar_stock` rechaza un actor vacío). Para soltarla en terminales hay que decidir qué persona queda como
  creadora de un apartado (o aflojar el `NOT NULL` de una tabla del núcleo): pregunta abierta para Felipe.

## Las 28 acciones (lista viva: `apps/web/lib/responsable-omitido.ts`)

Tienda y Compras: apartar prenda (solo persona), aviso al apartar, recibir/confirmar/cerrar traslado, cerrar conteo,
regularizar prenda, subir y quitar adjuntos de una factura. Catálogo: los 8 pasos del alta de producto
(categoría, tejido, talla, etiqueta, color, marca, muestra, valor), confirmar cambios de la ficha, revisar un alta al vuelo,
rechazar color, talla, tejido, patrón y etiqueta, aprobar talla, cambiar el estado de una etiqueta, campaña de etiqueta, foto
de muestra, fechas del año de las temporadas y el «Aprobar / Desactivar / Reactivar» de un clic (que cubre aprobar un color,
y desactivar o reactivar colores, tallas, tejidos, patrones, etiquetas, familias, marcas y categorías).

## Las dos que no se soltaron (mi error de etiqueta, no de Felipe)

Felipe decidió sobre la lista que yo le presenté; dos filas describían mal lo que hacía el combo:
- **#40, «alta al vuelo en un conteo» (`ConteoPanel.tsx`):** ese combo es el «Quién cuenta» de TODA la pantalla del conteo
  (contar, escanear, anular, dar de alta). Quitarlo dejaba sin cómo elegir quién cuenta. **Se conserva.** Si Felipe solo quiere
  que el alta al vuelo no lo exija, se firma esa llamada como soltada sin quitar el combo (habría que sumar la clave).
- **#106, «aprobar un color» (`ColoresLista.tsx:480`):** ese combo es el del modal «Nuevo color del vocabulario». Aprobar un
  color ya va por la confirmación de un clic, que sí se soltó. **Se conserva el combo de «Nuevo color»** (Felipe dejó
  «crear» de tallas, tejidos, patrones y etiquetas con combo; el color quedó igual que ellos).

## Otras decisiones de la ejecución

- **Confirmaciones de un clic que mezclan acciones:** `ConfirmarConResponsable` deja de pintar el combo por defecto; conserva
  `control` como opcional para las confirmaciones que NO se soltaron (eliminar una marca; cambiar la temporada de una categoría
  y asignar en lote). Categorías: «Desactivar categoría» desde la ventana de edición conserva su combo; la reactivación de un clic, no.
- **Cerrar un conteo:** el paso «No está → 0» llama a `conteo_contar` una vez por prenda. Firma con quien cuenta si el combo de la
  pantalla del conteo lo tiene elegido, pero no lo exige (`conteo_contar` no lee al responsable en la base).
- **Rutas `/api/productos/*`:** reciben el `fetch` del navegador y hablan con la base con un cliente de servidor. Ese cliente
  ahora también reenvía `x-responsable-omitido` (`firmaDeEncabezados` y `createClient`, `lib/supabase/server.ts`); sin eso, las
  listas del Catálogo se habrían rechazado. Lo cubre `responsable-omitido.test.ts`.
- **Aviso de la ficha de producto:** el aviso de éxito ya no dice «Por Rosa · …» (venía del combo).

## VOLVER (la palanca que Felipe pidió)

1. **Web:** `git revert` del commit «quita 30 combos» → las 28 pantallas vuelven a pedir responsable. Es un solo commit.
2. **Base, si ya se pegó:** `delete from retail.acciones_sin_responsable;` (la base deja de respetar el encabezado), o volver
   a pegar la definición de `fn_actor_persona_id` de `20260924171300_admin_firma_sin_asistencia.sql`. Si se hace solo esto
   sin el punto 1, las 28 pantallas quedan sin combo y la base rechaza: hacer siempre el 1 primero.
   Mientras la migración no esté en producción, «volver» es solo el punto 1.

## Cómo se verifica

- Base: `pnpm pruebas:responsable-omitido` (18 casos, ROLLBACK, 28 claves; incluye «volver» con la tabla vacía y que un encabezado
  inventado para la caja o la venta no abre nada). En local sin la migración aplicada: `--en-seco`.
- Web: `responsable-omitido.test.ts` (las 28 claves son las mismas en la web y en la migración; también la ruta `/api` que reenvía la clave) y `tsc`.
- A mano, en local, antes de pegar en producción: un alta de producto con un color nuevo, aprobar y rechazar un color,
  cerrar un conteo, recibir un traslado y adjuntar un archivo a una factura — con la cuenta de una persona y con una terminal.

## Pendiente antes de producción

Pegar la migración (una parte, sin políticas ni `alter` de tablas en uso: ADR-0195; una tabla nueva con RLS sin políticas y `create or replace` de una función), refrescar el diccionario de datos
(`pnpm datos:generar:produccion`: la tabla `acciones_sin_responsable` es nueva) y verificar en producción que las 30 claves
están y que `fn_actor_persona_id` tiene la marca `x-responsable-omitido`. **Sin la migración, la web que sube este PR deja
las 28 acciones sin combo y la base las rechaza**: la migración se pega antes o junto con el despliegue de la web.

## Actualización 2026-09-29 (b) — las ocho acciones del alta ya no quedan sin nombre (ADR-0285)

En una terminal, las ocho acciones `alta_producto_*` dejaban el tejido, color, marca, talla, etiqueta, muestra, valor o
categoría nuevos sin persona («lo que se pierde», arriba). Felipe pidió que quien inicia el alta se identifique una vez y firme todo
lo que crea en ella: **dentro del alta esas acciones firman con esa persona** (ADR-0285, `useFirmaDeMitad`); la clave omitida solo
se manda fuera del alta (`alta_producto_marca` desde Marcas, la ficha y el conteo; `alta_producto_color` desde «Agregar colores»
de la ficha). Las otras veinte acciones no cambian.

