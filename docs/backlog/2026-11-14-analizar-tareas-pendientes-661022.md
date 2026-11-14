## Recibir: tareas 4, 5 y 10 (2026-11-14) — rama `claude/analizar-tareas-pendientes-661022`, solo web, sin migración

Hecho y probado en el navegador contra el código de `main`, con un envío de prueba en la base local (5 prendas del catálogo, 24 unidades):

- [x] **Tarea 4.** El número llega listo al elegir o agregar un modelo sin contar (solo con mouse), y «quién recibe» se recuerda en las tres puertas (`recordarQuienRecibe`).
- [x] **Tarea 5.** Enter y ↓ bajan por la talla, ↑ y Shift+Enter suben, Enter al fondo pasa a la talla siguiente (`columnasDeLaTabla` + `celdaVecina`), y en la última el cursor va a «Llevar al stock ahora».
- [x] **Tarea 10.** «Tallas para después» sigue como en producción, y «Faltan tallas» se suma como filtro aparte (`faltanTallas`: lo que lleva el aviso ámbar). Con todo contado el pie dice «Faltan tallas: <modelo>» (`siguienteFaltanTallas`), solo entre lo que la lista muestra si hay un filtro puesto. La primera versión había reemplazado un filtro por el otro; se corrigió a pedido de Felipe («no quites funcionalidades ni filtros»).
- [x] Tarea 4, corrección: tocar en la lista el modelo que ya está en el contador (sin contar) vuelve a abrir su número, también tras cerrarlo con Escape o un clic fuera (`esPedidoNuevo`, `abreAlElegir`).
- [x] Tarea 5, corrección: Enter en la última casilla solo salta al botón del pie cuando el reparto cuadra (`enterSaleDeLaTabla`); a medias, el cursor se queda.
- [x] El cursor vuelve a la primera casilla al abrir la hoja de tallas (roto desde el #1793).

Pendiente:

- [ ] Abrir el PR con `/abrir-pr`. Los commits están solo en la rama local.
- [ ] Probar a mano, sin navegador automático (Felipe pidió no abrir más ventanas): los dos filtros de tallas con un modelo pedido «ahora» y otro «para después»; el pie con «Por llevar al stock» puesto; volver a tocar el modelo del contador tras Escape; Enter en la última casilla con el reparto a medias y completo. Lo cubren pruebas de reglas, no el navegador.
- [ ] «Quién recibe» sin probar en el navegador con una cuenta de terminal y asistencia marcada (lo cubre `lib/responsable-conteo.test.ts`).
- [ ] El aviso «Toca el número para escribirlo» (`PlacaDelModelo.tsx`) quedó viejo cuando el número ya llega abierto. Es un texto de la pantalla: decidir qué dice.
- [ ] `/chaos` sobre Contar con estos cambios (doble Enter, dos pestañas, red caída al teclear). No se corrió: la base local es compartida y otra sesión tiene un caso a medias.
- [ ] `/formidable` y la ciega con una persona de almacén.
- [ ] El anillo de foco del enlace «Faltan tallas: …» quedó sin medir (el medidor pide teclado real). Es la pieza `btn-enlace`, igual que «Falta contar: …».
- [ ] Medir el efecto contra la mediana por reposición (9 min), no contra la de modelo nuevo: desde el 13-nov la foto se puede subir dentro de la hoja de crear. Es la tarea 1.
- [ ] Toca `apps/web/components/recepcion-conteo/` y `lib/`: nada de `components/ui/` ni de `app/estilos/vidrio/`. No cambia el diseño de Dynamic.
