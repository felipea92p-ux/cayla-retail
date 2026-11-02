# Maqueta · Gestión ▸ Frescura del piso con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Gestión ▸ Frescura del piso (`app/(app)/gestion/frescura`
→ `components/frescura/FrescuraPanel.tsx`, ADR-0208). Es el piloto de `/formidable`.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px).

Está armada **solo con lo ya elegido**: cabecera A, placas Serena, la barra apilada con los gráficos B · Tinta sobre vidrio, insignia A,
títulos de sección con su globito, buscador A · Pozo, filtros A · Gotas, «Limpiar filtros» punteado, botones gota y la miniatura de prenda de
hoy. **Los colores de los tramos no cambian**: verde, neutro y ámbar, nunca rojo; lo que aún no se sabe, rayado (Felipe en Formidable,
2026-10-10).

## Lo propio de Frescura (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| «Lo que mueve la aguja» (`FrescuraAguja`) | Como ahora | Hasta tres tarjetas de papel chicas, cada una con su insignia, lo que dice y un botón secundario. |
| | A · Placas chicas | Tres placas de vidrio claras e iguales; la insignia da el tono. |
| | **B · Lentes del tono** (elegida) | Cada tarjeta se tiñe apenas del tono de su insignia. |
| La marca de la prenda «por decidir» (`FrescuraFila`) | Como ahora | Un filete de tinta de 2 px al canto de la fila. |
| | A · Gota al canto | La marca de la fila elegida del menú (más gruesa, con su luz) y la fila apenas aclarada. |
| | **B · Fila hundida** (elegida) | La fila por decidir queda en un pozo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Los tramos y sus colores, las cifras del piso, las familias, lo que dice cada tarjeta de la aguja y su botón, las prendas por categoría con su
estado, qué hacer y su botón (el único negro es el de la prenda por decidir), los filtros y «Limpiar filtros».

## Reglas que respeta

Solo tokens; los colores de las prendas son dato. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos
inventados. Medida de 320 a 1920 px sin que nada se salga. En la maqueta, `marco.css` ya usa `.prendas`, así que aquí se llama `.fr-prendas`.

## Lo que decidió Felipe

**2026-11-02: «Lo que mueve la aguja» B · Lentes del tono y «por decidir» B · Fila hundida** (no tomó las recomendadas). Al implementar:
- `FrescuraAguja`: cada tarjeta (`rounded-xl border-sand bg-papel`) pasa a vidrio teñido del tono de su insignia (`vara.tono`: verde, ámbar),
  al 6→12 % sobre vidrio, con un filo del tono al 30 %.
- `FrescuraFila` con `porDecidir`: en vez del filete (`FILETE`), la fila queda en un pozo (tinta al 4 % con su sombra adentro, esquinas de
  16 px y un margen de 6 por 10 px); la raya de la fila de abajo se oculta. Varias filas seguidas por decidir quedan como pozos separados.
