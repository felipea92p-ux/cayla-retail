## 2026-10-27 (Producción: cinco pasos, orden «de antes» y tres etapas de visibilidad — ADR-0551)
Qué hice:
- Revisé en solo lectura los ADR 0361, 0371, 0400 y 0509, las migraciones de fases (`20261019191000`, `20261019192000`) y las lecturas que deciden si una prenda se ve (Vender, Existencias, Productos, vitrina).
- Escribí el **ADR-0551 (propuesto)** con las decisiones de Felipe del 27-oct (pasos 7→5, «Ojales y botones», orden «de antes», cierre sin stock, pago desde BCP Operativa, tres etapas) separadas de lo que propone el arquitecto y de siete preguntas abiertas.
Por qué así: esas decisiones solo vivían en una conversación; sin ADR, la primera migración habría quedado sin su razón escrita (principio 8). La etapa de una prenda se deriva de una función, no de una columna, para que Vender, la vitrina y Productos no puedan contradecirse.
Estado: solo documentos. Ninguna migración, ningún dato, nada en producción. Siguiente: que Felipe conteste las preguntas abiertas y dé su OK a la actividad 1.
