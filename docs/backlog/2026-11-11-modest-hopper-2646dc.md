## 🧭 La guardia de «¿Salir sin guardar?» ya no mueve la página (2026-11-11, ADR-0528 act. 2026-11-11) — solo web, sin migración; rama `claude/modest-hopper-2646dc`, sin PR

- [x] **El defecto, medido.** Con un clic real: en Recibir ▸ Contar (1280×560) «Una más» con la vista en 300, subir a 0 y a los 779 ms la vista
      volvía a 300; a 375 px, de 1184 a 934 a los 835 ms. En Conf. Tienda, escribir una letra, bajar y borrarla: de 515 a 355. En Nuevo
      producto, «atrás» con cambios: de 419 a 19 antes de preguntar.
- [x] **El arreglo** (`components/ui/useSalidaSinGuardar.tsx`, reglas en `lib/salida-sin-guardar.ts`): la entrada de abajo y la guardia quedan
      en «manual» mientras la guardia está puesta; fuera de ella toda entrada vuelve a «auto» (al terminar cada vuelta por el historial, al
      soltar la guardia para navegar y cuando el formulario se va) y el navegador anota de nuevo el scroll con un píxel de ida y vuelta, que
      espera si la persona está desplazando o hay un menú abierto. No cambia qué pregunta la guardia ni cuándo.
- [x] **Verificado en el navegador** (Playwright con clic, rueda y dedo reales, contra localhost, escritorio y 375 px): Contar no salta; deshacer
      no salta; «atrás» con cambios pregunta una sola vez y la página se queda, también tras «Seguir editando» en el teléfono; «Salir sin
      guardar» sale; salir y volver a Contar la deja donde estaba (150, no 300); una hoja del teléfono abierta y cerrada tras guardar no la
      mueve; nada hereda «manual» al salir por un enlace con cambios; con el menú «Más» abierto, el menú no se cierra solo.
- [x] **Pruebas:** `lib/salida-sin-guardar-scroll.test.ts` (19 casos; con el hook de antes fallan 2). `pnpm --filter web test` (891 archivos),
      `pnpm knip` y `pnpm knip:produccion`, en verde.
- [ ] **Sin probar:** Safari (iPhone) y Firefox. La regla se midió solo en Chromium; el modo se devuelve fuera del `popstate` pensando en ellos.
- [ ] **Queda en «manual» hasta que se la visita:** la entrada del formulario que se abandonó con la guardia puesta (se guardó y se navegó,
      «Salir sin guardar», una recarga). La primera vez que se vuelve a ella el navegador no le devuelve el scroll; ahí mismo vuelve a «auto».
- [x] **El parche local de Recibir, quitado** (la rama de ADR-0645 entró a `main` con el PR #1779 mientras se abría este): el efecto de
      `components/recepcion-conteo/RecibirContando.tsx` que ponía `scrollRestoration` en «manual» ya no está, y el ADR-0645 lo dice.
      Recibir ▸ Contar vuelto a medir sin él, en escritorio y a 375 px.
- [ ] **CAYLA Dynamic:** `components/ui/useSalidaSinGuardar.tsx` cambió cómo funciona (y `lib/salida-sin-guardar.ts` ganó la regla). Allá es tarea.
- [ ] **Hallazgo aparte, sin arreglar (no es de la guardia):** en Recibir ▸ Contar, contar 6, ir a otra pantalla y volver con «atrás» muestra 5
      (la pantalla guardada por el router), con 6 en la base; el siguiente «Una más» o «Una menos» guarda sobre el número viejo. Medido en local
      el 2026-11-11. Lo decide Felipe: toca cómo se guarda un conteo.
