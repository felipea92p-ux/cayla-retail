# ADR-0662 — Existencias en dos tiempos (la lista antes que «Hoy») y la medición por tramos

**Fecha:** 2026-11-13 · **Estado:** aprobado por Felipe (las dos cosas, en este orden y en el mismo PR, pedidas desde la sesión que siguió
el informe `docs/innovacion/2026-11-13-cambiar-de-modulo.md`). Rama `claude/existencias-dos-tiempos`. Solo web: sin migración.
**Sigue a:** ADR-0654 (el cronómetro del clic), ADR-0328 act. 7 (el motor del piso), ADR-0185 (la página no se encoge bajo el mouse),
ADR-0149 / ADR-0623 (loader único; cambiar de pantalla dibuja el esqueleto), ADR-0424 (qué se registra y qué no).

## El problema

Inventario ▸ Existencias tarda 2,9–4,0 s de clic a contenido en producción (`tiempo_de_pantalla`, ruta `/inventario`, 2026-11-13), aunque
ese mismo día se publicaron #1831 (la lectura de stock de 716 a 134 ms), #1822 (el plan del piso de 908 a 770 ms) y #1823 (la identidad en
un viaje). Desde Perú cada petición tiene un piso de ~0,5 s (la red de Vercel entra por `iad1` y la función corre en `gru1`). No se sabía en
qué se iban los otros ~2 s: la base, el tamaño de la página o el dibujo en el navegador. Y la página esperaba TODAS sus lecturas antes de
dibujar: las prendas, que ya estaban, esperaban a la más lenta, el plan del piso (`fn_piso_plan_lectura`, 0,77 s de media).

**Analogía CAYLA.** La encargada abre la tienda y no deja entrar a nadie hasta tener la lista de «qué colgar hoy»: las prendas ya están en el
riel, pero la puerta espera al papel. Ahora la puerta abre con el riel a la vista y la lista llega un momento después, en su lugar.

## Decisión

### 1. Medir por tramo, en producción (`lib/medir-tramos.ts`)

Cada carga de `/inventario` deja UNA línea `existencias_tramos` en el registro del servidor, como `finanzas_resumen_ms`:

```json
{"evento":"existencias_tramos","sede_id":"…","lista_ms":384,"total_ms":388,
 "tramos":{"persona":{"ms":119,"fin":119},"ubicaciones":{"ms":26,"fin":150},"existencias":{"ms":125,"fin":275},"plan":{"ms":130,"fin":280}, …},
 "bytes":{"panel":214886,"plan":20013}}
```

- Cada lectura de la página se envuelve con `medir(nombre, promesa)`, que devuelve la misma promesa (no cambia qué responde ni si falla) y
  anota cuándo empezó y terminó, contado desde que empezó la página. `ms` es lo que duró; `fin`, cuándo terminó: con `fin` se ve qué lectura
  estuvo en el camino largo (el ritmo arranca cuando llegan las prendas; el reparto, cuando llegan las empresas).
- `lista_ms`: cuándo estuvo lo que se dibuja primero (la marca `lista`, justo antes del `return`). `total_ms`: cuándo terminó la última.
- `bytes`: el largo en UTF-8 del JSON de las props de `InventarioPanel` y del plan recortado (aproximado: no es el paquete exacto de React).
- La línea se escribe con `after()` de `next/server` (el primero del repo): corre cuando la respuesta ya terminó y no suma nada a la espera.
  Si algo falla ahí, solo se pierde la línea.
- **Sin datos personales (ADR-0424):** nombres de tramo, ms, bytes y el id de la sede. La prueba de `lineaDeTramos` exige que no haya otra llave.
- Se lee con `vercel logs … --query existencias_tramos --json` (Vercel Pro guarda 24 h), como `tiempo_de_pantalla` (ADR-0654).

**Lo que mostró en local** (base del seed, `next dev`, 4 cargas en caliente): `persona` 119–212 ms y `ubicaciones` 20–44 ms van en fila antes
de todo; la lectura más lenta del `Promise.all` fue `danadas` (`getPrendasDanadasPendientes`, 149–584 ms), no el plan; y «Ver el valor a
costo» (`getValorInventario`) arrancaba recién cuando TODO había respondido: era el último tramo, en fila. **Arreglado en este PR:** arranca
con las demás (su resultado se sigue esperando donde se usa). Las cifras de producción las dirá la línea; local no las reemplaza.

### 2. Existencias en dos tiempos (`lib/existencias-plan-panel.ts`, `components/existencias/usePlanDelPiso.ts`)

- La página ya no espera al plan. Le pasa al panel la **promesa** del plan, recortada a las tallas de la sede (`planDelPanel`: un objeto que
  viaja, no un `Map`). React la manda por el mismo hilo de la respuesta.
- El panel la espera **sin suspender** (`usePlanDelPiso`): ni `use()` (dejaría el panel entero detrás del plan) ni un `<Suspense>` alrededor
  del panel (al llegar el plan, React cambiaría el panel de reserva por el de verdad y se perderían lo escrito en el buscador, el foco y la
  prenda abierta). El panel se dibuja una vez; el plan solo cambia sus datos. Probado escribiendo «blusa» antes de que llegue: la lista se
  filtra, la URL lleva `?q=blusa` y, al llegar el plan, el texto y el foco siguen ahí.
- `aplicarPlan` (pura) junta el stock con el plan y dice en qué va: `no_aplica` (Taller) · `calculando` · `listo` · `fallo`. **«Calculando»
  no es «N/D»:** «calculando» = viene en camino; «N/D» = no respondió (el aviso `TEXTO_PLAN_FALLO`, el mismo de antes).
- Tras un refresco (colgar, o una venta en otra caja, ADR-0603) llegan stock nuevo y una promesa nueva. Hasta que llega el plan nuevo, el
  anterior sigue valiendo para las tallas que **no cambiaron** (el motor decide con lo libre en piso y almacén); solo las que cambiaron dicen
  «calculando». Así una venta en otra caja no pone a calcular toda la pantalla y una talla recién colgada no dice «Por colgar · 0 uds».
- Mientras el plan llega, dicen «calculando» (la pieza `<Calculando>` de `components/Esqueleto.tsx`: una banda del tamaño de lo que viene, sin
  texto a la vista, «Calculando» para el lector): la columna «Hoy» (tabla por talla y por prenda), las cifras de los atajos «Por colgar» y
  «Sin stock atrás», el anillo «N de M hoy» (que además **no guarda la foto del día** sin plan), la fila «Calculando qué colgar hoy» de
  «Para hoy» y, con un caso de «Hoy» puesto (un atajo o un enlace con `?hoy=`), el conteo y la lista misma (la sombra de una fila de
  tarjetas con su rejilla y su alto), nunca un «Nada por colgar».
- **El aviso del piso sin cuadrar sale desde el principio.** Lo adelanta la capacidad (`fn_capacidad_piso.cuadrado_en`), que llega con la lista
  y lee la misma fecha del último cuadre que el plan. Cuando el plan llega, manda su `enPausa`. Con el plan caído, el aviso sigue si la
  capacidad lo sabe (antes se callaba: es un dato que sí se conoce).
- **El orden de la lista del día** (lo vendido ayer primero) llega con el plan. La PRIMERA vez solo reordena las tarjetas si la persona todavía
  no tocó, desplazó ni tecleó en la lista; si ya lo hizo, espera a su próximo cambio de vista (un filtro, una página, tarjetas ↔ tabla):
  reordenar bajo el dedo le cambiaría la tarjeta que iba a tocar (ADR-0185, `listaQueOrdena`). Los refrescos siguientes ordenan como siempre.
  Hoy ninguna tienda cuadró su piso, y con el piso en pausa la lista del día va vacía: en producción todavía no reordena nada.

### Lo que se midió en el navegador (Chromium sin cabeza, 1440 px, plan demorado 4 s a propósito solo en la copia local)

- La lista a los ~0,4–0,6 s, hidratada a los ~0,9 s; «Hoy» a los 4,3 s. Ningún loader global en toda la carga, ni al entrar con un clic desde
  Movimientos (esqueleto a los 0,23 s, pantalla a los 0,66 s).
- Nada se mueve cuando llega el plan: CLS 0 en la vista de entrada y 0,0001 con `?hoy=` puesto, después de ajustar el lugar de cada cifra.
- Con el plan caído: «calculando» hasta que responde y después «N/D» y el aviso, como antes.
- Un `router.refresh()` con el plan ya puesto no vuelve a poner nada en «calculando».

## Alternativas descartadas

- **`<Suspense>` alrededor del panel, con el panel sin plan como reserva.** Lo pidió el planteo como opción. Al llegar el plan React desmonta la
  reserva y monta el panel de verdad: se pierden lo escrito, el foco, la prenda abierta y la página de la lista. Romper eso para ganar medio
  segundo no vale.
- **`<Suspense>` solo alrededor de las piezas que dependen del plan.** El plan no es una pieza: decide el filtro, el orden, las cifras, el anillo y
  cada fila. Partir el panel en islas que lo lean cada una por su lado sería reescribirlo.
- **Que el servidor pinte el plan si ya llegó** (leer `promesa.status`): si el navegador hidrata antes de recibir ese trozo, el HTML y el primer
  render no coinciden. Las bandas se ven hasta que el panel se hidrata, también cuando el plan llegó antes; es el costo de no arriesgar eso.
- **Reservar el lugar del aviso «"Hoy" no se pudo calcular»** mientras el plan llega: en el caso normal (el plan responde) ese lugar se cerraría y
  la página se encogería bajo el mouse. Se acepta que, solo si el plan falla, el aviso empuje la lista hacia abajo (CLS 0,013 medido).

## Lo que queda (backlog de la rama)

- Leer 24 h de `existencias_tramos` en producción y decidir el siguiente paso con números de verdad.
- `persona` y `ubicaciones` van en fila antes de todo: `getUbicaciones()` podría arrancar a la vez que la identidad.
- Si el ritmo reciente resulta estar en el camino largo, partirlo como el plan (ya espera a las prendas).

## Actualización 2026-11-13 (b): el Ritmo reciente también llega después

**Lo que mostró la línea en producción** (8 cargas de TRU, versión `86f6926f3`): la lista estaba a los 1,5–2,4 s y la pantalla a los 3,3–4,8 s
(`tiempo_de_pantalla`). Las prendas terminaban a los 0,6–1,1 s; lo que seguía en el camino de la lista era el **ritmo** (`fn_ritmo_reciente_json`
con las 1.953 tallas de la sede), que arranca cuando llegan las prendas y tardaba **0,9–1,5 s más**. El plan ya no frenaba (llega a los 1,9–3,1 s,
aparte). El ritmo solo alimenta dos columnas de la tabla («Cobertura piso» y «Ritmo reciente»), la línea «¿Cómo se vende?» del panel de la talla, el
aro de la talla «principal» cuando hay un filtro puesto y la descarga: era el caso que este ADR dejó anotado («si el ritmo resulta estar en el
camino largo, partirlo como el plan»).

**Decisión.** Igual que el plan: la página le pasa al panel la **promesa** del ritmo (`lib/existencias-ritmo-panel.ts:ritmoDelPanel`, un objeto que
viaja) y el panel la espera sin suspender (`components/existencias/useRitmoReciente.ts` → `aplicarRitmo`, pura y con su prueba). Mientras llega,
las dos columnas y «¿Cómo se vende?» dicen «calculando» (`<Calculando>`); la descarga escribe «Calculando» en esas celdas, no un «—» que se leería
como «sin dato». Si no responde, «N/D» y el mismo aviso de antes (`TEXTO_RITMO_FALLO`).

- **La cobertura se calcula en el panel**, con el piso que la fila tiene ahora (`calcularCoberturaPiso`), y no en el servidor: tras un refresco
  (colgar, una venta en otra caja) llega el piso nuevo y la cobertura lo sigue sin esperar otro ritmo. `getRitmoRecientePorVariante` ya no recibe
  el piso ni devuelve la cobertura.
- **Tras un refresco, el ritmo anterior sigue valiendo** hasta que llega el nuevo (son 7 días: una venta casi no lo mueve). A diferencia del plan,
  no se compara el stock: solo una talla que el ritmo anterior no traía dice «calculando».
- **La línea `existencias_tramos` suma `bytes.ritmo`**: el ritmo ya no viaja dentro de las props del panel (cada talla trae sus 7 días), así que
  `bytes.panel` baja y su peso se ve aparte.

**Lo que se midió en local** (servidor de desarrollo, base del seed, el ritmo demorado a propósito solo en la copia local): con el ritmo demorado
8 s, la lista se ve a los ~0,65 s y el panel responde al clic a los ~0,7 s, igual que sin demora; las dos columnas muestran la banda hasta que
llega y después sus cifras. El bloque «calculando» de «¿Cómo se vende?» mide 60 px y es lo último del panel: al llegar crece hacia abajo (a
113 px en una ventana de 688 px, donde el texto ocupa dos líneas), sin mover nada de arriba. **En producción, lo que diga `existencias_tramos`:**
se espera la lista cerca de cuando terminan las prendas (~0,7–1,1 s en vez de 1,5–2,4 s).

**Junto con el 2026-11-14 (`claude/existencias-ritmo-y-plan`, en main antes de este PR):** ese cambio encontró la causa del ritmo lento (`hoyLima`
armaba un formateador en cada llamada: ~1 s de CPU por carga) y lo hizo arrancar con las cantidades delgadas de la sede en vez de la lista
entera. Los dos se suman: el ritmo arranca temprano y es rápido, y además la lista no lo espera. Al juntarlos, el ritmo sigue arrancando con
`pisoDeCadaTalla` (solo sus tallas) y midiendo `ritmo_rpc` / `ritmo_calculo`, pero ya no recibe el piso: la cobertura sigue en el panel.
