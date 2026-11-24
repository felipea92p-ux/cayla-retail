## 2026-11-24 (Del piso a la caja: el ticket que arma la asesora llega a la MacBook)
Qué hice: «Mandar a la caja» en Vender (el ticket armado en el celular llega a la caja de la sede), la lista «Del piso» en la caja con
«Abrir» y el basurero, los del piso en la hoja de cierre, y la venta anotada en cada ticket para medir el cobro real (ADR-0701, ADR-0511
paso 2). Tabla nueva `retail.tickets_compartidos` y cinco funciones en `20261124172000_tickets_compartidos.sql`, sin pegar en producción.
Por qué así: el cobro de TRU se traba porque cada asesora hace siete pasos seguidos en la única compu; partirlo en armar, cobrar y entregar
lleva la espera simulada de unos 2 min a unos 9 s sin comprar equipo. El ticket viaja como una foto con un solo dueño a la vez: nadie lo
edita desde dos equipos, así que no hay versiones que reconciliar.
Felipe se lleva: pegar la migración (una sola parte, a cualquier hora) y, desde ese día, el tiempo real de cada cobro con la consulta de
ADR-0701. Falta correr `/chaos`, `/milimetro auditar`, `/focus` y `/formidable` antes del PR.
