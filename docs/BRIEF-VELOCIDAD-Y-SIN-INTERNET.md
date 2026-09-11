# BRIEF — Velocidad y sin internet

> Para arrancar esta dimensión desde una sesión nueva. Escrito el 2026-09-10 y **reescrito el
> 2026-09-11** al cerrar los pasos 1 y 2. Si pasaron semanas, **verificá los números contra la
> base antes de creerle a este documento** — es exactamente el error que costó dos vueltas el
> día que se escribió la primera versión.

## De dónde sale esto

El documento *CAYLA Retail — el estándar, los doce y el camino* compara 16 sistemas en cinco
dimensiones. Felipe decidió atacarlas una por una, tomando como vara solo las celdas de
**5/5**. Ésta es «velocidad y sin internet», donde el 5/5 lo tienen Square for Retail y
Loyverse: *«qué tan rápido se siente en caja y qué pasa cuando se cae internet»*.

**Velocidad ya estaba en ~4** (131 ms de TTFB en `/inventario`, medido el 09-09) y es donde
menos queda por ganar. **Sin internet estaba en 0** y es lo que urge: la tienda tiene red
floja y el censo pone a cuatro personas escaneando durante días.

## Dónde está, paso por paso

| Paso | Estado | Dónde leerlo |
|---|---|---|
| 1. Reintentar una venta no cobra dos veces | ✅ hecho, verificado, `c22896e` | ADR-0031, `0054` |
| 2. El censo abre y cuenta con el servidor caído | ✅ hecho, verificado, `4f72fd0` + cierre del 11-sep | ADR-0032 |
| **3. Venta sin internet** | **← acá arranca la sesión nueva** | ADR-0013 §C (decidido), este brief |
| Desplegar | ⏸ nada está en `main`; Vercel despliega `main` | — |

**Lo que hay que saber del paso 2 antes de tocar el 3**, porque el 3 se construye con las
mismas piezas:

- No hay IndexedDB y es a propósito. El service worker (`apps/web/public/sw.js`) cachea el
  DOCUMENTO de `/inventario/conteo`, que ya trae el catálogo adentro. Guardar el documento
  guarda el dato. ADR-0018 había diseñado la mitad del problema (el dato local) sin la otra
  mitad (que la pantalla abra): todas las rutas son Server Components y sin red no llega ni
  el HTML.
- `navigator.onLine` miente en el caso más común de tienda (wifi vivo, servidor caído). La
  señal que no miente es la marca que el worker deja en la caché cuando sirve desde ahí
  (`/__cayla/servido-desde-cache`). `lib/sin-red.ts` arma el aviso con las dos señales.
- La cola del conteo (`localStorage`, `cayla:conteo:pendientes:v1`) sube sola: al volver la
  red, al montar, y con un latido cada 30 s mientras haya algo. **Solo se encola el fallo de
  red** (`esFalloDeRed`); un rechazo del servidor se muestra y no se encola.
- **Next caído no es Supabase caído.** El navegador escribe directo a Supabase. Para simular
  la tienda sin red en local hay que apagar los dos: `preview_stop` del Next **y**
  `docker stop supabase_kong_cayla-retail` (y volver a levantarlo después).
- Hay catálogo de prueba: `supabase/seed-pruebas/catalogo-de-prueba.sql`. 8 modelos, 38
  variantes, 86 unidades en AQP/TRU/LIM, con **prendas de una sola unidad a propósito**
  (`BLU-0001-NEG-S`, `PAN-…-NEG-L`, `VES-…-AZM-L`, `VES-…-VIN-M`, `ABR-…-GRI-M`) — son los
  casos que la venta sin internet tiene que bloquear. Se aplica con el `docker exec` de su
  cabecera; re-ejecutable.

## Las decisiones ya tomadas para el paso 3 (no re-decidir)

Felipe, 2026-09-11, con las opciones y sus precios enfrente (anotado en ADR-0013 §C):

1. **Umbral: 2 o más unidades en esta sede.** Para implementar: la venta sin red se permite
   solo si **deja al menos una unidad** en la sede — `stockAqui - cantidad >= 1` por cada
   ítem del carrito. Con cantidad 1 eso es exactamente «2 o más»; llevarse las dos de dos
   también es vender la última.
2. **Bloquea y explica, sin salida.** Ni reservar ni vender con aviso. El texto, en idioma
   CAYLA: «Sin internet no se puede vender la última unidad de esta prenda: podría estar
   vendiéndose en otra sede. Espera a que vuelva la señal, o anota la venta y regístrala
   después.»

Y una que viene de antes: **las escrituras no se replican**. La venta sin red se ENCOLA y la
registra `registrar_venta` cuando vuelve la red; `movimientos` sigue siendo la única fuente
de verdad (principio 4). Nada de descontar stock en el servidor desde el navegador.

## El diseño del paso 3, en rebanadas verificables

Cada una se ve funcionando en navegador antes de la siguiente, con el catálogo de prueba,
contra un build de producción (`.claude/launch.json` → `cayla-retail-prod`, puerto 3100).

**A. `/vender` abre sin red.** `RUTA_CONTEO` en `sw.js` pasa a ser una lista con `/vender`.
`RegistroServiceWorker` se monta también ahí. El documento de `/vender` trae «Ventas de hoy»
y la caja abierta: sin red se ven congelados, y el aviso (`avisoDeRed`, mismo componente que
el conteo) lo dice. Ojo con el `LogoutButton`: ya limpia la caché; no hay que tocarlo.
*Verificación:* servidor y kong apagados, recarga, la pantalla abre con el aviso.

**B. La venta se encola cuando la red falla.** En `RegistrarVentaModal.onSubmit`, si el RPC
falla con `esFalloDeRed` → la venta va a `localStorage` con su **token** (el `useRef` que ya
existe — es lo que hace seguro el reintento), caja, método, ítems, `creadoEn`. Se muestra el
acuse igual que una venta normal, con una línea que dice que sube sola. Un rechazo del
servidor (caja cerrada, sin permiso) se muestra y NO se encola.
*Verificación:* sin red, vender 1 de una prenda con 5 → acuse, cola con 1.

**C. La regla del umbral, ANTES de encolar.** Si algún ítem no cumple
`stockAqui - cantidad >= 1` y la red falló → bloquear con el texto de arriba, sin encolar.
Y las ventas ya encoladas **descuentan `stockAqui` en pantalla** (un overlay sobre las
`variantes` que llegan por props), para que una segunda venta sin red no vea unidades que ya
se vendieron sin subir. Sin esto, dos ventas sin red de una prenda con 2 pasan las dos.
*Verificación:* sin red, `BLU-0001-NEG-S` (1 unidad) → bloqueada con el texto; `BLU-0001-BLA-L`
(2) → una venta pasa, la segunda se bloquea.

**D. La cola sube sola.** Mismo trío que el conteo: al volver la red, al montar, latido cada
30 s. Cada venta va con su token: si la primera vez había llegado y se cortó la respuesta,
`registrar_venta` devuelve la misma venta y no duplica (ADR-0031). Un rechazo del servidor
durante la subida (la caja se cerró mientras tanto) se muestra con la referencia y se queda
en la cola — borrarla sería perder una venta cobrada. Al vaciarse: `router.refresh()`.
*Verificación:* con la cola de B y C, levantar kong y Next → `ventas` y `movimientos` tienen
las filas, el stock bajó una sola vez, el aviso se apagó.

**E. ADR-0033 y cierre.** Decisión estructural: hay una segunda cola de escrituras y una
regla de negocio en el cliente. Documentar por qué el umbral vive en el navegador (es la
única parte que sabe que está sin red) y por qué igual no es fuente de verdad.

**Lo que NO entra en el paso 3:** inventario, caja (abrir/cerrar), facturación sin red. Cada
una es una decisión aparte; la pantalla de venta tiene que decir que emitir comprobante
necesita señal.

## Trampas de este repo que hay que saber antes de tocar nada

- **Sobre producción no se afirma leyendo archivos.** Se mide (`pnpm migraciones:verificar`
  contra una foto fresca, o el conector de Supabase con `current_database()` y un conteo que
  identifique la base: producción tiene 19 variantes; local, las 38 del seed).
- **La base local no es réplica fiel de producción.** `personas` vs `public.personas`,
  `fn_puede_operar_sede` vs `puede_operar_sede`. Un cuerpo que funciona en una puede no
  correr en la otra.
- **Aplicar una migración a mano en local** exige `set search_path to retail, public,
  extensions;` + `set check_function_bodies = off;` antes, y un `alter function … set
  search_path = retail, public, extensions` después — el archivo dice `public` porque así
  corre en `db reset`, pero la local ya tiene todo en `retail`.
- **Toda migración que cambie la firma de una función** lleva su `drop function` de la vieja
  con tipos explícitos (ADR-0026), y la firma resultante se prueba por HTTP contra
  PostgREST, que es donde murió el arreglo del 10-sep.
- **`packages/database/src/types.ts` tiene parches a mano** (listados en su cabecera).
  Regenerar a ciegas los borra. Ningún entorno tiene el esquema completo.
- **El arnés de navegador necesita la pestaña visible.** React no revela el streaming ni
  hidrata sin un frame; con el panel oculto la pantalla se queda en «CARGANDO…» y parece un
  bug de la app. No lo es. Traer el panel al frente antes de dar algo por roto.
- **`.claude/launch.json` → `cayla-retail-prod`** corre `next start` en 3100 contra el build
  de `apps/web/.next`. Hay que `next build` antes; el service worker no se prueba en dev
  (los chunks no llevan hash y la caché no significa lo mismo).

## Dónde seguir leyendo

`docs/adr/0013` (§C, decidido) · `0031` · `0032` (con addendum) · `docs/BACKLOG.md` ·
`docs/BITACORA.md`, entradas del 10 y 11 de septiembre.
