## 🧨 /chaos de Inventario (2026-10-14) — rama `claude/chaos-inventario-5c56e1`, semilla `20261014`, ADR-0401

Informe con la evidencia en `.chaos/informes/inventario-2026-10-14.md` (local, fuera de git). Tablero: `docs/chaos/README.md`.

### Cerrado en la rama
- [x] ~~El token de Nuevo traslado no sigue al contenido (gravedad 1)~~ — `useIntento` + `fn_intento_con_huella` en `iniciar_traslado`.
- [x] ~~Dos dañadas «arregladas» con un solo movimiento~~ — la dañada es parte de la huella de `arreglar_prenda_danada`.
- [x] ~~El token devuelve lo del primer envío en `recibir_lote`, `pedir_a_otra_sede`, `pedir_prenda_para_apartar`, `apartar_prenda`,
  `bajar_al_piso_desde_vender` y `enviar_pedido_a_otra_sede`~~ — misma pieza; `PasePedido` usa `useIntento`.
- [x] ~~Recargar a mitad de un traslado (o de un cobro) no avisa al volver~~ — `useEnviosEnCurso`, con reintento si la sesión no estaba lista.
- [x] ~~Una fecha imposible tumba Movimientos~~ y ~~un pase con un id que no es uuid tumba Traslados~~.
- [x] ~~Nota de traslado de 5000 letras, llegada en 1990, motivo de ajuste libre, nota de ajuste sin tope~~.

### Para Felipe
- [ ] **Pegar en producción** `20261014162000` y después `20261014163000` (solo funciones; anclas verificadas en producción el 2026-10-14).
  Después: el volcado de `docs/datos/generado/` y `pnpm datos:comparar`.
- [ ] **«Prenda de más» al recibir un traslado** (ADR-0173, INV-08): entra al destino sin salir del origen. ¿Sale del origen o entra como
  sobrante a investigar? Cambia el flujo de recibir: no se tocó.

### Menores que se dejaron a propósito
- [ ] La nota de un pedido no atendido acepta 5000 letras por la API (la pantalla de Vender ya la corta; en producción la más larga tiene 23).
- [ ] Liquidar una dañada a precio `NaN` por la API da el mensaje técnico del candado `venta_items_montos_finitos` (ya está bloqueado).

### Lo que no se cubrió
- [ ] TEC-01 (Tab en un modal) y NAV-09 (cambiar de sede con trabajo a medias) en Inventario; Conteo en el navegador; Por regularizar sin datos en el seed.
