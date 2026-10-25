# Backlog · 2026-10-25 · Producción: «Nueva orden» sobre la lista (ADR-0509)

- [x] Actividades 1 a 7 de la lista aprobada por Felipe (25-oct): «Ver OP-…» y URL limpia, terreno sin cambio visible + token por apertura, el formulario en la página, nivel 2 plegado, borrador y «crear otra», guías y modo oscuro, verificación y cierre.
- [ ] **Correr contra la base local** lo que no se pudo sin Docker: `pnpm --filter web guias:recorrer` de `produccion.ordenes` (escritorio y 375 px) y `pnpm --filter web tema:auditar` con los escenarios `produccion.orden-borrador` y `produccion.orden-oferta` (nunca se ejecutaron).
- [ ] `/formidable` de «Nueva orden» sobre la lista: la prueba ciega con un agente sin contexto y con 3 a 5 colaboradoras del Taller no se hizo (solo se midió y se revisó a mano).
- [ ] **De la base (zona roja, la decide Felipe):** la huella de idempotencia de `abrir_orden_produccion` no cubre las fases ni la tela; un reintento con otras fases devuelve la orden vieja sin error.
- [ ] Decidir si «Crear otra orden» debe ser un botón (como decía la lista aprobada) en vez del interruptor.
- [ ] Decidir si el formulario debe ser más bajo para que la lista se vea sin bajar (hoy la primera fila empieza a ~1300 px con el formulario plegado; 680 px de alto).
- [ ] El pliegue del nivel 2 (`components/orden-produccion/NivelDos.tsx`) es un componente local hecho con piezas del sistema: pasarlo por `/unificar` si Felipe lo quiere como pieza única.
- [ ] El borrador solo vive en el navegador donde se escribió: si el Taller trabaja desde dos computadores, decidir si merece una tabla (con migración, es zona roja).
- [ ] Una orden «Retomada» de un modelo que ya no existe abre el buscador con lo demás escrito: revisar si conviene avisarlo con una frase.
- [ ] R2 a R10 del 16-oct (Producción) siguen sin construir; ver `docs/pantallas/` y el artefacto de revisión del 25-oct.
