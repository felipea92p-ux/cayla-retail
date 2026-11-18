# 2026-11-07 · La lupa del celular busca módulos

- **Qué:** en el celular, la lupa de la cabecera llevaba a `/buscar` (el buscador de prendas). Ahora abre el mismo buscador de pantallas
  que «Buscar…» en escritorio (`BuscadorGlobal`, por el evento `abrirBuscadorGlobal`), también en CAYLA Global.
- **Y busca por módulo:** «inven» trae Existencias, Traslados, Conteo… (`modulosDeLasHojas` en `lib/menu.ts`, con su prueba). Cada fila
  dice su módulo en palabras («Inventario») en vez de la dirección de la página.
- **Verificado:** a 375 px y a 1440 px con la cuenta de Felipe (Tienda Lima y CAYLA Global): se abre, filtra y al tocar «Traslados» entra a
  `/inventario/traslados`. `/buscar` (prendas) sigue en los accesos de Inicio y el dock de Almacén.
