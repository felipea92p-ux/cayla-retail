## 2026-10-13 (El aviso falso «La sesión se cerró en otra pestaña»)
Qué hice: «Salir» ahora marca su cierre como propio y la pestaña ya no se cuenta a sí misma que «otra pestaña cerró la sesión». Antes, al salir y volver a
entrar se veía ese aviso encima de Inicio.
Por qué así: el botón cierra la sesión y recién después navega a `/login`; en medio, el detector de ADR-0309 veía la cuenta desaparecer y asumía que fue otra
pestaña. La marca vive en memoria de la pestaña que salió (10 s), así que un cierre hecho en otra pestaña sigue avisando. Detalle: ADR-0309, act. 2026-10-13.
Felipe se lleva: salir y entrar en la misma pestaña ya no muestra ese aviso; si cierras sesión en OTRA pestaña, la primera sigue avisando. Verificado con
pruebas de la regla (`lib/sesion-entre-pestanas-reglas.test.ts`); no se reprodujo en el navegador (pide una cuenta real) — conviene confirmarlo saliendo y entrando una vez.
