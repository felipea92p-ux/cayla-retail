## 💸 ADR-0362, fase 5b: la plata de «Nos debe» (2026-10-15) — migraciones `20261015145000` y `20261015150000`, **en producción desde el 2026-10-15**; rama `claude/purchase-order-phase5b-9b0c82`

- [x] **«Pasar a saldo a favor»** con documento interno DI-…; con factura, su IGV a la cuenta puente 4019 (Felipe 2026-10-15).
- [x] **«Llegó su nota de crédito»** (la 07 del proveedor, adjunta a los documentos internos; Impuestos y el Diario la cuentan desde su fecha).
- [x] **El aviso del IGV** en Inicio (no se oculta) y en el Observatorio.
- [x] **«Depositó»** desde la ficha, con Proveedores: documento + reembolso en una transacción. La ficha muestra el saldo a favor con Proveedores solo (`fn_saldo_favor_visible`).
- [x] **«Devolver al proveedor»** desde Dañadas (Existencias; solo lo que llegó dañado en una recepción, el grupo entero), que queda como deuda «por reponer», con sus tres salidas (6a y 6b).
- [x] **Verificado en un banco propio reconstruido desde cero** con `main` y estas dos migraciones:
  - `nos_debe` 41/41 y 56 suites vecinas en verde;
  - en el navegador, cada hoja a 1440 y 1024 px, en claro y en oscuro;
  - `guias:recorrer` de la ficha, Notas de crédito y Existencias a 1440 y 375 px: en verde.
- [x] **`/chaos` con plata:**
  - dos sesiones con el mismo depósito: la segunda espera y se rechaza;
  - doble clic en el mismo instante: un solo pedido a la base;
  - permisos y entradas raras: resisten;
  - INV-19 e INV-20 nuevas, vivas: detectan lo que se corrompe a propósito;
  - un hallazgo de gravedad 2, arreglado: la nota del proveedor aceptaba NaN en la tabla.
- [x] **En producción (2026-10-15, con el OK de Felipe):** `20261015145000` y después `20261015150000` (allá `20261015233508` y `20261015234146`).
  - Antes, solo lectura: las 22 anclas y las 2 huellas en su lugar, sin filas que los candados nuevos tuvieran que revisar, y lo que las
    funciones usan al correr (firmas, columnas, valores permitidos) igual al banco.
  - Después: las 16 funciones con la misma huella que el banco y los mismos permisos; las 22 anclas, «ya aplicado»; las tablas nuevas, con
    RLS y sin lectura directa. Las dos migraciones de seguridad que otra sesión pegó antes (`20261015221000`, `20261015222000`) no tocan
    nada de esta fase.
- [ ] **Refrescar el volcado y el diccionario** (`pnpm datos:refrescar`, ver `docs/datos/generado/COMO-REFRESCAR.md`): queda aparte.
  Producción ya tiene 21 tablas que el volcado no conoce: las 2 de esta fase y 19 de la tienda online, el padrón, Apartados y los datos
  bancarios de los proveedores. Cada una necesita su pájaro en `scripts/datos/aviario.mjs`, y elegir el dueño de tablas de otros módulos
  no es de esta fase.
- [ ] **`/formidable`:** los 3 cambios propuestos ([compras-nos-debe-plata](../formidable/compras-nos-debe-plata.md)) van en otro PR,
  después de la prueba ciega (Felipe 2026-10-15). Falta también la prueba con una colaboradora real.
- [ ] **El contador:** el código y el nombre de la 4019; si la devolución de una dañada de factura necesita otra cosa que la nota 07.
- [ ] **Sin construir, por decisión (Felipe 2026-10-15):**
  - devolver con deuda lo que devolvió un cliente o reportó la tienda;
  - devolver solo una parte de un grupo de dañadas;
  - lo del Taller (decisión 85: lo que no llegó de una orden de insumos).
- [ ] **`danadas_concurrencia`** no se corrió en local (solo corre en una base desechable): la corre el CI.
