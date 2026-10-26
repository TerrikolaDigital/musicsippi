// Único módulo de src/data que NO habla con nuestro propio servidor: manda
// el formulario de contacto directo a FormSubmit.co (gratis, sin cuenta,
// sin backend propio) — ver
// docs/superpowers/specs/2026-09-03-formulario-contacto-design.md.
//
// Antes de distribuir la app con este formulario activo hace falta un paso
// manual (una sola vez, no es código): la primera vez que FormSubmit recibe
// un envío a este destino, manda un mail de confirmación a
// terrikoladigital@gmail.com que hay que aceptar para que empiece a
// reenviar. Hasta confirmarlo, los envíos de prueba no llegan.
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/terrikoladigital@gmail.com';

// FormSubmit reconoce el campo "email" y lo usa como Reply-To del mail que
// te reenvía — por eso el nombre del campo importa, no es solo texto libre.
// "_honey" es su honeypot nativo: si llega con contenido, FormSubmit
// descarta el envío en silencio sin que haga falta lógica propia acá.
export function enviarContacto({ mensaje, email, honey }) {
  return fetch(FORMSUBMIT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      mensaje,
      email,
      _honey: honey,
      _subject: 'Nuevo mensaje desde Musicsippi',
    }),
  });
}
