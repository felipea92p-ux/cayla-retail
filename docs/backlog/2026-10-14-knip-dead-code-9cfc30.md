## 🧹 Knip en el CI y el código muerto que encontró (2026-10-14) — sin migración ni RPC; rama `claude/knip-dead-code-9cfc30`, ADR-0406

- [x] **Knip 6.41.0** en la raíz: `knip.ts` (compilador de CSS para Tailwind v4, puntos de entrada que Knip no ve solo, cada excepción
      con su porqué), `pnpm knip` y el paso «Código muerto» del job «Tipos, lint y pruebas». Probado al revés: un archivo, una
      exportación y un CSS sembrados salen los tres y Knip sale con 1.
- [x] **Borrado** (detalle en ADR-0406): `components/ui/useArrastrarParaCerrar.ts`; los componentes `TiraFicha`, `SenalBuscando`,
      `FotosAlta`, `BotonVerDetalleCierre` y `ListaAbierta`; las lecturas `getVentasDeHoy`, `getFichaClienta`, `getTextosClub`,
      `listarMovimientosProducto`, `getTrasladosCerrados` y `leerRendimientoEquipo` (ninguna deja una función de la base sin llamador);
      textos y reglas huérfanos de rediseños; 20 tipos y 3 valores reexportados que nadie pedía por ahí; `@anthropic-ai/sdk` y
      `@radix-ui/react-slot`.
- [x] **Cuentas y registros:** `nombreVer` sale de `SIN_USO_CONOCIDAS` (22 → 21); `TiraFicha` sale de las piezas de la guía de foco
      (`PIEZAS_DE_LA_GUIA`, el escáner de `/focus` y su prueba); huellas de las guías de Caja, Nuevo producto y Editar producto
      aceptadas (ningún paso hablaba de los controles borrados).
- [x] **Docs:** `CLAUDE.md` (regla «Código muerto: Knip en el CI»; el «Buscando…» es `<Buscador buscando>`; la ficha que se edita dice
      «Lo que falta» en su panel), `docs/ARQUITECTURA.md` (Clientes), nota en ADR-0045.
- [ ] **Decisión de Felipe — la regla de Frescura que nadie aplica:** `DIAS_PARA_VEREDICTO_DE_COMPROMISO = 7`
      (`lib/frescura-decisiones-reglas.ts`) dice «de un compromiso se dice cómo va desde el día 7 (antes es "en curso" sin veredicto)»,
      pero ningún código la lee desde que nació (2026-09-30, ADR-0208 paso 4b). O se aplica en el veredicto o se borra.
- [ ] **Decisión de Felipe — «Mis partes de compras»:** `components/MisPartesDeCompras.tsx`, `getMisPartesDeCompras` y
      `porPagarConMiParte` no se dibujan desde ADR-0387. Son las únicas llamadas a `fn_mis_partes_de_compras` y `fn_deuda_visible`:
      retirarlas (con la página `/compras/parte/[compraId]` y `lib/compras-mi-parte*.ts`, como dice ADR-0387) lleva su migración.
- [ ] **Decisión de Felipe — el destello de «comprobante saldado»** (sigue del backlog del 2026-10-06): `BotonConfirmar` y
      `lanzarChispas` quedan marcados `@public` hasta que vuelvan a los modales de pago o se borren.
- [ ] **`PieAcciones.tsx`** (ronda 11 de /unificar) está en `ignore` de `knip.ts` porque nació antes que sus usos: sale de ahí cuando
      la use la primera hoja.
- [ ] **La otra mitad del código muerto:** lo que solo usa su propia prueba. Knip no lo ve (las pruebas cuentan como uso);
      `reglas-sin-uso.test.ts` lo mira solo en `lib/*-reglas.ts` (21 conocidas). Fuera de ahí hay al menos un caso grande:
      `lib/registro-contable.ts` entero, que ADR-0198 ya llama huérfano y del que la web solo usa `IGV_TASA`. El modo `--production`
      de Knip no reconoce hoy las rutas de Next como entrada; hacerlo andar es su propio trabajo.
- [ ] **De paso, no tocado:** `unificar/familias.mjs:146` todavía describe la familia «Buscadores» con `SenalBuscando` (la decisión de
      la ronda 5, más abajo en el mismo archivo, ya dice `Buscador.tsx`). Es el registro de /unificar, que otra sesión edita hoy.
