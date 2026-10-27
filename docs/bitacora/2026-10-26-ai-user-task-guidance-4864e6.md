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

## 2026-10-27 («Pregúntale a CAYLA» se enciende sede por sede: actividad 8 de ADR-0529)
Qué hice: una tarjeta en Configuración ▸ Tiendas y caja con un interruptor por sede (`retail.asistente_sedes`, migración `20261027163000`);
el botón «Preguntar» y `/api/asistente` solo responden en una sede encendida, y al lado se ve lo gastado del mes contra el tope de US$30.
Por qué así: lo cambia quien ve Configuración y no solo un líder (Felipe hoy: «los líderes solo supervisan visualmente»); nace apagado en
todas porque el piloto es de una sede, y sin la función en la base el botón tampoco sale. Felipe se lleva: pegar las dos migraciones del
asistente cuando lo decida y encender la sede del piloto; la obra sigue en el worktree `zen-bell-150592` (rama `claude/ai-guide-c654db`).

## 2026-10-27 (Gestión ▸ «Preguntas del equipo»: actividad 9 de ADR-0529)
Qué hice: una pantalla nueva en Gestión (`/gestion/preguntas`, módulo `preguntas_equipo`, migración `20261027165000`) con las cifras del mes,
dónde llevaron las respuestas, qué accesos piden y la lista de preguntas con quién preguntó, qué se le respondió y si le sirvió.
Por qué así: Felipe eligió mostrar el nombre; por eso el cajón avisa «Tu líder ve lo que preguntas» y el módulo es solo de personas (como
Rendimiento). Nace sin rol: hoy solo la ve el líder. Felipe se lleva: pegar la migración (después de la de preguntas) y decidir si se la da
a las encargadas en Roles y accesos.

## 2026-10-27 (El informe del lunes: actividad 10 de ADR-0529)
Qué hice: cada lunes a las 7:00 de Lima un cron de Vercel junta las preguntas de la semana anterior y Claude Sonnet 5.5 las vuelve en hasta
5 mejoras (función nueva, mover a la vista, escribir una regla, dar un acceso, capacitar), cada una con sus preguntas; se ve arriba de
Preguntas del equipo y, si el lunes no salió, el líder lo arma con un botón (`retail.asistente_informes`, migración `20261027173000`).
Por qué así: el cron de Vercel usa la clave y la llave que ya están en producción (el vigía de GitHub pedía un secreto nuevo); la IA cita
«p1, p2…» y la base rechaza el informe si una cita no es de esa semana, así no hay evidencia inventada. Medido en local: US$0,009 por informe.
Felipe se lleva: pegar las cuatro migraciones del asistente juntas antes de fusionar; si no, el cron del lunes da 500.

## 2026-10-27 (Cierre de «Pregúntale a CAYLA»: actividad 11 de ADR-0529)
Qué hice: la evaluación fija de 40 preguntas (de 35 a 38 bien con la IA, tras arreglar que la búsqueda no ofrecía pantallas sin entrada propia
en el menú), /guia, /focus, oscuro y 375 px, /chaos (semilla 529: 21 de 24 resistieron, se cerró el doble clic que pagaba dos veces) y
/formidable (de 7,7 a 8,3, con los 3 cambios que Felipe aprobó).
Por qué así: la evaluación mide la búsqueda y la IA por separado, así que cuando falla se sabe dónde. Felipe se lleva: decidir el hallazgo
de permisos de /chaos (en el chat) y pegar las cuatro migraciones del asistente antes de fusionar el PR.
