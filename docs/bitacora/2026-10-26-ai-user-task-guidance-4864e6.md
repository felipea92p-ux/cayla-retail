## 2026-10-26 (Nace la idea de «Pregúntale a CAYLA»: la IA que te lleva al botón y aprende de lo que nadie encuentra)
Qué hice: con las 10 respuestas de Felipe escribí el ADR-0529 (propuesto, nada construido): botón en la cabecera y ⌘K, guía viva con el
motor de las guías interactivas, IA que elige solo de pasos que existen, modo básico sin IA, tope de US$30, informe de 5 mejoras cada lunes y
piloto en una sede.
Por qué así: si la IA pudiera describir pantallas de memoria inventaría botones; encadenando pasos de `lib/guias/` hereda las huellas que ya
vigilan cada pantalla. Las tres tensiones (rellenar contra «nunca guarda», botón contra módulo, reglas sin escribir) quedan resueltas en el ADR.
Felipe se lleva: el ADR para leer y la lista de actividades de `/construir` para aprobar; la clave de la API y la sede del piloto son suyas.

## 2026-10-26 («Pregúntale a CAYLA» ya responde, lleva al paso y anota cada pregunta: actividades 1 a 5 de ADR-0529)
Qué hice: el cajón de la cabecera busca entre las guías, la IA (Haiku 5.5) elige guía y paso de esa lista, «Muéstrame» lleva al paso
(hasta 3 pantallas), dice a quién pedir lo que el rol no ve, y cada pregunta se anota con «¿Te sirvió?» y el tope de US$30.
Por qué así: la IA nunca inventa un botón (solo elige de las guías, que ya se vigilan) y la frase de «sin acceso» la escribe el
sistema. Felipe se lleva: la migración `20261026235000` lista para pegar cuando lo decida; hasta entonces el asistente no anota nada.

## 2026-10-27 (Pausa de la obra «Pregúntale a CAYLA»: 7 de 11 actividades hechas; cómo seguir desde otra sesión)
Qué hice: actividades 6 (rellena el buscador con lo que la persona dijo, marcado «Lo escribió CAYLA») y 7 (10 reglas de tienda
aprobadas por Felipe y errores con la frase de la pantalla); todo en commits locales de la rama, sin push ni PR (se abre al final).
Por qué así: Felipe se quedó sin tokens en esta cuenta y sigue en otra sesión en esta misma máquina; el estado completo y los pasos
para retomar están en `docs/backlog/2026-10-26-ai-user-task-guidance-4864e6.md`, sección «Para continuar desde otra sesión».
Felipe se lleva: abrir la nueva sesión en este mismo worktree y decirle «sigue con la actividad 8 de ADR-0529».
