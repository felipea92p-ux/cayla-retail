- **2026-10-27 — Editar producto en una terminal: el precio de su tienda se escribe en la tabla, como un costo (Felipe: «por qué me pide
  hacer clic en otro botón si ya tengo ahí en la tabla»).** En «Precios», las tallas guardadas muestran el precio al que vende SU tienda
  y se escriben; como es uno por prenda (ADR-0370), escribir en una talla cambia todas, en ámbar. Bajo la tabla sale «Por qué cambia el
  precio en …» (la base exige el motivo) y todo se guarda con «Revisar y guardar» (`poner_precio_sede`, o `quitar_precio_sede` si se
  escribe el precio de la prenda). Desaparecen el bloque «Precio en …», «Cambiar precio aquí» y su hoja en la terminal; el líder sigue
  con «Precio por tienda». Regla pura: `cambioPrecioAqui` / `problemaPrecioAqui` (`lib/precio-sede-reglas.ts`, con prueba); pieza:
  `components/ficha-producto/PrecioAquiTerminal.tsx`. Verificado en local con la terminal administrativa hasta la hoja «Revisa y guarda»;
  el guardado final no se pudo probar en local (sin marcajes de Dynamic nadie está de turno), usa la misma RPC y firma que la hoja de antes.
- **Ajuste tras probarlo (Felipe, mismo día):** vuelve la frase del bloque de antes, siempre a la vista bajo la tabla: «Este precio solo vale en
  Tienda …: las otras tiendas no cambian.» La pestaña «Insignias y campañas» de la ficha (y su grupo en «Revisa y guarda») pasa a llamarse
  «Insignias». La pestaña Costos no se tocó: solo la ve quien puede ver el dinero de compras (`fn_puede_ver_dinero_de_compras`), y la
  terminal administrativa de la base local no tiene esos módulos.
- **Sin motivo (Felipe, mismo día: «solo con guardar al responsable está bien»):** la terminal ya no escribe por qué cambia el precio. Como
  `poner_precio_sede` exige 3 letras, la pantalla manda `MOTIVO_DESDE_LA_TABLA` («Cambiado desde la tabla de precios») y quién lo cambió lo
  guarda la firma; la línea del precio propio no repite ese motivo fijo. Sin migración. La hoja del líder («Precio por tienda») sigue pidiéndolo.
