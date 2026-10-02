## 2026-10-01 (Club CAYLA: la página del QR, igual al diseño aprobado, en tres pasos)

Qué hice: `/club/<tienda>` pasa a tres pasos en la misma dirección —al escanear, sus datos y ya es socia— como las tres
pantallas de celular que aprobó Felipe, con sus animaciones en `app/estilos/club-publico.css` (solo tokens; el único bucle es el
colibrí flotando; «reducir movimiento» lo apaga todo y deja cada cosa en su estado final). Las cifras del inicio, la barra de
avance (lo mismo que cuenta la guía de foco), el aviso de cumpleaños del mes de Lima y «Socia desde oct. 2026» salen de
`lib/club-publico-reglas.ts`, con su prueba. La lógica del registro no cambió: padrón por `/api/club/nombre`, `registrarme`,
textos versionados de la base, errores y `club_texto_cambio`.

Por qué así: la página la ven las clientas, no el equipo; Felipe aprobó para ella un movimiento más vistoso que el del ERP (lo
documenta él en el ADR). «Qué recibes» y la cabecera del borrador legal los reemplazó el inicio del diseño, con las mismas cifras
de la base y las condiciones en la nota del umbral y en los Términos.

Felipe se lleva: mirarla a 375 px (los tres pasos, con y sin WhatsApp, socia nueva y la que ya era socia, «reducir movimiento»);
anotar en el ADR el rojo de «Sigue aquí» (el resto del ERP guía sin rojo) y que `docs/club/texto-legal-registro-v1.md` §1 ya no
describe la cabecera ni «Qué recibes».
