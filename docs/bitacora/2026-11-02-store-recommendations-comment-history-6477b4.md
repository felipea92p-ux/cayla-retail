## 2026-11-02 — Tienda ▸ Recomendaciones: el mensaje propio se ve junto a la respuesta

- **Qué:** en «Lo que nos escribiste» cada recomendación muestra «Tú escribiste · fecha» (lo que mandó la clienta, siempre) y, debajo, «CAYLA te respondió · fecha».
- **Por qué así:** el texto ya estaba, pero suelto y sin rótulo; con varias recomendaciones apiladas no se entendía cuál era de quién. Solo presentación: sin migración ni cambio de base.
- **Abierto:** la base guarda una sola respuesta por recomendación (no hay hilo): una réplica de la clienta cuenta como recomendación nueva contra su tope diario.

## 2026-11-02 (b) — ERP ▸ Recomendaciones: cerrar la hoja con una respuesta sin enviar pregunta antes

- **Qué:** `<Cajon>` gana `antesDeCerrar` (Escape, velo, ✕, «atrás» y bajarla con el dedo pasan por ahí, igual que `<Modal>`). La hoja de una recomendación lo usa con `useSalidaSinGuardar`: con una respuesta escrita y no enviada pregunta «¿Salir sin guardar?».
- **Por qué así:** antes se cerraba en silencio y se perdía lo escrito. Se reutiliza la pregunta del sistema, no una nueva.
- **No verificado en navegador:** el ERP necesita sesión y la base local; la lógica la cubren tipos, lint y las pruebas de hojas (`hojas-escape`, `hojas-atras`).
