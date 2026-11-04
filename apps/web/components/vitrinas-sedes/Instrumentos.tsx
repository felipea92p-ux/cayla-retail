import { useId, type CSSProperties } from "react";
import { anguloDial, arcoCarga, avance, nivelFondo, requeridos, falta, type CampoSede, type VitrinaSede } from "@/lib/vitrinas-sedes-reglas";

// Configuración ▸ Empresa y tiendas (docs/maquetas/empresa-tiendas-vitrinas-2026-11/): cada dato de una sede es un INSTRUMENTO dentro de una gota de vidrio. Se ve antes
// de leerse: el visor con su QR, el dial del día, el líquido del fondo, la constelación de Preguntar y el sello de la carga. Solo dibujan lo que ya dicen las reglas
// (`lib/vitrinas-sedes-reglas.ts`) y son `aria-hidden`: lo que se lee está en el texto del dato. Color: el de la sede solo aquí y en su aro (Felipe 2026-11-04: «más
// sutil y más ordenado»); ámbar, lo que falta; verde, lo que cerró. Estilos y movimiento: `app/estilos/vidrio/vitrinas-sedes.css`.

const conVar = (x: Record<string, string | number>) => x as CSSProperties;

// El dibujo de un QR, no un código real: no se puede leer, y el de verdad se imprime en el cartel del club.
const QR = [1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1];

function Visor({ con }: { con: boolean }) {
  return (
    <svg className={`vsi-qr ${con ? "" : "no"}`} viewBox="0 0 58 58" aria-hidden>
      {["M15 20v-5h5", "M38 15h5v5", "M43 38v5h-5", "M20 43h-5v-5"].map((d) => (
        <path key={d} className="esq" pathLength={1} d={d} />
      ))}
      {QR.map((p, k) =>
        p ? <rect key={k} className="mod" style={conVar({ "--f": Math.floor(k / 7) })} x={18.5 + (k % 7) * 3.1} y={18.5 + Math.floor(k / 7) * 3.1} width={2.6} height={2.6} rx={0.6} /> : null,
      )}
      <rect className="haz" x={13} y={13} width={32} height={1.4} rx={0.7} />
    </svg>
  );
}

const MARCAS = Array.from({ length: 13 }, (_, k) => {
  const a = ((-135 + k * 22.5) * Math.PI) / 180;
  const largo = k % 2 ? 2 : 3.6;
  return { k, x1: 29 + Math.sin(a) * 22, y1: 29 - Math.cos(a) * 22, x2: 29 + Math.sin(a) * (22 - largo), y2: 29 - Math.cos(a) * (22 - largo) };
});

function Dial({ hora }: { hora: string | null }) {
  const g = hora ? anguloDial(hora) : -135;
  return (
    <svg className={`vsi-dial ${hora ? "" : "no"}`} viewBox="0 0 58 58" aria-hidden>
      {MARCAS.map(({ k, ...m }) => (
        <line key={k} className="marca" {...m} />
      ))}
      {hora && (
        <>
          {/* unificar-fijo: el arco del día es parte del dial, no un avance: no se cierra ni se pone verde */}
          <circle className="arco" style={conVar({ "--a": ((g + 135) / 270) * 75 })} cx={29} cy={29} r={17.5} pathLength={100} transform="rotate(-225 29 29)" />
          <g className="aguja" style={conVar({ "--g": `${g}deg` })}>
            <line className="vara" x1={29} y1={29} x2={29} y2={15} />
            <circle className="punta" cx={29} cy={11.5} r={2.3} />
          </g>
        </>
      )}
      <circle className="eje" cx={29} cy={29} r={1.8} />
    </svg>
  );
}

function Liquido({ fondo }: { fondo: number | null }) {
  const id = useId();
  const con = fondo !== null;
  // 52: lo que asoma con muy poco; 8: casi lleno. El nivel es un dibujo, no una regla (`nivelFondo`).
  const y = Math.round(52 - nivelFondo(fondo) * 44);
  return (
    <svg className={`vsi-liq ${con ? "" : "no"}`} viewBox="0 0 58 58" aria-hidden>
      <clipPath id={id}>
        <circle cx={29} cy={29} r={27.4} />
      </clipPath>
      {con ? (
        <>
          <g clipPath={`url(#${id})`}>
            <g className="nivel" style={conVar({ "--n": `${y}px` })}>
              <g className="ola">
                <path className="espuma" d="M-58 2q7-4.5 14.5 0t14.5 0 14.5 0 14.5 0 14.5 0 14.5 0 14.5 0 14.5 0v70h-116z" />
                <path className="cuerpo" d="M-58 4q7 4 14.5 0t14.5 0 14.5 0 14.5 0 14.5 0 14.5 0 14.5 0 14.5 0v70h-116z" />
              </g>
            </g>
          </g>
          <text className="simbolo" x={29} y={35}>
            S/
          </text>
        </>
      ) : (
        <circle className="vacio" cx={29} cy={29} r={20} />
      )}
    </svg>
  );
}

function Constelacion({ activa }: { activa: boolean }) {
  return (
    <svg className={`vsi-const ${activa ? "" : "no"}`} viewBox="0 0 58 58" aria-hidden>
      <g className="gira">
        <ellipse className="orbita" pathLength={1} cx={29} cy={29} rx={22} ry={8.5} transform="rotate(32 29 29)" />
        <ellipse className="orbita" pathLength={1} cx={29} cy={29} rx={22} ry={8.5} transform="rotate(-32 29 29)" />
        <circle className="nodo" style={conVar({ "--k": 0 })} cx={47.6} cy={40.6} r={1.9} />
        <circle className="nodo" style={conVar({ "--k": 1 })} cx={10.4} cy={40.6} r={1.5} />
        <circle className="nodo" style={conVar({ "--k": 2 })} cx={47.6} cy={17.4} r={1.3} />
      </g>
      <path className="estrella" d="M29 16c1.3 8.1 4.9 11.7 13 13-8.100 1.300-11.700 4.900-13 13-1.300-8.100-4.900-11.700-13-13 8.100-1.300 11.700-4.900 13-13z" />
    </svg>
  );
}

function Sello({ vitrina }: { vitrina: VitrinaSede }) {
  const e = vitrina.carga?.estado;
  const clase = e?.tipo === "cerrada" ? "cerrado" : e?.tipo === "abierta" ? "abierto" : "no";
  const arco = e ? arcoCarga(e) : 0;
  return (
    <svg className={`vsi-sello ${clase}`} viewBox="0 0 58 58" aria-hidden>
      <path className="hex" pathLength={1} d="M29 7.5 47.6 18.25V39.75L29 50.5 10.4 39.75V18.25Z" />
      {/* unificar-fijo: los días que quedan alrededor del sello, parte del dibujo; lo que se lee es la fecha */}
      {arco > 0 && <circle className="dias" style={conVar({ "--a": arco * 100 })} cx={29} cy={29} r={25.5} pathLength={100} transform="rotate(-90 29 29)" />}
      <path className="traza cierre" d="M23.5 28v-3.5a5.5 5.5 0 0 1 11 0V28" />
      <rect className="traza" x={21} y={28} width={16} height={11.5} rx={3} />
    </svg>
  );
}

/** La gota de vidrio con el instrumento de ese dato. */
export function Instrumento({ vitrina, campo }: { vitrina: VitrinaSede; campo: CampoSede }) {
  return (
    <span className="vs-gota" aria-hidden>
      <i className="vs-brillo" />
      {campo === "whatsapp" && <Visor con={!falta(vitrina, "whatsapp")} />}
      {campo === "cierre" && <Dial hora={vitrina.tienda?.horaCierre ?? null} />}
      {campo === "fondo" && <Liquido fondo={vitrina.tienda?.fondo ?? null} />}
      {campo === "preguntar" && <Constelacion activa={!!vitrina.preguntar} />}
      {campo === "carga" && <Sello vitrina={vitrina} />}
    </span>
  );
}

/** El aro de la sede: un tramo por cada dato que cuenta. Encendido, listo; punteado y en ámbar, falta. */
export function AroSede({ vitrina }: { vitrina: VitrinaSede }) {
  const r = requeridos(vitrina);
  const a = avance(vitrina);
  if (!a.total) return null;
  const C = 2 * Math.PI * 29.5;
  const hueco = r.length > 1 ? 7 : 0;
  const largo = C / r.length - hueco;
  const texto = a.completo ? "Todo listo" : `${a.hechos} de ${a.total} listos`;
  return (
    <span className="vs-aro" role="img" aria-label={`${vitrina.corto}: ${texto}`} title={texto}>
      <svg className="tramos" viewBox="0 0 66 66" aria-hidden>
        {r.map((c, k) => {
          // Un tramo que falta se puntea DENTRO de su largo: con el punteado corriendo por todo el círculo, los tramos se tapaban entre sí.
          const vacio = falta(vitrina, c);
          const puntos = Math.max(1, Math.floor(largo / 4.8));
          const trazo = vacio ? `${Array(puntos).fill("1.6 3.2").join(" ")} 0 ${C - puntos * 4.8}` : `${largo} ${C - largo}`;
          return (
            // unificar-fijo: un aro por tramos dice qué dato falta; el <Anillo> del sistema solo dice cuánto
            <circle
              key={c}
              className={`tramo ${vacio ? "vacio" : "lleno"}`}
              style={conVar({ "--k": k, "--largo": `${largo}px`, strokeDasharray: trazo, strokeDashoffset: -(k * (C / r.length)) - hueco / 2 })}
              cx={33}
              cy={33}
              r={29.5}
            />
          );
        })}
      </svg>
      {a.completo ? (
        <svg className="visto" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <b aria-hidden>
          {a.hechos}/{a.total}
        </b>
      )}
    </span>
  );
}

/** El sello de la empresa: un guilloche de una sola tinta con su candado. Decora: lo que explica es el «?» de al lado. */
export function SelloEmpresa() {
  return (
    <svg className="vs-guilloche" viewBox="0 0 72 72" aria-hidden>
      <g className="giro">
        {Array.from({ length: 12 }, (_, k) => (
          <ellipse key={k} className="linea" style={conVar({ "--k": k })} pathLength={1} cx={36} cy={36} rx={33} ry={13} transform={`rotate(${k * 15} 36 36)`} />
        ))}
      </g>
      <path className="candado cierre" d="M31 35v-3a5 5 0 0 1 10 0v3" />
      <rect className="candado" x={29} y={35} width={14} height={10} rx={2.5} />
    </svg>
  );
}
