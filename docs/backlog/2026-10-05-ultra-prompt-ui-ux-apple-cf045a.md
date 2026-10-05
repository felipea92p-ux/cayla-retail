## Formidable (ADR-0350) — lo que falta (2026-10-05)

- [x] **Piloto, corrida 1:** hecha el 2026-10-05 (`docs/formidable/inventario-frescura.md`). Falta la corrida 2 con datos que permitan la tarea.
- [ ] **Repetir la prueba ciega con prendas de varios estados** (Nueva, Vigente, Envejecida, Crítica, temporada pasada) y con Sonnet u Opus pidiendo pasos y conteos; sin eso la ley 1 sigue sin nota.
- [x] **Los 3 cambios de Frescura ejecutados** (2026-10-05, commits `afab1e7a9`, `6506121ac`, `a205dc895`, `724dd4172`; sin push ni PR).
- [ ] **Decidir (Felipe):** las dos preguntas de negocio del informe: qué se decide en «Por decidir» y si el semáforo se muestra con menos de 10 ventas.
- [ ] **Arreglar el foco visible una vez para todo el ERP** (`campos.tsx:710`, `globals.css:439`, pastilla de sede, filas clicables, cifra «por decidir»): hoy ≈2:1 o menos, bajo el 3:1 de WCAG 1.4.11. Cálculo por código; confirmarlo con una lectura directa.
- [ ] **Base local al día:** la base compartida no tiene `fn_observatorio` ni las tablas de decisiones de Frescura (4b); cualquier prueba de pantalla mide el entorno. Decide quién aplica las migraciones (hoy nadie lo hace por su cuenta).
- [ ] **Decidir (Felipe):** qué significa «Por decidir / Decididas» en Frescura del piso; el nombre no dice qué se decide (ley 1) y la respuesta es de negocio.
- [ ] **Pasada con colaboradoras reales** (3 a 5, de distintas sedes, en el Mac mini de la tienda): sin ella la ley 1 no pasa de 8.
- [ ] **Medir qué dispositivo abre cada ruta** (los registros de acceso o la analítica): «sobre todo Mac mini» es una afirmación, no un dato; antes de bajar la prioridad táctil de un módulo.
- [ ] **Prueba en el CI** cuando el piloto fije qué es «bueno»: hoy el cumplimiento es con tablero, sin CI. Decide Felipe.
- [ ] **Medidor en script** (`scripts/formidable/`) si el JS pegado en el navegador se vuelve tedioso: el actual (`referencia/medir-oficio.js`) está probado a mano, sin prueba automática.
- [ ] **Sonido al confirmar lo importante** (siempre apagable): quedó como principio en el ADR; no se construyó nada. Antecedente: ADR-0344.
- [ ] **Corrida 2 de Frescura** con prendas de varios estados y 3 a 5 colaboradoras reales, para recalificar las leyes; hoy solo hay medición parcial.
- [ ] **Subir los 4 commits** (push y PR) cuando Felipe lo ordene: la rama aún no está en `origin`.
