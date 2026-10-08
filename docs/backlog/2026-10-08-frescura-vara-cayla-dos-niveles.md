## Inventario ▸ Frescura del piso: vara CAYLA de respaldo, umbral de evidencia y dos niveles (2026-10-08, ADR-0208 act. 2026-10-07) — rama `claude/frescura-vara-cayla-dos-niveles`

Una actividad por commit (`/construir`); el orden es por dependencia.

- [x] 0 · Rama al día con `origin/main` (`4613b0d53`); ADR-0208 con las 4 decisiones de Felipe y las 2 técnicas; fila en `SESIONES-ACTIVAS.md`.
- [ ] 1 · `estaQuieta` exige 2 ventas esperadas, no 1 (prueba: 0 vendidas con 1,0 esperadas no es «Por decidir»; con 2,1 sí).
- [ ] 2 · Tabla `retail.frescura_vara_cayla` + ruta cron diaria + lectura en `frescura.ts` — **migración sin pegar en producción** (la pega Felipe).
- [ ] 3 · `analizarSede` juzga contra CAYLA cuando la tienda no llega a 10 ventas en la categoría; la fila dice «contra lo que vende CAYLA»; prueba con el fixture real.
- [ ] 4 · Tablero por categoría (barra apilada de unidades por estado, cuántas esperan decisión, con qué vara); tocar una fila filtra. Navegador a 1440 y 375.
- [ ] 5 · Lista: el botón dice el verbo y ejecuta (cambiar de lugar anota con Deshacer; trasladar abre Traslados con la prenda; retirar abre Existencias); un solo aviso; el chip «¿De qué temporada es?» sale de Frescura.
- [ ] 6 · Columna «ocupa · meta» por categoría leída de Plan del piso — **espera a que el PR #831 se fusione**.
- [ ] 7 · `docs/pantallas/inventario-frescura.md`, `docs/ARQUITECTURA.md` (tabla y cron nuevos), cierre de bitácora y de esta sección.
- [ ] Fuera de esta ronda: «entra una, sale una» desde el mix **aprobado** (segunda entrega de Plan del piso); vara CAYLA ponderada por tienda (hoy junta unidades: AQP, con 60 m², manda).
