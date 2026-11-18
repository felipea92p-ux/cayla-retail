## Responsive de celular y tablet (`/multi-view-responsive celular`, 2026-11-18)

- [x] Modo `celular` en `/multi-view-responsive`: seis tamaños de teléfono y tablet y un segundo medidor (toque de 44 px, zoom de campos, pegado que no pega, fijo atrapado, barras pegadas).
- [ ] Correr `/multi-view-responsive celular` módulo por módulo, empezando por las rutas de celular obligatorio (`/vender`, `/vender/apartados`, `/cambios`, `/devoluciones`), con sus modales y hojas abiertos. Hoy solo se midió la pantalla de entrada de Vender, Cambios y Gastos a 375 px.
- [ ] **Felipe decide:** un teléfono acostado (844 × 390) recibe el diseño de escritorio con el menú lateral abierto: quedan 557 px de ancho y 390 de alto para la pantalla (visto en `/cambios`, 2026-11-18). ¿Se queda así, o bajo cierto alto el menú se pliega solo?
- [ ] A 844 × 390 el medidor marca un solape entre el logo del lateral y el botón de plegar (`a.group` ✕ `button.marco-plegar`): confirmar con captura si se ve o es solo el área del clic.
- [ ] Dos `100vh` sin respaldo en `dvh`: `apps/web/app/estilos/finanzas-dinero.css:846` (el alto máximo de un panel pegado) y `apps/web/app/global-error.tsx:62`. Riesgo bajo; el de `login.css` ya trae su respaldo.
- [ ] La tablet de verdad es táctil, pero el navegador integrado solo emula el dedo bajo 768 px: el toque de 44 px a 768 y 820 no se mide. Para medirlo haría falta sumarle esos anchos a `apps/web/tacto/medir.mjs` (Playwright sí emula el dedo a cualquier ancho).
