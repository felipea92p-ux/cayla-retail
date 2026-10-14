## 🛜 Un corte de red no dice si se guardó (2026-10-14, ADR-0410) — solo web, sin migración; rama `claude/happy-euler-dda937`

- [x] `traducirError`: ante un corte de red, toda escritura dice la frase honesta; `confirmarAntesDeRepetir` queda aceptada y sin efecto.
- [x] Las 19 lecturas (cargar, buscar, leer, revisar antes de borrar, exportar, preparar la propuesta) piden `{ lectura: true }`.
- [x] Pruebas: `lib/error-escritura.test.ts` (los cinco textos de corte, la opción vieja, la lectura) y `lib/revisar-productos-reglas.test.ts`;
      vitest completo, tsc, eslint y knip en verde.
- [x] Navegador local: Ingresar insumo con la respuesta perdida tras guardar (frase honesta sin pedir la opción) y Mi perfil con la lectura
      cortada (frase neutra). Base local restaurada a su foto.
- [x] Felipe lo aprobó para todas las escrituras (2026-10-14), no solo para las pantallas con token.
- [ ] Cuando #1087 (Producción, ADR-0409) esté en `main`: borrar `confirmarAntesDeRepetir` de las 18 llamadas y su prueba de guardia.
- [ ] **La lista de atrás no se refresca tras un corte:** el lote estaba en la base y Insumos seguía en «0 lotes». Refrescar la pantalla
      (`router.refresh()`) cuando una escritura termina sin respuesta, en un solo lugar.
