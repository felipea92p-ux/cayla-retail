## 🔬 Código que solo usan las pruebas (2026-10-14) — sin migración ni RPC; rama `claude/knip-produccion-1bed1d`, sobre `claude/knip-dead-code-9cfc30` (ADR-0406)

Informe completo, con la lista y la fecha de cada pieza: `docs/investigacion/2026-10-14-codigo-que-solo-usan-las-pruebas.md`.

- [x] **Medido:** `knip --production` anda con `!` en el `project` de producción (`{app,components,lib}/**`, `public/*.js`, la raíz
      de la web y `packages/*/src`) e `ignoreFiles` solo en producción para los registros y los datos de prueba. El modo normal sigue
      igual (0, sin avisos). Producción: 0 dependencias, 1 archivo y 103 exportaciones, en ~1 s. Probado en una copia de la
      configuración: `knip.ts` no se tocó.
- [x] **Fechado:** cada pieza con su «sin pantalla desde» (historia de `main` por su primer padre) y la pantalla que la usaba.
- [x] **El candado (Felipe eligió la opción 2):** `knip.ts` con `!` en lo que llega a la tienda e `ignoreFiles` solo en producción;
      `@internal` + motivo en los 22 oráculos; `pnpm knip:produccion` (`scripts/knip/produccion.mjs` + `produccion.test.mjs`) contra
      `scripts/knip/deuda-produccion.mjs` (78, solo baja), en el paso «Código que solo usan las pruebas» del CI; se retira
      `reglas-sin-uso.test.ts` (sus 21 están dentro). ADR-0406 actualización (b), nota en ADR-0234, regla en `CLAUDE.md`.
- [x] **Las cuatro copias, conectadas:** `campanaValida` (Campaña), `textoRecibido` (Cómo se cerró, ahora pide solo lo que usa),
      `anioLima` (mudada a `fechas-lima.ts`, la usa Configuración ▸ Impuestos) y `esRafaga` (reescrita con la regla del panel de la talla,
      que la llama). Nada de lo que se ve cambia.
- [ ] **`textoDeRepartoParaLector`** nunca llegó al lector de pantalla de `plan-piso/DetalleDelGrupo.tsx`: conectarlo es accesibilidad.
- [ ] **El aviso llega en el CI, no en el hook:** `reglas-sin-uso` corría en vitest (hook de commit); si Felipe quiere el aviso antes,
      `pnpm knip && pnpm knip:produccion` se suma a `.githooks/pre-commit` (~4 s).
- [ ] **Decisión de Felipe — `registro-contable.ts`:** `IGV_TASA` pasa a `lib/impuestos-reglas.ts` y se borran el archivo y su prueba
      (356 líneas, sin RPC ni migración). Aparte, porque es dinero: el 18 % está escrito cinco veces en la web (`IGV_TASA`, dos
      `IGV_PORCENTAJE`, el valor por defecto de `igvDeFactura`), y podría salir de un solo lugar.
- [ ] **Decisión de Felipe — la hoja de prueba de etiquetas:** `lib/codigo128.ts` y `puntosPorModuloQR` viven solo para
      `scripts/etiquetas/hoja-de-prueba.mjs` (Zebra, 2026-09-09/10). Si ya no se usa, se van los tres.
- [ ] **Después del OK, módulo por módulo:** borrar las 51 de D y las 18 de E con sus pruebas (lista en el informe); `resolverTienda`
      o su copia de `scripts/terminales/reglas.mjs`; el alias `dniEnmascarado`. `partesPorPagar` va con el retiro de «Mis partes de
      compras» (ADR-0387, ya en el backlog de la rama de Knip).
- [x] **Orden:** `claude/knip-dead-code-9cfc30` se fusionó como #1079; esta rama ya trae ese `main`.
- [ ] **De paso, no tocado:** `TOPE_ESPERA_MS = 20_000` está copiado en cinco componentes (`AjustarInventarioModal`, `BajarEnManoModal`,
      `HojaLiquidarDesde`, `FlujoTalla`, `useStockFicha`) además de `lib/intento-reglas.ts`. No es código muerto, es la misma pieza cinco
      veces.
