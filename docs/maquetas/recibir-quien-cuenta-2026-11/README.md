# Maqueta · ¿Dónde se pide «Quién cuenta» en Recibir? (2026-11-03)

Origen: una terminal (Almacén Trujillo) no pudo «Agregar y contar» en «¿Qué llegó?». La base respondió «Elige quién hace esta operación» y la hoja lo mostró como falla de conexión; el combo «Quién cuenta» estaba al final del resumen, tapado por la hoja.

Abrir `index.html` (`http://localhost:<puerto>/recibir-quien-cuenta-2026-11/`, servidor `maqueta-referentes`). Sin build; no guarda nada. Usa el CSS real de `../recibir-boceto-2026-11/`.

Opciones: **Hoy** (reproduce el fallo) · **A** al empezar · **B** franja en Contar · **C** primer campo de la hoja · **A + C** (propuesta). Arriba se alterna entre terminal y persona con sesión (esta nunca ve nada).

Sin implementar en `apps/web`: espera la elección de Felipe. Sea cual sea, la hoja deja de inventar «revisa la conexión» y muestra el motivo real (`mensajeAlGuardar`).
