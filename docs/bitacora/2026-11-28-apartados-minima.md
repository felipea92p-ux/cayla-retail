## 2026-11-28 (Apartados en tres pestañas: Apartar, Pendientes e Historial, ADR-0720, actividad 1)
Qué hice: las pestañas pasan a «Apartar», «Pendientes» e «Historial», en el mismo lugar en las cuatro vistas, y el número de «Pendientes» es el de filas de su lista (`lib/apartados-pestanas.ts`, con su prueba).
Por qué así: es la «Mínima» que Felipe aprobó en la maqueta (`docs/maquetas/apartados-claro-2026-11/`, rama de la maqueta): cada apartado sale en un solo lugar y la pestaña no promete un número que ninguna lista tiene.
Felipe se lleva: nada que tocar todavía; la pantalla nueva llega entera en el PR de las actividades 0 a 4.

## 2026-11-28 (Pendientes como una sola lista, lo urgente primero, actividad 2)
Qué hice: «Pendientes» es una lista (`PendientesVista`, la tabla viva de Recibir) con todo lo vivo: lo abierto y lo cancelado que espera su devolución. Cada fila lleva un solo botón y solo si hay algo que hacer hoy (Devolver, Escribirle o «Avisado hoy»); tocar una fila abierta abre su cobro; «Escribirles a los N» arriba; «Búscalo en Historial» si lo buscado no está; los pedidos entre tiendas, debajo. Reglas puras en `lib/apartados-pendientes.ts`, con su prueba.
Por qué así: lo urgente vivía dentro del Historial y lo abierto salía dos veces. Al probarlo salió un error de verdad: el botón de la fila subía su clic a la fila y abría el cobro además del mensaje; ahora cada botón hace solo lo suyo. El cobro se abre solo para lo abierto, nunca para lo cancelado.
Felipe se lleva: probado a 1024, 1440 y 375 px, en claro y en oscuro, como líder y como colaborador, con datos inventados; falta la prueba con una colaboradora (actividad 11).
