# ADR-0045 — Vuelven el puente shadcn (ADR-0037) y GSAP (ADR-0038) que el corte V1→V2 borró

**Fecha:** 2026-09-14
**Estado:** Aplicado en `main` local (rama `feat/pos-ticket-progresivo`).
**Afecta:** `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/lib/motion-gsap.ts`,
`apps/web/components/ui/RevelarAlScroll.tsx`, el bloque «Puente shadcn/ui» de
`apps/web/app/globals.css`, `apps/web/package.json` (siete dependencias) y los ADR-0037 y
ADR-0038, restaurados con su texto original.

## Contexto

Al pedir «los componentes animados de shadcn, tal vez ya existentes» para el ticket de
Vender, se midió qué había: **nada**. El corte V1→V2 (`0af2f1b`, 2026-09-12, ADR-0035)
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
- **No vuelve** lo que era de Finanzas V1, módulo que V2 borró a propósito (ADR-0035):
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
