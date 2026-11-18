# 2026-11-18 · modern-web-guidance-skill-64cb91

Lo que el laboratorio `docs/maquetas/plataforma-moderna-2026-11/` propone llevar al ERP. Nada se cambia sin que Felipe lo elija mirando.

- [ ] **Tomar · `:user-invalid`** en lugar de la cuenta de «ya se tocó» de `useValidarAlSalir` (Baseline amplio desde 2023). No cambia qué se valida.
- [ ] **Tomar · la raya de `<Pestanas>` con anchor positioning** en vez de medir con JavaScript; sin soporte, raya fija.
- [ ] **Tomar · `@starting-style` + `allow-discrete`** dentro de `<Modal>`, `<Cajon>` y los menús, sin cambiar cómo funcionan.
- [ ] **Tomar · `document.ariaNotify()`** en `avisar.*`, con región viva de respaldo.
- [ ] **Probar · una hoja nueva con `<dialog>` nativo** y medir cuánto de `useEscapeLibre` / `useAtrasCierraLaHoja` sobra. Safari sin `closedby`.
- [ ] **Probar · `light-dark()`** para no escribir cada token dos veces (`globals.css` + `tema.css`). Toca el contrato con Dynamic: decide Felipe.
- [x] **Hecho (solo funcionalidad, 2026-11-18):** Ver más (Ctrl+F), globo «?»/«!» que se cierra al salir de la vista, Copiar que avisa
      al lector, notas que crecen, títulos y frases sin palabra sola. **Falta mirarlo en el navegador** (local con `.env.local` o la
      vista previa de Vercel del PR): abrir un «Ver más» con Ctrl+F, bajar con un «?» abierto, copiar dos veces con VoiceOver, escribir
      una nota larga, y comparar un título largo a 1440 px y a 375 px.
- [ ] **Descartado por «sin cambiar el diseño»:** Ctrl+F en pestañas (las pantallas solo dibujan la vista activa y 50 filas son URL),
      bordes y gota por CSS, la barra que se viste al pegarse, `:user-invalid` (nuestros campos validan con reglas propias).
- [ ] **Tomar · `<Pestanas>`:** vistas ocultas con `hidden="until-found"` + `beforematch` (Ctrl+F abre la pestaña), bordes con máscara por scroll
      (adiós `FilasQueSeDeslizan`) y la gota atada con anchor (adiós `IndicadorDeslizante`). Maqueta: `docs/maquetas/mejoras-componentes-2026-11/`.
- [ ] **Tomar · `<FilasDeMas>`:** `hidden="until-found"` en vez de `inert`, para que Ctrl+F encuentre las filas guardadas.
- [ ] **Tomar · `text-wrap: balance` / `pretty`** en `EncabezadoPagina`, `TituloSeccion`, el título de `Modal` y `.texto-bajada` (pasa por `/tipografia`).
- [ ] **Tomar · `field-sizing: content`** en las notas (`textarea`): crecen solas entre 2 y 8 líneas.
- [ ] **Probar · `<Ayuda>` con anchor positioning** (se esconde solo si su botón sale de la vista); Firefox necesitaría polyfill.
- [ ] **Probar · `scroll-state(stuck)`** para que la cabecera y las barras pegadas lleven vidrio solo al pegarse (sin soporte, como hoy).
- [ ] **Probar · `<BotonCopiar>` con globito `role="status"`**: cambia la cara de la pieza, decide Felipe por `/unificar`.
- [ ] **Igual a la vista · `<BarraAvance>` y `<Anillo>` sobre `<progress>`**: solo accesibilidad y alto contraste.
- [ ] **No por ahora · `base-select`:** sin buscador (regla ADR-0209) y Firefox cae al combo del sistema.
- [ ] **No en el ERP · animaciones por scroll (`view()`):** las animaciones arrancan apagadas (ADR-0625); quizá en la tienda.
