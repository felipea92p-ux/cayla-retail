## /formidable de Vitrina ▸ Probador (2026-10-17)

- [x] Medir, prueba ciega, escéptico e informe (`docs/formidable/tienda-web-vitrina-probador.md`, fila en el tablero).
- [x] Los 3 cambios y los arreglos chicos, con el OK de Felipe: solo lo que entra al probador (`packages/shared`), una palabra por prenda, el
  paso que toca arriba; ícono de «Largos típicos», lista filtrada a la vista, «Deshacer» al descartar y textos.
- [ ] **Felipe:** quitar en producción los largos típicos de Vestidos, Faldas y Enterizos (Tienda web ▸ Vitrina ▸ Probador ▸ «Largos
  típicos», dejar las tres cajas vacías y Guardar). Hasta entonces, 44 prendas usan esos largos y las minis se dibujan como maxi.
- [ ] Al publicar: mirar en producción que «Les falta el largo» baje de 48 a los 12 Conjuntos y que «Preparar» ya no ofrezca fotos de accesorios.
- [ ] Repetir la prueba ciega sobre la pantalla nueva y hacer la pasada con una colaboradora real.
- [x] `/chaos` de la pantalla (semilla 1017, `docs/chaos/README.md`): 20 ataques, 15 resisten; arreglados con su prueba el «Deshacer» que
  pisaba otra decisión, el foco al cerrar y el aviso de redondeo.
- [ ] **POR PEGAR (2026-10-17), con el OK de Felipe, ANTES de fusionar el #1164:** `supabase/migrations/20261017183000_recortes_deshacer_y_candado.sql`
  (una parte; huellas esperadas en la descripción del PR). Después, refrescar el volcado (`deshacer_descarte_recorte` es nueva).
- [ ] «Preparar recortes» en dos equipos a la vez hace el trabajo dos veces y deja archivos de más en el almacén (gravedad 4): avisar que
  otra persona ya prepara, o saltar la foto que ya tiene recorte al llegar a ella.
- [ ] `guias:recorrer` no arranca ninguna demo en este entorno (`.guia-tarjeta` no aparece con `?demo=1`, tampoco en Looks, que no se tocó).
  Averiguar si es del entorno o de main antes de confiar en el recorredor.
- [ ] Lista aparte del informe: «Anterior» y filtro «Descartadas» en Revisar, la hoja de la prenda con sus recortes, «Todo listo.» antes de
  decidir, `focoEnLaHoja` en «Largos típicos», la nota de «Preparar» con `nota-cayla` y su tiempo, y los datos con su título a 375 px.
