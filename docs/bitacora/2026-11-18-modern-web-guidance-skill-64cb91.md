# 2026-11-18 · modern-web-guidance-skill-64cb91

- **Qué:** la skill `modern-web-guidance` (Google Chrome, Apache-2.0, commit `64a6d708`) entra al repo en `.claude/skills/` con su nota
  de CAYLA («se consulta, no manda»), su fila en `PROCEDENCIA.md` y el permiso solo para `npx -y modern-web-guidance@latest *` (y su
  versión `pnpx`) en `.claude/settings.json`. CLAUDE.md la suma a «Skills de diseño de afuera» y a la lista de skills de afuera.
- **Laboratorio:** `docs/maquetas/plataforma-moderna-2026-11/` rehace Existencias SIN las reglas del repo, con lo que la skill
  recomienda (`<dialog>` + `closedby`, `command`, `@starting-style`, `base-select`, `interestfor`, anchor positioning, `@container`,
  `:user-invalid`, `light-dark()`, `view()`, `ariaNotify`) y una tarjeta por pieza con «hoy en el ERP / con la plataforma / mi lectura».
- **Verificado:** en el navegador integrado (Chrome 156): abrir la hoja por botón y por menú, guardar con error y sin error, el «¿descartas?»
  con Esc real, el combo con muestras y teclado, el globo, el menú que se da vuelta, la tabla en tarjetas a 375 px y el modo oscuro.
  Aprendido: el guardián de cambios con `cancel` + `preventDefault()` falla sin un toque previo; la salida es `closedby="none"` mientras haya cambios.
- **Mejoras a piezas de hoy:** `docs/maquetas/mejoras-componentes-2026-11/` compara «Hoy» y «Propuesta» en ocho piezas (pestañas, ver más,
  globo, barra pegada, campos, avance y anillo, copiar, títulos). Aprendido: `:user-invalid` solo avisa mientras se escribe al volver a un
  campo que estaba bien; para «no a la primera letra» (ADR-0611) hace falta `:not(:focus)` y una marca `data-dicho`. Probado con teclas reales.
  No se pudo medir en el panel oculto: Ctrl+F de verdad, el seguimiento del globo «Hoy» al hacer scroll y la barra al pegarse.
- **Al ERP, solo funcionalidad (Felipe: «sin cambiar el diseño ni el estilo ni las animaciones»):** `FilasDeMas` pasa de `inert` a
  `hidden="until-found"` ya plegada y se abre sola al encontrar algo (`alEncontrar` en 11 listas; las otras 26 aprietan su botón con
  `aria-controls`); `AyudaCabecera` y el «!» de `Ayuda` se cierran si su botón sale de la vista (`useCerrarSiSeVa`); `BotonCopiar` avisa al
  lector fuera del botón y repite el aviso; `<NotasQueCrecen />` (layout) estira todo `<textarea>` con `field-sizing` desde el alto que ya
  tenía; `titulos.css` pone `text-wrap: balance` a los títulos y `pretty` a las frases, en `@layer base` con `:where()`.
  Verificado: tipos, 947 archivos de prueba (168 802 pruebas) y Knip en verde. **No verificado en el navegador:** este worktree no tiene
  `.env.local` y la base local de Docker es de otro proyecto.
