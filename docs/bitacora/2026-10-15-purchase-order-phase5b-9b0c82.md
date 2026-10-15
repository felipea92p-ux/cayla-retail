## 2026-10-15 (ADR-0362, fase 5b: la plata de «Nos debe», actividades 1 a 7)
Qué hice: con `/construir`, siete actividades, un commit cada una:
1. «Pasar a saldo a favor» con un documento interno DI-… (boleta, nota de venta o sin comprobante: sin IGV).
2. Lo mismo con factura: su IGV espera en la cuenta puente 4019.
3. «Llegó su nota de crédito»: la nota 07 del proveedor se adjunta a esos documentos.
4. El aviso del IGV en Inicio y en el Observatorio.
5. «Depositó» desde la ficha del proveedor: el documento interno y el reembolso juntos. De paso, el saldo a favor visible con Proveedores (salía S/ 0).
6a. «Devolver al proveedor» lo que llegó dañado en una recepción, que queda como deuda «por reponer».
6b. La plata de lo devuelto, con un documento por devolución.
7. El cierre: `/chaos` con plata (dos invariantes nuevas), `/formidable` rápido, las demos y el modo oscuro, la documentación y el PR.

Por qué así: la deuda sigue siendo una fila de `despacho_diferencias` y el documento interno una nota más del comprobante. Así todo lo que
ya cuenta deudas, saldos, el Diario e Impuestos los ve sin duplicar nada; lo que habla con SUNAT los deja fuera por su serie DI-. El
resolvedor conserva su firma de 5 argumentos, porque la recargan una migración vieja y seis pruebas: el depósito le llega en un ajuste de
la transacción. Lo devuelto no se cierra en el comprobante, porque sí llegó.

Felipe se lleva: la plata de lo que no llegó o llegó dañado vuelve al toque, con la cuenta puente mientras falta la nota del proveedor, y
un aviso que no se oculta mientras ese IGV no se regularice.
Las dos migraciones están en producción desde el 2026-10-15, con su OK: las 16 funciones quedaron con la misma huella que el banco.
Queda para él:
- los 3 cambios que propone `/formidable`, en otro PR después de la prueba ciega;
- el contador, para la 4019;
- el volcado de producción, en una sesión aparte: hay 19 tablas nuevas de otros módulos que necesitan dueño en el aviario.
