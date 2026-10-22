import { randomUUID } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';

const ceremonies = new Map();
const ttlMs = 10 * 60_000;

export class PasskeyService {
  constructor(env = process.env) { this.env = env; }

  #origin(request) {
    const configured = this.env.WEB_ORIGIN;
    const requestOrigin = request.headers.origin;
    const origin = configured ? new URL(configured).origin : requestOrigin;
    if (!origin || (requestOrigin && requestOrigin !== origin)) throw Object.assign(new Error('El origen del sitio no coincide con WEB_ORIGIN.'), { status: 403 });
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') throw Object.assign(new Error('Passkeys requiere HTTPS.'), { status: 400 });
    return { origin, rpID: parsed.hostname };
  }

  async registrationOptions({ email, name, userId = randomUUID(), mode }, request, credentials = []) {
    const { origin, rpID } = this.#origin(request);
    const registrationId = randomUUID();
    const options = await generateRegistrationOptions({
      rpName: 'Asistencia', rpID, userID: Buffer.from(userId), userName: email,
      userDisplayName: name, attestationType: 'none', timeout: 60_000,
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      excludeCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports }))
    });
    for (const [id, state] of ceremonies) if (state.expiresAt <= Date.now()) ceremonies.delete(id);
    if (ceremonies.size > 10_000) throw Object.assign(new Error('Hay demasiadas verificaciones pendientes. Inténtalo de nuevo en unos minutos.'), { status: 429 });
    ceremonies.set(registrationId, { kind: 'registration', mode, userId, email, origin, rpID, challenge: options.challenge, expiresAt: Date.now() + ttlMs });
    return { registrationId, options };
  }

  async verifyRegistration(registrationId, response, request) {
    const state = ceremonies.get(registrationId);
    if (!state || state.kind !== 'registration' || state.expiresAt <= Date.now()) throw Object.assign(new Error('La verificación biométrica venció. Inténtalo de nuevo.'), { status: 410 });
    const { origin, rpID } = this.#origin(request);
    if (origin !== state.origin || rpID !== state.rpID) throw Object.assign(new Error('El origen de la verificación no coincide.'), { status: 403 });
    let verification;
    try { verification = await verifyRegistrationResponse({ response, expectedChallenge: state.challenge, expectedOrigin: state.origin, expectedRPID: state.rpID, requireUserVerification: true }); }
    catch { throw Object.assign(new Error('El teléfono no pudo validar el registro. Inténtalo otra vez desde el mismo sitio y dispositivo.'), { status: 400 }); }
    if (!verification.verified || !verification.registrationInfo?.credential) throw Object.assign(new Error('El dispositivo no pudo confirmar la biometría o el bloqueo de pantalla.'), { status: 400 });
    const credential = verification.registrationInfo.credential;
    const saved = { id: randomUUID(), usuarioId: state.userId, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports ?? [], creadoEn: new Date().toISOString() };
    if (state.mode === 'signup') {
      state.credential = saved;
      state.verified = true;
      return { registrationId, mensaje: 'Verificación del dispositivo lista.' };
    }
    ceremonies.delete(registrationId);
    return { saved, mensaje: 'Verificación del dispositivo registrada.' };
  }

  takeSignupCredential(registrationId, email) {
    const state = ceremonies.get(registrationId);
    if (!state || state.kind !== 'registration' || state.mode !== 'signup' || !state.verified || state.email !== email || state.expiresAt <= Date.now()) throw Object.assign(new Error('Configura la verificación Face ID/huella antes de enviar la solicitud.'), { status: 400 });
    ceremonies.delete(registrationId);
    return state.credential;
  }

  async authenticationOptions(userId, credentials, request) {
    if (!credentials.length) throw Object.assign(new Error('Esta cuenta no tiene un dispositivo verificado. Registra Face ID, huella o bloqueo de pantalla primero.'), { status: 428 });
    const { origin, rpID } = this.#origin(request);
    const challengeId = randomUUID();
    const options = await generateAuthenticationOptions({ rpID, timeout: 60_000, userVerification: 'required', allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports })) });
    for (const [id, state] of ceremonies) if (state.expiresAt <= Date.now()) ceremonies.delete(id);
    if (ceremonies.size > 10_000) throw Object.assign(new Error('Hay demasiadas verificaciones pendientes. Inténtalo de nuevo en unos minutos.'), { status: 429 });
    ceremonies.set(challengeId, { kind: 'authentication', userId, origin, rpID, challenge: options.challenge, expiresAt: Date.now() + ttlMs });
    return { challengeId, options };
  }

  async verifyAuthentication(challengeId, response, userId, storage, request) {
    const state = ceremonies.get(challengeId);
    ceremonies.delete(challengeId);
    if (!state || state.kind !== 'authentication' || state.userId !== userId || state.expiresAt <= Date.now()) throw Object.assign(new Error('La verificación de entrada venció. Escanea el QR otra vez.'), { status: 410 });
    const { origin, rpID } = this.#origin(request);
    if (origin !== state.origin || rpID !== state.rpID) throw Object.assign(new Error('El origen de la verificación no coincide.'), { status: 403 });
    const rows = await storage.read('credenciales_passkey');
    const credential = rows.find(item => item.usuarioId === userId && item.credentialId === response?.id);
    if (!credential) throw Object.assign(new Error('Este dispositivo no está registrado en la cuenta.'), { status: 401 });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response, expectedChallenge: state.challenge, expectedOrigin: state.origin, expectedRPID: state.rpID,
        credential: { id: credential.credentialId, publicKey: Buffer.from(credential.publicKey, 'base64url'), counter: credential.counter, transports: credential.transports },
        requireUserVerification: true
      });
    } catch { throw Object.assign(new Error('No se pudo verificar el dispositivo. Escanea el QR y vuelve a intentarlo.'), { status: 401 }); }
    if (!verification.verified) throw Object.assign(new Error('No se pudo comprobar la identidad del alumno.'), { status: 401 });
    await storage.update('credenciales_passkey', all => all.map(item => item.id === credential.id ? { ...item, counter: verification.authenticationInfo.newCounter, usadoEn: new Date().toISOString() } : item));
    return true;
  }
}
