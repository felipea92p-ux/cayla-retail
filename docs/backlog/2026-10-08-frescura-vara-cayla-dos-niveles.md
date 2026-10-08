## Inventario ▸ Frescura del piso: vara CAYLA de respaldo, umbral de evidencia y dos niveles (2026-10-08, ADR-0208 act. 2026-10-07) — rama `claude/frescura-vara-cayla-dos-niveles`

Una actividad por commit (`/construir`); el orden es por dependencia.

- [x] 0 · Rama al día con `origin/main` (`4613b0d53`); ADR-0208 con las 4 decisiones de Felipe y las 2 técnicas; fila en `SESIONES-ACTIVAS.md`.
- [x] 1 · «Por decidir» exige 2 ventas esperadas, no 1 (`rapidezParaDecidir`, antes de `estaQuieta`; el pilar pasa con cualquier evidencia, la que dejó de vender también). 7 pruebas nuevas, entre ellas el caso exacto de la captura de TRU; 395 de Frescura en verde.
- [x] 2 · Tabla `retail.frescura_vara_cayla` + `guardar_frescura_vara_cayla` (solo `service_role`) + `fn_frescura_vara_cayla` (quien ve Frescura) + parche anclado de `fn_frescura_sede` (deja pasar a la llave de servicio; md5 «después» `2b9fde71…`/`6ac58e3c…`) + ruta cron `GET /api/inventario/frescura-vara-cayla` (3:20 de Lima) + `lib/frescura-vara-cayla.ts`. Verificado: 12 casos SQL en el stack local (`pnpm pruebas:frescura-vara-cayla`, paso en CI), 9 pruebas web, tsc y eslint. **Migración `20261008120000` sin pegar en producción** (la pega Felipe; antes de publicar la web). La lectura en la web va con la actividad 3.
- [ ] 3 · `analizarSede` juzga contra CAYLA cuando la tienda no llega a 10 ventas en la categoría; la fila dice «contra lo que vende CAYLA»; prueba con el fixture real.
- [ ] 4 · Tablero por categoría (barra apilada de unidades por estado, cuántas esperan decisión, con qué vara); tocar una fila filtra. Navegador a 1440 y 375.
- [ ] 5 · Lista: el botón dice el verbo y ejecuta (cambiar de lugar anota con Deshacer; trasladar abre Traslados con la prenda; retirar abre Existencias); un solo aviso; el chip «¿De qué temporada es?» sale de Frescura.
- [ ] 6 · Columna «ocupa · meta» por categoría leída de Plan del piso — **espera a que el PR #831 se fusione**.
- [ ] 7 · `docs/pantallas/inventario-frescura.md`, `docs/ARQUITECTURA.md` (tabla y cron nuevos), cierre de bitácora y de esta sección.
- [ ] Fuera de esta ronda: «entra una, sale una» desde el mix **aprobado** (segunda entrega de Plan del piso); vara CAYLA ponderada por tienda (hoy junta unidades: AQP, con 60 m², manda).
