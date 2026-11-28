## · Separar sin punto en el panel (2026-11-27, ADR-0716) — solo web, sin migración; rama `claude/sin-punto-medio-panel`

### Hecho

- [x] La regla de once casos escrita en Retail: ADR-0716, `.claude/rules/separar-sin-punto.md`, fila en el índice de `CLAUDE.md`, fila
  «linea-de-datos» y nota del caso 3 en `unificar.md`, y regla **S10** en `docs/familia/contrato.json` (versión 5) con su
  `aplicacion_pendiente` para Dynamic.
- [x] Las tres piezas, con sus pruebas: `components/ui/LineaDeDatos.tsx` (con `renglones` para una fila angosta),
  `components/ui/CabeceraConCuenta.tsx` + `lib/cuenta-en-frase.ts`, `lib/lista-dicha.ts` (`listaDicha` y `prendaDicha`).
- [x] Las 20 copias de `new Intl.ListFormat("es", …)` del panel (16 archivos) y `unirConO` llaman a `listaDicha`.
- [x] Movimientos limpio (Movimientos, Ingresos y Pérdidas) y la cabecera de toda pantalla (`EncabezadoPagina`, `FechaHoraLima`).
- [x] Freno `lib/sin-punto-medio.test.ts` con `MODULOS` (solo crece), probado contra lo que debe frenar.
- [x] Verificado en el navegador a 1440 y 375 px, en claro y en oscuro, con capturas del antes y el después.

### Sin hacer (dicho sin adornos)

- [ ] **Felipe mira la muestra en producción** y dice si se sigue con otro módulo. Quedan unas 2 380 líneas con «·» en unos 850 archivos del panel.
- [ ] **No se vio la cuenta urgente en rojo con datos reales:** la base local no tiene prendas que «aparecieron» en los últimos 90 días; la
  pieza está probada en su prueba (`lib/sin-punto-medio.test.ts`) y en Dynamic (Incidencias).
- [ ] **Dynamic:** traer las tres piezas con la misma forma (lo pide `aplicacion_pendiente` del contrato; el vigilante abrirá la tarea por
  `components/ui/`). Desde aquí no se toca ese repositorio.
- [x] **PR #2052** (2026-11-28): Felipe pidió llevarlo a producción («Realiza lo necesario para tener todo en produccion») y lo confirmó en
  esta sesión; fusión automática cuando el CI dé verde. Auditoría al milímetro en `docs/milimetro/auditorias/2026-11-28-movimientos-sin-punto.md`.
- [ ] **`/formidable` y `tema:auditar` no se corrieron** en Movimientos: el cambio es de texto y de la línea de datos; en oscuro midió `/color`.
