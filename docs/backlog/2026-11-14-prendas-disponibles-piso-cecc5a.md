## 🧵 Plan del piso ▸ «Configurar piso» (2026-11-14, ADR-0329 act.) — rama `claude/prendas-disponibles-piso-cecc5a`, sin migración, sin PR

Pedido de Felipe: un botón de configuración del piso para actualizarlo contra la realidad. Construido con `/construir` en 6 actividades.

- [x] 1. `leerCapacidadPiso` trae `version` y `contadaEl` (`231f44a90`).
- [x] 2. Reglas puras `lib/capacidad-piso-config.ts` con su prueba (topes cruzados contra la migración) (`15a38be49`).
- [x] 3. Hoja «Configurar el piso» + botón de la cabecera, solo líder en una tienda; guía de foco, paso en la guía interactiva y huella (`236f63dcd`).
- [x] 4. Escenarios de modo oscuro y recorrido de la guía a 1440 y 375 px (`74379b41d`).
- [x] 5. `/chaos` (4 de 4 resisten), `/milimetro` (0 graves; correcciones en `00c9eb9d1`) y prueba ciega de `/formidable`.
- [x] 6. ADR-0329 (actualización), `ARQUITECTURA.md`, bitácora y tableros.
- [ ] Los 3 cambios de `/formidable` (`docs/formidable/plan-piso-configurar.md`), esperan el OK de Felipe: tocar la fecha bloqueada apaga «Aún no lo conté»; «Con lo que cuelga hoy:» antes de la frase; un «?» que diga que el valor anterior queda anotado.
- [ ] Probar con una cuenta no líder en el navegador y en un celular real; abrir PR con `/abrir-pr` (la rama no se ha subido).
- [ ] Decisión de Felipe: si quien mide cuenta metros de riel y no m², la hoja debería partir de ese dato.
- [ ] Higiene local: la base Docker compartida quedó con Lima en versión 5 y 3 filas de Actividad de mis pruebas; `pnpm pruebas:capacidad-piso` falla 4 casos hasta rehacer la base.
