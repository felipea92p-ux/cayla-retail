# Ficha al milímetro — la hoja de ofertas de una campaña (ADR-0677, actividades 7 y 8)

Se arma por partes, como se construye (`/construir`, 2026-11-18): cada actividad suma su sección. La cara: `docs/maquetas/campanas-simple-2026-11/`
(«Una sola hoja: el ejemplo es la opción»). Lo que guarda NO cambia: el estado de la oferta (`OfertaEnEdicion`), `problemasDeOferta` y
`/api/productos/campana-reglas` siguen siendo los de siempre; solo cambia cómo se ve.

## 7a · «Qué le das»: las cinco formas, y el ejemplo es la opción

| Pieza | Rama | Por qué |
|---|---|---|
| La fila de cinco (`.of-tipos` / `.of-tipo`) | **nueva**, con el vidrio claro y el ahumado denso de lo elegido | ninguna pieza del ERP dice «lo que da» en grande con una línea debajo y se elige; es hermana del cartel de oferta (`panel-de-campana.md`) |
| Los números de la elegida | **decididas, las de siempre:** `<PasoCantidad>`, `<CampoMonto>`, `pildora-cayla` | migrar cambia cómo se ve, nunca qué hace (ADR-0358) |

- **Medidas:** grilla `repeat(auto-fill, minmax(8.5rem, 1fr))` con 8 px de hueco; cada opción 12 × 14 px de relleno, radio 14 px, alto mínimo 76 px; el ejemplo en la serif a
  22 px (`text-wrap: balance`, el «%» pegado a su número con un espacio que no se corta); la línea a 14 px. La elegida en el ahumado denso con la letra crema; las demás en
  el vidrio claro, sin desenfoque (la hoja se desplaza, ADR-0623).
- **Texto (ley 8, «poco texto»):** salen la bajada «Elige lo que más se parezca…», los tres párrafos de ayuda (`.of-ayuda`), las píldoras «· pronto» y «Regalo» y
  «Club» (Felipe 2026-11-17). Lo que explicaban lo dice el ejemplo de cada opción.
- **Estados:** default, hover (solo con `(hover: hover)`, el borde a tinta 25 %), focus-visible (el anillo del sistema), elegida (`aria-pressed`, ahumado + letra crema: no
  depende solo del color, cambian fondo, borde y letra), quieto (sin transición). No hay apagadas: lo que no funciona no se muestra.
- **Pendiente para 7b:** a 375 px la pregunta vive en una columna de 204 px (la hoja de hoy pone la etiqueta al costado) y las opciones van de a una; la hoja de una sola
  columna lo resuelve.
