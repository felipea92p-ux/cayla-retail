## 🧭 El motor de las guías rehace lo que dejó cada paso al volver (2026-11-18, ADR-0389 act. d) — solo web, sin migración; rama `claude/guias-motor-ida-y-vuelta`

- [x] **Las dos causas del motor** que dejó la ida y vuelta del PR #1955: la cadena de reapertura ya no se corta en un paso que solo
  cierra o vacía (`fuenteAlVolver` salta lo que no deja nada y lo que un paso posterior deshizo), y lo que abre un `demostrar` se repite
  al volver (el motor lo cuenta como parte de lo que deja el paso, y lo vuelve a correr en el paso mismo).
- [x] **Lo que un Escape cerró lo sabe el motor:** al avanzar anota cuántas hojas había abiertas al empezar cada paso y si su toque salió
  bien (`MemoriaDeIda`); al volver no reabre lo que ya se había cerrado. Contar los Escape del texto se equivocaba (Devoluciones pide dos
  seguidos con una sola hoja).
- [x] **La tercera, de Atributos:** una pestaña con `href` navega y el piloto espera la URL nueva y que se vaya la silueta de carga antes
  del toque siguiente. «Su foto o su dibujo» ya elige «Tejidos» antes de la tarjeta.
- [x] Más ajustes que salieron al correrla: todas las piezas de la fuente (Inicio), los `vaciar` de entre medio (Colaboradores), un toque
  que no cierra ni desmarca lo que ya está (`sinAlternar`), el «si está» que espera lo recién abierto (la píldora «Costo»), y con la pieza
  del paso a la vista no se rehace nada (Recibir).
- [x] Las líneas de guía de las 12 guías del encargo (Productos, Atributos, Análisis, Recibir, Compras, Devoluciones, Colaboradores,
  Producción ▸ Proveedores, Flujo de caja, Vender; Configuración e Inicio pasan solo con el motor).
- [x] Pruebas de las reglas en `lib/guias/reglas.test.ts` (`fuenteAlVolver` con y sin memoria, `piezasParaRepetir`, `limpiezasEntre`,
  `destinoDeNavegacion`). La skill `/guia` dice que todo `demostrar` tiene que poder repetirse, como todo `preparar`.
- [x] **Verificado** con `guias:recorrer -- --ida-y-vuelta` (el del PR #1955, corrido desde una copia fuera de git) contra una base local
  propia (`cayla-motor-guias`, puertos 5652x, ya apagada) y `next build` + `next start` de esta rama: las 12 guías dan ✓ a 1440×900 y a
  375×812. Corrida completa de las 123 guías en los dos anchos: ✓ 184 · ✗ 36 · ⚠ 26 de 246 (el #1955 midió ✓ 154 · ✗ 64 · ⚠ 26 en 122),
  y ninguna de las 18 que fallan por ancho es nueva: todas están en la lista del #1955.

### Sigue fallando (de la guía o ya en la ida; la causa está en `docs/backlog/2026-11-18-guias-ida-y-vuelta.md`, PR #1955)

- [ ] De la guía, una pestaña o una búsqueda que queda puesta: `inventario.movimientos`, `compras.mi-plata.envios`,
  `productos.id.historial`, `cambios`, `finanzas.cierre`, `inventario.traslados`, `vender.historial` (2.ª ida), `productos.nuevo`
  (alterna sin `para` en una ficha con `aria-pressed`).
- [ ] `inventario.plan-del-piso`: lo arregla el PR #1955 en su rama (todavía no está en main).
- [ ] `produccion.insumos`: el recorredor cuenta 2 hojas en la ida y 1 al volver; la hoja de «Nuevo avío» queda montada cerrada
  (`data-state="closed"`) y el motor ya no la cuenta. Ver si el recorredor debería contar solo las abiertas.
- [ ] Ya fallan en la ida: `finanzas.dinero`, `finanzas.dinero.por-pagar`, `tienda-web.campanas.editor`, `tienda-web.pedidos`,
  `vender.reportes.empresas`, `produccion.ordenes`, `inventario.por-regularizar`, `tienda-web.vitrina.esperan`.
- [ ] Cuando se fusione el #1955: su paso 4 de `/guia` dice que lo de un `demostrar` «al volver no se repite: pídelo en el `preparar`».
  Con este PR sí se repite; esa frase se cambia por «un toque que alterna lleva `para`, también en un `demostrar`».
