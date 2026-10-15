## 🐈 Aventurero en «Sin acceso» y en los errores (2026-10-15, ADR-0136 act. 2026-10-15) — solo web, sin migración; rama `claude/no-view-page-image-animation-972032`

- [x] **Pieza** `<Aventurero motivo="sin-acceso" | "error">`: foto en `public/aventurero.webp` (45 KB), texto Impact/Anton con los colores fijos, patas que teclean (CSS, quietas con `prefers-reduced-motion`).
- [x] **En:** «Sin acceso» (con el caso nuevo «tu cuenta no ve ninguna pantalla» y su botón «Ya me lo activaron»), `app/(app)/error.tsx`, `vender/comprobantes/error.tsx` y `global-error.tsx`.
- [x] **Verificado en local:** «Sin acceso» en claro, oscuro y 375 px con una cuenta de prueba; las barreras de error provocando un error a propósito (andamio borrado). Pruebas de la web, tipos, lint y Knip en verde.
- [ ] **Que un error avise solo.** El meme dice «lo está dando todo», pero hoy nadie se entera: el error del navegador queda en su consola y el del servidor solo en los logs de Vercel, sin aviso. Hasta que eso exista, la tarjeta sigue pidiendo «avisa a Felipe» con el código.
- [ ] **El error global en oscuro:** en `next dev` la pantalla de error global salió en claro con el tema oscuro guardado (su script del tema no corre al pintarse desde el navegador). Es de antes de este cambio; falta mirarlo en una versión de producción.
- [ ] **La 404** («Esta pantalla no existe») no lleva a Aventurero: no se pidió. Si Felipe lo quiere ahí, es una línea.
