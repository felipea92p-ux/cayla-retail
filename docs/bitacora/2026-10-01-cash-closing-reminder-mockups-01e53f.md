## 2026-10-01 (Tres maquetas del recordatorio de cierre de caja)
Qué hice: `docs/maquetas/recordatorio-cierre-caja-2026-10/` con tres formas de avisar que hay que cerrar caja (Hilo, Isla y Crepúsculo). Las tres leen la hora de `ubicaciones.hora_cierre` (AQP 21:30, TRU 19:45), suben de nivel a los 30 y 60 min y no se quitan hasta que la caja se cierra. Las probé en el navegador en escritorio y a 375 px.
Por qué así: la hora de cierre por tienda ya existía en la base, así que el recordatorio no necesita migración ni una hora escrita en el código. Cada animación responde a algo que pasó (ADR-0136); la única que late es la del nivel «sin cerrar», como el chip «Vencida».
Felipe se lleva: elegir una maqueta (recomiendo la Isla, más la marca «● Cerrar» del menú) y responder las cinco preguntas del README: quién lo ve, si el líder ve otras sedes, la hora de Lima, el preaviso y los cortes de 30 y 60 min.

## 2026-10-01 (La «Isla» ya recuerda cerrar caja en el ERP)
Qué hice: implementé la maqueta 2 tal cual (ADR-0303, sin migración): `components/RecordatorioCierreCaja.tsx` montada en el layout, reglas puras en `lib/recordatorio-cierre-reglas.ts` (16 pruebas), `GET /api/caja/recordatorio` para enterarse de un cierre hecho en otra terminal, y «Cerrar caja» abre el cierre en `/caja?cerrar=1`. La probé en el ERP local en escritorio y a 375 px.
Por qué así: la hora ya vivía en `ubicaciones.hora_cierre`; el layout no se repinta al navegar, por eso el sondeo de un minuto; y un 503 nunca se lee como «ya cerraron».
Felipe se lleva: en producción las tres tiendas tienen `hora_cierre` vacía (consultado el 2026-10-01): hay que cargar AQP 21:30 y TRU 19:45 en Configuración ▸ Tiendas y caja, o la isla no aparece.
