## 🔬 Código que solo usan las pruebas (2026-10-14) — sin migración ni RPC; rama `claude/knip-produccion-1bed1d`, sobre `claude/knip-dead-code-9cfc30` (ADR-0406)

Informe completo, con la lista y la fecha de cada pieza: `docs/investigacion/2026-10-14-codigo-que-solo-usan-las-pruebas.md`.

- [x] **Medido:** `knip --production` anda con `!` en el `project` de producción (`{app,components,lib}/**`, `public/*.js`, la raíz
      de la web y `packages/*/src`) e `ignoreFiles` solo en producción para los registros y los datos de prueba. El modo normal sigue
      igual (0, sin avisos). Producción: 0 dependencias, 1 archivo y 103 exportaciones, en ~1 s. Probado en una copia de la
      configuración: `knip.ts` no se tocó.
- [x] **Fechado:** cada pieza con su «sin pantalla desde» (historia de `main` por su primer padre) y la pantalla que la usaba.
- [ ] **Decisión de Felipe — el candado:** opción 2 recomendada (`knip --production` en el CI + `@internal` en los 22 oráculos + una
      lista de deuda que solo baja, y se retira `reglas-sin-uso.test.ts`, cuyas 21 están todas en la lista nueva). Opción 1: extender
      `reglas-sin-uso.test.ts`, que no vería 15 de las 103. Va como actualización de ADR-0406, sin número nuevo.
- [ ] **Decisión de Felipe — conectar las cuatro pruebas que vigilan una copia:** `campanaValida` (`EtiquetasLista.tsx:630`),
      `textoRecibido` (`ComoSeCerro.tsx:94`), `anioLima` (`configuracion/page.tsx:126`) y `esRafaga` (`PanelTalla.tsx:430`, este que
      lo mire quien conoce la pistola). Además, `textoDeRepartoParaLector` nunca llegó al lector de pantalla de
      `plan-piso/DetalleDelGrupo.tsx`.
- [ ] **Decisión de Felipe — `registro-contable.ts`:** `IGV_TASA` pasa a `lib/impuestos-reglas.ts` y se borran el archivo y su prueba
      (356 líneas, sin RPC ni migración). Aparte, porque es dinero: el 18 % está escrito cinco veces en la web (`IGV_TASA`, dos
      `IGV_PORCENTAJE`, el valor por defecto de `igvDeFactura`), y podría salir de un solo lugar.
- [ ] **Decisión de Felipe — la hoja de prueba de etiquetas:** `lib/codigo128.ts` y `puntosPorModuloQR` viven solo para
      `scripts/etiquetas/hoja-de-prueba.mjs` (Zebra, 2026-09-09/10). Si ya no se usa, se van los tres.
- [ ] **Después del OK, módulo por módulo:** borrar las 51 de D y las 18 de E con sus pruebas (lista en el informe); `resolverTienda`
      o su copia de `scripts/terminales/reglas.mjs`; el alias `dniEnmascarado`. `partesPorPagar` va con el retiro de «Mis partes de
      compras» (ADR-0387, ya en el backlog de la rama de Knip).
- [ ] **Orden:** esto va encima de `claude/knip-dead-code-9cfc30`, que todavía no es un PR. Primero se fusiona esa rama.
- [ ] **De paso, no tocado:** `TOPE_ESPERA_MS = 20_000` está copiado en cinco componentes (`AjustarInventarioModal`, `BajarEnManoModal`,
      `HojaLiquidarDesde`, `FlujoTalla`, `useStockFicha`) además de `lib/intento-reglas.ts`. No es código muerto, es la misma pieza cinco
      veces.
