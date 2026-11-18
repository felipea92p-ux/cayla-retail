## 2026-11-18 (Libro de Reclamaciones virtual, ADR-0679)
Qué hice: comparé con el repo los 35 puntos legales de un video que mandó Felipe y construí el que faltaba y más pesaba en Perú: el Libro de Reclamaciones virtual de la tienda online, en 6 actividades. El cliente deja su reclamo o queja sin cuenta y recibe su constancia numerada y una copia por correo; el ERP (Tienda web ▸ Libro de Reclamaciones) ve cada hoja con sus días hábiles restantes y la responde, y la respuesta le llega al cliente por correo y en su constancia.
Por qué así: la ley no deja pedir cuenta, la hoja es una constancia (no se corrige ni se borra, copia los datos de CAYLA del día) y el correo puede fallar sin que se pierda nada (cola con reintentos). El plazo se calcula al leer, con solo los feriados de siempre: si falta uno, el ERP avisa antes, nunca después.
Felipe se lleva: nada en producción. Faltan su OK para las 4 migraciones (en orden), una llave de Resend propia de la tienda y la revisión legal (sesión aparte, `docs/legal/`); probado en local (base 46/46, ERP 163.031, tienda 917, de punta a punta en el navegador y a 375 px).

## 2026-11-18 (Libro de Reclamaciones: al día con main y lo que pidió la revisión legal)
Qué hice: traje `main` (3 845 commits) y puse el Libro en el vidrio Serena (el cajón con el velo que difumina) y en el diseño nuevo de la tienda; después sumé lo que pidió la revisión legal: el código del libro «LR-WEB-01», los datos completos de quien representa a un menor, la casilla de conformidad que reemplaza la firma y la línea de privacidad.
Por qué así: la hoja virtual tiene que tener lo mismo que el formato oficial (Anexo I); la base no guarda una hoja sin la conformidad ni a un menor sin los datos de quien lo representa.
Felipe se lleva: 5 migraciones esperan su OK (en orden), la llave de Resend de la tienda, y el abogado copia las leyendas literales de los Anexos I y II. Probado en local: base 51/51, tienda 1234, ERP en verde, una hoja de menor de punta a punta en el navegador.

## 2026-11-18 (Libro de Reclamaciones: la base en producción)
Qué hice: con el OK de Felipe, pegué en producción las 5 migraciones del Libro (CLI enlazado a `vovjyyiafkxteijimpuy`, cada una en una transacción con su registro en `schema_migrations`) y verifiqué cada parte con una consulta de solo lectura.
Por qué así: el CLI corre el archivo tal cual (sin transcribir SQL a mano) y la transacción deja todo o nada; al final, las 18 funciones del Libro tienen la misma huella en producción y en la base local probada.
Felipe se lleva: la base ya está; falta publicar la web (PR), la llave de Resend de la tienda y darle el módulo a un rol.
