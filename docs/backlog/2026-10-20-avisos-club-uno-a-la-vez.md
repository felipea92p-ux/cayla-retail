## Avisos del club: uno a la vez y mensajes editables (2026-10-20)
- [x] ~~Pegar en producción `20261020144000_club_avisos_mensajes_editables.sql`~~ — **pegada el 2026-10-20** con el OK de Felipe; verificados los textos nuevos (cierre y BAJA al final) y las 4 funciones.
- [x] ~~Pegar en producción `20261020151000_club_avisos_mensajes_por_tienda.sql`~~ — **pegada el 2026-10-20** con el OK de Felipe; verificado que la lista de avisos lee el mensaje de cada tienda y que toda tienda arranca con los de CAYLA.
- [ ] Probarla con una cuenta real: mandar dos avisos seguidos con «Siguiente» y Enter, y «Deshacer» (la prueba local fue sin base: no se vio un envío anotado).
- [ ] Correr `/formidable` y `/chaos` sobre la pantalla y la hoja (la hoja guarda: doble clic en «Guardar mensajes», dos líderes a la vez).
- [ ] Refrescar el diccionario de datos cuando las dos migraciones estén en producción (`aviso_cierre`, `club_avisos_textos_sede` y sus funciones).
