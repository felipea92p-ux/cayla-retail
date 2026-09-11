# ADR-0037 — GSAP entra solo para ScrollTrigger; el resto del movimiento sigue en CSS

**Fecha:** 2026-09-11
**Estado:** Aplicado

## Contexto

Felipe pidió integrar GSAP al proyecto. Al auditar antes de instalar nada apareció
la misma tensión que ya resolvió ADR-0011: el repo tiene una capa de movimiento
propia en `app/globals.css` (gestos `entrada`/`revelar`/`asentar`, el "hilo vivo",
barrido de luz), construida a propósito sin librerías — incluso se evitó sumar
Radix Select por un simple desplegable. Sumar una librería de animación de ~70kb
para lo que CSS ya resuelve habría sido pagar peso de bundle por algo duplicado
(principio 3, simplicidad radical).

Se le marcó la tensión a Felipe con AskUserQuestion antes de tocar código: ¿qué
necesita hacer con GSAP que la capa CSS no cubre? Respuesta: **ScrollTrigger** —
animaciones ligadas al scroll. Ahí sí hay una razón real: `animation-timeline:
scroll()` (el equivalente en CSS puro) todavía tiene soporte de navegador parejo
y poco control fino de punto de disparo/pin, mientras que ScrollTrigger lo
resuelve bien. GSAP y todos sus plugins (incluido ScrollTrigger) son gratis desde
que Webflow adquirió la librería — ya no hay versión de pago que evitar.

## Decisión

**GSAP entra únicamente para lo que la capa CSS no puede: disparar una animación
cuando algo cruza el viewport durante el scroll.** No reemplaza `anim-entrada`,
`anim-asentar` ni el resto de `globals.css` — esos siguen en CSS puro, sin tocar.

- **`components/ui/RevelarAlScroll.tsx`** — un solo componente cliente. Envuelve
  contenido y lo revela con el mismo gesto visual que `.anim-asentar` (opacidad
  0.35→1, 4px), pero disparado por `ScrollTrigger` (`start: "top 85%", once: true`)
  en vez de al montar.
- **`CustomEase` en vez de una curva nueva.** GSAP no entiende `cubic-bezier(...)`
  crudo como CSS, así que en vez de aproximar `--ease-cayla` a ojo con un ease con
  nombre de GSAP (`power2.out`, etc.) se registró la curva EXACTA
  (`0.32, 0.72, 0.24, 1`) vía `CustomEase.create`. La capa de scroll se ve
  idéntica a la capa CSS — misma física, dos disparadores distintos.
- **`prefers-reduced-motion` con `gsap.matchMedia()`.** Mismo criterio que
  `globals.css`: quien pidió menos movimiento ve el resultado (duración
  colapsada a ~0), no el viaje — nunca se elimina la animación de golpe.
- **Regla de ADR-0011 respetada:** el movimiento responde a una acción de la
  persona. Acá la acción es el scroll mismo (`once: true`, no se repite al
  volver a pasar) — no es decoración que se dispara sola.
- **Primera aplicación: `/comercial`.** Dashboard de decisiones comerciales con
  varias secciones apiladas (qué reponer, rotación, comparativo de sedes) que el
  Líder recorre con scroll — candidato natural, no una pantalla elegida al azar.

## Consecuencias

- Nueva dependencia: `gsap` + `@gsap/react` (`useGSAP` para que el cleanup de
  ScrollTrigger/matchMedia sea automático al desmontar). Es la única librería de
  animación del repo; todo lo que no necesite scroll sigue en `globals.css`.
- Verificado en navegador (ruta de prueba temporal `/prueba-scroll`, con bypass
  temporal en `proxy.ts` para saltar el login — no había credenciales de sesión
  disponibles; ambos se revirtieron antes de cerrar): al hacer scroll, los
  bloques que ya cruzaron el 85% del viewport quedan en `opacity: 1` sin
  transform, y los que siguen fuera de vista quedan en `opacity: 0.35,
  translateY(4px)` — el estado "antes de revelar" de `.anim-asentar`, disparado
  por scroll en vez de al montar. `tsc`, `eslint` y `next build` en verde.
- Queda como precedente para el resto del repo: antes de usar GSAP en una
  pantalla nueva, primero preguntar si CSS puro ya lo resuelve (probablemente
  sí) — GSAP es la excepción para scroll, no el nuevo default de animación.
