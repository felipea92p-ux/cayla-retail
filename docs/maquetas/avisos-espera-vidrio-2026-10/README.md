# Maqueta · el sistema que habla, con vidrio (2026-11-01)

Tres piezas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596) que ninguna pantalla monta: salen solas cuando el ERP
tiene algo que decir.

- **Los avisos de la esquina** (`components/ui/Avisos.tsx`, `app/estilos/avisos.css`, ADR-0146).
- **El loader a pantalla completa** (`components/ui/Espera.tsx`, ADR-0149).
- **«Hay una versión nueva»** (`components/VersionNueva.tsx`, ADR-0422).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`). La barra negra elige la cara de cada pieza, el tema y el ancho (de 320 a 1920 px). En «Probar»: un guardado
que pasa por el loader y deja su éxito con «Deshacer», un error, una advertencia, un proceso con avance que se transforma en éxito, los
cuatro juntos, el loader quieto (a los 4 s dice «Está tardando más de lo normal») y la gota otra vez. La ✕ de la píldora la recoge.

## Lo que hay hoy

- **Avisos:** arriba a la derecha, máximo cuatro; éxito 4 s, advertencia 6 s, error 8 s (7 s como mínimo con «Deshacer»). El anillo se
  dibuja, el glifo se traza, el texto se revela y a los 520 ms el anillo empieza a vaciarse como reloj. La tarjeta es **papel macizo**
  con borde de arena y sombra: lo único sólido que flota sobre el vidrio.
- **Loader:** velo crema al 60 % con 3 px de desenfoque y una **tarjeta de papel** con el colibrí, el arco rojo que gira, «Un momento ·
  Cargando» y el hilo que barre. Los avisos esperan a que se vaya.
- **Versión nueva:** la gota que cae, rebota una vez (el único rebote del ERP) y se riega hasta ser una **píldora de tinta sólida**. El
  movimiento está decidido: la maqueta lo copia tal cual de `avisos.css` y solo cambia el material.

## Las caras

| Pieza | Cara | Cómo es |
|---|---|---|
| Avisos | Como ahora | Tarjeta de papel. |
| | A · Placa Serena | La placa de vidrio de las hojas; el tono, solo en el anillo. |
| | **B · Lente del tono** (elegida) | La placa teñida apenas del tono, con un filo del tono: la lente del aviso de las hojas y de la insignia. |
| | C · Isla ahumada | Vidrio ahumado de tinta, letra crema, como una notificación del celular. |
| Loader | Como ahora | Velo crema y tarjeta de papel. |
| | A · Hoja Serena | El velo y la hoja Serena de todas las hojas; arco e hilo como hoy. |
| | **B · Lente sola** (elegida) | Sin tarjeta: la pantalla se esmerila y queda una lente con el colibrí; las palabras sueltas debajo. |
| Versión nueva | Como ahora | Píldora de tinta sólida. |
| | **A · Gota ahumada** (elegida) | El mismo líquido de tinta al 88 %, con lo de atrás desenfocado, la luz arriba y un filo. |
| | B · Gota de vidrio claro | Líquido de vidrio claro con un filo, letra tinta, «Actualizar» como botón primario. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Dónde sale cada pieza, sus tiempos y su orden (los avisos esperan al loader; lo que ya se vio no vuelve; el loader sale a los 200 ms y dura
al menos 400), la coreografía de los avisos, el arco y el hilo del loader, la gota con su único rebote, el texto para lector, y que con
`prefers-reduced-motion` todo llega ya hecho (menos el reloj del aviso, que es función).

## Lo que cambia por el marco nuevo

Hoy, en escritorio, la píldora de la versión nueva se centra en la banda de la cabecera. Con la cabecera «Dos islas», el buscador ocupa a
veces ese centro. Por eso la píldora va en el **hueco entre las dos islas** si cabe con 12 px de aire por lado (pasa a 1440 y 1920 px), y si
no cabe va **justo bajo la cabecera**, centrada sobre el contenido (a 1024 y 1280 px; es lo mismo que hoy pasa bajo 1024 px). En la maqueta
lo decide `colocarVersion()`, y se midió a siete anchos sin que se salga ni pise una isla.

## Reglas que respeta

Solo tokens, claro y oscuro. Ningún movimiento nuevo: el vidrio de la píldora llega a los 1,65 s, cuando el líquido termina de llenar, con
el mismo fundido del contenido. El círculo rojo es el lugar del colibrí del logo. Datos inventados.

## Lo que decidió Felipe

**2026-11-01: avisos B · Lente del tono, loader B · Lente sola y versión nueva A · Gota ahumada** (en el loader no tomó la recomendada, la
hoja Serena). Al implementar: el texto del loader va suelto sobre el esmerilado, así que hay que medir su contraste sobre las pantallas más
cargadas (tablas, Observatorio) en los dos temas; la regla de la píldora, que va en el hueco entre las islas o bajo la cabecera, está arriba.
