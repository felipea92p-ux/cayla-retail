## Qué cambia y por qué

## Cómo se verificó

<!-- Comando y resultado, o el recorrido en el navegador. -->

- [ ] Si toca Vender, Cambios o Devoluciones (`/vender`, `/vender/apartados`, `/cambios`, `/devoluciones`, o los componentes `PuntoDeVenta*`, `Cambio*`/`Cambios*`, `Devoluciones*`): **probado a 375 px de ancho, con captura** adjunta aquí. Caja y Almacén siguen siendo de escritorio (PL-105).

- [ ] Si agrega o cambia una pantalla o un modal donde se llenan campos o se avanza por pasos: **lleva su guía de foco** (qué está
  hecho, qué sigue y qué falta; CLAUDE.md «Guía de foco», ADR-0284) y, si es una pantalla nueva, está declarada en
  `lib/guia-de-foco-pantallas.ts`; o el cuerpo dice por qué no aplica. Una pantalla nueva no nace «pendiente».

- [ ] Si agrega o cambia un campo que muestra un ejemplo o texto de ayuda (placeholder, «Ej. …», chips o listas sugeridas): **el ejemplo
  sigue lo que la persona ya eligió** (`/sugerir`; CLAUDE.md «Sugerencias coherentes», ADR-0289), probado en el navegador tocando cada
  control que lo mueve, y a 375 px que no se corte. Si no depende de nada elegido antes, va marcado `// sugerir-fijo: <por qué>`.
  Un archivo nuevo no entra a `lib/sugerir-archivos.ts` (`pnpm sugerir` lo dice).

## SQL para producción

<!-- Si el PR agrega archivos en `supabase/migrations/`: cada uno en orden, en cuántas partes se pega y la consulta que
     comprueba que quedó (md5 esperados). Si no trae migraciones, deja las casillas sin marcar: el check no las pide.
     Vercel publica `main` apenas se fusiona: si el SQL no está pegado, la web nueva pide funciones o columnas que
     producción no tiene (pasó con 6 cambios el 2026-09-27). Mientras una revisión siga corriendo sobre esta rama, el PR
     va en BORRADOR (Draft): GitHub no deja fusionar un borrador. -->

- [ ] **SQL pegado en producción.** Cada migración nueva de este PR se pegó en el SQL Editor de producción, en su orden y
  por partes como dice su encabezado, y la consulta de verificación dio lo esperado. Se pega ANTES de fusionar.
- [ ] **El SQL se pega después de fusionar**, porque pegarlo antes rompería la web de hoy: el cuerpo dice por qué, y queda
  en el archivo de la rama en `docs/backlog/` como «POR PEGAR» con la fecha.

<!-- El check «SQL pegado» sale rojo si el PR trae una migración nueva y no hay ninguna de las dos casillas marcadas, o si
     edita o borra una migración que ya está en `main` (la corrección va en un archivo nuevo). -->
