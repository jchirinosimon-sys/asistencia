import http from 'node:http';
import path from 'node:path';
import { readFile, stat, readdir } from 'node:fs/promises';
import { randomUUID, randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { JsonStorage, COLLECTIONS } from './storage/json-storage.js';
import { createSession, readSession, verifyPassword, hashPassword } from './security.js';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const secret = env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error('Falta SESSION_SECRET o tiene menos de 32 caracteres. Copia .env.example a .env, configura SESSION_SECRET y vuelve a ejecutar npm start.');
const root = path.resolve('frontend');
const storage = new JsonStorage(path.resolve(env.DATA_DIR ?? 'backend/data'));
const backupDir=path.resolve(env.BACKUP_DIR??'backups');
await storage.init();
const roles = ['direccion', 'maestro', 'alumno', 'tutor'];
const loginFailures=new Map();
const signupFailures=new Map();
const attendanceFailures=new Map();
const createCollections = ['alumnos','maestros','tutores','relaciones_tutores','grupos','especialidades','semestres','materias','inscripciones','avisos_escolares','horarios','calendario_escolar','periodos_evaluacion'];
const securityHeaders={'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; form-action 'self'",'permissions-policy':'camera=(self), microphone=(), geolocation=()'};
const json = (res, status, value, headers={}) => { res.writeHead(status, { ...securityHeaders,...headers,'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
const todayAt = (zone='America/Guatemala') => new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fail = (status,message) => Object.assign(new Error(message),{status});
const safeEqual = (a,b) => { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); };
const hashQrToken = token => token.length===5 ? createHmac('sha256',secret).update(token).digest('hex') : createHash('sha256').update(token).digest('hex');
function validateFields(collection, record){
  const required={alumnos:['nombres','apellidos','matricula'],maestros:['nombres','apellidos'],tutores:['nombres','apellidos'],relaciones_tutores:['tutorId','alumnoId','parentesco'],grupos:['nombre','ciclo'],especialidades:['nombre'],semestres:['nombre'],materias:['nombre'],inscripciones:['alumnoId','grupoId','ciclo'],avisos_escolares:['titulo','contenido'],horarios:['diaSemana','horaInicio','horaFin','materiaId','maestroId','grupoId'],calendario_escolar:['fecha','tipo'],periodos_evaluacion:['nombre','iniciaEn','terminaEn']}[collection]??[];
  for(const key of required)if(record[key]===undefined||record[key]===null||record[key]==='')throw fail(400,`El campo ${key} es obligatorio.`);
  if(collection==='alumnos'&&String(record.matricula).length>40)throw fail(400,'La matrícula no puede exceder 40 caracteres.');
  if(collection==='horarios'&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.horaInicio)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.horaFin)||record.horaInicio>=record.horaFin||!Number.isInteger(Number(record.diaSemana))||Number(record.diaSemana)<0||Number(record.diaSemana)>6))throw fail(400,'El horario debe indicar día de 0 a 6 y horas válidas.');
  if(collection==='calendario_escolar'&&!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha))throw fail(400,'La fecha debe usar el formato AAAA-MM-DD.');
  if(collection==='calendario_escolar'&&!['lectivo','clases','festivo','suspension','sin_clases','evento','evaluacion','jornada_especial'].includes(String(record.tipo).toLowerCase()))throw fail(400,'El tipo de día del calendario no es válido.');
  if(collection==='relaciones_tutores'&&typeof record.activa==='undefined')record.activa=true;
  if(collection==='inscripciones'&&typeof record.estado==='undefined')record.estado='activa';
  if(collection==='alumnos'||collection==='maestros'||collection==='tutores'||collection==='grupos'||collection==='especialidades'||collection==='semestres'||collection==='materias')if(typeof record.activo==='undefined')record.activo=true;
  if(collection==='periodos_evaluacion'&&record.iniciaEn>record.terminaEn)throw fail(400,'El periodo debe terminar después de su fecha de inicio.');
}
async function authorizedRecords(collection,user,selectedStudentId=null){
  const records=await storage.read(collection);
  if(user.rol==='direccion')return collection==='usuarios'?records.map(({passwordHash,...safe})=>safe):records;
  if(collection==='avisos_escolares')return records.filter(x=>x.publicado===true);
  if(user.rol==='alumno'){
    if(collection==='boletas')return records.filter(x=>x.alumnoId===user.personaId&&x.publicada===true);
    if(collection==='calificaciones'){const ids=new Set((await storage.read('boletas')).filter(x=>x.alumnoId===user.personaId&&x.publicada).flatMap(x=>x.referenciasCalificacionIds??[]));return records.filter(x=>x.alumnoId===user.personaId&&ids.has(x.id));}
    if(collection==='horarios'){
      const ins=(await storage.read('inscripciones')).filter(x=>x.alumnoId===user.personaId&&x.estado==='activa');const groups=new Set(ins.map(x=>x.grupoId));return records.filter(x=>x.activo!==false&&groups.has(x.grupoId));
    }
    return records.filter(x=>x.alumnoId===user.personaId);
  }
  if(user.rol==='tutor'){
    const links=(await storage.read('relaciones_tutores')).filter(x=>x.tutorId===user.personaId&&x.activa);
    const ids=new Set(links.map(x=>x.alumnoId));if(selectedStudentId&&ids.has(selectedStudentId)){ids.clear();ids.add(selectedStudentId);}
    if(collection==='boletas')return records.filter(x=>ids.has(x.alumnoId)&&x.publicada===true);
    if(collection==='calificaciones'){const published=new Set((await storage.read('boletas')).filter(x=>ids.has(x.alumnoId)&&x.publicada).flatMap(x=>x.referenciasCalificacionIds??[]));return records.filter(x=>ids.has(x.alumnoId)&&published.has(x.id));}
    if(['asistencias','faltas','retardos','mensajes','justificaciones'].includes(collection))return records.filter(x=>ids.has(x.alumnoId)&&(!x.tutorId||x.tutorId===user.personaId));
    if(collection==='horarios'){
      const ins=(await storage.read('inscripciones')).filter(x=>ids.has(x.alumnoId)&&x.estado==='activa');const groups=new Set(ins.map(x=>x.grupoId));return records.filter(x=>x.activo!==false&&groups.has(x.grupoId));
    }
    return [];
  }
  if(user.rol==='maestro'){
    if(['horarios','listas_asistencia','faltas','retardos','calificaciones'].includes(collection))return records.filter(x=>x.activo!==false&&x.maestroId===user.personaId);
    return [];
  }
  return [];
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 32_000) throw Object.assign(new Error('Solicitud demasiado grande'), { status: 413 }); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
async function currentUser(req) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const id = readSession(token, secret);
  if (!id) return null;
  return (await storage.read('usuarios')).find(u => u.id === id && u.activo) ?? null;
}
async function audit(user, accion, entidad) {
  await storage.update('auditoria', rows => [...rows, { id: randomUUID(), usuarioId: user.id, accion, entidad, creadoEn: new Date().toISOString() }]);
}
async function auditLogin(email, user, resultado) {
  const record = { id: randomUUID(), usuarioId: user?.id ?? null, accion: resultado === 'correcto' ? 'inicio_sesion_correcto' : 'inicio_sesion_fallido', entidad: 'autenticacion', email: email.slice(0, 254), resultado, creadoEn: new Date().toISOString() };
  await storage.update('auditoria', rows => [...rows, record].slice(-5000));
}
function timeAt(date,zone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return `${parts.find(x=>x.type==='hour').value}:${parts.find(x=>x.type==='minute').value}`;}
async function generateDailyMessages(date=todayAt()){
  const [links,students,faults,delays,justifications,notifications,accounts]=await Promise.all(['relaciones_tutores','alumnos','faltas','retardos','justificaciones','notificaciones','usuarios'].map(name=>storage.read(name)));
  const existing=new Set(notifications.map(x=>x.claveIdempotencia));const newNotifications=[],newMessages=[];
  for(const link of links.filter(x=>x.activa)){
    const student=students.find(x=>x.id===link.alumnoId);if(!student)continue;
    const absent=faults.filter(x=>x.alumnoId===student.id&&x.fecha===date&&x.estado==='confirmada');const late=delays.filter(x=>x.alumnoId===student.id&&x.fecha===date&&x.estado!=='anulado');if(!absent.length&&!late.length)continue;
    const key=`resumen:${date}:${link.tutorId}:${student.id}`;if(existing.has(key))continue;
    const tutorUser=accounts.find(x=>x.rol==='tutor'&&x.personaId===link.tutorId&&x.activo);if(!tutorUser)continue;
    const subject=[student.nombres,student.apellidos].filter(Boolean).join(' ');const subjects=absent.map(x=>x.materiaNombre??x.materiaSnapshot??x.materiaId).filter(Boolean);const just=justifications.filter(x=>x.alumnoId===student.id&&absent.some(f=>f.id===x.registroId));
    const text=`Resumen de ${date}: ${subject}. Faltó a ${absent.length} clase(s)${subjects.length?`: ${subjects.join(', ')}`:''}. Retardos registrados: ${late.length}. Justificaciones: ${just.length?just.map(x=>x.estado).join(', '):'sin solicitudes registradas'}.`;
    const notification={id:randomUUID(),claveIdempotencia:key,tutorId:link.tutorId,alumnoId:student.id,estado:'generada',creadaEn:new Date().toISOString()};
    newNotifications.push(notification);newMessages.push({id:randomUUID(),notificacionId:notification.id,destinatarioUsuarioId:tutorUser.id,tutorId:link.tutorId,alumnoId:student.id,asunto:`Resumen escolar · ${subject}`,contenido:text,creadoEn:new Date().toISOString(),leidoEn:null});existing.add(key);
  }
  if(newNotifications.length)await storage.transact([{collection:'notificaciones',upsert:newNotifications},{collection:'mensajes',upsert:newMessages}]);
  return newNotifications.length;
}
let schedulerBusy=false;
async function runScheduledJobs(){if(schedulerBusy)return;schedulerBusy=true;try{
  const settings=(await storage.read('configuracion'))[0]??{},zone=settings.zonaHoraria??'America/Guatemala',today=todayAt(zone),summaryAt=settings.horaResumenDiario??'17:00';
  const prior=new Date(`${today}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()-1);await generateDailyMessages(prior.toISOString().slice(0,10));
  if(timeAt(new Date(),zone)>=summaryAt)await generateDailyMessages(today);
  if(timeAt(new Date(),zone)==='02:00'){
    const dirs=await readdir(backupDir,{withFileTypes:true}).catch(()=>[]);const date=new Date().toISOString().slice(0,10);
    if(!dirs.some(x=>x.isDirectory()&&x.name.startsWith(date))){await storage.backup(backupDir);await storage.pruneBackups(backupDir,Number(settings.retencionBackups??30));}
  }
}catch(error){console.error('Tarea programada falló:',error.message);}finally{schedulerBusy=false;}}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { estado: 'disponible' });
    if (req.method === 'POST' && url.pathname === '/api/auth/solicitudes') {
      const ip=req.socket.remoteAddress??'local',now=Date.now(),attempts=signupFailures.get(ip);if(attempts&&attempts.until>now&&attempts.count>=5)return json(res,429,{error:'Se alcanzó el límite de solicitudes. Intenta de nuevo más tarde.'});if(!attempts||attempts.until<=now)signupFailures.set(ip,{count:0,until:now+15*60_000});
      const input=await body(req),nombre=typeof input.nombre==='string'?input.nombre.trim():'',email=typeof input.email==='string'?input.email.trim().toLowerCase():'',password=input.password,rolSolicitado=input.rol;
      if(nombre.length<2||nombre.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>200||!['alumno','maestro','tutor'].includes(rolSolicitado))return json(res,400,{error:'Completa nombre, correo, tipo de cuenta y una contraseña de 12 caracteres o más.'});
      const attemptState=signupFailures.get(ip);signupFailures.set(ip,{...attemptState,count:attemptState.count+1});
      const request={id:randomUUID(),nombre,email,rolSolicitado,passwordHash:await hashPassword(password),estado:'pendiente',creadoEn:new Date().toISOString()};
      await storage.update('solicitudes_cuenta',async rows=>{const accounts=await storage.read('usuarios');if(accounts.some(x=>x.email===email)||rows.some(x=>x.email===email&&x.estado==='pendiente'))throw fail(409,'Ya existe una cuenta o solicitud pendiente con ese correo.');return[...rows,request];});
      return json(res,202,{mensaje:'Solicitud recibida. Dirección debe aprobar y vincular tu expediente antes de que puedas iniciar sesión.'});
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const ip=req.socket.remoteAddress??'local',now=Date.now(),entry=loginFailures.get(ip);if(entry&&entry.until>now&&entry.count>=10)return json(res,429,{error:'Demasiados intentos. Espera 15 minutos y vuelve a intentarlo.'});if(entry&&entry.until<=now)loginFailures.delete(ip);
      const input = await body(req);
      if (typeof input.email !== 'string' || typeof input.password !== 'string') return json(res, 400, { error: 'Correo y contraseña son obligatorios.' });
      const email = input.email.trim().toLowerCase();
      const user = (await storage.read('usuarios')).find(u => u.email === email && u.activo);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {const state=loginFailures.get(ip);loginFailures.set(ip,{count:state&&state.until>now?state.count+1:1,until:state&&state.until>now?state.until:now+15*60_000});await auditLogin(email,null,'fallido');return json(res, 401, { error: 'Credenciales incorrectas.' });}
      loginFailures.delete(ip);
      await auditLogin(email,user,'correcto');
      return json(res, 200, { token: createSession(user.id, secret), usuario: { id: user.id, nombre: user.nombre, rol: user.rol } });
    }
    const user = await currentUser(req);
    if (req.method.startsWith('GET') && url.pathname === '/api/auth/me') {
      if (!user) return json(res, 401, { error: 'Inicia sesión.' });
      return json(res, 200, { id: user.id, nombre: user.nombre, rol: user.rol });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!user) return json(res, 401, { error: 'Inicia sesión.' });
      if(req.method==='GET'&&url.pathname==='/api/solicitudes_cuenta'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede revisar solicitudes.'});
        const requests=(await storage.read('solicitudes_cuenta')).map(({passwordHash,...safe})=>safe);return json(res,200,requests);
      }
      const accountRequestMatch=url.pathname.match(/^\/api\/solicitudes_cuenta\/([^/]+)\/resolver$/);
      if(req.method==='POST'&&accountRequestMatch){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede resolver solicitudes.'});
        const input=await body(req);if(!['aprobar','rechazar'].includes(input.decision))return json(res,400,{error:'Selecciona aprobar o rechazar.'});
        let approvedUser=null,resolvedRequest=null;
        await storage.transact(async read=>{
          const requests=await read('solicitudes_cuenta'),request=requests.find(x=>x.id===accountRequestMatch[1]);if(!request||request.estado!=='pendiente')throw fail(409,'La solicitud no existe o ya fue atendida.');
          const {passwordHash,...requestInfo}=request;
          if(input.decision==='rechazar'){resolvedRequest={...requestInfo,estado:'rechazada',resueltaPor:user.id,resueltaEn:new Date().toISOString()};return[{collection:'solicitudes_cuenta',upsert:[resolvedRequest]}];}
          const personCollection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[request.rolSolicitado],personaId=typeof input.personaId==='string'?input.personaId.trim():'';if(!personaId||!(await read(personCollection)).some(x=>x.id===personaId&&x.activo!==false))throw fail(400,'Dirección debe vincular la solicitud con un expediente activo existente.');
          const accounts=await read('usuarios');if(accounts.some(x=>x.email===request.email))throw fail(409,'Ya existe una cuenta con ese correo.');if(accounts.some(x=>x.rol===request.rolSolicitado&&x.personaId===personaId&&x.activo))throw fail(409,'Ese expediente ya tiene una cuenta activa.');
          approvedUser={id:randomUUID(),email:request.email,nombre:request.nombre,rol:request.rolSolicitado,personaId,activo:true,passwordHash,creadoEn:new Date().toISOString(),aprobadoPor:user.id};
          resolvedRequest={...requestInfo,estado:'aprobada',usuarioId:approvedUser.id,resueltaPor:user.id,resueltaEn:new Date().toISOString()};
          return[{collection:'usuarios',upsert:[approvedUser]},{collection:'solicitudes_cuenta',upsert:[resolvedRequest]}];
        });
        await audit(user,`solicitud_cuenta_${input.decision}`,accountRequestMatch[1]);
        if(approvedUser){const{passwordHash,...safe}=approvedUser;return json(res,200,{solicitud:resolvedRequest,usuario:safe});}
        return json(res,200,resolvedRequest);
      }
      if (url.pathname === '/api/dashboard' && req.method === 'GET') {
        if (user.rol === 'direccion') {
          const [alumnos, maestros, grupos, asistencias, faltas, retardos, listas, notificaciones, calificaciones, jornadas,periodos] = await Promise.all(['alumnos','maestros','grupos','asistencias','faltas','retardos','listas_asistencia','notificaciones','calificaciones','jornadas','periodos_evaluacion'].map(n => storage.read(n)));
          return json(res, 200, { alumnos: alumnos.filter(x=>x.activo!==false).length, maestros: maestros.filter(x=>x.activo!==false).length, grupos: grupos.filter(x=>x.activo!==false).length, asistencias: asistencias.filter(x=>x.fecha===todayAt()).length, faltas: faltas.filter(x=>x.fecha===todayAt()).length, retardos: retardos.filter(x=>x.fecha===todayAt()).length, listasPendientes: listas.filter(x => x.estado === 'abierta').length, notificacionesPendientes: notificaciones.filter(x => x.estado === 'pendiente').length, calificaciones: calificaciones.length, jornadas:jornadas.filter(x=>x.fecha===todayAt()&&x.estado==='habilitada').length,periodosActivos:periodos.filter(x=>x.estado!=='cerrado').length });
        }
        return json(res, 200, { rol: user.rol, nombre: user.nombre });
      }
      if(req.method==='GET'&&url.pathname==='/api/backups'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede consultar las copias.'});
        const dirs=await readdir(backupDir,{withFileTypes:true}).catch(()=>[]);return json(res,200,dirs.filter(x=>x.isDirectory()&&!x.name.startsWith('.tmp-')).map(x=>({id:x.name})).sort((a,b)=>b.id.localeCompare(a.id)));
      }
      if(req.method==='PUT'&&url.pathname==='/api/configuracion'&&user.rol==='direccion'){
        const input=await body(req),timeZone=input.zonaHoraria??'America/Guatemala';try{new Intl.DateTimeFormat('es',{timeZone}).format(new Date())}catch{return json(res,400,{error:'La zona horaria no es válida.'});}
        const summary=input.horaResumenDiario??'17:00',retention=Number(input.retencionBackups??30),scaleMin=Number(input.escalaMin??0),scaleMax=Number(input.escalaMax??100);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(summary)||!Number.isInteger(retention)||retention<1||retention>365||!Number.isFinite(scaleMin)||!Number.isFinite(scaleMax)||scaleMin>=scaleMax)return json(res,400,{error:'Hora, retención (1 a 365 días) o escala de calificaciones inválida.'});
        const setting={id:'configuracion-institucional',zonaHoraria:timeZone,horaResumenDiario:summary,retencionBackups:retention,escalaMin:scaleMin,escalaMax:scaleMax,actualizadoEn:new Date().toISOString(),actualizadoPor:user.id};await storage.update('configuracion',()=>[setting]);await audit(user,'actualizar_configuracion',setting.id);return json(res,200,setting);
      }
      if(req.method==='POST'&&url.pathname==='/api/backups'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede crear copias.'});const directory=await storage.backup(backupDir);await storage.pruneBackups(backupDir,30);await audit(user,'crear_respaldo',path.basename(directory));return json(res,201,{id:path.basename(directory)});
      }
      if(req.method==='POST'&&url.pathname==='/api/backups/restaurar'){
        if(user.rol!=='direccion')return json(res,403,{error:'Solo dirección puede restaurar copias.'});const input=await body(req);if(typeof input.id!=='string'||path.basename(input.id)!==input.id||input.id.startsWith('.'))return json(res,400,{error:'Copia seleccionada inválida.'});const source=path.join(backupDir,input.id);const safetyCopy=await storage.restoreBackup(source,backupDir);await audit(user,'restaurar_respaldo',input.id);return json(res,200,{restaurado:input.id,copiaAnterior:path.basename(safetyCopy)});
      }
      if(req.method==='GET'&&url.pathname==='/api/mis-alumnos'){
        if(!['alumno','tutor'].includes(user.rol))return json(res,403,{error:'Este portal no tiene expedientes vinculados.'});const students=await storage.read('alumnos');if(user.rol==='alumno')return json(res,200,students.filter(x=>x.id===user.personaId));const links=(await storage.read('relaciones_tutores')).filter(x=>x.tutorId===user.personaId&&x.activa);const ids=new Set(links.map(x=>x.alumnoId));return json(res,200,students.filter(x=>ids.has(x.id)));
      }
      if(req.method==='GET'&&url.pathname==='/api/perfil'){
        if(!['alumno','maestro','tutor'].includes(user.rol))return json(res,403,{error:'El administrador no tiene un perfil académico personal.'});const collection={alumno:'alumnos',maestro:'maestros',tutor:'tutores'}[user.rol],profile=(await storage.read(collection)).find(x=>x.id===user.personaId);return profile?json(res,200,profile):json(res,404,{error:'No existe una ficha asociada a esta cuenta.'});
      }
      const exportMatch=url.pathname.match(/^\/api\/exportar\/([a-z_]+)\.csv$/);
      if(req.method==='GET'&&exportMatch){
        const collection=exportMatch[1],exportable=['alumnos','maestros','tutores','grupos','materias','horarios','asistencias','listas_asistencia','faltas','retardos','justificaciones','calificaciones','boletas','mensajes','avisos_escolares'];if(!exportable.includes(collection))return json(res,403,{error:'Esta categoría no se puede exportar.'});
        let records=await authorizedRecords(collection,user,url.searchParams.get('alumnoId'));for(const key of ['grupoId','materiaId','fecha','estado']){const value=url.searchParams.get(key);if(value)records=records.filter(row=>String(row[key]??'')===value);}if(records.length>50_000)return json(res,413,{error:'Aplica filtros para exportar como máximo 50,000 registros.'});
        const keys=[...new Set(records.flatMap(row=>Object.keys(row)))].filter(key=>!['passwordHash','token','secret','tokenHash'].includes(key));const cell=value=>{let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};const csv='\uFEFF'+[keys.map(cell).join(','),...records.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
        await audit(user,'exportar',collection);res.writeHead(200,{...securityHeaders,'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${collection}.csv"`,'cache-control':'no-store'});return res.end(csv);
      }
      const editMatch=url.pathname.match(/^\/api\/([^/]+)\/([^/]+)$/);
      if(req.method==='PATCH'&&editMatch&&user.rol==='direccion'){
        const [,collection,id]=editMatch;if(collection!=='usuarios'&&!createCollections.includes(collection))return json(res,403,{error:'Esta categoría no admite edición desde esta ruta.'});const old=(await storage.read(collection)).find(x=>x.id===id);if(!old)return json(res,404,{error:'Registro no encontrado.'});const input=await body(req);
        const fields={usuarios:['nombre','email'],alumnos:['nombres','apellidos','matricula','fechaNacimiento','activo'],maestros:['nombres','apellidos','numeroEmpleado','correo','activo'],tutores:['nombres','apellidos','correo','telefono','activo'],relaciones_tutores:['tutorId','alumnoId','parentesco','activa'],grupos:['nombre','ciclo','semestreId','especialidadId','activo'],especialidades:['nombre','clave','activo'],semestres:['nombre','orden','activo'],materias:['nombre','clave','activo'],inscripciones:['alumnoId','grupoId','ciclo','estado'],avisos_escolares:['titulo','contenido','publicado','visibleDesde','visibleHasta'],horarios:['diaSemana','horaInicio','horaFin','materiaId','maestroId','grupoId','aula','desde','hasta','activo'],calendario_escolar:['fecha','tipo','descripcion','jornadas','activo'],periodos_evaluacion:['nombre','iniciaEn','terminaEn','estado','escalaMin','escalaMax']}[collection]??[];
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))return json(res,400,{error:'Los campos de actualización no son válidos.'});const candidate={...old,...input,actualizadoEn:new Date().toISOString()};if(collection==='usuarios'&&typeof candidate.email==='string')candidate.email=candidate.email.trim().toLowerCase();validateFields(collection,candidate);
        if(collection==='relaciones_tutores'&&(!(await storage.read('tutores')).some(x=>x.id===candidate.tutorId)||!(await storage.read('alumnos')).some(x=>x.id===candidate.alumnoId)))return json(res,400,{error:'El tutor y alumno deben existir.'});
        if(collection==='inscripciones'&&(!(await storage.read('alumnos')).some(x=>x.id===candidate.alumnoId)||!(await storage.read('grupos')).some(x=>x.id===candidate.grupoId)))return json(res,400,{error:'El alumno y grupo deben existir.'});
        if(collection==='grupos'&&candidate.semestreId&&!(await storage.read('semestres')).some(x=>x.id===candidate.semestreId))return json(res,400,{error:'El semestre indicado no existe.'});
        if(collection==='grupos'&&candidate.especialidadId&&!(await storage.read('especialidades')).some(x=>x.id===candidate.especialidadId))return json(res,400,{error:'La especialidad indicada no existe.'});
        if(collection==='usuarios'){if(typeof candidate.nombre!=='string'||!candidate.nombre.trim()||typeof candidate.email!=='string'||!candidate.email.includes('@'))return json(res,400,{error:'Nombre y correo válido son obligatorios.'});candidate.nombre=candidate.nombre.trim();}
        if(collection==='horarios'){
          for(const [name,ref] of [['maestros',candidate.maestroId],['grupos',candidate.grupoId],['materias',candidate.materiaId]])if(!(await storage.read(name)).some(x=>x.id===ref))return json(res,400,{error:`La referencia ${name} no existe.`});
          if((await storage.read('horarios')).some(x=>x.id!==id&&x.activo!==false&&Number(x.diaSemana)===Number(candidate.diaSemana)&&[x.maestroId===candidate.maestroId,x.grupoId===candidate.grupoId,Boolean(candidate.aula&&x.aula===candidate.aula)].some(Boolean)&&candidate.horaInicio<x.horaFin&&candidate.horaFin>x.horaInicio))return json(res,409,{error:'El horario se cruza con otra clase del mismo maestro, grupo o aula.'});candidate.diaSemana=Number(candidate.diaSemana);
        }
        if(['horarios','periodos_evaluacion'].includes(collection))await storage.backup(backupDir);
        const unique=({usuarios:['email'],alumnos:['matricula'],maestros:['numeroEmpleado'],especialidades:['clave'],materias:['clave']}[collection]??[]);const updated=await storage.update(collection,rows=>{if(unique.some(key=>candidate[key]&&rows.some(row=>row.id!==id&&String(row[key]).toLowerCase()===String(candidate[key]).toLowerCase())))throw fail(409,'Ya existe otro registro con ese identificador.');return rows.map(row=>row.id===id?candidate:row);});await audit(user,'editar',`${collection}:${id}`);const edited=updated.find(x=>x.id===id);if(edited.passwordHash){const{passwordHash,...safe}=edited;return json(res,200,safe)}return json(res,200,edited);
      }
      const passwordMatch=url.pathname.match(/^\/api\/usuarios\/([^/]+)\/password$/);
      if(req.method==='PATCH'&&passwordMatch&&user.rol==='direccion'){
        const input=await body(req);if(typeof input.password!=='string'||input.password.length<12)return json(res,400,{error:'La contraseña debe tener al menos 12 caracteres.'});const passwordHash=await hashPassword(input.password),rows=await storage.update('usuarios',items=>{const index=items.findIndex(x=>x.id===passwordMatch[1]);if(index<0)throw fail(404,'Cuenta no encontrada.');items[index]={...items[index],passwordHash,actualizadoEn:new Date().toISOString()};return items;});await audit(user,'restablecer_contraseña',passwordMatch[1]);const{passwordHash:_hash,...safe}=rows.find(x=>x.id===passwordMatch[1]);return json(res,200,safe);
      }
      const stateMatch=url.pathname.match(/^\/api\/([^/]+)\/([^/]+)\/estado$/);
      if(req.method==='PATCH'&&stateMatch&&user.rol==='direccion'){
        const [,collection,id]=stateMatch;if(!['usuarios',...createCollections].includes(collection))return json(res,403,{error:'Esta categoría no admite cambios de estado desde esta ruta.'});
        const updated=await storage.update(collection,rows=>{const index=rows.findIndex(x=>x.id===id);if(index<0)throw fail(404,'Registro no encontrado.');const item={...rows[index]};if(collection==='periodos_evaluacion')item.estado=item.estado==='cerrado'?'abierto':'cerrado';else{const field=collection==='usuarios'?'activo':collection==='relaciones_tutores'?'activa':collection==='avisos_escolares'?'publicado':'activo';item[field]=!(item[field]??true);}item.actualizadoEn=new Date().toISOString();rows[index]=item;return rows;});
        await audit(user,'cambiar_estado',`${collection}:${id}`);const item=updated.find(x=>x.id===id);if(item.passwordHash){const{passwordHash,...safe}=item;return json(res,200,safe)}return json(res,200,item);
      }
      const match = url.pathname.match(/^\/api\/([^/]+)$/);
      if (match && req.method === 'GET') {
        const collection = match[1];
        if (!COLLECTIONS.includes(collection)) return json(res, 404, { error: 'Colección no encontrada.' });
        if(collection==='operaciones')return json(res,403,{error:'Este archivo interno no es consultable por la API.'});
        const allowed = user.rol === 'direccion' || ['avisos_escolares','horarios','asistencias','faltas','retardos','listas_asistencia','calificaciones','boletas','mensajes','justificaciones'].includes(collection);
        if (!allowed) return json(res, 403, { error: 'Sin permiso para consultar esta información.' });
        const selectedStudentId=url.searchParams.get('alumnoId');let results=await authorizedRecords(collection,user,selectedStudentId);
        for(const key of ['grupoId','materiaId','especialidadId','semestreId','periodoId','estado','fecha']){const value=url.searchParams.get(key);if(value)results=results.filter(row=>String(row[key]??'')===value);}
        const query=url.searchParams.get('q')?.trim().toLocaleLowerCase('es');if(query)results=results.filter(row=>Object.entries(row).filter(([key])=>/nombre|matricula|titulo|materia|asunto/i.test(key)).some(([,value])=>String(value??'').toLocaleLowerCase('es').includes(query)));
        const total=results.length,limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')??50))),offset=Math.max(0,Number(url.searchParams.get('offset')??0));if(!Number.isFinite(limit)||!Number.isFinite(offset))return json(res,400,{error:'Paginación inválida.'});return json(res, 200, results.slice(offset,offset+limit),{'x-total-count':String(total),'x-limit':String(limit),'x-offset':String(offset)});
      }
      if (req.method==='POST'&&url.pathname==='/api/jornadas'&&user.rol==='direccion'){
        const input=await body(req);if(typeof input.fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))return json(res,400,{error:'Indica una fecha válida (AAAA-MM-DD).'});
        const calendar=await storage.read('calendario_escolar');const calendarDay=calendar.find(x=>x.fecha===input.fecha&&x.activo!==false);if(!calendarDay)return json(res,409,{error:'Primero define esta fecha como lectiva en el calendario escolar.'});if(!['lectivo','clases','jornada_especial'].includes(String(calendarDay.tipo).toLowerCase()))return json(res,409,{error:'El calendario marca esta fecha como día sin clases ordinarias.'});
        const created={id:randomUUID(),fecha:input.fecha,nombre:String(input.nombre??'Jornada ordinaria').trim(),estado:'habilitada',abreEn:input.abreEn??'06:00',cierraEn:input.cierraEn??'08:00',zonaHoraria:input.zonaHoraria??'America/Guatemala',creadoEn:new Date().toISOString(),creadoPor:user.id};
        await storage.update('jornadas',rows=>{if(rows.some(x=>x.fecha===created.fecha&&x.estado==='habilitada'))throw fail(409,'Ya existe una jornada habilitada para esta fecha.');return [...rows,created];});await audit(user,'habilitar_jornada',created.id);return json(res,201,created);
      }
      if(req.method==='POST'&&url.pathname==='/api/qr_diarios/renovar'&&user.rol==='direccion'){
        const input=await body(req);const jornada=(await storage.read('jornadas')).find(x=>x.id===input.jornadaId&&x.estado==='habilitada');if(!jornada)return json(res,404,{error:'No existe una jornada habilitada para ese QR.'});
        const versionId=randomUUID();let token,qr;
        await storage.transact(async read=>{
          const all=await read('qr_diarios'),now=Date.now(),occupied=new Set(all.filter(x=>x.activa&&Date.parse(x.expiraEn)>now&&x.jornadaId!==jornada.id).map(x=>x.tokenHash));
          for(let attempt=0;attempt<100;attempt++){const candidate=String(randomInt(0,100000)).padStart(5,'0');if(!occupied.has(hashQrToken(candidate))){token=candidate;break;}}
          if(!token)throw fail(503,'No se pudo generar un código libre. Inténtalo de nuevo.');
          const createdAt=new Date(now).toISOString(),expiresAt=now+10*60*1000;
          qr={id:randomUUID(),jornadaId:jornada.id,versionId,tokenHash:hashQrToken(token),activa:true,creadaEn:createdAt,expiraEn:new Date(expiresAt).toISOString(),creadaPor:user.id};
          const oldVersions=all.filter(x=>x.jornadaId===jornada.id&&x.activa).map(x=>({...x,activa:false,revocadaEn:createdAt}));
          return[{collection:'qr_diarios',upsert:[...oldVersions,qr]}];
        });
        await audit(user,'renovar_qr',jornada.id);return json(res,201,{jornadaId:jornada.id,versionId,token,expiraEn:qr.expiraEn});
      }
      if(req.method==='POST'&&url.pathname==='/api/asistencias/registrar'&&user.rol==='alumno'){
        const attemptKey=user.id,now=Date.now(),attempt=attendanceFailures.get(attemptKey);
        if(attempt&&attempt.until>now&&attempt.count>=10)return json(res,429,{error:'Se alcanzó el límite de intentos de código. Espera 15 minutos y vuelve a intentarlo.'});
        if(attempt&&attempt.until<=now)attendanceFailures.delete(attemptKey);
        const input=await body(req);if(typeof input.token!=='string'||!(/^[0-9]{5}$/.test(input.token)||/^[A-Za-z0-9_-]{22}$/.test(input.token)))return json(res,400,{error:'Escribe el código de 5 números o escanea el QR completo.'});
        const digest=hashQrToken(input.token),version=(await storage.read('qr_diarios')).find(x=>x.activa&&Date.parse(x.expiraEn)>Date.now()&&safeEqual(x.tokenHash,digest));
        if(!version){const state=attendanceFailures.get(attemptKey);attendanceFailures.set(attemptKey,{count:state&&state.until>now?state.count+1:1,until:state&&state.until>now?state.until:now+15*60_000});return json(res,410,{error:'El código venció o no es correcto. Revisa que tenga cinco cifras y genera uno nuevo si expiró.'});}
        attendanceFailures.delete(attemptKey);
        const jornada=(await storage.read('jornadas')).find(x=>x.id===version.jornadaId&&x.estado==='habilitada');if(!jornada)return json(res,409,{error:'La jornada no está habilitada.'});
        if(jornada.fecha!==todayAt(jornada.zonaHoraria))return json(res,410,{error:'El código QR venció o corresponde a otra fecha.'});
        const localTime=timeAt(new Date(),jornada.zonaHoraria);if(localTime<jornada.abreEn||localTime>jornada.cierraEn)return json(res,409,{error:`El código QR sí es válido, pero el registro está cerrado. La jornada permite entradas de ${jornada.abreEn} a ${jornada.cierraEn} (${jornada.zonaHoraria}); ahora son las ${localTime}. Dirección debe habilitar una jornada con el horario correcto.`});
        const student=(await storage.read('alumnos')).find(x=>x.id===user.personaId&&x.activo!==false);if(!student)return json(res,403,{error:'La cuenta no está vinculada con un alumno activo.'});
        const attendance={id:randomUUID(),alumnoId:student.id,nombreSnapshot:[student.nombres,student.apellidos].filter(Boolean).join(' '),fecha:jornada.fecha,jornadaId:jornada.id,horaServidor:new Date().toISOString(),metodo:'qr',estado:'validada',versionQrId:version.versionId};
        await storage.update('asistencias',rows=>{if(rows.some(x=>x.alumnoId===student.id&&x.jornadaId===jornada.id))throw fail(409,'Ya registraste tu entrada para esta jornada.');return [...rows,attendance];});await audit(user,'registrar_entrada',attendance.id);return json(res,201,{mensaje:'Entrada registrada correctamente.',asistencia:attendance});
      }
      if(req.method==='POST'&&url.pathname==='/api/listas_asistencia'&&user.rol==='maestro'){
        const input=await body(req),schedule=(await storage.read('horarios')).find(x=>x.id===input.horarioId&&x.activo!==false&&x.maestroId===user.personaId);if(!schedule)return json(res,403,{error:'La clase no pertenece a tu horario.'});
        const date=input.fecha??todayAt();if(date!==todayAt())return json(res,400,{error:'Solo se puede abrir una lista para la fecha escolar actual.'});const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();if(Number(schedule.diaSemana)!==weekday)return json(res,409,{error:'Esta clase no aparece en el horario para hoy.'});
        const calendarDay=(await storage.read('calendario_escolar')).find(x=>x.fecha===date&&x.activo!==false);if(!calendarDay||!['lectivo','clases','jornada_especial'].includes(String(calendarDay.tipo).toLowerCase()))return json(res,409,{error:'El calendario no marca hoy como día lectivo.'});
        const existing=await storage.read('listas_asistencia');if(existing.some(x=>x.horarioId===schedule.id&&x.fecha===date))return json(res,409,{error:'Ya existe una lista para esta clase y fecha.'});
        const enrollment=await storage.read('inscripciones'),students=await storage.read('alumnos'),members=enrollment.filter(x=>x.grupoId===schedule.grupoId&&x.estado==='activa').map(x=>students.find(s=>s.id===x.alumnoId)).filter(Boolean);
        const list={id:randomUUID(),horarioId:schedule.id,sesionId:schedule.sesionId??schedule.id,fecha:date,maestroId:user.personaId,grupoId:schedule.grupoId,materiaId:schedule.materiaId,estado:'abierta',alumnos:members.map(s=>({alumnoId:s.id,nombreSnapshot:[s.nombres,s.apellidos].filter(Boolean).join(' '),estado:'pendiente'})),creadaEn:new Date().toISOString()};
        await storage.update('listas_asistencia',rows=>{if(rows.some(x=>x.horarioId===schedule.id&&x.fecha===date))throw fail(409,'Ya existe una lista para esta clase y fecha.');return[...rows,list]});await audit(user,'abrir_lista',list.id);return json(res,201,list);
      }
      const closeMatch=url.pathname.match(/^\/api\/listas_asistencia\/([^/]+)\/cerrar$/);
      if(req.method==='POST'&&closeMatch){
        const list=(await storage.read('listas_asistencia')).find(x=>x.id===closeMatch[1]);if(!list||list.estado!=='abierta')return json(res,404,{error:'No existe una lista abierta.'});if(user.rol!=='direccion'&&!(user.rol==='maestro'&&user.personaId===list.maestroId))return json(res,403,{error:'No tienes permiso para cerrar esta lista.'});
        const schedule=(await storage.read('horarios')).find(x=>x.id===list.horarioId);if(schedule&&list.fecha===todayAt()&&schedule.horaFin&&timeAt(new Date(),schedule.zonaHoraria??'America/Guatemala')<schedule.horaFin)return json(res,409,{error:'La clase todavía no termina; la lista no puede cerrarse.'});
        const input=await body(req),states=new Map((input.alumnos??[]).map(x=>[x.alumnoId,x.estado]));const allowedStates=new Set(['presente','retardo','ausente']);if(list.alumnos.some(x=>!allowedStates.has(states.get(x.alumnoId))))return json(res,400,{error:'Confirma el estado de cada alumno antes de cerrar la lista.'});
        const closed={...list,estado:'cerrada',alumnos:list.alumnos.map(x=>({...x,estado:states.get(x.alumnoId)})),cerradaEn:new Date().toISOString(),cerradaPor:user.id};const snapshots=[];
        for(const student of closed.alumnos){if(student.estado==='ausente')snapshots.push({collection:'faltas',record:{id:`falta_${list.id}_${student.alumnoId}`,alumnoId:student.alumnoId,nombreSnapshot:student.nombreSnapshot,fecha:list.fecha,grupoId:list.grupoId,materiaId:list.materiaId,sesionId:list.sesionId,maestroId:list.maestroId,estado:'confirmada',listaId:list.id,creadoEn:new Date().toISOString()}});if(student.estado==='retardo')snapshots.push({collection:'retardos',record:{id:`retardo_${list.id}_${student.alumnoId}`,alumnoId:student.alumnoId,nombreSnapshot:student.nombreSnapshot,fecha:list.fecha,grupoId:list.grupoId,materiaId:list.materiaId,sesionId:list.sesionId,maestroId:list.maestroId,estado:'registrado',listaId:list.id,creadoEn:new Date().toISOString()}});}
        await storage.backup(backupDir);const patches=[{collection:'listas_asistencia',upsert:[closed]},...['faltas','retardos'].map(collection=>({collection,upsert:snapshots.filter(x=>x.collection===collection).map(x=>x.record)}))];await storage.transact(async read=>{const latest=(await read('listas_asistencia')).find(x=>x.id===list.id);if(!latest||latest.estado!=='abierta')throw fail(409,'La lista ya se cerró en otra solicitud.');return patches});await audit(user,'cerrar_lista',list.id);return json(res,200,closed);
      }
      if(req.method==='POST'&&url.pathname==='/api/calificaciones'&&user.rol==='maestro'){
        const input=await body(req),student=(await storage.read('alumnos')).find(x=>x.id===input.alumnoId),period=(await storage.read('periodos_evaluacion')).find(x=>x.id===input.periodoId&&x.estado!=='cerrado');if(!student||!period)return json(res,400,{error:'Alumno o periodo de evaluación inválido.'});
        const groupId=input.grupoId??(await storage.read('inscripciones')).find(x=>x.alumnoId===student.id&&x.estado==='activa')?.grupoId;
        if(!(await storage.read('horarios')).some(x=>x.activo!==false&&x.maestroId===user.personaId&&x.grupoId===groupId&&x.materiaId===input.materiaId))return json(res,403,{error:'No tienes asignada esta materia y grupo.'});
        const settings=(await storage.read('configuracion'))[0]??{},value=Number(input.valor),min=Number(period.escalaMin??settings.escalaMin??0),max=Number(period.escalaMax??settings.escalaMax??100);if(!Number.isFinite(value)||value<min||value>max)return json(res,400,{error:`La calificación debe estar entre ${min} y ${max}.`});
        if((await storage.read('boletas')).some(x=>x.alumnoId===student.id&&x.periodoId===period.id&&x.publicada))return json(res,409,{error:'La boleta ya fue publicada. Dirección debe retirarla antes de una corrección.'});
        const now=new Date().toISOString();let savedGrade;
        await storage.transact(async read=>{const rows=await read('calificaciones'),boletas=await read('boletas');if(boletas.some(x=>x.alumnoId===student.id&&x.periodoId===period.id&&x.publicada))throw fail(409,'La boleta ya fue publicada. Dirección debe retirarla antes de una corrección.');const old=rows.find(x=>x.alumnoId===student.id&&x.materiaId===String(input.materiaId)&&x.periodoId===period.id);savedGrade={id:old?.id??randomUUID(),alumnoId:student.id,materiaId:String(input.materiaId),maestroId:user.personaId,grupoId:groupId,periodoId:period.id,valor:value,estado:'borrador',modificadoPor:user.id,modificadoEn:now,creadoEn:old?.creadoEn??now};return[{collection:'calificaciones',upsert:[savedGrade]}];});await audit(user,'capturar_calificacion',savedGrade.id);return json(res,201,savedGrade);
      }
      if(req.method==='POST'&&url.pathname==='/api/boletas/publicar'&&user.rol==='direccion'){
        const input=await body(req),studentId=input.alumnoId,periodId=input.periodoId;if(!(await storage.read('alumnos')).some(x=>x.id===studentId)||!(await storage.read('periodos_evaluacion')).some(x=>x.id===periodId))return json(res,400,{error:'Alumno o periodo inválido.'});
        await storage.backup(backupDir);const published=await storage.transact(async read=>{const grades=(await read('calificaciones')).filter(x=>x.alumnoId===studentId&&x.periodoId===periodId);if(!grades.length)throw fail(409,'No hay calificaciones para publicar.');const all=await read('boletas'),old=all.find(x=>x.alumnoId===studentId&&x.periodoId===periodId);const boleta={id:old?.id??randomUUID(),alumnoId:studentId,periodoId:periodId,publicada:true,publicadaEn:new Date().toISOString(),publicadaPor:user.id,referenciasCalificacionIds:grades.map(x=>x.id)};return[{collection:'boletas',upsert:[boleta]}];});await audit(user,'publicar_boleta',studentId);const boleta=(await storage.read('boletas')).find(x=>x.alumnoId===studentId&&x.periodoId===periodId);return json(res,200,boleta);
      }
      if(req.method==='POST'&&url.pathname==='/api/justificaciones'&&user.rol==='tutor'){
        const input=await body(req),link=(await storage.read('relaciones_tutores')).find(x=>x.tutorId===user.personaId&&x.alumnoId===input.alumnoId&&x.activa);if(!link)return json(res,403,{error:'El alumno no está vinculado a tu cuenta.'});const faults=await storage.read('faltas'),delays=await storage.read('retardos'),record=faults.find(x=>x.id===input.registroId)||delays.find(x=>x.id===input.registroId);if(!record||record.alumnoId!==input.alumnoId)return json(res,404,{error:'No se encontró una falta o retardo de ese alumno.'});if(typeof input.motivo!=='string'||input.motivo.trim().length<5)return json(res,400,{error:'Describe el motivo de la solicitud.'});
        const request={id:randomUUID(),alumnoId:input.alumnoId,tutorId:user.personaId,registroId:record.id,tipo:faults.some(x=>x.id===record.id)?'falta':'retardo',motivo:input.motivo.trim(),estado:'pendiente',solicitadoEn:new Date().toISOString()};await storage.update('justificaciones',rows=>{if(rows.some(x=>x.registroId===record.id&&x.estado==='pendiente'))throw fail(409,'Ya existe una solicitud pendiente para este registro.');return[...rows,request]});await audit(user,'solicitar_justificacion',request.id);return json(res,201,request);
      }
      const resolveMatch=url.pathname.match(/^\/api\/justificaciones\/([^/]+)\/resolver$/);
      if(req.method==='POST'&&resolveMatch&&user.rol==='direccion'){
        const input=await body(req),decision=input.decision;if(!['autorizar','rechazar'].includes(decision))return json(res,400,{error:'La decisión debe ser autorizar o rechazar.'});let resolved;
        await storage.transact(async read=>{const all=await read('justificaciones'),current=all.find(x=>x.id===resolveMatch[1]);if(!current||current.estado!=='pendiente')throw fail(409,'La solicitud no existe o ya fue resuelta.');resolved={...current,estado:decision==='autorizar'?'autorizada':'rechazada',resueltaPor:user.id,resueltaEn:new Date().toISOString()};const patches=[{collection:'justificaciones',upsert:[resolved]}];if(decision==='autorizar'){const collection=current.tipo==='falta'?'faltas':'retardos',items=await read(collection),item=items.find(x=>x.id===current.registroId);if(item)patches.push({collection,upsert:[{...item,estado:'justificada',justificacionId:current.id,actualizadoEn:new Date().toISOString()}]});}return patches;});await audit(user,`resolver_justificacion_${decision}`,resolved.id);return json(res,200,resolved);
      }
      const withdrawMatch=url.pathname.match(/^\/api\/boletas\/([^/]+)\/retirar$/);
      if(req.method==='POST'&&withdrawMatch&&user.rol==='direccion'){
        const list=await storage.read('boletas'),current=list.find(x=>x.id===withdrawMatch[1]&&x.publicada);if(!current)return json(res,404,{error:'No existe una boleta publicada con ese ID.'});const updated={...current,publicada:false,retiradaEn:new Date().toISOString(),retiradaPor:user.id};await storage.update('boletas',rows=>rows.map(x=>x.id===current.id?updated:x));await audit(user,'retirar_boleta',current.id);return json(res,200,updated);
      }
      const closeDay=url.pathname.match(/^\/api\/jornadas\/([^/]+)\/cerrar$/);
      if(req.method==='POST'&&closeDay&&user.rol==='direccion'){
        const current=(await storage.read('jornadas')).find(x=>x.id===closeDay[1]);if(!current)return json(res,404,{error:'Jornada no encontrada.'});const closed={...current,estado:'cerrada',cerradaEn:new Date().toISOString(),cerradaPor:user.id};
        const revoked=(await storage.read('qr_diarios')).filter(x=>x.jornadaId===current.id&&x.activa).map(x=>({...x,activa:false,revocadaEn:new Date().toISOString()}));await storage.transact([{collection:'jornadas',upsert:[closed]},{collection:'qr_diarios',upsert:revoked}]);await audit(user,'cerrar_jornada',current.id);return json(res,200,closed);
      }
      if (match && req.method === 'POST' && match[1] === 'usuarios' && user.rol === 'direccion') {
        const input = await body(req);
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!email.includes('@') || typeof input.nombre !== 'string' || !input.nombre.trim() || !roles.includes(input.rol) || typeof input.password !== 'string' || input.password.length < 12) return json(res, 400, { error: 'Indica nombre, correo válido, rol y contraseña de al menos 12 caracteres.' });
        const personaId = input.personaId;
        if (input.rol !== 'direccion') {
          const personCollection = { alumno: 'alumnos', maestro: 'maestros', tutor: 'tutores' }[input.rol];
          if (typeof personaId !== 'string' || !(await storage.read(personCollection)).some(person => person.id === personaId)) return json(res, 400, { error: 'La persona asociada al rol no existe.' });
        }
        await storage.backup(backupDir);const passwordHash = await hashPassword(input.password);
        const created = { id: randomUUID(), email, nombre: input.nombre.trim(), rol: input.rol, activo: true, ...(personaId ? { personaId } : {}), passwordHash, creadoEn: new Date().toISOString() };
        await storage.update('usuarios', rows => {
          if (rows.some(item => item.email.toLowerCase() === email)) throw Object.assign(new Error('Ya existe una cuenta con ese correo.'), { status: 409 });
          return [...rows, created];
        });
        await audit(user, 'crear_usuario', created.id);
        const { passwordHash: _secret, ...safe } = created;
        return json(res, 201, safe);
      }
      if (match && req.method === 'POST' && user.rol === 'direccion' && createCollections.includes(match[1])) {
        const collection = match[1];
        const record = await body(req);
        if (!record || typeof record !== 'object' || Array.isArray(record)) return json(res, 400, { error: 'Registro inválido.' });
        validateFields(collection,record);
        if(collection==='grupos'){
          if(record.semestreId&&!(await storage.read('semestres')).some(x=>x.id===record.semestreId))return json(res,400,{error:'El semestre indicado no existe.'});
          if(record.especialidadId&&!(await storage.read('especialidades')).some(x=>x.id===record.especialidadId))return json(res,400,{error:'La especialidad indicada no existe.'});
        }
        if(collection==='relaciones_tutores'){
          if(!(await storage.read('tutores')).some(x=>x.id===record.tutorId)||!(await storage.read('alumnos')).some(x=>x.id===record.alumnoId))return json(res,400,{error:'El tutor y el alumno deben existir.'});
        }
        if(collection==='inscripciones'){
          if(!(await storage.read('alumnos')).some(x=>x.id===record.alumnoId)||!(await storage.read('grupos')).some(x=>x.id===record.grupoId))return json(res,400,{error:'El alumno y grupo deben existir.'});
        }
        if(collection==='horarios'){
          for(const [name,id] of [['maestros',record.maestroId],['grupos',record.grupoId],['materias',record.materiaId]])if(!(await storage.read(name)).some(x=>x.id===id))return json(res,400,{error:`La referencia ${name} no existe.`});
          const conflict=(await storage.read('horarios')).find(x=>x.activo!==false&&Number(x.diaSemana)===Number(record.diaSemana)&&[x.maestroId===record.maestroId,x.grupoId===record.grupoId,Boolean(record.aula&&x.aula===record.aula)].some(Boolean)&&record.horaInicio<x.horaFin&&record.horaFin>x.horaInicio);
          if(conflict)return json(res,409,{error:'El horario se cruza con otra clase del mismo maestro, grupo o aula.'});
          record.diaSemana=Number(record.diaSemana);
        }
        if(['horarios','periodos_evaluacion'].includes(collection))await storage.backup(backupDir);
        const saved = { ...record, id: randomUUID(), creadoEn: new Date().toISOString(), actualizadoEn:new Date().toISOString() };
        await storage.update(collection, rows => {
          const unique=({alumnos:['matricula'],maestros:['numeroEmpleado'],especialidades:['clave'],materias:['clave']}[collection]??[]);
          if(unique.some(field=>saved[field]&&rows.some(row=>String(row[field]).toLowerCase()===String(saved[field]).toLowerCase())))throw fail(409,`Ya existe un registro con el mismo ${unique[0]}.`);
          if(collection==='relaciones_tutores'&&rows.some(x=>x.tutorId===saved.tutorId&&x.alumnoId===saved.alumnoId))throw fail(409,'El tutor ya está vinculado a ese alumno.');
          if(collection==='inscripciones'&&saved.estado==='activa'&&rows.some(x=>x.alumnoId===saved.alumnoId&&x.estado==='activa'))throw fail(409,'El alumno ya tiene una inscripción activa.');
          return [...rows, saved];
        });
        await audit(user, 'crear', collection);
        return json(res, 201, saved);
      }
      return json(res, 404, { error: 'Ruta no encontrada.' });
    }
    const candidate = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!candidate.startsWith(root + path.sep) && candidate !== path.join(root, 'index.html')) return json(res, 403, { error: 'Ruta no permitida.' });
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile()) return json(res, 404, { error: 'No encontrado.' });
    const ext = path.extname(candidate).toLowerCase();
    const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
    res.writeHead(200, { ...securityHeaders,'content-type': contentTypes[ext] ?? 'application/octet-stream','cache-control': candidate.endsWith(`${path.sep}sw.js`) ? 'no-cache' : 'public, max-age=300' });
    res.end(await readFile(candidate));
  } catch (error) { if(!error.status)console.error('Error de solicitud:',error.stack??error.message);json(res, error.status ?? 500, { error: error.status ? error.message : 'Error interno del servidor.' }); }
});
server.listen(port, env.HOST ?? '127.0.0.1', () => console.log(`Plataforma escolar disponible en http://${env.HOST ?? '127.0.0.1'}:${port}`));
setInterval(runScheduledJobs,30_000);
runScheduledJobs();
