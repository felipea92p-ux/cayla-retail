## 🗓️ El subrayado de btn-enlace se ve en todos los enlaces (2026-10-14) — rama `claude/btn-enlace-subrayado`

- [x] **El subrayado tenue y el hilo rojo se pintan en todos los contextos** (`app/globals.css`, `.btn-enlace`): antes no se veían en 5 de 8 en
  reposo. Mismo lugar, sin mover nada (medido). Registro: `docs/unificar/enlace.md`.
- [ ] **Si aparece otro `btn-enlace` con su propio `mb-*`**, descuéntale 0,25 em como en `FiltrosMovimientos` (el margen de la utilidad le gana al
  negativo de la pieza y la caja crecería 0,25 em). Hoy no hay otro.
