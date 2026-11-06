# Taller: lo que el rediseño no puede romper (ADR-0614, 2026-11-05)

Felipe cerró las reglas, el dinero y los datos del Taller antes de rediseñarlo. Este mapa dice qué es regla, dónde vive y qué prueba la vigila. Cambiar cómo se ve no toca nada de esto; si un cambio visual te obliga a tocarlo, ya no es solo visual: pregúntale a Felipe.

## Reglas de negocio, en la base

| Regla | Dónde | La vigila |
|---|---|---|
| Revertir un cierre devuelve el costo exacto, o se rechaza si ya se mezcló | `revertir_produccion`, `fn_revertir_costo_del_cierre` | `pruebas:produccion-revertir-costo` |
| Lo que se le debe a un servicio sale de la orden, sin IGV, aunque falte el nombre | `fn_servicios_por_pagar`, `fn_deuda_consolidada` | `pruebas:produccion-servicios-por-pagar` |
| Registrar el papel de un servicio no mueve plata: «Ir a pagar» lo hace aparte | `pagar_servicio_de_orden` | `pruebas:produccion-pagar-servicio` |
| Una compra lleva varias líneas; por kilo o rollo se guarda en metros, con su nota | `registrar_compra_de_insumos` | `pruebas:produccion-llego-una-compra` |
| Un lote nunca baja de lo ya usado; la diferencia queda como merma | `ajustar_lote_usado`, `asignar_proveedor_a_lote`, `reemplazar_papel_provisional` | `pruebas:produccion-regularizar-lotes` |
| Se corta hasta el plan + 3 por talla y color; las demás fases, lo que salió de la anterior | `fn_produccion_entrada_variante` | `pruebas:produccion-tope-de-corte` |
| Anular con tela cortada obliga a decir el destino y el motivo | `anular_orden_con_tela_cortada`, `fn_orden_tiene_tela_cortada` | `pruebas:produccion-anular-tela-cortada` |
| El plan no baja de lo cortado; cada cambio deja su fila en la historia | `cambiar_plan_de_orden`, `cambiar_datos_de_orden` | `pruebas:produccion-datos-y-plan` |
| Los avíos declarados bajan solos al pasar al stock, y entran al costo | `fn_descontar_avios_al_cerrar` | `pruebas:produccion-avios-al-cerrar` |
| Lo que no llegó a una tienda no se ofrece; llegar no tiene vuelta | `fn_productos_por_etapa`, `fn_vitrina_por_que_no`, `fn_productos_filtro` | `pruebas:produccion-etapas-de-prenda` |
| Una orden que no declaró tela se frena al pasar al stock, solo en la pantalla (ADR-0600) | `lib/orden-tela-sin-anotar-reglas.ts` | `lib/orden-tela-sin-anotar-reglas.test.ts` |

## Reglas puras, en la web

Se llaman desde cualquier diseño; no se copian ni se reescriben dentro de un componente: `lib/orden-pagina-reglas.ts` (estado, siguiente paso, pasos que se ofrecen, historia, resumen de cierre), `lib/ordenes-lista-reglas.ts` (fila, pestañas, cifras, filtros), `lib/insumo-compra-reglas.ts`, `lib/pagar-servicio-reglas.ts`, `lib/servicios-por-pagar-reglas.ts`, `lib/regularizar-insumos-reglas.ts`, `lib/etapa-prenda-reglas.ts`, `lib/produccion-reglas.ts` y `lib/insumos-reglas.ts`.

## Lo que se revisa al mover una pieza

- **Guías:** cada `data-guia` tiene su paso en `lib/guias/pantallas/produccion.ts`. Si un botón nace o se va, cambia la guía y su huella (`lib/guias/huellas/produccion.*.json`) en el mismo PR. Se prueba con `guias:recorrer`.
- **Guía de foco:** `lib/guia-de-foco-pantallas.ts` tiene hojas del Taller como pendientes. El rediseño las baja y no sube ninguna.
- **Textos con dinero:** nada de «S/ » con espacio normal (`lib/montos-sin-corte.test.ts`).
- **Hojas que guardan:** `enterNoGuarda` y el token de reintento. Sin token, un doble clic registra dos compras.
- **Montos ocultos:** `producciones` tiene candado por columna. Una columna nueva necesita su `grant select`, y la sin permiso de costos sigue sin verlos.
- **Enlaces viejos:** `/produccion/ordenes?orden=<id>` lleva a la página de la orden; hay enlaces guardados que lo usan.

## Lo que quedó para el rediseño, a propósito

- Nombres de botones y menú, orden de pantalla, cifras de Insumos, y las hojas nuevas mirándolas a 375 px y en oscuro (se probaron en escritorio y en claro).
- Un modelo que sigue en el Taller no sale en Productos: se llega desde su orden. Si estorba al editarlo, aquí puede sumarse un enlace.

## Después, con su propio trabajo

- El Taller como mayorista (ADR-0547), con cotizaciones reales.
- `set_etapa_produccion` ya no tiene quien la llame: se retira con una migración propia.
