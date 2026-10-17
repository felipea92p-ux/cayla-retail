## 🧭 Guía de foco de la ficha del Equipo (2026-10-17, ADR-0284) — solo web, sin migración; rama `claude/keen-booth-bb6d01`

- [x] `FichaColaborador.tsx` con `useGuiaCampos` + `<CampoGuiado>` + `<PieGuia>`; lógica en `lib/ficha-colaborador-guia.ts` y su prueba
  (coincide con lo que apaga cada botón). `MODALES` la declara «aplicada»; `MODALES_PENDIENTES_HOY` 54 → 53.
- [x] Verificado en el navegador local (cuenta Admin del seed, 1280 px, claro y oscuro): con Micaela, «Cambiar rol» enciende el rol nuevo;
  con Sandra (líder sin sede) y «Integrante», se enciende «Sede donde queda» y el botón apagado dice «Falta: sede donde queda»; al elegir la
  sede, «Todo listo para cambiar el rol.» y el botón con su aro. No se guardó nada.
- [x] La guía interactiva de Colaboradores, recorrida a mano en el navegador (arrancada con «Demo»): 31 pasos y ninguna hoja abierta al terminar.
  El texto del paso «Cambiar rol, sede o suspender» suma que se enciende lo que sigue; huella aceptada.
- [ ] **Decisión de Felipe:** el motivo de «Suspender», ¿opcional (lo que hay hoy y lo aplicado) o sugerido?
- [ ] **`?demo=1` no arranca ninguna guía con `next dev`** (probado en `/colaboradores` y `/clientas`): la URL se limpia y la tarjeta nunca
  sale, así que `pnpm --filter web guias:recorrer` falla en local («la guía no arrancó con ?demo=1»). Causa probable: el modo estricto de
  React, que en desarrollo monta dos veces `components/guias/MotorGuias.tsx`. La limpieza al desmontar cancela el temporizador del arranque,
  y al volver a montar, `repetida` (el «arrancó hace menos de un minuto») solo limpia la URL. En producción no debería pasar. Sin arreglar aquí.
