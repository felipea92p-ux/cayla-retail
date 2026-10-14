## Compras ▸ Fondos por rendir: los cambios 2 y 3 de /formidable (2026-10-14) — rama `claude/formidable-fondos-cambios-9b0c82`

- **Qué:** lo que /formidable propuso y Felipe eligió después de fusionar la fase 6 (#1055). Cambio 2: si la lista de lo rendido no se
  lee, «Revisar», «Ver tu rendición» y «Rendir» lo dicen y ofrecen «Volver a intentar» (antes, una lista vacía falsa), y «Aprobar» espera
  a que se vea (decisión 81). Cambio 3: la cuenta de cada persona dicha entera —el faltante dice en cuánto queda la deuda, «dice S/ 375.00
  · por aprobar» en la fila, «Revisar» en secundario para quien no aprueba, «Ver tu rendición» lee la explicación de la propia rendición y
  palabras de tienda— (decisión 82).
- **Por qué:** dos pruebas ciegas se trabaron en lo mismo: 8 de sus 24 dudas eran cifras que no se explicaban entre sí; y el escéptico vio
  que «Ver tu rendición» decía algo falso sin explicación y que «Aprobar» se podía pulsar con la lista cargando.
- **Cómo:** la base solo cambia un texto (`fn_rendicion_quien_no_aprueba`) y suma una lectura chica (`fn_mi_rendicion_abierta`); no se tocó
  la forma de `fn_mi_fondo_rendicion`, que las pruebas recargan. Lógica pura con su prueba (`rendicion-reglas.test.ts`), caso nuevo en
  `pruebas:rendicion-fondo`, guía de Fondos al día y sus huellas. Visto en el banco como Felipe, Sandra y Micaela, con la lectura forzada a
  fallar y al reintentar. La ciega de la encargada, repetida con capturas nuevas: 11 dudas (antes 12) y 4 retrocesos (antes 5); la duda
  «faltan S/ 5 y debe S/ 25» la resolvió «Revisar» sola. Notas: leyes 7,2 (antes 6,3), oficio 8.
- **Después (decisión 83):** Felipe eligió explicar en la hoja de devolución las dos cifras que confundieron a la ciega (S/ 380 de los libros
  y S/ 375 de tope): la hoja dice los libros, lo que falta y hasta cuánto puede devolver. Los montos de las frases ya no se parten entre «S/» y
  la cifra (`solesSinCorte`). Escenarios nuevos de modo oscuro para la lista que no se lee; la guía ya no dice «en gris».
