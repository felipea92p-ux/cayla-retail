# Maqueta · Gestión ▸ Rendimiento con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Gestión ▸ Rendimiento (`app/(app)/rendimiento` →
`components/rendimiento/`, ADR-0219 y ADR-0325).

**El plan es de Dany: solo cambia el material.** Ni una cifra, ni un orden, ni una palabra: qué se mide, cómo se cuenta (los soles por hora
contraídos), «Adelante / En ritmo / Por debajo» sin rojo, quién edita una meta y los dos rankings quedan como están.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px). Toca una tienda para elegirla.

Está armada **solo con lo ya elegido**: cabecera A, el segmento de modo (Hoy · Semana · Mes), tarjetas de cifra A · Placa, tabla B · Placa
Serena, avatar en lente, insignia A, barra de avance A · Tubo con su marca, barras por tiempo con los gráficos B · Tinta sobre vidrio, lápiz en
gota.

## Lo propio de Rendimiento (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| Las tarjetas-pestaña de las tiendas (`ComparativoTiendas`) | Como ahora | Papel con borde arena; la elegida, borde de tinta y una raya de 3 px abajo. |
| | **A · La elegida se levanta** (recomendada) | Placas Serena; la elegida es la más clara, sube 2 px con su sombra y lleva un filo de tinta, como la gota de las pestañas; las otras, un poco más tenues. |
| | B · La elegida se hunde | Placas Serena; la elegida queda en un pozo, como la tarjeta de cifra que filtra. |
| El historial de cambios de meta (el `<details>` de `PanelRendimiento`) | Como ahora | Tarjeta de papel; abierto, una línea por cambio. |
| | **A · Placa que se abre** (recomendada) | La placa Serena; abierta, los cambios bajan en un pozo. |
| | B · Línea del tiempo | La placa Serena; los cambios cuelgan de un riel con un punto por cambio. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin
que nada se salga. En la maqueta, `marco.css` ya usa `.pt`, así que aquí se llama `.rd-pt`.

## Lo que decidió Felipe

Pendiente.
