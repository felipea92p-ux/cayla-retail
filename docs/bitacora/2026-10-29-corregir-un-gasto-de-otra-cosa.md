# 2026-10-29 · Corregir un gasto de «otra cosa» (rama clever-goldwasser-719e02)

- **Qué:** Felipe pidió poder editar los gastos de «Gasté en otra cosa» (Comida, Saco Piñata…) que salen como «Compras lo revisa», igual que ya se corrigen las compras (ADR-0561).
  Nueva `corregir_gasto_rapido` (concepto, qué fue, monto y foto) solo con el gasto por completar y su ronda abierta (una cerrada se reabre antes, ADR-0569), todo o nada, el rastro
  en `compra_gasto_correcciones`; la plata de «Tienes para comprar» y el «gastaste» de la ronda se recalculan solos porque ya leen el monto vivo del gasto. En la web, «Corregir este gasto»
  en el detalle de la fila, con la misma hoja de «Gasté en otra cosa» (ahora una sola pieza, `CamposDelGasto`) y un cuadro de «qué cambia». ADR-0572, migración `20261029171000` (NO en producción: la pega Felipe con su OK).
- **Verificado:** `pnpm pruebas:compras-simple-corregir-gasto` 13/13 en Postgres local; vitest de la web completa, `tsc`, `knip`, guía (huella aceptada) y la clave de firma (67);
  en el navegador con una página temporal de respuestas inventadas (ya borrada): el flujo completo a 1024 y a 375 px. **Falta:** verlo con una cuenta de compradora real, `/formidable`, `/chaos`
  y avisarle a Compras, en «Revisar compras», que un gasto fue corregido.
- **Choques probables:** `apps/web/lib/guias/pantallas/compras.ts` y su huella `compras.mi-plata.json` (otra sesión toca «Cerrar mi ronda»), y el conteo de claves de firma (67) en `responsable-omitido.test.ts` y `responsable_omitido.mjs`.
