## Recibir: tareas 4, 5 y 10 (2026-11-14) — rama `claude/analizar-tareas-pendientes-661022`, solo web, sin migración

Hecho y probado en el navegador contra el código de `main`, con un envío de prueba en la base local (5 prendas del catálogo, 24 unidades):

- [x] **Tarea 4.** El número llega listo al elegir o agregar un modelo sin contar (solo con mouse), y «quién recibe» se recuerda en las tres puertas (`recordarQuienRecibe`).
- [x] **Tarea 5.** Enter y ↓ bajan por la talla, ↑ y Shift+Enter suben, Enter al fondo pasa a la talla siguiente (`columnasDeLaTabla` + `celdaVecina`), y en la última el cursor va a «Llevar al stock ahora».
- [x] **Tarea 10.** El filtro «Faltan tallas» (antes «Tallas para después») junta todo lo contado sin tallas (`sinTallas`), y con todo contado el pie dice «Faltan tallas: <modelo>» (`siguienteSinTallas`).
- [x] El cursor vuelve a la primera casilla al abrir la hoja de tallas (roto desde el #1793).

Pendiente:

- [ ] Abrir el PR con `/abrir-pr`. Los commits están solo en la rama local.
- [ ] «Quién recibe» sin probar en el navegador con una cuenta de terminal y asistencia marcada (lo cubre `lib/responsable-conteo.test.ts`).
- [ ] El aviso «Toca el número para escribirlo» (`PlacaDelModelo.tsx`) quedó viejo cuando el número ya llega abierto. Es un texto de la pantalla: decidir qué dice.
- [ ] `/chaos` sobre Contar con estos cambios (doble Enter, dos pestañas, red caída al teclear). No se corrió: la base local es compartida y otra sesión tiene un caso a medias.
- [ ] `/formidable` y la ciega con una persona de almacén.
- [ ] El anillo de foco del enlace «Faltan tallas: …» quedó sin medir (el medidor pide teclado real). Es la pieza `btn-enlace`, igual que «Falta contar: …».
- [ ] Medir el efecto contra la mediana por reposición (9 min), no contra la de modelo nuevo: desde el 13-nov la foto se puede subir dentro de la hoja de crear. Es la tarea 1.
- [ ] Toca `apps/web/components/recepcion-conteo/` y `lib/`: nada de `components/ui/` ni de `app/estilos/vidrio/`. No cambia el diseño de Dynamic.
