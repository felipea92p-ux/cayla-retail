# ADR-0144 — El menú es un árbol de datos: `lib/menu.ts` decide quién ve qué, y una fotografía del menú de hoy lo vigila

**Fecha:** 2026-09-21
**Estado:** Aceptado e **implementado** (paso 1 del rediseño del menú: **sin cambio visible**). Verificado con `tsc` y `eslint` limpios, la suite completa de la web
y una prueba de equivalencia de 1176 renders del `AppShell` de `main` contra el nuevo (0 diferencias), 2023 pruebas en total, más mutaciones que la prueba caza.
**Decide:** Felipe, el 2026-09-21: que el menú y el Inicio se diseñen primero para el colaborador en el mostrador; que «completar el aviario» sea construirlo de
verdad; el orden de obra (candado → menú a datos → celular → colaborador plano → «+ Nuevo» e Inicio → nombres); y que un futuro Admin tenga otra vista sin
rehacer el menú. Arquitectura: este documento.
**Afecta:** `apps/web/lib/menu.ts` (nuevo), `menu.test.ts` y `menu-hoy.golden.json` (nuevos), `AppShell.tsx` (deja de tener las filas), `lib/produccion-menu.ts`
(pasa a ser una vista fina) y a todo PR que agregue una fila al menú.

## Contexto (verificado, 2026-09-21)

1. Las reglas de quién ve qué estaban repartidas en siete constantes sueltas de `AppShell.tsx`, una lista de rutas por grupo repetida a mano
   (`RUTAS_POR_GRUPO`), las acciones de «+ Nuevo» dentro de otro componente, y `lib/produccion-menu.ts`.
2. **En un solo día `main` cambió el menú cinco veces** (Notas de crédito, Por pagar de Producción, «Compras no se muestra en el Taller», «Recibir» y
   «Resumen» en Producción) y seis PRs abiertos editaban `AppShell.tsx`. Cada uno agrega su fila a mano en la misma zona y choca con los demás; cada reconciliación cuesta
   una vuelta de trabajo.
3. **No había manera de saber si un cambio del menú cambió lo que ve algún perfil.** `AppShell.tsx` tiene 1200 líneas con hooks: no se prueba sin abrir un navegador.
4. El aviario (14 pájaros) y el menú no se correspondían y nada lo vigilaba: cinco pájaros sin puerta y ninguna regla que dijera cuáles debían tenerla.

## Decisión

**DECIDÍ:** el menú es **datos**. Un árbol en `apps/web/lib/menu.ts` y una función pura `menuPara({ permisos, ubicacionTipo })` que devuelve el riel de
escritorio, las cinco columnas de la barra del celular, las acciones de «+ Nuevo» y el grupo que se abre al aterrizar en una ruta. `AppShell.tsx` solo dibuja.

- Cada nodo declara su **pájaro** del aviario (el dueño del dato que muestra), el **permiso semántico** que exige, los **tipos de ubicación** donde aplica y si
  está **viva** o **futura**. Los nodos futuros (Finanzas, Clientas, Configuración, Apartados, Comercial…) viven en el árbol sin emitirse: el aviario queda a la vista.
- **Permisos, no `esLider`:** `administrar`, `verDinero`, `analizar`. `permisosDe(rol)` es el ÚNICO lugar donde el rol se traduce a permisos: el día que nazcan Admin y
  Solo lectura (D-12) se cambia esa función y el árbol no se toca.
- **Una fotografía del menú de hoy** (`menu-hoy.golden.json`) capturada del `AppShell.tsx` real —no del árbol nuevo— y una prueba que exige que `menuPara` la
  reproduzca fila por fila para 6 perfiles. Los pasos siguientes cambian el árbol **a propósito** y cambian la fotografía a propósito: el diff del PR muestra la
  diferencia exacta que vería cada perfil.
- Invariantes que la prueba vigila: cada nodo cita un pájaro válido de los 14; un destino aparece una sola vez por perfil; ningún grupo con una sola hija; tope de
  8 filas de primer nivel y 6 hijas por grupo; toda ruta viva existe bajo `app/`; toda acción de «+ Nuevo» apunta a una ruta viva.

**DESCARTÉ:**
- *Dejar las constantes en `AppShell.tsx` y agregar pruebas.* No hay forma de probar un componente de 1200 líneas con hooks sin abrir un navegador, así que el menú seguiría
  cambiando sin que nada lo notara.
- *Un menú configurable por marca o por persona.* D-50: una base por marca; sería sobreingeniería. Se centraliza para probarlo y mantenerlo, no para revenderlo.
- *Generar el menú desde el aviario.* El aviario dice a quién le preguntas cuando una tabla se rompe (mirada de quien construye); el menú, qué hace una persona ahora
  (mirada de quien usa). La relación es N a M y se **declara** en el árbol —cada nodo cita su pájaro—, no se deriva.
- *Escribir la fotografía a mano.* Sería circular: el árbol nuevo pasaría porque ya se parece a lo que uno cree que es el menú.

**SE ROMPE SI:** (a) alguien agrega una fila directo en `AppShell.tsx` en vez de en `menu.ts` (por eso `AppShell.tsx` ya no tiene constantes de filas); (b) se cambia la
fotografía para que una prueba en rojo pase sin explicar en el PR qué perfil ve algo distinto; (c) una regla de visibilidad cambia solo en la base (RPC o RLS) y el árbol sigue
mostrando lo que la base rechaza: el menú solo decide qué se **muestra**, el candado real vive en la base; (d) un grupo llega al tope de 6 hijas y alguien sube el tope
en vez de regrupar.

## Cómo agregar una fila al menú (para quien viene detrás)

1. Edita **`apps/web/lib/menu.ts`**, no `AppShell.tsx`: agrega el nodo con su `id`, `etiqueta`, `ruta`, clave de `icono`, `pajaro`, `permiso` (si exige uno) y los
   `ubicaciones` donde aplica. Si el ícono es nuevo, agrega su trazo a `IC` en `AppShell.tsx` (es lo único que sigue viviendo allí).
2. Corre `menu.test.ts`: fallará la equivalencia, y es correcto. **Regenera `menu-hoy.golden.json` a propósito** y explica en el PR qué perfil ve algo distinto.
3. Si tu grupo ya tiene 6 hijas no subas el tope: regrupa (una fila nueva entra como pestaña dentro de la pantalla).
4. Una fila entra al menú cuando **existe**: pantalla, permiso y candado en la base. Mientras tanto, déjala con estado `futura`.

## Lo que queda abierto

- **Producción SUPERA el tope de 6: tiene 7 hijas** para el líder parado en el Taller desde que #231 (Resumen, F6) entró a `main` sin regrupar. Está registrado como deuda
  explícita, no escondido: `EXCEPCIONES_TOPE_HIJAS = { produccion: 7 }` en `menu.test.ts` y una prueba «DEUDA: Producción supera el tope de 6 hijas desde #231…» que falla
  si el grupo crece a 8 y también si baja a 6 sin quitar la excepción. Remedio: regrupar (el nodo futuro `produccion.abastecimiento` es el candidato para Proveedores,
  Comprobantes, Recibir y Por pagar) antes de agregar Eficiencia (F7). Regrupar cambia lo visible: es un paso aparte, con el OK de Felipe.
- **Nombres repetidos entre Compras y Producción** (Proveedores, Comprobantes, Por pagar): Felipe eligió «… del Taller». Es el paso de nombres y cambia la fotografía a propósito.
- `grupoDe` mira todo el árbol vivo, no solo lo que el perfil ve: un líder en tienda que aterriza en `/produccion` cierra los demás grupos aunque no vea Producción.
  Se conservó porque es el comportamiento de hoy; queda como decisión para un paso posterior.
- `scripts/datos/aviario.mjs` ya asigna las tablas de Producción a Gallito y los nodos de Producción del menú también (10 Gallito); si nace una pantalla nueva, su
  nodo cita el pájaro del aviario de la tabla que lee.
- Con «Compras no se muestra parado en el Taller» (PR #219), el líder en el Taller no tiene «Recibir mercadería» en el lateral (queda en «+ Nuevo»). Felipe lo dejó así por
  ahora; una prueba con nombre lo documenta y se revierte a propósito quitando `soloSinPermiso` de `inventario.recibir`.
- `hijosMenuProduccion` y `hijosMenuCompras` quedan en `produccion-menu.ts` solo sostenidos por su prueba; se borran cuando las páginas de Producción importen
  `puedeVerProduccion` desde `lib/menu.ts`.
- No se probó en un navegador real con interacción (teclado, hover, cajón del lateral plegado) ni se comparó píxel a píxel: la equivalencia es de estructura.
