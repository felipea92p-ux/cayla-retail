## 2026-11-07 (La base responde rápido aunque tengamos un año de ventas)
Qué hice: medí 254 funciones de lectura sobre una copia de main con un año de operación inventada (131 mil ventas, 407 mil movimientos). 6 pasaban
el corte de 8 s y 15 tardaban más de 1 s; ahora ninguna pasa los 8 s y quedan 5 sobre 1 s. Reescribí 15 funciones en 3 migraciones con candado
md5 (tienda e inventario, Finanzas, reparto por proveedor), más una cuarta con índices y las metas del mes en una llamada. En la web, el marco,
Inicio, Vender, Caja y Comercial dejaron de esperar lecturas en fila.
Por qué así: producción todavía no tiene volumen, así que medirla hoy no dice cómo se va a portar en 12 meses. Cada cambio da exactamente la misma
respuesta (md5 antes = después, también con casos raros armados). Y como cada migración reescribe la función entera, el candado se niega a pegarla
si producción tiene otra versión (ADR-0622).
Felipe se lleva: Proveedores, Clientes, Cuadrar depósitos, alertas de máquinas y el Observatorio pasan de segundos a menos de 1 s, y el Resumen de
Finanzas de 6,8 s a 2,7 s. Falta su OK para pegar las cuatro migraciones, y decidir el stock de la red en Vender y el Resumen de Inventario.
