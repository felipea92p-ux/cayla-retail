## 2026-10-04 (Finanzas cuenta desde una fecha: la planilla de septiembre deja de ser una pérdida falsa — ADR-0332)
Qué hice: Felipe vio «Utilidad de septiembre –S/ 39,613» en el Resumen y dijo que, como el sistema es nuevo, todo debería correr desde
octubre. Producción (solo lectura) le dio la razón: septiembre tiene 15 ventas de piloto (S/ 1,128) y **ningún** gasto registrado, así que
esos números eran la planilla de Dynamic contra casi nada. Agregué una fecha configurable, «Desde cuándo cuenta Finanzas», en Configuración ▸
Caja y avisos: lo registrado antes de ella no entra al diario ni al Estado de resultados (y por eso tampoco al Resumen, Balance y Cierre).
El Resumen dice «Finanzas cuenta desde el 1 de octubre: octubre es el primer mes completo» en vez de un cero, y el Cierre ya no ofrece cerrar
septiembre. Migración `20261004190000` (sin pegar en producción) + pruebas SQL (39), unitarias y recorrido en el navegador.
Por qué así: cortar la planilla «a ciegas» habría escondido plata real. La proyección de caja usa la última planilla pagada como estimado
de la que viene; la de octubre se pagará aunque el sistema sea nuevo, y sin ella desaparecía el aviso de que la semana del 26-oct al 1-nov
baja del mínimo de caja. Por eso se corta lo REGISTRADO y no lo que viene, ni el IGV de septiembre (se declara a SUNAT), ni el costo por
prenda del Taller.
Felipe se lleva: nada cambia hasta que pegue el SQL y elija «Desde Octubre 2026». Después de eso, el chequeo del Cierre sobre la planilla
de Dynamic es el que protege octubre: no se cierra antes de que Dynamic pague su período.
