# ADR-0205 · "Más", avatar y lupa en la barra del celular

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido; **superado en parte por ADR-0206** el mismo día (la barra y «Más» se retiran por el cajón lateral; la lupa se queda). **Producción:** ninguna migración ni RPC; es solo pantalla.
- **Alcance:** `apps/web/components/AppShell.tsx` (celular), `apps/web/components/MasMovil.tsx` (nuevo).
- **Decide:** Felipe (pidió el spike visual, lo corrigió dos veces en vivo, luego «Bien ahora implementemos»).
  **Diseño:** `docs/maquetas/menu-movil-spike-2026-09/` (spike interactivo; queda como referencia).

## Problema

Felipe: *«El sistema retail no está adaptado para celular, ya que no aparecen todas las opciones»*. Verificado en el
código antes de diseñar nada:

- `COLUMNAS_MOVIL` (`lib/menu.ts`) fija la barra del celular — hoy (tras ADR-0204) 4 columnas: Inicio, Punto de
  Venta, Inventario, Caja.
- ADR-0130, D8: *«en celular no hay lateral, hay pestañas»* — esa barra es TODA la navegación que existe en un
  teléfono; no hay ningún otro camino.
- `InventarioLayout.tsx`: *«entre Existencias, Movimientos, Traslados, Conteo y Análisis se navega solo con el
  lateral»* — ni siquiera el único módulo con pestaña propia (Inventario, que aterriza en Existencias) puede
  moverse a sus otras 4 pantallas desde el celular.
- `AppShell.tsx`: el botón «Mi perfil» y `<LogoutButton/>` viven dentro de `<aside … hidden … sm:flex>` — en
  celular ese bloque entero no se renderiza. No había forma de cerrar sesión ni de abrir «Mi perfil» desde un
  teléfono.

Contado con el árbol real (no una impresión): para un líder de tienda, 18 de sus ~26 pantallas no tenían ninguna
puerta en celular — incluida Traslados, la única fila con insignia de «por atender» (el número se veía sumado en
la pestaña de Inventario; tocarlo para resolverlo, no se podía).

## Decisiones

**D1 — "Más" es una quinta columna fija, siempre al final.** No reemplaza a ninguna de las 4 de `COLUMNAS_MOVIL`
(Inicio/Punto de Venta/Inventario/Caja no se mueven) — el primer diseño del spike SÍ reemplazaba a «Inventario»;
Felipe pidió sacarlo de ahí y ponerlo al final, pareja con las demás. No navega (no tiene `href`): abre una hoja.
El riel rojo del lateral (que se mueve por `pathname`) nunca la marca — es correcto, no es un destino.

**D2 — La hoja de "Más" pinta `menu.riel` completo, tal cual — no un árbol recortado.** Se pensó en excluir de la
hoja lo que ya vive en la barra (Inicio/Punto de Venta/Existencias/Caja), como hacía el spike por claridad
narrativa. Se descartó: `menu.riel` es el dato YA correcto y YA probado (`menu.test.ts`); armar un segundo árbol
"todo menos lo de la barra" es una fuente de verdad nueva que puede desincronizarse de la primera (principio 2,
CLAUDE.md: cero estados inconsistentes). Que Existencias aparezca en la barra Y dentro de «Inventario» en la hoja
no es un bug — es la misma pantalla, alcanzable por dos caminos, como ya pasa hoy con «Recibir mercadería» (vive
en Compras y en Inventario a la vez).

**D3 — Es un `<Modal>`, no un menú tipo `CajonGrupo`.** Por regla del sistema (ADR-0136): *«todo modal nuevo se
hace con `<Modal>`… no reimplementes el overlay»*. Se dudó entre el patrón *menu button* (como el desaparecido
`MenuNuevo`, o `CajonGrupo`: no atrapa el foco, Tab cierra) y el de diálogo — se eligió diálogo porque una lista
larga y con scroll (todo el árbol del menú) se comporta mejor dejando que Tab recorra sus filas una por una, y
porque es exactamente el mismo tipo de superficie que `PerfilModal` (contenido real y extenso, no un menú de 5
opciones). `<Modal>` da gratis: velo, hoja que sube 18 px y crece, Escape, clic afuera, foco devuelto al botón
"Más" al cerrar, y (en celular) hoja pegada abajo.

**D4 — El avatar reutiliza el disparador que YA existe (`setPerfilAbierto`), no un componente nuevo.**
`<PerfilModal>` ya vivía fuera del `<aside>` (línea siguiente a su cierre) — nunca estuvo oculto en celular, solo
le faltaba un botón visible ahí que llamara a `setPerfilAbierto(true)`. El botón nuevo en la cabecera del celular
es ESE botón, con las mismas iniciales que ya calcula `AppShell` para el lateral. Cero estado nuevo, cero
componente nuevo para esto.

**D5 — La lupa es un `<Link href="/buscar">`, sin JavaScript.** `/buscar` ya existe (acceso hoy solo por una
tarjeta en Inicio) y ya resuelve su propio campo con un `<form method="get">` nativo. La lupa de la cabecera es
un atajo de navegación, no una pantalla nueva.

**D6 — "Colaboradores" y "Roles y accesos" NO están en la hoja de "Más".** El propio árbol ya lo dice
(`lib/menu.ts`): esas dos viven solo en el perfil (`PerfilModal`), nunca en `menu.riel`. La primera versión del
spike las duplicaba (un grupo "Gestión" armado a mano); Felipe lo marcó como duplicado al probarlo. Corregido
reusando `menu.riel` tal cual (D2) — que ya no las trae — en vez de mantener una lista paralela.

**D7 — Cabecera del celular: sede, lupa y avatar agrupados en UN bloque, empujado al borde derecho.** Antes solo
la ubicación llevaba `ml-auto`; ahora ese contenedor agrupa los tres. Ajuste en vivo (Felipe, sobre el spike): un
"isla" decorativa que simulaba el notch del iPhone quedaba flotando sobre la lupa/el avatar porque no conocía el
contenido real — se sacó del spike entero, y el real nunca la tuvo.

## Lo que NO se resolvió (decisiones de Felipe)

1. **Las 6 acciones de "＋Nuevo" (ADR-0204) se retiraron enteras, sin reemplazo.** Con "Más" ya construido, ¿deberían
   entrar ahí como un grupo "Nuevo" (Nueva venta, Registrar factura de proveedor, Recibir mercadería, Mover
   mercadería, Registrar cambio, Registrar devolución), o queda aceptado que esas 6 pierdan su atajo de un toque?
   No se agregaron a `menu.riel` ni a la hoja en este ADR para no pisar una decisión que no es suya.
2. **El hueco que deja ADR-0204 sigue abierto:** el líder parado en el Taller sigue sin ningún link a `/recibir`
   (Compras no se muestra en el Taller; `inventario.recibir` tiene `soloSinPermiso: "verDineroCompras"`, que él sí
   tiene). "Más" no lo tapa: pinta `menu.riel`, que ya no incluye esa fila para ese perfil. Se resuelve destrabando
   `inventario.recibir` para el líder en el Taller (o no) — decisión de Felipe, ajena a este ADR.
3. **Terminal Punto de Venta (ADR-0162):** no tiene "Inicio" en `COLUMNAS_MOVIL` (aterriza en `/vender`,
   `terminalVeInicio`). "Más" sigue funcionando igual — pinta su `menu.riel`, ya filtrado por sus `modulos` — pero
   no se probó en vivo con una cuenta terminal.
4. **Orden del acordeón dentro de "Más":** el mismo orden que el lateral (Catálogo, Producción/Compras, Ventas,
   Inventario, …). No se evaluó reordenar por frecuencia de uso en celular.

## Cómo verificar

Con sesión de líder, celular (375 px, PL-105): la barra queda en 5 columnas parejas, **Más** al final; la
cabecera suma lupa y avatar junto a la sede, sin «＋» en ningún lado. Tocar **Más**: hoja con Catálogo, Compras
(o Producción si la sede es el Taller), Ventas, Inventario (con Traslados y su insignia) — sin "Gestión"
duplicado. Tocar un destino cierra la hoja y navega. Tocar el avatar: `PerfilModal` de siempre, con «Cerrar
sesión». Tocar la lupa: `/buscar`. Con una cuenta colaboradora, "Más" trae menos filas (sin Compras, sin
Producción) y el avatar no ofrece Colaboradores/Roles.

`pnpm --filter web typecheck`, `lint`, `build` y la suite completa (126 archivos, 21 290 pruebas) en verde.
**Sin verificar todavía con clics reales** — pendiente Felipe, logueado, en el navegador.
