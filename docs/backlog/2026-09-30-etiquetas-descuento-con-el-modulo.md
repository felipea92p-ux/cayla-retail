## 🏷️ El descuento por etiqueta con el módulo (2026-09-30, ADR-0293) — rama `claude/etiquetas-descuento-con-el-modulo`

- [x] Migración `20261001130000` (funciones + catálogo) y `20261001130100` (política `etiquetas_insert_autenticado`), re-ejecutables, probadas en una copia de la base local.
- [x] Web: Nuevo producto ofrece todas las etiquetas; Atributos ▸ Etiquetas muestra «Prendas» y «Configurar campaña» a quien tiene el módulo; suite web, `tsc` y eslint en verde.
- [x] **Base aplicada en producción el 2026-09-30** (`20261001130000` y `20261001130100` cada una en su llamada; verificadas: capacidad, `crear_producto_con_variantes` y la ficha sin guardia, política nueva, «incluye» del módulo).
- [ ] **Fusionar la web** (después de la base: ya está). Luego refrescar el volcado de `docs/datos/generado/` (`fn_puede_dar_descuento_por_etiqueta` cambia de cuerpo).
- [ ] **Decidir si los tres roles con cuentas deben tener Etiquetas** (hoy lo tienen Integrante, Terminal administrativa y Terminal de ventas en producción): con esta regla todos ellos configuran descuentos. Se acota en Roles y accesos, sin código.
- [ ] **Probar con la terminal real «Almacén Trujillo»**: Nuevo producto ▸ Etiquetas ▸ «Ver todos» muestra «Para liquidar» y «Últimas unidades»; Atributos ▸ Etiquetas trae «Prendas» y «Configurar campaña» en esas dos tarjetas. La terminal necesita el módulo Etiquetas en su rol para configurar (Roles y accesos); para solo etiquetar al crear, no.
- [ ] Decidir si la caja necesita un freno propio para una campaña que alguien configuró por error (hoy: solo la vigencia y el tope de descuento que ya existían).
