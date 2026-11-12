## Recibir ▸ Contar al volver con «atrás» (2026-11-11, ADR-0393 act. 2026-11-11) — solo web, sin migración; rama `claude/quizzical-sanderson-0e3403`, commit local, sin PR

- [x] Reproducido en local (ENV-001244, «Gabardina» 30 → 31): tras «atrás» la pantalla dice 30 con 31 en la base, y el servidor no recibe ninguna petición. Igual a los 40 s; por un enlace, solo antes de 30 s (`staleTimes`).
- [x] Causa: Next dibuja la página guardada en «atrás» sin preguntar; `RecibirContando` guarda sin `router.refresh()` y recordaba lo guardado solo mientras estaba montado; `guardar_conteo_envio` recibe el número entero y gana el último (si lo que mandas es igual a lo que hay, no avisa).
- [x] Arreglo de pantalla: la pestaña recuerda la versión más alta de cada línea (`apps/web/lib/recepcion-conteo-memoria.ts`) y Contar arranca de ahí. Prueba `lib/recepcion-conteo-memoria.test.ts`; verificado con clics reales en escritorio y a 375 px.
- [ ] **Decisión de Felipe: qué pasa cuando alguien guarda sobre un número que ya cambió.** Hoy gana el último (decisión 9 de ADR-0393). El arreglo de arriba cubre lo que guardó ESTA pestaña; no cubre a otra persona, otro aparato u otra pestaña. Tres caminos:
  - **A. Dejarlo así.** Ganas: nada que construir; el caso medido ya no pasa. Pagas: dos personas en la misma línea, o una pantalla abierta mucho rato, pueden perder una prenda sin aviso cuando los dos números coinciden.
  - **B. La pantalla relee la base cada vez que aparece** (al entrar, al volver y al despertar el celular) y no deja tocar hasta que conteste. Ganas: trae lo de otras personas hasta ese momento, sin tocar la base. Pagas: una lectura más por entrada, un instante sin responder (más largo en el almacén con mala señal; hay que decidir qué se ve si la lectura falla), y dos personas contando a la vez la misma línea siguen igual.
  - **C. La base no acepta un guardado hecho sobre una versión vieja** cuando el número cambió: devuelve lo que hay y la pantalla pregunta («Lucía puso 38 mientras tanto: ¿dejas 38 o pones tu 40?»). Ganas: el número mal guardado deja de poder ocurrir, venga de donde venga (principio 2). Pagas: cambia la decisión 9, lleva migración (`guardar_conteo_envio`) y una hoja nueva con su guía; cuando dos personas cuentan la misma línea, la segunda tiene un toque más. Recomendada si en una sede cuentan de a dos.
  - Descartada: mandar la diferencia (+1) en vez del número entero. Sirve para «Una más», pero no para un número escrito a mano, «Poner en cero» ni las tallas (`separado` es una lista entera).
- [ ] `/chaos` sobre Recibir ▸ Contar con la familia «navegación torcida» (atrás, adelante, dos pestañas): este caso no estaba en el catálogo.
- [ ] De paso (no es de esta tarea): en la base local falta `retail.fn_invariantes_estado`; el Inicio lo dice en la consola del servidor en cada carga.

### Otras pantallas con el mismo patrón (solo buscadas, no arregladas)

