## 2026-11-06 (Ganancias y pérdidas: el IGV de las compras se contaba dos veces)
Qué hice: medí octubre en producción: las ventas van sin IGV y el costo de la carga inicial lo trae (ADR-0433, punto 5), así que ese IGV pesa como costo y además es el crédito fiscal. Cargué `saldo_favor_igv` = S/ 62,035 con vigencia 1-oct, con el OK de Felipe, y cambié la nota «ese 18 % es de SUNAT», que hoy no es cierta.
Por qué así: el arreglo del costo va en los costos con factura (ADR-0417 d.2), no en las ventas; el 20261106005000 solo cubre lo que entra desde ahora. La nota no menciona un saldo ni un mes para seguir siendo cierta cuando el crédito se acabe.
Qué se rompería sin esto: Impuestos y «¿Me alcanza?» seguirían calculando sin el crédito, y octubre seguiría leyéndose peor de lo que fue sin que nada lo avisara.
Estado: saldo en producción (la cifra sale de la bitácora del 2-nov; falta confirmarla contra el PDT, y una corrección va como fila nueva). La nota está en la rama. Sin corregir: el costo ya cargado, que espera el documento de Felipe y su decisión.

## 2026-11-06 (Ganancias muestra las ventas con IGV y el IGV que el líder dice pagar, ADR-0620)
Qué hice: agregué una capa de lectura sobre el Estado de resultados: el líder dice el IGV del mes en Impuestos (`decir_igv_del_mes`, `retail.igv_del_mes`) y Ganancias, la línea de meses y «Ganaste» del Flujo restan ese monto de las ventas con IGV. El arranque del Balance resta el crédito: 4011 = 41,878.00 a favor, 50 = 201,758.78, patrimonio 172,458.63.
Por qué así: copia el molde de los sueldos estimados y no reemplaza ninguna función viva; el libro, la renta, Impuestos y el archivo del contador no cambian. Sin monto dicho se resta todo el IGV incluido, con aviso, y no frena el cierre. Lo decidió Felipe. Yo recomendé no tocar el Balance hasta hablar con el contador, y él prefirió que dejara de decir una deuda que no existe.
Qué se rompería sin esto: octubre seguiría leyéndose como si todo su IGV hubiera salido de la caja, y el Balance seguiría contradiciendo a Impuestos.
Estado: construido en la rama, **sin aplicar en producción y sin PR**. Las dos migraciones se probaron en una pila aparte, porque el Postgres local compartido está atrasado (`pruebas:igv-gestion` 65/65, `pruebas:arranque-igv` 32/32). Las cifras reales de octubre (133,922.31 y −5,986.79) faltan confirmarse con la sesión de Felipe.

## 2026-11-06 (IGV de gestión: cuatro hallazgos de la revisión, ADR-0620)
Qué hice: el crédito de IGV salió de «plata y cobros» a su propio grupo del Balance; el chip contra «a esta fecha» se apaga si el mes en curso resta su monto entero; una cuenta sin vista de toda CAYLA ya no lee que el líder no dijo el IGV (la lectura trae `ve_dicho`); la cabecera y la línea de Ganancias caen juntas al libro, y las barritas del calendario no se dibujan sin IGV.
Por qué así: `fn_igv_de_gestion` ya sabe qué mes está en curso y quién recibe el monto, así que lo dice ella y la web no adivina con la sesión. Prorratear el mes en curso cambiaría cuánto se resta, y eso lo decide Felipe.
Qué se rompería sin esto: el resultado se vería miles de soles peor que el mes pasado sin motivo, el medidor contaría como plata lo que SUNAT no paga, y una terminal leería algo falso.
Estado: en la rama, sin PR y sin producción. `pruebas:igv-gestion` 68/68 y `pruebas:arranque-igv` 32/32 en la pila aparte. Falta verlo en el navegador.
