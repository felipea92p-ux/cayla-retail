# ADR-0257 — Cabecera: buscador global (Ctrl/Cmd+K), lockup «CAYLA / Retail» y el colibrí en vector

**Fecha:** 2026-09-28
**Estado:** Construido y verificado en local — navegador a 1280 px y 375 px (móvil), el buscador probado de punta a punta
(abrir con clic y con `Ctrl+K`, filtrar sin tildes, flechas, Enter navega y cierra, estado vacío, cerrar con Escape y con
la ✕), `typecheck` y `eslint` limpios. Sin migración: no toca ninguna tabla ni RPC nueva.
**Decide:** Felipe, 2026-09-28 — pidió el spike comparando la cabecera de Retail con la de Dynamic («Buscar una pantalla
o a alguien del equipo…», ⌘K), lo ajustó dos veces sobre la maqueta (mantener el color del colibrí — se había ido a
gris —, y el botón de plegar el lateral, que el spike había perdido, con el buscador al lado) y aprobó la versión final
antes de pedir la implementación.
**Sobre:** [ADR-0136](0136-regla-de-movimiento-de-modales.md) (el buscador es un `<Modal variante="papel">`, no una
gramática de movimiento nueva), [ADR-0169](0169-paleta-oficial-cayla-dynamic.md) (paleta oficial), ADR-0149 (loader
general — por qué el equipo de turno se pide con la RPC directamente y no con una Server Action), ADR-0207 (Actividad,
mismo dato de «quién está hoy» que ya arma `getEquipoDeHoy`). Spike: `docs/maquetas/dynamic-visual-spike-2026-09/`.

## Contexto

Retail y Dynamic son dos sistemas separados — unificados solo por debajo, en el mismo Supabase de producción (nota de
arquitectura de `CLAUDE.md`) — y hasta hoy la cabecera de Retail no lo decía: el logo solo dice «CAYLA», igual en los
dos. Felipe pidió tres cosas mirando una captura de Dynamic: que la cabecera diga de qué sistema es, un buscador como
el de Dynamic (pantallas y personas, `⌘K`), y de paso arreglar el colibrí de `/cayla-isotipo.png` (223 × 150 px, se
nota pixelado en cualquier sitio ≥190 px de alto).

Retail ya tenía dos buscadores sueltos, ninguno es este: `/buscar` (`app/(app)/buscar/page.tsx`) busca solo en el
catálogo de prendas (SKU, talla, color); y hubo un `BuscadorGlobal` de cabecera que escribía `?q=` hacia esa misma
pantalla y se quitó el 2026-09-16 por no tener más destino que el catálogo. Este es un tercero: busca **pantallas del
menú** y **quién está de turno**, como atajo de navegación — no reemplaza a ninguno de los otros dos.

## Decisiones

**1. El buscador busca pantallas y equipo — nunca prendas.**
DECIDÍ: dos listas separadas dentro del mismo diálogo, «Pantallas» y «Equipo · <sede>» — `components/BuscadorGlobal.tsx`.
DESCARTÉ fusionarlo con `/buscar`: mezclar «3 unidades de la talla M» con «Chiara Farfán» en la misma lista confunde
más de lo que ahorra; son dos preguntas distintas («¿qué hay?» vs. «¿dónde está X o quién está hoy?»).
Las pantallas salen de `menu.riel.flatMap(hojasDe)` en `AppShell.tsx` — el mismo árbol, ya filtrado por rol, ubicación
y módulo (ADR-0161), que arma el lateral: el buscador nunca ofrece una pantalla que la persona no puede abrir, sin
escribir esa regla dos veces.

**2. Una fila de «Equipo» no lleva a ningún lado.**
DECIDÍ que sea solo informativa (nombre + «En tienda» / «En pausa» / «Ya salió»), con el mismo dato y la misma
función pura que arma «Equipo de hoy» en Inicio (`armarEquipo`, `textoEstado` — `lib/inicio-avisos.ts`), llamando
directo a `fn_asesoras_de_turno` desde el navegador (no la RPC de actividad: el buscador no necesita ventas ni monto).
Es para ENCONTRAR a alguien, no para actuar sobre esa persona — actuar (suspender, cambiar rol, mover de sede) ya vive
en Colaboradores, con sus propios candados (ADR-0161, ADR-0178).
Solo se pide si `ubicacionTipo === "tienda"` y no es una terminal — la misma condición que ya usa Inicio para mostrar
«Equipo de hoy»; en Almacén, Taller o una terminal el buscador se queda solo con «Pantallas».
DESCARTÉ una Server Action: el loader general (ADR-0149, `lib/espera-reglas.ts`) clasifica TODA Server Action como
«guardado» sin excepción para lecturas — habría tapado la pantalla con «Guardando…» cada vez que alguien abre el
buscador. Llamando a `supabase.rpc("fn_asesoras_de_turno", …)` directo desde el cliente, el prefijo `fn_` ya la
reconoce como lectura (`esRpcDeLectura`), igual que cualquier otra RPC de solo lectura del navegador.
SE ROMPE SI: se agrega otra RPC al buscador sin el prefijo `fn_`/`get_`/etc. — volvería a tapar la pantalla con el
loader de guardado en cada apertura.
SIN RESOLVER (abierto para más adelante, no bloquea esto): ¿un integrante debería ver a TODO el equipo de turno, o
solo a quien puede tocar (`fn_alcanzo_a`, ADR-0178)? Hoy ve a todos — es lectura de nombre y estado nada más, el mismo
dato que ya es público dentro de la sede en Inicio, así que no hay un permiso nuevo que esté saltándose.

**3. El atajo `Ctrl`/`Cmd`+`K` abre Y cierra, con guarda propia.**
El único atajo global que ya existía (`[`, plegar el lateral, `AppShell.tsx`) nunca necesita cerrar un diálogo abierto,
así que su guarda (bloquear si hay `[role='dialog']` abierto) no sirve acá tal cual: `Ctrl+K` con el buscador ya
abierto tiene que cerrarlo. La guarda nueva vive dentro de `BuscadorGlobal` mismo (no toca el listener de `[`): no se
abre encima de OTRO diálogo ya abierto, pero si el que está abierto es el suyo, alterna.

**4. Lockup «CAYLA / Retail», apilado — 3 puntos de contacto, ningún dato nuevo.**
DECIDÍ la forma apilada (CAYLA arriba, RETAIL debajo, más chico y en `taupe-profundo`): es la única de las tres que el
spike probó que no depende del ancho disponible — funciona igual en el lateral de 17rem, en el logo de 26 px de la
cabecera móvil y en el login de 56 px, sin una regla de «a partir de tal ancho, cambia de forma». Se agrega, nunca
reemplaza: la palabra «CAYLA» no cambió de tamaño, posición ni peso en ninguno de los tres lugares
(`AppShell.tsx` × 2, `login/page.tsx`).
SIN RESOLVER: si CAYLA algún día vende este sistema a otra marca (la visión de venta de `CLAUDE.md`), «Retail» puede
no ser la palabra correcta — ese día se cambia en tres archivos, no se diseña hoy para esa hipótesis.

**5. El colibrí de baja resolución se resuelve con un vector, no con un PNG más grande.**
`EtiquetaPrecio.tsx` ya se topó con esto el 2026-09-25 («salía serruchado en la Brother») y lo resolvió calcando el
trazo a mano en SVG. `components/ui/IsotipoCayla.tsx` reusa ESE mismo `<path>` (no se dibuja de nuevo), con el rojo de
marca (`#b8412d`) por defecto — muestreado del propio PNG con un script: es el color en el 99 % de sus píxeles — en
vez del negro que usa la etiqueta impresa.
DECIDÍ aplicarlo solo en pantalla: el logo del lateral (con el lockup), el logo de la cabecera móvil, y el login.
DESCARTÉ tocar los otros 7 usos del PNG (`ReciboTermico`, `ProformaA4`, `BoletaA4`, `CambioTicket`,
`ComprobantesListaVacia`, `PrendaCelda`, `Espera.tsx`): son documentos ya calibrados para su impresora o su tamaño de
papel, y cambiarlos sin verificar contra una impresora real sería el mismo error que ya pasó una vez. Queda en el
BACKLOG como limpieza aparte, no parte de este cambio.
`EtiquetaPrecio.tsx` tampoco se tocó (sigue con su propio `<path>` inline, sin importar el componente nuevo): es un
componente ya verificado contra una impresora física — deduplicarlo era una mejora cosmética que no valía el riesgo de
tocar algo que ya funciona, sin poder volver a probarlo contra la Brother real desde acá.

## Qué se rompería sin esto

Sin el buscador: seguir sin forma de saltar directo a una pantalla o de saber quién está en la sede sin ir a Inicio.
Sin el lockup: una captura de pantalla no dice si es de Retail o de Dynamic. Sin el vector: el colibrí sigue
pixelándose en cualquier lugar donde se use más grande que hoy (una pantalla nueva, un banner, una lona de tienda).

Felipe se lleva: **un raster resuelve el tamaño de hoy; un vector resuelve el problema.** El PNG de 223 px no se rompió
por tener «poca resolución» — se rompió porque un isotipo de dos colores y cuatro trazos dependía de un formato pensado
para fotos. Ya pasó una vez (la etiqueta de precio) y la solución fue la misma las dos veces.
