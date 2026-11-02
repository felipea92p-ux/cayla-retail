# Maqueta · Inventario ▸ Traslados con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Inventario ▸ Traslados, la **billetera de pases**
(ADR-0355, `components/traslados-pases/`, `app/estilos/traslados-pases.css`).

La billetera de pases es un diseño propio, con su propio movimiento. El 2026-11-02 Felipe decidió pasarla al vidrio **con el mismo
movimiento**: el camión que corre, la línea que se llena, el anillo, el pase que entra y el sello que cae siguen iguales. La maqueta solo
cambia el material.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco elegido (`../vidrio-base-2026-10/`), con las piezas
ya elegidas: cabecera A, buscador A · Pozo, pestañas A · La gota de Mi perfil, paginación A · Gota en su pozo y botones gota. Todo se toca:
las pestañas Llegan, Envías y Terminados (en Terminados cae el sello «RECIBIDA»), los pases de la pila y las flechas de abajo. En el celular
se ve una cosa a la vez, con la flecha para volver a tus cajas.

## Lo propio de Traslados (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| El pase (grande y mini) | Como ahora | Papel macizo; la banda, del color de lo que te toca; los huecos de la perforación, pintados del color del fondo. |
| | A · Vidrio claro | La placa de vidrio, con su luz; la banda, vidrio teñido del tono; los huecos se recortan de verdad (una máscara) y dejan ver el fondo. |
| | **B · Lente del tono** (elegida) | Además, todo el pase se tiñe apenas del color de lo que te toca. |
| El escenario del pase grande | Como ahora | Caja de hueso de 640 px. |
| | **A · Al aire** (elegida) | Sin caja: el pase flota sobre el lienzo. |
| | B · Pozo | El pase descansa en un pozo hundido. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Todo el movimiento de ADR-0355 (el giro del pase para contar, las letras que giran, el camión, el anillo y el sello), los colores de lo que
te toca, un solo botón negro por pase, la pila con su franja y, en el celular, una cosa a la vez. El reverso (contar) y los pedidos entre
sedes llevan el mismo material del pase que se elija.

## Reglas que respeta

Solo tokens: los colores de cada tono son los de `traslados-pases.css`. Claro y oscuro. Ningún movimiento nuevo; todo se apaga con
`prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

**2026-11-02: pasar la billetera de pases al vidrio con el mismo movimiento**, con **el pase B · Lente del tono y el escenario A · Al
aire** (en el pase no tomó la recomendada). Al implementar en `traslados-pases.css`:
- `.tp-pase` y `.tp-mini`: vidrio teñido del tono (`--tp-c` al 6→12 % sobre vidrio al 82→62 %, `backdrop-filter: blur(26px) saturate(1.6)`),
  con un filo del tono al 30 %. La banda (`.tp-banda`, `.tp-mini-banda`), vidrio teñido del tono (10→18 %). El sello, el camión y el fin de
  la línea, gotas claras.
- La perforación: los huecos se recortan con una máscara (`radial-gradient` en los dos bordes, a la altura de `.tp-perfo`) en vez de
  pintarse de `hueso`/`crema`; así funcionan sobre cualquier fondo.
- `.tp-escenario` sin `background` (al aire); `.tp-dia`, la placa de vidrio.
- Ningún movimiento cambia (ADR-0355).
