# Spike visual · Navegación en celular (2026-09-25)

> **Estado (2026-09-25): en revisión con Felipe.** Sin aplicar. Este spike no toca `AppShell.tsx`
> ni `lib/menu.ts` — es HTML/CSS/JS autocontenido con datos y un árbol de menú inventados, solo para
> juzgar el patrón de navegación antes de construirlo.

`menu-movil-spike.html` — un solo archivo, autocontenido (el isotipo va incrustado en base64: no
necesita nada al lado). Ábrelo en el navegador.

## De dónde sale

Felipe: *«El sistema retail no está adaptado para celular, ya que no aparecen todas las
opciones»*. Antes de diseñar nada se leyó el código real:

- `COLUMNAS_MOVIL` (`lib/menu.ts`) fijaba **5 columnas**: Inicio, Punto de Venta, el hueco del «＋»,
  Inventario, Caja.
- ADR-0130, D8: *«en celular no hay lateral, hay pestañas»* — esa barra es TODA la navegación que
  existe en un teléfono.
- `InventarioLayout.tsx`: *«entre Existencias, Movimientos, Traslados, Conteo y Análisis se navega
  solo con el lateral»* — o sea que ni siquiera el módulo que SÍ tiene pestaña en celular
  (Inventario, que aterriza en Existencias) puede moverse a sus otras 4 pantallas ahí.
- `AppShell.tsx`: el botón «Mi perfil» y `<LogoutButton/>` viven dentro de `<aside … hidden … sm:flex>`
  — en celular ese bloque completo no se renderiza. **Hoy no hay forma de cerrar sesión ni de abrir
  «Mi perfil» desde un teléfono.**

Con esas cuatro piezas de código (no una impresión) se puede contar el problema en vez de solo
describirlo: para un líder parado en tienda, **18 de sus ~26 pantallas no tienen ninguna puerta en
celular** — ni pestaña, ni atajo por «＋Nuevo» — incluida Traslados, la única fila con insignia de
«por atender» (el número se ve sumado en la pestaña de Inventario hoy; tocarlo para resolverlo, no
se puede). El spike calcula este número EN VIVO (columna derecha) para cada rol, con el mismo árbol
y las mismas reglas de visibilidad que `lib/menu.ts` — no es una cifra fija, es la salida de simular
el código real con datos de mentira.

Esto ya estaba anotado en el backlog (`docs/BACKLOG.md`, sección «🎯 Menú a datos: `lib/menu.ts`»):
*«Pasos siguientes… «Más» + avatar «Yo» + lupa en celular… cada uno con el OK de Felipe»*. Este
spike es esos pasos, hechos concretos para poder juzgarlos.

## Dos ajustes durante la revisión (2026-09-25) — importante

La primera versión ponía «Más» reemplazando a «Inventario» en la 4ª columna y dejaba el botón «＋»
tal cual, al centro. Dos correcciones, en vivo, mirando el spike con Felipe:

1. **Felipe:** *«Ese nuevo del centro lo vamos a eliminar, el "más" creo que debería estar a la
   derecha al final».*
2. **Al revisar el repo para aplicarlo** (`git status` antes de tocar nada — regla de este
   proyecto) apareció algo más importante que mi primer ajuste: **otra sesión está, ahora mismo, en
   este mismo repo, retirando «＋Nuevo» DE VERDAD** — no reubicándolo, **eliminándolo entero**
   (lateral de escritorio y barra del celular por igual). El comentario ya en `AppShell.tsx`
   (sin commitear todavía) dice: *«v3.7 (2026-09-25, pedido de Felipe): se retira el "+ Nuevo"
   global... Detalle y trade-off: ADR-0204»*, y `lib/menu.ts` ya tiene `COLUMNAS_MOVIL` en 4:
   `["inicio", "venta.puntoDeVenta", "inventario", "venta.caja"]` — sin el hueco del «＋».

   Mi primer instinto (mover el «＋» a la cabecera, como ícono) habría sido **inventar una
   reubicación que Felipe nunca pidió** — la decisión real es retirarlo, punto, con el trade-off ya
   aceptado y escrito en el propio commit en curso (*«se pierde el atajo de un clic desde cualquier
   pantalla»*). Corregido: este spike ya NO agrega un «＋» en la cabecera. La cabecera del
   «Después» lleva solo lupa (Buscar) y avatar (Mi perfil); la barra queda en **Inicio, Punto de
   Venta, Inventario, Caja, Más** — las mismas 4 columnas que ya está escribiendo la otra sesión,
   más **Más al final**, que es la parte que aporta este spike.

## Qué prueba

Un teléfono de **375 px** (el ancho mínimo que exige PL-105 para Vender/Cambios/Devoluciones) con
tres controles:

| Control | Qué cambia |
|---|---|
| **Ver**: Antes / Después | La barra y la cabecera de hoy (producción real, con «＋Nuevo») vs. la propuesta |
| **Ver como**: Líder·tienda / Colaboradora·tienda / Líder·Taller | Repite EN EL SPIKE las mismas reglas reales de `lib/menu.ts` (`ubicaciones`, permisos) — Producción solo aparece en Taller, Compras solo en tienda/almacén, «Gestión» (Colaboradores/Roles) solo para el líder |
| **Movimiento reducido** | Apaga las transiciones — mismo criterio que el resto del sistema |

**Antes**: la barra tal cual está en producción hoy (5 columnas, «＋» al centro). Tocar
«Inventario» lleva a Existencias y muestra, en un recuadro, la lista exacta de lo que desde ahí no
tiene salida (Movimientos, Traslados, Conteo, Análisis), citando la línea del código que lo explica.

**Después**: Inicio, Punto de Venta, Inventario y Caja no se mueven; se agrega **Más** al final.
La cabecera suma dos íconos: una lupa (Buscar) y un avatar con iniciales (Mi perfil) — sin «＋»,
en ningún lado. Tocar **Más** abre una hoja de pantalla completa con el mismo árbol y el mismo
agrupamiento que el lateral de escritorio, filtrado por el rol activo — incluida Traslados con su
insignia. Tocar el avatar abre nombre, rol · sede, «Mi perfil», «Colaboradores»/«Roles y accesos»
(si el rol los ve) y «Cerrar sesión». La hoja sigue el movimiento del sistema (ADR-0136): velo con
desenfoque → hoja que sube 18 px y crece → contenido en cascada, 55 ms de desfase.

## Qué resuelve

| Problema (verificado en el código) | Cómo lo responde el spike |
|---|---|
| 5 columnas fijas y sin lateral en celular (ADR-0130, D8): todo lo que no sea Inicio/Punto de Venta/Inventario/Caja no tiene puerta. | «Más», al final de la barra, abre el mismo árbol del lateral (`lib/menu.ts`), agrupado igual, filtrado por los mismos permisos. Inicio/Punto de Venta/Inventario/Caja no se mueven. |
| Dentro de Inventario, Movimientos/Traslados/Conteo/Análisis dependen del lateral (`InventarioLayout.tsx`) — callejón sin salida en celular. | Esas 4 pantallas viven dentro de «Más», bajo «Inventario» — incluida Traslados con su insignia. Existencias sigue en su pestaña de siempre. |
| «Mi perfil» y `<LogoutButton/>` viven dentro de `<aside hidden … sm:flex>`: no se renderizan en celular. Sin forma de cerrar sesión desde un teléfono. | Un avatar con iniciales en la cabecera abre nombre, rol · sede, accesos de administración (si aplica) y «Cerrar sesión». |
| `/buscar` ya existe, pero en celular solo se llega por una tarjeta en Inicio. | Una lupa en la cabecera lo deja a un toque desde cualquier pantalla — mismo destino, atajo nuevo. |
| El «＋Nuevo» central se retira entero (otra sesión, ADR-0204 en curso) — se pierde el atajo de un clic a 6 acciones. | Fuera del alcance de este spike: esas 6 pantallas siguen alcanzándose por «Más» o por su ruta directa, solo que ya no en un toque. Ver punto 6 de abajo. |

## Qué reutiliza y qué inventa

Reutiliza (mismos nombres y valores que `apps/web/app/globals.css` y el resto del sistema): los
tokens de color de la guía CAYLA Dynamic (ADR-0169, ningún hex inventado), `--ease-cayla:
cubic-bezier(.32,.72,.24,1)`, el movimiento de hoja de `<Modal>` (ADR-0136: velo, 18 px, cascada de
55 ms), EB Garamond + DM Sans, y el árbol de módulos de `lib/menu.ts` (mismas etiquetas, mismo
agrupamiento, mismas reglas de `ubicaciones`/permisos, reescritas en JS plano para el spike).

Inventa (habría que decidirlo si esto avanza):

| Cosa nueva | Costo de construirla de verdad |
|---|---|
| Hoja «Más»: un componente nuevo (`~120 líneas`), teclado igual que `CajonGrupo` (Escape, foco) | El árbol ya existe (`menuPara().riel`); lo nuevo es el contenedor de hoja, no el dato |
| Ícono «Más» (grilla de puntos) y el resto de los íconos del spike | Son de relleno — el sistema real usa `IC` (`AppShell.tsx`); si se aprueba el patrón, falta el trazo de `mas` y `buscar` en `ClaveIcono` |
| Avatar con iniciales + hoja de perfil en celular | Reutiliza el mismo cálculo de iniciales y los mismos datos que `PerfilModal.tsx` (que ya existe) — lo nuevo es una versión angosta para 375 px, no el dato ni la RPC |
| Lupa en la cabecera → `/buscar` | Cero backend: la ruta ya existe, es un atajo de navegación nada más |

## Lo que NO se resolvió (decisiones de Felipe)

1. **¿La hoja «Más» reemplaza al cajón-por-hover del lateral plegado (ADR-0130) o es un patrón
   aparte?** No hay mouse en un teléfono — el acordeón/lista vertical de este spike es la traducción
   táctil correcta, no una versión reducida del cajón. Vale la pena decirlo explícito para que no se
   intente portar el hover.
2. **Orden del acordeón dentro de «Más».** Este spike usa el mismo orden que el lateral (Catálogo,
   Producción/Compras, Ventas, Inventario, Gestión). Podría convenir ordenar por frecuencia de uso en
   celular en vez de por la jerarquía de escritorio.
3. **La hoja de «Mi perfil» en celular, ¿es una versión angosta de `PerfilModal.tsx` real (con foto,
   cambiar contraseña) o solo un resumen que enlaza a una pantalla completa `/perfil`?** Este spike
   muestra lo segundo, más simple.
4. **Terminal Punto de Venta (ADR-0162, sin persona)**: no tiene «Inicio» (aterriza directo en
   `/vender`, `terminalVeInicio`). No está simulado en el selector «Ver como» de este spike, pero la
   misma regla aplicaría igual dentro de la barra y de «Más».
5. **¿Vale la pena la lupa en la cabecera de TODAS las pantallas, o solo donde no hay ya un
   buscador propio?** Existencias, por ejemplo, ya filtra por texto en su propia pantalla.
6. **La pérdida real del «＋Nuevo» (ADR-0204, ajena a este spike).** Con «＋Nuevo» retirado, Nueva
   venta/Registrar factura de proveedor/Recibir mercadería/Mover mercadería/Registrar cambio/
   Registrar devolución dejan de tener un atajo de un toque desde cualquier pantalla — quedan a la
   distancia normal de navegación (o dentro de «Más», si se decide sumarlas ahí como un grupo
   «Nuevo» más). Este spike no las agregó dentro de «Más» para no pisar una decisión que no es suya;
   si se quiere recuperar el atajo, es la primera pregunta a resolver con quien está llevando
   ADR-0204.

## Cómo verificar

Abrir el HTML, con **Ver: Después** — la cabecera muestra solo lupa y avatar (sin «＋», en ningún
lado) y la barra queda en 5 columnas: Inicio, Punto de Venta, Inventario (con su insignia «2»),
Caja, **Más** al final. Tocar «Inventario»: Existencias, con una nota tranquila («Movimientos,
Traslados, Conteo y Análisis viven ahora en Más»), no la alarma de «Antes». Tocar **Más**: se abre
la hoja con Catálogo, Compras, Ventas, Inventario (más allá de Existencias) y Gestión — Traslados
con su «2», sin ninguna fila marcada «ya por ＋Nuevo» (ese atajo ya no existe en el «Después»).
Cambiar **Ver como** a Colaboradora·tienda CON LA HOJA ABIERTA: se redibuja en el sitio (sin
cerrarse) y Compras/Gestión desaparecen. Tocar el avatar: nombre, rol, «Cerrar sesión» en rojo
profundo. Volver a **Ver: Antes (hoy)**: la barra recupera el «＋» central y, al tocar «Inventario»,
el recuadro «Callejón sin salida» — ahí sí, con las filas «ya por ＋Nuevo» atenuadas, porque hoy en
producción ese atajo todavía existe. Sin errores de consola en los tres roles.
