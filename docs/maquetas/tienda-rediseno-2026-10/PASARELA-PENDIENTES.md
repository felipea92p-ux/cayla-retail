# «G · Pasarela»: lo que falta y cómo seguir (traspaso, 2026-10-27)

**Para quién es:** quien retome la tienda online (`apps/tienda`) en otra conversación. Aquí está todo lo que hay que saber para seguir sin
volver a preguntar: en qué estado quedó, **qué le falta a la tienda real frente a la maqueta** (animaciones y botones, comparados uno por uno),
qué decisiones son de Felipe, cómo correrla en local y las trampas. La maqueta es [`g-pasarela.html`](g-pasarela.html) (con
[`movimiento.js`](movimiento.js), [`marco.js`](marco.js), [`datos.js`](datos.js) y [`marco.css`](marco.css)); se sirve con
`preview_start maquetas` y se abre en `http://localhost:3031/tienda-rediseno-2026-10/g-pasarela.html` (por `file://` no carga el CSS ni los scripts).

**Mensaje para arrancar la otra conversación:**
> Lee `docs/maquetas/tienda-rediseno-2026-10/PASARELA-PENDIENTES.md`, el ADR-0524 y abre la maqueta `g-pasarela.html`. Construye el
> «paquete 1» de la sección 2 con `/construir`: un commit por animación, captura a 1440 y 375 px en claro y oscuro antes de seguir.

---

## 1. Dónde quedó todo (verificado el 2026-10-27)

| Cosa | Estado |
|---|---|
| El rediseño completo «G · Pasarela» (10 actividades, ADR-0524) | **Fusionado y publicado**: PR #1375, fusionado el 2026-10-27 00:07 UTC |
| El menú de «Ropa» y «Accesorios» (regresión mía: el panel quedó del ancho de las pestañas y cortaba los nombres) | **Fusionado y publicado**: PR #1381, 2026-10-27 16:06 UTC |
| Lo que falta (esta lista) | **Nada construido todavía**: es lo que sigue |
| Rama de trabajo | `claude/cayla-tienda-redesign-fdda02` (sin commits propios pendientes salvo este traspaso) |
| ADR | `docs/adr/0524-la-tienda-pasarela-rediseno-visual.md` (con sus actualizaciones de las actividades 8 y 9 y la del menú), reserva `reserva/adr-0524` |

La tienda **no tiene vista previa de rama** (sus variables viven solo en Producción): **fusionar publica**. Todo se mira en local antes de fusionar.

**Medido en la actividad 9** (`/inicio` compilado, caché fría, contra una compilación de `origin/main` en el mismo equipo):

| | Pasarela | `main` de entonces |
|---|---|---|
| Escritorio 1440: LCP / total / fuentes | 676 ms / 2487 kB / 250 kB | 1436 ms / 2664 kB / 724 kB |
| Celular (4G lento, CPU ×4): LCP / total | **5,5 s** / 1137 kB | 2,9 s / 901 kB |

En celular lento la portada nueva es más lenta: `main` no tenía foto a la vista y la Pasarela pone ahí la primera salida del desfile. Mi medición
local **deja esa foto sin optimizar** (las URL de la base local son las del almacenamiento de producción y `TIENDA_FOTOS_ORIGEN` es el local, así
que `fotoOptimizable` dice que no); en Vercel pasa por `_next/image` (AVIF) y pesa menos. **Hay que medir `/inicio` móvil en producción**
(Lighthouse). Si pasa de ~4 s, el plan B del desfile (ADR-0524, «SE ROMPE SI (a)») es una vuelta o quieto.

---

## 2. Lo que le falta a la tienda frente a la maqueta: animaciones

Salió de leer la maqueta completa y buscar cada pieza en `apps/tienda`. Lo hecho (y no hay que rehacer): el desfile con su pausa y su programa, la
luz y la entrada en cascada del escenario, «El programa» con la prenda que asoma, la invitación del Club que se inclina, el visor con su flash y la
foto que vuela a la bolsa, el total y el número del pedido que cuentan, la invitación que se da vuelta, el subrayado de los campos de «Entrar», los
botones con cortina, el zoom de la foto de la tarjeta y la raya que viaja de las pestañas.

Reglas que mandan (CLAUDE.md y ADR-0430/0136): **una sola vez, sin rebote, sin bucle**, todo apagado con `prefers-reduced-motion`, solo tokens de
`app/globals.css`, y `lib/bucles-de-movimiento.test.ts` falla si aparece un bucle nuevo. Con «reducir movimiento» lo animado debe verse ya
terminado. Un elemento animado nunca debe quedar oculto si el navegador no soporta la técnica.

### Paquete 1: solo CSS, riesgo bajo

**1. Revelado al bajar** (`movimiento.js`: `revelar`; `g-pasarela.html` líneas ~223–230).
- *Maqueta:* al entrar en pantalla (margen `0 0 -10% 0`, umbral .12, una sola vez) los bloques suben 26 px y se aclaran (1 s / 1,1 s,
  `cubic-bezier(.2,.7,.2,1)`, retraso `--i × 110 ms`); los títulos de sección (`.p-titulo`) además **cierran su espaciado** de `.2em` a `-.01em` en 1,6 s.
  Afecta a: títulos de sección, filas del programa, pasos 01–04, tiendas.
- *Hoy:* solo el título de «El programa» y el Club usan `.t-revela` (`app/globals.css:274`, `animation-timeline: view()`); looks, ofertas, más
  vendidos, «Así se separa» y «Nuestras tiendas» aparecen de golpe.
- *Propuesta:* extender `.t-revela` (CSS scroll-driven, sin JavaScript) con una variante de lista (cascada por `--i`) y una de título (espaciado
  que se cierra), y ponérsela a `app/(catalogo)/inicio/page.tsx`, `components/AsiSeSepara.tsx`, `NuestrasTiendas.tsx` y las tarjetas de looks. Con
  `@supports not (animation-timeline: view())` todo queda visible.

**2. Cortina de fotos escalonada** (`g-pasarela.html` líneas ~223–226).
- *Maqueta:* la foto se descubre de abajo hacia arriba (`clip-path: inset(100% 0 0 0)` → `inset(0)`, 1,2 s, `cubic-bezier(.76,0,.24,1)`) con retraso por
  columna (`--i = posición % 4`, 100 ms) y **el pie de la tarjeta (nombre y precio) aparece después** (.9 s, retraso .5 s + columna).
- *Hoy:* `t-cortina` (`app/estilos/catalogo.css:~451`) ya descubre la foto con `animation-timeline: view()`, pero todas las columnas a la vez y el pie no espera.
- *Propuesta:* desfase por columna en el `animation-range` y un fundido del pie (`.t-card-info`) detrás de la foto. Sin tocar la lógica de las tarjetas.

**3. Entrada de la ficha** (`g-pasarela.html` líneas ~231–234).
- *Maqueta:* la foto se descubre de arriba hacia abajo (1,4 s, retraso .1 s) y los hijos del panel (nombre, precio, color, talla, stock, botón) suben
  14 px en cascada (.9 s / 1 s, retraso .25 s + 75 ms × posición).
- *Hoy:* `components/FichaPrenda.tsx` y `app/estilos/ficha.css` no animan la llegada (solo el visor al agregar).
- *Propuesta:* CSS de llegada **solo al cargar la página** (no al cambiar de color ni de talla, ni en el esqueleto: ahí usar el mismo
  `:not(.t-esqueleto …)` que ya guarda `t-sube-k` en `bolsa.css`).

**7. Estados de talla, color y opción de tienda** (`g-pasarela.html` línea ~208).
- *Maqueta:* `transition: background-color .35s, color .35s, border-color .3s`. *Hoy:* `.t-talla` y compañía cambian en .15 s (`ficha.css:112`, `bolsa.css`). Cambio de dos números.

### Paquete 2: JavaScript pequeño

**4. Títulos por letras** (`movimiento.js`: `letras`; CSS `.p-letras .letra`, línea ~216).
- *Maqueta:* los títulos grandes de página («Ropa», «Tu bolsa») entran letra a letra: cada palabra en `inline-block; white-space: nowrap` (para que no se corte «NU / EVO»),
  cada letra con `--l` y `opacity 0 + translateY(.6em)` → `none` (.9 s / 1,3 s, retraso `.15 s + --l × 70 ms`); el lector oye la palabra entera (`aria-label`).
- *Hoy:* solo el título del desfile (`lib/desfile.ts: letrasDelTitulo`, `desfile.css: .t-escena-tit .t-letra`). Catálogo (`.t-lista-cab h1`), Bolsa,
  Looks y Mi perfil son estáticos.
- *Propuesta:* un componente `TituloConLetras` (servidor, sin JavaScript de cliente: son `<span style="--l:n">`) que reutilice `letrasDelTitulo`
  y las reglas de `desfile.css`, una sola vez al llegar la página y **sin repetirse en el esqueleto** (la actividad 8 dejó el esqueleto quieto a propósito: `TituloQuieto`).

**5. Indicador deslizante en los filtros** (`movimiento.js`: `indicador`; CSS `.p-filtros .indicador`).
- *Maqueta:* una sola raya negra de 1 px se desliza (`transform` y `width`, .6 s, `cubic-bezier(.2,.7,.2,1)`) hasta la opción elegida de cada grupo (qué buscas, tienda); la primera vez se coloca sin recorrido y se recalcula al cambiar el ancho.
- *Hoy:* cada opción dibuja su propia raya fija. Los filtros viven en `components/filtros/` (`ProveedorFiltros`, `ZonaDeFiltro` con `aria-pressed`) y la fila de categorías en `FiltrosDeLista.tsx`.
- *Propuesta:* generalizar `components/useRayaDelNav.ts` (hoy: la raya de las pestañas de la cabecera) a un `useIndicador(grupo, activa)`; mismo patrón de colocar sin recorrido la primera vez y con `prefers-reduced-motion` sin transición.
  **Ojo:** lo que ancla la raya es el contenedor posicionado más cercano, y la regla de `lib/cabecera-mega.test.ts` (el nav no se posiciona) no aplica a los filtros pero sí enseña la trampa.

### Paquete 3: más riesgo

**6. Reacomodo de las tarjetas al filtrar (técnica FLIP)** (`movimiento.js`: `flipAntes` / `flipDespues`).
- *Maqueta:* al filtrar, las tarjetas que quedan se deslizan a su nuevo lugar (700 ms) y las que aparecen entran (650 ms, 30 ms de desfase, 24 px).
- *Hoy:* la lista cambia de golpe.
- *Propuesta:* primero mirar **si el filtrado es de cliente o de servidor** (`components/filtros/ProveedorFiltros.tsx`): si es de cliente, FLIP con la API de animaciones como la maqueta; si recarga desde el servidor, `<ViewTransition name={prenda.id}>` en `TarjetaPrenda` (la tienda ya usa `<ViewTransition>` en `Vistas.tsx`, `EnCamino.tsx`, `PrendaTocada.tsx`).
  Riesgos: ~30 nombres de transición a la vez (probar en celular), la paginación, y que quede apagado con «reducir movimiento».

**8. La cabecera pegada arriba al bajar** (`.p-cab { position: sticky; top: 0; backdrop-filter: blur(10px) }`).
- *Hoy:* la cabecera se va con el scroll (decisión de Felipe pendiente desde la actividad 8). Yo diría que sí: arregla que la foto que vuela a la bolsa a veces tenga su destino fuera de pantalla.
  Toca las barras de filtros y de la ficha (todas bajan 76 px: la maqueta usa `top: 112px`). **Cuidado con el panel del menú** (ver la sección 6: ningún ancestro del panel debe quedar posicionado).

---

## 3. Botones y funciones: lo que difiere (casi todo es decisión de Felipe)

Los botones de la maqueta son simulaciones; los de la tienda real hacen más y existen: «Elige tu talla», «Quitar», «Separar», «Mandar por WhatsApp»,
«Cómo llegar», «Olvidé mi contraseña», «Ver las N salidas» y la pausa del desfile. Lo que no coincide:

| Maqueta | Tienda | Lectura |
|---|---|---|
| «Crear mi cuenta» y «Ya tengo cuenta» bajo el desfile | «Ver lo nuevo» | En la tienda real el precio se ve sin cuenta; el aviso de arriba y el Club ya invitan. Agregar un enlace si Felipe lo quiere |
| «Guía de tallas» junto a Talla | No existe | El botón de la maqueta tampoco hace nada. Pide medidas por categoría que no están en la base: **no inventarlas** |
| «Salida 03» en cada tarjeta y número gigante en la ficha | Solo en el desfile y el programa | La numeración cambiaría con cada filtro y página. No recomendado |
| Filtro «En qué tienda» dentro del catálogo | Selector de sede en la cabecera, con el velo | Distinto por diseño, ya aprobado |
| Luz que va y viene en «Entrar» (9 s, en bucle) | Quieta | El bucle no está aprobado. Si se quiere, que entre una sola vez |
| Transición entre páginas «las luces bajan y vuelven a subir» | La raya que viaja | Felipe eligió la raya |
| Logo en EB Garamond | El logo oficial del colibrí en rojo | La marca no se rediseña sin que Felipe lo pida |
| «Ver precio» para visitantes | Precio visible | Descartado en ADR-0524 |

## 4. Decisiones abiertas de Felipe

1. **El desfile desaparece si la sede no tiene llegadas de los últimos 30 días** (`nuevas.length > 0` en `app/(catalogo)/inicio/page.tsx`): la portada vuelve a la
   tarjeta de campaña de siempre. En la base local, Lima y las otras sedes que probé no tienen ninguna. Propuesta: mostrar las últimas 6 llegadas aunque tengan más
   de 30 días, con otro rótulo («Últimas salidas»). Cambia qué significa «lo nuevo».
2. La cabecera pegada (sección 2, punto 8).
3. ¿«Crear mi cuenta» / «Ya tengo cuenta» bajo el desfile para visitantes? (sección 3).
4. Plan B del desfile en celular, según lo que mida Lighthouse en producción.
5. «Guía de tallas»: solo si hay contenido real que mostrar.

## 5. Pendientes de verificar con datos reales / en producción

- El menú «Ropa» en producción: que los nombres largos («Ropa interior/Lencería», «Pañuelos y Pañoletas») se lean, y la vitrina «Recién llegado» a 1280 px o menos (el ancho de las
  columnas ahora manda sobre la vitrina; en local no hay prendas recientes en ese menú).
- Lighthouse móvil sobre `/inicio` (la sección 1).
- El desfile en un teléfono real (cuadros por segundo con seis fotos y `mix-blend-mode`).
- La portada con una campaña sin imagen; la página del pedido confirmado con su código de recojo (no hay un pedido confirmado en local); fotos de modelo (no recortadas sobre blanco).
- «Separar» de punta a punta con una cuenta real justo después de cada fusión.
- Que `tienda_filtros` (de #1341) esté en producción antes de contar con el panel de COLOR y TALLA: en local la apliqué a mano.

## 6. Cómo correrlo en local, y las trampas

- **Servidor:** `pnpm --filter tienda exec next dev --port 3100` desde la raíz del repo (con su `.env.local`, que en un worktree nuevo hay que copiar). La pila de clientes
  y la cuenta de prueba están en la memoria del proyecto («Tienda en local con sesión real»); **la clave de la cuenta de prueba nunca se escribe en un archivo del repo** (es público): los scripts la piden por `TIENDA_CORREO` y `TIENDA_CLAVE`.
- **El panel del navegador recuerda la sede en una cookie.** Si estaba en Lima, `/inicio?sede=arequipa` vuelve a `?sede=lima`, y Lima no tiene llegadas recientes en la base local: no sale el desfile (sección 4, punto 1). Las capturas con sesión nueva (`tomas.mjs`) sí lo muestran.
- **Fotos sin optimizar en local** (sección 1): no compares pesos de imágenes de local con producción.
- **El menú de «Ropa» tarda ~0,3 s en aparecer:** una captura tomada justo al pasar el mouse lo muestra a medio aparecer (transparente, con la portada detrás). Espera 1 s antes de capturar.
- **Trampa que costó un PR:** `.t-nav` no puede llevar `position: relative`. El panel del menú (`.t-mega`, `position: absolute; left: 0; right: 0`) se ancla al ancestro posicionado más cercano, que debe ser la fila de la cabecera (`.t-cab-fila`). Lo vigila `lib/cabecera-mega.test.ts`. El barrido de anchos no lo ve (el panel solo existe con el mouse encima).
- **Dev vs compilado:** «1 Issue» en la esquina es el indicador de Next en desarrollo (un aviso de `new Date()` fuera de caché que ya existía), no de la tienda.
- **Base local compartida con otras sesiones.** Mis restos (revisar antes de usar):
  - Fotos sembradas en `retail.producto_fotos` con la marca `created_at = '2026-10-26 00:00:01+00'`. Para deshacerlas: `delete from retail.producto_fotos where created_at = '2026-10-26 00:00:01+00';`
  - El pedido de prueba `W-0794` (cuenta de prueba) está cerrado como vencido (los pedidos no se borran, se anulan).
  - La clave de la cuenta de prueba la cambié a una desechable.
  - La foto `rediseno-bolsa` de `scripts/flujo-de-negocio/estado.mjs` **no se restauró** (otra sesión escribió ventas mientras tanto, y restaurar las habría borrado).
  - `tienda_filtros` aplicada a mano en local (ver sección 5).

## 7. Herramientas de medición (`herramientas/`)

Scripts sueltos de Node que manejan Chrome sin cabeza por el puerto de depuración (Chrome en `/Applications/Google Chrome.app`, macOS) contra la tienda local en `http://localhost:3100`.
No son parte de la tienda ni del CI; sirven para verificar cada animación nueva.

| Script | Para qué | Uso |
|---|---|---|
| `tomas.mjs` | Capturas del tamaño de la ventana bajando por la página | `node tomas.mjs <carpeta> <ancho> <alto> <maxTomas> <url> <nombre> [<url> <nombre> …]` |
| `barrido.mjs` | Cada ruta × ancho × tema: desborde horizontal y el medidor de oficio de `/formidable` (blancos de toque, contraste, texto chico) | `node barrido.mjs <carpeta> <anchos> <temas> <rutas>`; `SESION=1` (con `TIENDA_CORREO` y `TIENDA_CLAVE`) entra con la cuenta de prueba; `BOLSA=1` llena la bolsa antes; `TIENDA_URL` cambia el origen |
| `chico.mjs` | Todo el texto de menos de 12 px y los blancos de toque de menos de 24 px, por ruta | `node chico.mjs <ancho> <rutas>` |
| `peso.mjs` | LCP y kB por tipo de `/inicio`, caché fría; con `movil` emula 4G lento y CPU ×4 | `node peso.mjs <url> <ancho> <alto> [movil]` |
| `lcp-detalle.mjs` | Lo mismo, desglosando el LCP (cuándo se pide y cuándo llega la foto) | `node lcp-detalle.mjs <url> <ancho> <alto> [movil]` |

El barrido de la actividad 9 (10 pantallas × 5 anchos × claro y oscuro = 100 combinaciones) salió limpio. Cada animación nueva debe volver a pasarlo.
Medir contra una compilación (`next build` + `next start`), no contra `next dev`: el modo desarrollo falsea el peso y los tiempos.

## 8. Hechos que conviene no volver a descubrir

- Los números de ADR y de migración se reservan al empezar (`pnpm reservar adr`); todo PR se abre con `/abrir-pr`; Knip corre en el CI; la tienda no tiene vista previa de rama.
- No pidas «Update branch» mientras corre el CI: lo cancela.
- Los comentarios de Vercel en un PR de la tienda dicen «1 Skipped Deployment»: es lo esperado.
- Las medidas y capturas de cada actividad están en `docs/bitacora/2026-10-26-cayla-tienda-redesign-fdda02.md` y en el ADR-0524.
