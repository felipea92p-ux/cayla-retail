-- ============================================================================
-- 20261106234000 — El pago de la tela y de la maquila del Taller: dos categorías de gasto que el diario lleva al inventario
--
-- EL PROBLEMA PRIMERO. Desde 20261106171000 el diario sigue la ropa que hace el Taller: la tela que se corta pasa de
-- «Materias primas» (241) a «Productos en proceso» (231), y la prenda terminada pasa de 231 a Mercaderías (201) a su costo
-- (tela + avíos + maquila). Pero nada ENTRABA a la 241 ni a la 231 por el lado del dinero: comprar tela o pagar la maquila no
-- tenía dónde registrarse sin volverse un gasto del mes (que restaría la ropa dos veces: al pagarla y al venderla). Una orden
-- nueva dejaba la 241 y la 231 por debajo de lo real en el Balance.
--
-- LA DECISIÓN (Felipe eligió «Pago de tela y maquila», 2026-11-06). Dos categorías de gasto, con su cuenta de INVENTARIO:
--   · «Telas e insumos del Taller» → 241: la tela, los botones y los cierres que se compran para producir.
--   · «Maquila del Taller» → 231: lo que se le paga a quien cose, corta o borda una orden.
-- Se registran en Gastos como cualquier pago (con su comprobante y su IGV, que se descuenta), pero el diario las pone en el
-- inventario, no en el Estado de resultados: la ropa se vuelve costo recién cuando se vende (691). Lo que no es de una orden
-- (hilo general, agujas, aceite de máquina) sigue en «Consumibles del Taller» (656), que sí es gasto del mes.
--
-- CONTRATO
--   PROMETE: dos filas nuevas en `categorias_gasto`, al final del orden; repetirla no cambia nada.
--   ASUME:   que ya están las cuentas 231 y 241 (20261106171000).
--   NO HACE: no toca gastos ya registrados ni reglas del diario (la regla `gasto` ya lleva cada gasto a la cuenta de su categoría).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Dos `insert` en una tabla de configuración; sin políticas ni `alter`.
-- DOWN: update retail.categorias_gasto set activo = false where codigo in ('telas_insumos', 'maquila');  -- nunca se borran: un gasto las nombra.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden) values
  ('telas_insumos', 'Telas e insumos del Taller', 'Tela por metro, botones, cierres, entretela', '241', true, 22),
  ('maquila',       'Maquila del Taller',         'Costura de una orden, corte, bordado',         '231', true, 23)
on conflict (codigo) do nothing;

reset lock_timeout;
