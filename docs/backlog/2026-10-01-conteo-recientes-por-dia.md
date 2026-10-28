## 📅 Conteos recientes por día con filtro (2026-10-01, ADR-0296) — solo web, sin migración; rama `claude/conteo-recientes-por-dia`

- [x] Bandas por día, hora de apertura, filtro Todos · Hoy · Ayer · fecha (`CampoFecha` con `diasMarcados`), día sin conteos, `?dia=` en la URL que conserva `?variantes=`. Pruebas de la lógica pura; suite, `tsc` y eslint en verde.
- [ ] **Sin ver en producción** hasta fusionar: con la cuenta de Almacén Trujillo, «Hoy», «Ayer», un día sin conteos y el calendario (puntos en los días con conteos); también a 375 px.
- [ ] **Límite conocido:** el calendario llega a los últimos 300 conteos de la sede (~3 años a 100 al año); si una sede los supera, pasar la fecha a la base.
