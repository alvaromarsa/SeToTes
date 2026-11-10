// Cookie de sesión: un único sitio para su nombre y sus opciones.
// clearCookie debe recibir exactamente las mismas opciones (sin maxAge)
// o el navegador no la reconoce como la misma cookie y no la borra.
const AUTH_COOKIE_NAME = 'access_token';
const AUTH_COOKIE_MAX_AGE_MS = 60 * 60 * 1000;

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function setAuthCookie(response, token) {
  response.cookie(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions(),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

function clearAuthCookie(response) {
  response.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
}

module.exports = { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS, setAuthCookie, clearAuthCookie };
