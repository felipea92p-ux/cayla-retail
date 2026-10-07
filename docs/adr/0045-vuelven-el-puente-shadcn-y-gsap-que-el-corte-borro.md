# ADR-0045 — Vuelven el puente shadcn (ADR-0037) y GSAP (ADR-0038) que el corte V1→V2 borró

**Fecha:** 2026-09-14
**Estado:** Aplicado en `main` local (rama `feat/pos-ticket-progresivo`).
**Afecta:** `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/lib/motion-gsap.ts`,
`apps/web/components/ui/RevelarAlScroll.tsx`, el bloque «Puente shadcn/ui» de
`apps/web/app/globals.css`, `apps/web/package.json` (siete dependencias) y los ADR-0037 y
ADR-0038, restaurados con su texto original.

## Contexto

Al pedir «los componentes animados de shadcn, tal vez ya existentes» para el ticket de
Vender, se midió qué había: **nada**. El corte V1→V2 (`0af2f1b`, 2026-09-12)
reemplazó el núcleo entero y se llevó, sin decirlo en ningún documento vivo:

- el puente shadcn/ui de ADR-0037 (`components.json`, `cn()` en `lib/utils.ts`, los tokens
  semánticos `--color-primary/accent/ring/…` de `globals.css` y sus dependencias);
- GSAP de ADR-0038 (`lib/motion-gsap.ts` con la curva `caylaEase` y los plugins,
  `RevelarAlScroll.tsx`, y el reflujo con `Flip` del carrito del POS V1);
- los tres ADR (0037, 0038, 0039) — por eso `docs/adr/` saltaba de 0036 a 0041.

Los componentes shadcn de ADR-0038-bis (`badge/command/popover/table`, commit `bbc2575`)
nunca llegaron a `main`: se quedaron en una rama. No había nada que restaurar ahí.

## Decisión

Felipe eligió (2026-09-14, opción B) **traer de vuelta lo que había**, no rehacerlo:

- **Vuelve tal cual** lo que era de toda la app: el puente shadcn (mismos tokens, misma
  regla «`primary` es tinta, no rojo»), `cn()`, `motion-gsap.ts`, `RevelarAlScroll`, y las
  dependencias con los mismos rangos de versión que tenía V1 (`@radix-ui/react-slot`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `gsap`,
  `@gsap/react`). Los ADR-0037 y ADR-0038 se restauran con su texto original y una nota
  al inicio que apunta acá. Único recorte: el registro `@bklit` de `components.json`,
  que era de los charts.
- **No vuelve** lo que era de Finanzas V1, módulo que V2 borró a propósito:
  Bklit UI y los charts (ADR-0039, `motion`, `@number-flow/react`, `visx`, `d3`,
  `shimmering-text`). Si algún día hace falta un número animado en el ticket, es una
  decisión nueva, no una restauración.
- **El uso que vuelve primero es el que V1 ya tenía en el POS:** el reflujo con `Flip` al
  agregar o quitar una prenda, ahora sobre las líneas de `PuntoDeVentaTicket` (ADR-0038,
  adenda: «el momento de mayor fricción visual del POS»). El `useGSAP` y el ref viven en el
  padre `PuntoDeVenta` — el ticket sigue sin hooks (ADR-0043) y solo recibe el ref de su
  lista. La regla de ADR-0038 sigue vigente: antes de usar GSAP en una pantalla nueva,
  primero preguntar si CSS puro ya lo resuelve.

## Consecuencias

- Siete dependencias vuelven a `apps/web/package.json`; `pnpm-lock.yaml` cambia. Si otra
  rama del mismo día toca el lockfile, el choque es en ese archivo y se resuelve
  reinstalando, no a mano.
- Los tokens semánticos de shadcn existen otra vez, así que `npx shadcn add <componente>`
  vuelve a pintar con la identidad CAYLA sin retoques. Ningún componente shadcn queda
  instalado por este ADR — igual que en ADR-0037, solo la base.
- La capa CSS de movimiento (`anim-entrada/revelar/asentar/salida`, `alza-cayla`) no cambia
  y sigue siendo el default; GSAP es la excepción para scroll y para el reflujo de listas.

## Verificación

- `tsc`, `eslint`, `vitest` y el pre-commit del repo en verde.
- Reflujo `Flip` del ticket: verificado en navegador (ver BITÁCORA 2026-09-14).

## Adenda — sesión A, mismo día: los primeros componentes y el scroll interno

Las dos sesiones del 2026-09-14 recibieron la misma decisión (2-B) y la ejecutaron en
paralelo; esta rama llegó segunda y se quedó con la restauración de arriba tal cual. Lo que
suma, porque el catálogo de Vender lo necesita:

- **Primeros componentes instalados: `tooltip`, `toggle`, `badge`** — con
  `npx shadcn@latest add`, desde `apps/web`, contra el `components.json` restaurado. El CLI
  de hoy no genera lo que V1 esperaba: importa `cn` desde el paquete **`cn`** (de
  shadcn-ui, reemplazo compilado de `clsx + tailwind-merge`) y los primitivos desde el
  paquete paraguas **`radix-ui`**. Pelear esa convención sería editar a mano cada componente
  futuro, así que se adopta: `lib/utils.ts` pasa a **reexportar** `cn` del paquete, de modo
  que `@/lib/utils` y `"cn"` son una sola implementación (dos `cn` distintos fusionarían
  clases distinto); `clsx` y `tailwind-merge` salen porque nada los usa ya.
- **`tw-animate-css`** entra: es lo que anima la entrada/salida de los componentes shadcn
  (fundido + 95 % de escala, ~150 ms, sin rebote — compatible con ADR-0011). Regla de
  convivencia: un componente shadcn conserva su animación de tw-animate; lo que no es
  shadcn sigue con `anim-*` de `globals.css`; GSAP sigue siendo solo scroll y reflujo.
- **`RevelarAlScroll` descubre el contenedor que scrollea.** En V1 miraba solo la ventana;
  el POS es pantalla fija (ADR-0044) y la grilla scrollea por dentro, así que ahora busca el
  ancestro con `overflow-y: auto|scroll` (o acepta `scroller`). Disparo en `top 90%`.
- `TooltipProvider` se monta donde se usa (el catálogo), no en el layout raíz: aditivo.
- Mismo día, más tarde: **el POS dejó de usar `RevelarAlScroll`** (decisión de Felipe). El
  reveal dejaba tarjetas en opacidad 0.35 mientras las sin stock van en 0.55 — dos
  atenuados con significados distintos en la misma grilla. El componente sigue en `ui/`
  para tableros con scroll largo, que es donde nació (ADR-0038).
- Gotcha medido, en dos tiempos: instalar un paquete CSS con el dev server corriendo deja
  al proceso de PostCSS con la resolución fallida cacheada («Can't resolve
  'tw-animate-css'») hasta reiniciarlo; y aun reiniciado, **la caché persistente de
  Turbopack (`apps/web/.next`) puede seguir sirviendo el CSS compilado sin el import** —
  el CLI de Tailwind lo compilaba bien y el navegador no veía `.animate-in` ni
  `@keyframes enter`. La cura es borrar `apps/web/.next` y volver a levantar.

## Actualización 2026-10-06 — se borran las piezas que ninguna pantalla usaba

Rama `claude/determined-thompson-f7b8d8` (limpieza de código muerto de `apps/web`). El puente sigue en pie:
`components.json`, los tokens de `globals.css`, `lib/motion-gsap.ts` y los componentes shadcn que sí se dibujan
(`badge`, `tooltip`). Lo que sale:

- **`components/ui/RevelarAlScroll.tsx`.** Desde que el POS lo dejó (arriba) ningún tablero lo montó en tres semanas.
  GSAP se queda para el reflujo `Flip` del ticket; `motion-gsap.ts` no cambia y sigue registrando `ScrollTrigger`, así
  que volver a revelar al hacer scroll es recuperar el componente de la historia de git, sin instalar nada.
- **`components/ui/toggle.tsx` y `lib/utils.ts`.** El primero se instaló con el CLI en la adenda de arriba y nadie lo
  dibujó; el segundo (el reexport de `cn`) no lo importa nadie: los componentes que genera el CLI importan `cn` del
  paquete, como `badge` y `tooltip`. `components.json` sigue apuntando su alias `utils` a `@/lib/utils`; si un
  componente generado llegara a importarlo, basta con volver a crear esa línea (`export { cn } from "cn";`).
- **Ninguna dependencia queda sin uso**: `cn`, `class-variance-authority` y `radix-ui` siguen en `badge`, `tooltip` y
  los filtros; `package.json` no se toca.
