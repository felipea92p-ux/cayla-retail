# Responsive Quality Gate

Infraestructura reusable para validar responsive antes de cerrar una tarea. Corre en **LOCAL**
contra un `next dev` ya levantado (Turbopack o no), abre Chrome real vía Playwright, navega cada
pantalla registrada en varios anchos y escenarios, y mide con `getBoundingClientRect()` si algo
se corta de verdad. No es un test de implementación: no le importa si una fila usa Flexbox o
Grid, solo si el resultado renderizado deja algo inaccesible.

Motor genérico (`motor/`) + registro de pantallas (`pantallas/`) + matriz de viewports
(`matriz-viewports.mjs`). El motor no sabe qué es Existencias ni qué es Vender — cada pantalla
declara sus propios escenarios e interacciones.

## Correr

Con el `next dev` de este repo ya levantado (por defecto en `http://localhost:3010`; en esta
sesión el server vivía en `:3070`, por eso todas las corridas usaron `--base-url`):

```bash
pnpm --filter web responsive:check existencias
pnpm --filter web responsive:check existencias movimientos traslados
pnpm --filter web responsive:check --module inventario
pnpm --filter web responsive:check all
pnpm --filter web responsive:check existencias --base-url http://localhost:3070
pnpm --filter web responsive:check existencias --capturas-todas   # audita también los PASS
pnpm --filter web responsive:check existencias --headed           # Chrome visible, para depurar
```

Salida: `responsive/.salida/<fecha-de-la-corrida>/` — `reporte.md`, `reporte.json` y
`capturas/*.png` (gitignored: se regenera en cada corrida, nunca se commitea). Exit code `0` si
todo pasó, `1` si hubo al menos un FAIL real, `2` si el propio script se cayó (pantalla mal
configurada, etc).

## Registrar una pantalla

Un archivo por pantalla en `pantallas/`, exportado por default, y una línea en
`pantallas/registro.mjs` (`import` + agregarlo al array `TODAS_LAS_PANTALLAS`). La versión
mínima —sin escenarios, sin exclusiones— alcanza para la mayoría de pantallas nuevas:

```js
// pantallas/inventario.traslados.mjs
const pantallaTraslados = {
  id: "inventario.traslados",   // único, "modulo.pantalla"
  nombre: "Traslados",          // para el reporte
  modulo: "inventario",         // agrupa con otras del mismo módulo
  ruta: "/inventario/traslados",
  viewports: "rapida",          // opcional — "matriz" (20, por defecto), "rapida" (4) o una lista/objeto (ver abajo)
};
export default pantallaTraslados;
```

Con eso ya corre `pnpm responsive:check traslados` (o su id completo
`inventario.traslados`) con un único escenario "inicial" (la ruta tal cual carga) sobre la
matriz de viewports que le hayas dado.

## Definir escenarios

`escenarios: [{ id, nombre, preparar? }]`. `preparar(pagina, ctx)` recibe la página de
Playwright y `{ viewport, pantalla, escenario }`; ahí van los clicks, el llenado de un buscador,
abrir un combo, etc. Sin `preparar`, el escenario es el estado inicial de la ruta.

```js
escenarios: [
  { id: "por-prenda", nombre: "Por prenda (inicial)" },
  {
    id: "por-talla",
    nombre: "Por talla",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: "Por talla", exact: true }).click();
      await pagina.waitForTimeout(200);
    },
  },
],
```

Un escenario puede hacer el `preparar` condicional al viewport (`ctx.viewport.w`) para probar
algo que solo existe en celular (un botón "Filtros" que se pliega, por ejemplo) sin que falle en
escritorio si el control no está.

## Definir un módulo

Un módulo no es un archivo aparte: es el campo `modulo` que cada pantalla ya declara. Todas las
pantallas con el mismo `modulo` responden a `--module <nombre>`. Para agrupar una pantalla nueva
en "inventario", basta con que su registro diga `modulo: "inventario"`.

## Viewports

`matriz-viewports.mjs` tiene los 20 anchos pedidos, en un solo lugar. Una pantalla usa:
- `"matriz"` (o no declarar `viewports`) → los 20 completos.
- `"rapida"` → 4 representativos (320×568, 375×812, 412×915, 430×932) — para una pantalla de
  escritorio (Caja, Almacén — ver CLAUDE.md, «Celular obligatorio») que igual no debería romperse
  del todo si alguien la abre en un celular.
- `["320x568", "412x915"]` → esos ids nomás, en ese orden.
- `{ excluir: ["320x568"] }` → la matriz completa menos esos ids.
- `{ extra: [{ id: "kiosko", w: 1024, h: 768 }] }` → la matriz completa más un ancho ad-hoc que
  solo esa pantalla necesita.

## Ejecutar una pantalla / varias / un módulo / todo

```bash
pnpm --filter web responsive:check existencias                 # una
pnpm --filter web responsive:check existencias traslados vender # varias
pnpm --filter web responsive:check --module inventario          # un módulo completo
pnpm --filter web responsive:check all                          # todas las registradas
```

El id corto (`existencias`) resuelve solo si no hay ambigüedad entre módulos; si la hay, hay que
dar el id completo (`inventario.existencias`).

## Cómo detecta overflow

`overflowGlobal` en cada caso registra `window.innerWidth/innerHeight`,
`document.documentElement.clientWidth/scrollWidth` y `document.body.scrollWidth` — se guardan en
el reporte como señal, pero **nunca deciden solos** un FAIL: por diseño (para no repetir el error
de medir con `scrollWidth` a secas), la única señal que decide el veredicto es el clipping real
por elemento.

## Cómo detecta clipping

Por cada elemento que matchea los selectores clave (ver abajo), `getBoundingClientRect()` contra
el límite vigente (el viewport, salvo que la pantalla pida otra cosa — ver «Contenedores»), con
1px de tolerancia subpíxel: `rect.left < límite.left - 1` o `rect.right > límite.right + 1`.
Selectores por defecto (`motor/deteccion.mjs`, `SELECTORES_POR_DEFECTO`): `button`, `a[href]`,
`input`, `select`, `textarea`, `[role="button"|"link"|"tab"|"menuitem"|"checkbox"]`, `h1-h3`,
`label`, `dl` (resúmenes de datos clave) y `[data-critico]` (opt-in para lo que un componente
quiera marcar a mano). Una pantalla o un escenario puede sumar más con `elementosClave: [...]`.

## Cómo maneja contenedores

Por defecto se compara contra el viewport. Dos casos especiales:
- **Scroll horizontal legítimo** (detectado solo, sin configurar nada): si un elemento vive
  dentro de un ancestro con `overflow-x: auto|scroll` cuyo `scrollWidth` excede su `clientWidth`,
  se salta — es alcanzable desplazando ESE contenedor, no es un bug. El contenedor en sí (si
  matchea algún selector) se sigue comparando contra SU propio límite, así que un carrusel que se
  sale de SU padre igual se detecta.
- **Límite explícito**: una pantalla o escenario puede pasar `limite: "<selector>"` para comparar
  contra el rect de ESE elemento en vez del viewport (por ejemplo, validar solo lo que hay
  adentro de un modal). `ambito: "<selector>"` acota además QUÉ subárbol se recorre.

## Cómo evita falsos positivos

Un elemento se salta si: está oculto (`display:none`, `visibility:hidden`), su ancestro más
cercano tiene `[aria-hidden="true"]`, `[hidden]`, `[data-state="closed"]` (un Radix cerrado) o
**`[inert]`** — el mismo atributo nativo que ya usa `AppShell.tsx` para el cajón lateral colapsado
en celular (`<aside inert={esCelular && !movilAbierto}>`); el motor no inventa nada ahí, respeta
la misma señal que el navegador ya usa para volverlo no interactivo. Para lo que no encaja en
ninguna de esas, el opt-out explícito es el atributo `data-fuera-de-pantalla` en el componente, o
`exclusiones: ["<selector>"]` en el registro de la pantalla/escenario (se salta ese selector y
todo su subárbol, sin tocar el componente).

## Cómo genera screenshots

Un caso que da FAIL guarda automáticamente una captura:
`{modulo}-{pantalla}-{escenario}-{viewport}-FAIL.png` en `capturas/`. Con `--capturas-todas`
también se guarda una por cada caso que pasa (`...-PASS.png`), para una auditoría visual
completa.

## Cómo persiste/reutiliza sesión

`motor/sesion.mjs`: la primera corrida hace login de verdad contra `${baseURL}/login` con las
credenciales de desarrollo leídas en caliente de `supabase/seed.sql` (nunca se imprimen ni se
hardcodean) y guarda las cookies con `storageState` de Playwright en
`responsive/.sesion/storageState.json` (gitignored). Las corridas siguientes, si ese archivo
tiene menos de 12h, lo reusan sin loguearse de nuevo. Nada de esto expone secretos: el archivo es
local, no se commitea, y ni la clave ni el usuario aparecen en ningún log.

## Cómo prepara datos reproducibles

No prepara datos nuevos: usa lo que ya trae el seed local de Supabase (`supabase/seed.sql`),
igual que corre la app en desarrollo — así una corrida hoy y una corrida el mes que viene ven el
mismo catálogo, salvo que alguien reseedee la base a mano. Un escenario que necesite un estado
más específico lo arma con Playwright dentro de su propio `preparar()` (filtrar, buscar, abrir
algo) en vez de depender de que exista una fila concreta por azar — por eso, por ejemplo, el
escenario "Cajón de la prenda abierto" de Existencias abre **la primera** fila de la tabla
(`main [aria-label^="Abrir "]`) y no un producto por nombre.

## Agregar exclusiones

Dos formas, según dónde viva el conocimiento:
- **En el componente** (algo que SIEMPRE es off-canvas por diseño, para cualquier pantalla que lo
  use): agregarle el atributo `data-fuera-de-pantalla`.
- **En el registro de la pantalla** (algo específico de esa pantalla/escenario, sin tocar el
  componente): `exclusiones: ["<selector>"]` a nivel pantalla (aplica a todos sus escenarios) o
  a nivel escenario (solo ese).

## Dónde quedan screenshots/reportes

`responsive/.salida/<fecha-ISO-de-la-corrida>/` — `reporte.md` (para leer), `reporte.json` (para
que Claude Code lo parsee sin regex sobre texto) y `capturas/`. Toda la carpeta está en
`.gitignore`: se regenera en cada corrida.
