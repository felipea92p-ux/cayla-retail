import type { CSSProperties } from "react";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import { CabezaClub, EnlaceLegalClub, HojaClub } from "@/components/clientas/piezas-club-publico";
import { bienvenida, enlaceLegal, type PaginaClub, type RespuestaRegistro } from "@/lib/club-registro-reglas";
import { INICIO, avisoDeCumple, notaDelUmbral, petalos, sociaDesde, tarjetasDelInicio, type TarjetaInicio } from "@/lib/club-publico-reglas";

/* ====================================================================
   El primer y el último paso de la página PÚBLICA del Club CAYLA (`/club/<tienda>`, ADR-0288 act. g), tal como el diseño
   aprobado por Felipe el 2026-10-01: «al escanear» (lo que recibe y «Quiero unirme») y «ya es socia» (su tarjeta de socia y,
   si marcó WhatsApp, el saludo a la tienda). El del medio, el formulario, vive en `RegistroClub.tsx`, que es quien decide en qué
   paso está. Solo dibujan: las cifras y las frases salen de `lib/club-publico-reglas.ts` y `lib/club-registro-reglas.ts`; el
   aspecto y el movimiento, de `app/estilos/club-publico.css`.
   ==================================================================== */

/** `--r`: cuándo entra (la cascada del diseño); `--d`: cuánto dura. Los lee `.club-entra`. */
const entra = (r: number, d?: number) => ({ "--r": `${r}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as CSSProperties;

/** Paso 1 · al escanear: la tienda, «Tu mes, tu regalo.», lo que recibe y «Quiero unirme». */
export function InicioClub({ pagina, ubicacionId, onUnirme }: { pagina: PaginaClub; ubicacionId: string; onUnirme: () => void }) {
  const tarjetas = tarjetasDelInicio(pagina);
  return (
    <HojaClub cabeza={false}>
      <div className="club-paso club-paso-inicio">
        <div className="club-entra" style={entra(0, 500)}>
          <CabezaClub tienda={pagina.tienda} />
        </div>

        <section className="club-heroe" aria-labelledby="club-titulo">
          <IsotipoCayla className="club-colibri" color="currentColor" />
          <p className="club-antetitulo club-entra" style={entra(350, 600)}>
            {INICIO.antetitulo}
          </p>
          <h1 id="club-titulo" data-paso-titulo tabIndex={-1} className="club-titulo club-entra" style={entra(450, 700)}>
            {INICIO.tituloArriba}
            <br />
            <em>{INICIO.tituloAbajo}</em>
          </h1>
          <svg className="club-hilo" viewBox="0 0 346 26" aria-hidden>
            <path pathLength={100} d="M2 14 C 70 2, 130 24, 200 13 S 300 4, 344 12" />
          </svg>
          <p className="club-bajada club-entra" style={entra(650, 700)}>
            {INICIO.bajada}
          </p>
        </section>

        <ul className="club-beneficios" aria-label="Lo que recibes">
          {tarjetas.map((t, i) => (
            <li key={t.tipo} className="club-beneficio club-entra" style={entra(900 + i * 150, 650)}>
              <LadoDelBeneficio tarjeta={t} />
              <span>
                <strong>{t.fuerte}</strong>
                {t.resto}
              </span>
            </li>
          ))}
        </ul>

        <div className="club-unirme club-entra" style={entra(1350, 650)}>
          <button type="button" className="club-boton club-boton-unirme" onClick={onUnirme}>
            <span className="club-boton-capa" aria-hidden>
              <span className="club-brillo" />
            </span>
            <span className="club-boton-texto">{INICIO.boton}</span>
          </button>
          <p className="club-bajo-boton">{INICIO.bajoBoton}</p>
        </div>

        <p className="club-nota-umbral">
          {notaDelUmbral(pagina)}{" "}
          <EnlaceLegalClub href={enlaceLegal("terminos", ubicacionId)} amplio>
            Términos
          </EnlaceLegalClub>
          {" · "}
          <EnlaceLegalClub href={enlaceLegal("privacidad", ubicacionId)} amplio>
            Privacidad
          </EnlaceLegalClub>
        </p>
      </div>
    </HojaClub>
  );
}

/** La columna izquierda de cada tarjeta del inicio: el %, la mini escalera del vale o el globo de WhatsApp. */
function LadoDelBeneficio({ tarjeta }: { tarjeta: TarjetaInicio }) {
  if (tarjeta.tipo === "cumple") return <span className="club-beneficio-lado club-beneficio-cifra">{tarjeta.cifra}</span>;
  if (tarjeta.tipo === "vale") {
    return (
      <span className="club-beneficio-lado club-escalera" aria-hidden>
        {tarjeta.barras.map((b) => (
          <span key={b.anio} style={{ height: `${b.alto}%` }} />
        ))}
      </span>
    );
  }
  return (
    <span className="club-beneficio-lado club-beneficio-icono" aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5z" />
        <path d="M8.5 10h7M8.5 13.5h4.5" />
      </svg>
    </span>
  );
}

type Listo = Extract<RespuestaRegistro, { estado: "listo" }>;

/**
 * Paso 3 · ya es socia: pétalos, el ✓, su bienvenida, su tarjeta de socia, el aviso de cumpleaños (solo si nació este mes en
 * Lima) y, solo si marcó WhatsApp y la tienda tiene número, el saludo a la tienda. `mesNacimiento`: el que eligió en el formulario.
 */
export function SociaClub({ listo, pagina, mesNacimiento, hoy }: { listo: Listo; pagina: PaginaClub; mesNacimiento: string; hoy: string }) {
  const b = bienvenida(listo, pagina);
  const cumple = avisoDeCumple(pagina, mesNacimiento, hoy);
  const desde = sociaDesde(listo.clubDesde);
  return (
    <HojaClub cabeza={false}>
      <Petalos />
      <div className="club-paso club-paso-socia">
        <svg className="club-listo" viewBox="0 0 76 76" role="img" aria-label="Listo">
          <circle pathLength={100} cx="38" cy="38" r="35" />
          <path pathLength={100} d="M24 39 l9 9 l19 -20" />
        </svg>

        <div className="club-socia-encabezado club-entra" style={entra(900, 650)}>
          <h1 data-paso-titulo tabIndex={-1} className="club-socia-titulo">
            {b.titulo}
          </h1>
          <p className="club-socia-bajada">{b.bajada}</p>
        </div>

        <div className="club-tarjeta-socia-marco">
          <div className="club-tarjeta-socia" role="group" aria-label="Tu tarjeta de socia">
            <svg className="club-tarjeta-socia-hilo" viewBox="0 0 346 120" aria-hidden>
              <path pathLength={100} d="M4 96 C 80 20, 150 110, 220 50 S 320 10, 342 30" />
            </svg>
            <div className="club-tarjeta-socia-cabeza">
              <span className="club-tarjeta-socia-marca">
                <IsotipoCayla color="currentColor" />
                CLUB CAYLA
              </span>
              <span className="club-tarjeta-socia-pildora">SOCIA</span>
            </div>
            <div className="club-tarjeta-socia-datos">
              {listo.nombre && <span className="club-tarjeta-socia-nombre">{listo.nombre}</span>}
              <span className="club-tarjeta-socia-codigo">
                <span className="sr-only">Tu código de socia: </span>
                {listo.codigo}
              </span>
            </div>
            <div className="club-tarjeta-socia-pie">
              {desde && <span>{desde}</span>}
              <span>Muestra tu documento en caja</span>
            </div>
            <span className="club-tarjeta-socia-brillo" aria-hidden />
          </div>
        </div>

        {cumple && (
          <div className="club-aviso-cumple club-entra" style={entra(2100, 600)}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="9" width="18" height="12" rx="2" />
              <path d="M3 13h18M12 9v12M12 9c-1.5-3-5-4-5-1.5S10 9 12 9zm0 0c1.5-3 5-4 5-1.5S14 9 12 9z" />
            </svg>
            <span>
              <strong>{cumple.titulo}</strong> {cumple.texto}
            </span>
          </div>
        )}

        {b.saludo && (
          <div className="club-saludo club-entra" style={entra(2300, 600)}>
            <p className="club-saludo-titulo">{b.saludo.titulo}</p>
            <a href={b.saludo.enlace} target="_blank" rel="noopener noreferrer" className="club-boton club-saludo-boton">
              <svg className="club-boton-icono" viewBox="0 0 24 24" aria-hidden>
                <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5z" />
              </svg>
              <span className="club-boton-texto">{b.saludo.boton}</span>
            </a>
            <p className="club-saludo-nota">{b.saludo.parrafo}</p>
          </div>
        )}
      </div>
    </HojaClub>
  );
}

/** Los pétalos que caen una vez al llegar (siempre los mismos: `petalos()`), en los colores de la marca. */
function Petalos() {
  return (
    <div className="club-petalos" aria-hidden>
      {petalos().map((p, i) => (
        <span
          key={i}
          className="club-petalo"
          style={{
            left: `${p.izquierda}%`,
            width: p.ancho,
            height: p.alto,
            background: `var(--color-${p.color})`,
            animationDuration: `${p.duracion}ms`,
            animationDelay: `${p.retraso}ms`,
          }}
        />
      ))}
    </div>
  );
}
