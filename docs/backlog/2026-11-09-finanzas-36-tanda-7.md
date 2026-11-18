## Las 36 de Finanzas, tanda 7 (tareas 19, 20 y 21), rama `claude/finanzas-36-tanda-7`

- [ ] **POR PEGAR**, en orden, con el OK de Felipe y DESPUÉS de `20261107172000` (que reescribe el IGV por mes): `20261109143000`, `20261109144000`, `20261109145000`, `20261109150000`.
- [ ] La rama va atrás de main y no se pudo traer desde aquí (main tocó un archivo protegido). Hay que traerla antes de fusionar; `git merge-tree` no da conflictos.
- [ ] Contador: rectificatoria o ajuste en el mes corriente cuando cambia el IGV de un mes declarado (19); que gasto y crédito de una factura tardía entren en el mes abierto (20); que el IGV del papel de un gasto de un mes cerrado baje el gasto del mes en que se anota (20).
- [ ] El cruce con SUNAT marca «solo SUNAT» la factura tardía en su mes de emisión: se resuelve con «Va en otro mes». Marcarlo solo queda pendiente.
- [ ] Los recibos por honorarios del aviso del panel de Impuestos siguen por su fecha real (cambiarlos rompería volver a pegar 20261105222000).
- [ ] Sin pantalla todavía: anular una nota de crédito (el módulo de notas está apagado, ADR-0480) y anular un reembolso. Las funciones ya existen.
- [ ] No se anula desde aquí un pago que usó o dejó saldo a favor, ni una nota que dejó saldo a favor, nació de cerrar una línea o tiene adjuntos: esperan otra decisión.
- [ ] Un activo o un pago con fecha de un mes cerrado se siguen rechazando: la excepción de la tarea 20 es solo para el comprobante.
- [ ] `pruebas:produccion-punta-a-punta` falla en la base local con `costo_atipico` en un producto de demo; ver si pasa en el CI.
- [ ] Tanda 9 (`/chaos`): «Anular pago», «Quitar el comprobante» y «Llegó el comprobante» con el mes cerrado.
