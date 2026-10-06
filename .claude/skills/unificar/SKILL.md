---
name: unificar
description: Unifica el diseño del ERP CAYLA (ADR-0358, «una función, una pieza»). Recorre el ERP en LOCAL módulo por módulo con un motor que mide el DOM y captura cada pieza (botones por lo que hacen —Guardar, Cancelar, Volver…—, insignias de estado, pestañas, tablas, tarjetas de cifra, campos, combos, iconos, gráficos, avisos, estados vacíos, títulos, hojas), cuenta cuántas formas distintas hay de hacer lo mismo y dónde vive cada una, y le muestra a Felipe una lámina con las capturas lado a lado, qué cambia entre ellas y una PROPUESTA nueva dibujada con los tokens reales en claro y oscuro. Felipe elige; la elegida queda como la única pieza para todo el sistema y las pantallas nuevas, y una prueba del CI la hace cumplir. Úsala cuando Felipe diga «unificar», «hay dos botones distintos que hacen lo mismo», «que todo se vea igual», «estandarizar componentes», «sistema de diseño», o al terminar un módulo. Con un módulo (`inventario`) analiza ese módulo contra el resto; con `familia=<id>` profundiza una familia; con `todo` arma el tablero; con `migrar <familia> [módulo]` aplica una decisión ya tomada.
---

Unifica: $ARGUMENTS   (un módulo como `inventario`, `familia=pestanas`, `todo`, `migrar accion.cancelar inventario`, o sin argumento = pregunta cuál)

**Una función, una pieza.** Si dos botones hacen lo mismo y se ven distinto, la colaboradora aprende dos veces lo mismo y duda la tercera.
`/unificar` encuentra esas parejas, se las muestra a Felipe con capturas, le propone una forma mejor, y lo que Felipe elige pasa a ser la
única forma de esa función en todo el ERP, también en las pantallas que todavía no existen.

## Candados (no se negocian)

1. **Hasta que Felipe elige, solo se mira.** El censo, la lámina y la propuesta no tocan el código de ninguna pantalla.
2. **La elección es de Felipe.** Tú recomiendas una opción con su razón (la primera opción de la pregunta, «(Recomendado)»). No la tomas tú.
3. **Lo que existe por una decisión no se «corrige».** Si una variante vive por un ADR o una excepción de `CLAUDE.md` (el kit de Finanzas,
   ADR-0195; la vista rápida de producto y su movimiento, ADR-0136; los sellos de Movimientos, ADR-0353; el Observatorio, ADR-0322; la persiana
   de Caja cerrada, ADR-0301; la cabecera de cada módulo, ADR-0220), se presenta como **«decidida a propósito»** y Felipe dice si se unifica.
   `familias.mjs` lista en `gobierna` las reglas de cada familia.
4. **Migrar cambia cómo se ve, nunca qué hace.** Mismo `onClick`, mismo `submit`, mismas validaciones, mismos permisos, mismo texto salvo que
   Felipe lo pida. Si unificar obligaría a cambiar un comportamiento (un «Cancelar» que en un lado descarta el borrador y en otro no), para y pregunta.
   Dinero, stock, permisos y comprobantes/SUNAT: cualquier duda de comportamiento ahí es de Felipe.
5. **Fuera del censo:** el papel físico (`.papel-fijo`, `[data-papel]`: boleta, ticket, etiqueta, cartel del club), el color de una prenda
   (`[data-color-dato]`, las muestras de color) y el marco (lateral y cabecera, que ya es uno solo). El motor ya los salta.
6. **Solo LOCAL** con el seed (el motor se niega a otra cosa) y con el servidor de **esta** worktree (se niega a medir el de otra). No pulsa
   nada que guarde: los modales se abren con los escenarios del auditor de tema, que solo abren y cierran.
7. **La propuesta respeta el sistema:** solo tokens (ADR-0169, ADR-0336), movimiento sin rebote ni bucle (ADR-0136), loader único (ADR-0149),
   `<Modal>`, controles de 24 px mínimo y 32 de objetivo con mouse (ADR-0350). Un token nuevo sigue la regla 5 del modo oscuro.

## El motor (gratis, sin agentes) y lo que decides tú

`apps/web/unificar/` (README ahí) recorre el ERP con Playwright, reconoce cada familia (`unificar/familias.mjs`: la ÚNICA definición de qué
cuenta como la misma función), le saca a cada elemento su **huella** (alto, esquinas, fondo, borde, letra, icono, con los colores traducidos al
token: «tinta», «rojo/35», «≈taupe» si se parece, el hex si no es ninguno), agrupa por huella y captura cada variante a ×2. Deja en
`apps/web/unificar/.salida/<fecha>/`: `reporte.md` (lo lees tú), `lamina.html` (la ve Felipe), `comparativas/<familia>.png` (una imagen por
familia, para el chat) y `censo.json`.

El motor **encuentra y cuenta**; **tú juzgas**: qué es de verdad la misma función, qué es un falso positivo, qué diferencia es un accidente
(1–2 px, un 5 % de opacidad) y cuál es una decisión, y qué familia vale la pena unificar primero. Criterio y falsos positivos conocidos:
`referencia/criterio.md`.

## Método

**0. Terreno.** `git status --short`, `git fetch origin` y cuánto va detrás de `main` (se mide el código de la rama); `docs/SESIONES-ACTIVAS.md`
(si otra sesión está rediseñando ese módulo, avísalo: unificar encima de un rediseño en curso choca); `docs/unificar/README.md` (lo ya decidido).
Servidor de esta worktree: `preview_start` con **`cayla-retail-dev-libre`** (toma un puerto libre; `cayla-retail-dev` fija el 3010 y suele
estar ocupado por otra worktree). La base local responde (`curl -s -o /dev/null -w "%{http_code}" http://localhost:54421/rest/v1/`).

**1. Censo.** Desde `apps/web`, con el puerto que dio `preview_start`:

| Pediste | Comando | Tiempo aprox. |
|---|---|---|
| un módulo | `pnpm unificar:censo -- --base-url <url> --todas --foco <módulo> --escenarios` | ~10–12 min (todo el ERP + los modales del módulo; medido el 2026-10-06 con Inventario: 109 vistas en 10 min) |
| una familia | `pnpm unificar:censo -- --base-url <url> --todas --familia <id>` (agrega `--escenarios` si vive en hojas: `modal`, `campo`, `combo`, `etiqueta-campo`, `accion.guardar`, `accion.cancelar`) | ~10 min |
| `todo` | `pnpm unificar:censo -- --base-url <url> --todas` | ~10 min |

Siempre `--todas`, también para un módulo: para saber si una forma es «solo de Inventario» o «de todo el ERP» hay que mirar todo. `--foco`
marca en la lámina lo que aparece en ese módulo. Las rutas con `[id]` y los modales salen por escenarios (`tema/escenarios/registro.mjs`); lo
que no tiene escenario va a «No cubierto» del informe. Corre el censo en segundo plano y dile a Felipe cuánto va a tardar.

**2. Depurar** (antes de mostrarle nada a Felipe). Lee `reporte.md` y mira las `comparativas/`. Por cada familia con más de una forma:
descarta los falsos positivos, junta lo que es la misma pieza con un accidente, separa lo que es otra función, y marca lo «decidido a
propósito». Confirma el archivo de cada variante con `grep` (el informe dice `[probable]`). Si el mapa de archivos es grande, **un** agente
`Explore` puede confirmarlo; si dudas de que dos cosas sean la misma función, **un** escéptico puede intentar refutarlo. **Hasta 2 agentes y
díselo a Felipe antes de lanzarlos**; nada de `Workflow` salvo que él lo pida.

**3. Mostrar.** Primero los números, en una línea por familia: *«Pestañas: 4 formas en 19 pantallas — A `SegmentoDeslizante` (17), B
`TabsSubrayado` (2)…»*, ordenadas por cuánto confunden (formas × pantallas, y primero lo que se usa en el mostrador). Luego, por cada familia que
vale la pena: `SendUserFile` con `comparativas/<familia>.png` y, en tres líneas, **qué cambia** entre las formas y **qué le cuesta a la persona**
(«en Caja el Cancelar es rojo y en Inventario es gris: en Caja parece peligroso»). Abre la lámina en el navegador: `preview_start` con
**`unificar-laminas`** y navega a `/<carpeta-del-censo>/lamina.html`. Plantilla del mensaje: `referencia/informe.md`.

**4. Diseño extra (la propuesta).** Para las familias que Felipe quiere decidir (**de a 3 como máximo por ronda**), dibuja una forma nueva que
toma lo mejor de cada una y corrige lo que ninguna resuelve: `docs/unificar/propuestas/<familia>.html`, con sus estados (normal, encima,
foco, deshabilitado, cargando) y en contexto. Rehaz la lámina sin volver a recorrer el ERP: `pnpm unificar:censo -- --lamina <carpeta>`; la
propuesta sale al lado de las variantes, en claro y oscuro. Explica cada rasgo: *«de la A tomo el alto de 36 px (el más usado y cómodo con
mouse), de la C el icono a la izquierda (se reconoce antes de leer)…»*. Cómo se hace: `referencia/propuesta.md`.

**5. Elegir.** Felipe elige **mirando**, no leyendo: arma una página con `node unificar/elegir.mjs <especificacion.json>` (desde `apps/web`; el
formato está en la cabecera del script). Por cada familia (y por cada pregunta, si la familia tiene varias funciones, como Pestañas), una tarjeta
por opción con su captura: «Existe hoy» (las formas reales de la depuración, con dónde viven y si un ADR las decidió), «Lo aplicado ahora» (si ya
se migró algo) y «Propuesta dibujada» (los borradores y la final, fotografiados con el CSS real). Sírvela con `unificar-laminas` y pásale la
dirección; él toca una por pregunta, puede comentar, y copia su elección al chat (si la abrió en el navegador de la app, léela con
`window.__unificarEleccion`). Una pregunta con `AskUserQuestion` sirve solo para confirmar, nunca para elegir una forma sin verla: el
2026-10-06 Felipe eligió tres recomendaciones por su descripción y, al verlas aplicadas, no le gustaron.

**6. Registrar** (en cuanto elige, en un commit propio): el registro `docs/unificar/<familia>.md` (qué se comparó, las capturas, qué eligió
y por qué), la decisión en `DECISIONES` de `apps/web/unificar/familias.mjs` con sus **firmas** y su **deuda**
(`pnpm unificar:deuda <familia>` la lista), la fila del tablero `docs/unificar/README.md`, la línea de la familia en ADR-0358 («Decisiones»)
y en la tabla «Piezas únicas» de `CLAUDE.md`. Si la pieza elegida no existe todavía (la propuesta), se construye en `components/ui/` antes de
registrar. Paso a paso: `referencia/decision.md`.

**7. Migrar** (`/unificar migrar <familia> [módulo]`, con el OK de Felipe: toca varios módulos). Módulo por módulo, un commit por módulo:
reemplaza cada variante por la pieza, saca el archivo de la deuda, y vuelve a correr el censo de esa familia en ese módulo: **tiene que quedar
una sola forma**. Captura antes/después al mismo ancho (1440 × 900; Vender, Cambios y Devoluciones también a 375, PL-105). Pruebas:
`pnpm --filter web test -- unificar tema-colores sugerir guia-de-foco` y `pnpm --filter web typecheck`.

## La regla que queda (para todo lo que se construya después)

Antes de dibujar un botón, una insignia, unas pestañas o cualquier pieza de una familia: mira `docs/unificar/README.md`. **Si la familia está
decidida, se usa su pieza**, y `lib/unificar.test.ts` falla si alguien la vuelve a dibujar a mano. Si no está decidida, se usa la forma más
usada del último censo (la A) y no se inventa otra. Es la regla «Una función, una pieza» de `CLAUDE.md`.

## Salida

En el chat: los números, las comparativas y la pregunta. En el repo, solo lo decidido: `docs/unificar/` (registro, propuestas, tablero) y el
cambio en `familias.mjs`. El censo, las capturas y la lámina se regeneran y quedan fuera de git (`apps/web/unificar/.salida/`). Si Felipe
quiere compartir la lámina con alguien (Dany), ofrécele publicarla como Artifact privado con sus capturas; no lo hagas por tu cuenta.

## Antes de decir «listo»

Evidencia, no promesa: el censo de después muestra **una** forma donde había varias; las pruebas pasan; las capturas antes/después son del
mismo ancho; y lo que la persona ve **significa lo mismo** que antes (un Cancelar nunca queda con cara de Peligro, un estado nunca cambia de
color de dato). Lo que no cubrió el censo (modales sin escenario, estados que exigen guardar, listas largas que el seed no tiene) se dice.
