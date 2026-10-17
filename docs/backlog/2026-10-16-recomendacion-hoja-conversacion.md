## La hoja de una recomendación como conversación (2026-10-16)

**Hecho:** la hoja de Tienda web ▸ Recomendaciones se lee como una conversación (rama `claude/recomendacion-hoja-conversacion`).

**Para hacer:**
- [ ] **La demo de Recomendaciones no abre la hoja.** El paso «Una recomendación» hace clic en la primera fila con el cursor fantasma,
  pero la hoja no se abre, así que la guía se salta «Lo que escribió», «Quién la escribió», «Tu respuesta» y las acciones. Un clic de
  verdad sí la abre. Pasa igual con la hoja de antes de este cambio. Además, `guias:recorrer` no arranca con `?demo=1` en modo desarrollo
  (el mismo síntoma que se vio en Finanzas el 2026-10-16).
- [ ] **El aviso «Eres admin: no necesitas autorización…»** sale en todas las hojas que guardan cuando entra un Admin. Mostrarlo solo cuando
  alguien tiene que elegir responsable, o en su forma compacta, se decide en `ComboResponsable` para todo el ERP (decisión de Felipe).
