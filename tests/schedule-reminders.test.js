import test from 'node:test';
import assert from 'node:assert/strict';
import { sendScheduleReminders } from '../backend/src/schedule-reminders.js';

function createStorage(seed) {
  const records = structuredClone(seed);
  return {
    records,
    async read(collection) {
      return structuredClone(records[collection] ?? []);
    },
    async transact(patchesOrFactory) {
      const patches = typeof patchesOrFactory === 'function'
        ? await patchesOrFactory(collection => this.read(collection))
        : patchesOrFactory;
      for (const patch of patches) {
        const current = records[patch.collection] ?? [];
        for (const item of patch.upsert) {
          const index = current.findIndex(existing => existing.id === item.id);
          if (index < 0) current.push(item);
          else current[index] = item;
        }
        records[patch.collection] = current;
      }
    }
  };
}

function reminderData() {
  return {
    horarios: [{ id: 'h-1', activo: true, diaSemana: 1, horaInicio: '08:00', horaFin: '09:00', maestroId: 'm-1', grupoId: 'g-1', materiaId: 'mat-1', desde: '2026-01-01', hasta: '2026-12-31' }],
    alumnos: [{ id: 'a-1', activo: true }, { id: 'a-2', activo: true }],
    inscripciones: [{ id: 'i-1', alumnoId: 'a-1', grupoId: 'g-1', estado: 'activa' }, { id: 'i-2', alumnoId: 'a-2', grupoId: 'g-1', estado: 'cancelada' }],
    usuarios: [{ id: 'u-m1', rol: 'maestro', personaId: 'm-1', activo: true }, { id: 'u-a1', rol: 'alumno', personaId: 'a-1', activo: true }, { id: 'u-a2', rol: 'alumno', personaId: 'a-2', activo: true }],
    materias: [{ id: 'mat-1', nombre: 'Ciencias' }],
    grupos: [{ id: 'g-1', nombre: '4A' }],
    calendario_escolar: [{ id: 'cal-1', fecha: '2026-03-16', tipo: 'lectivo', activo: true }],
    notificaciones: [],
    mensajes: []
  };
}

test('sends one reminder per teacher and actively enrolled student, then deduplicates', async () => {
  const storage = createStorage(reminderData());
  const pushedUsers = [];
  const options = {
    now: new Date('2026-03-16T13:55:00.000Z'),
    timeZone: 'America/Guatemala',
    env: {},
    push: async (_storage, userIds) => pushedUsers.push(...userIds)
  };

  assert.equal(await sendScheduleReminders(storage, options), 2);
  assert.deepEqual(pushedUsers.sort(), ['u-a1', 'u-m1']);
  assert.equal(storage.records.mensajes.length, 2);
  assert.equal(storage.records.notificaciones.length, 2);
  assert.ok(storage.records.mensajes.every(message => message.contenido.includes('comienza a las 08:00')));

  assert.equal(await sendScheduleReminders(storage, options), 0);
  assert.equal(pushedUsers.length, 2);
  assert.equal(storage.records.mensajes.length, 2);
});

test('does not send reminders on non-school days or outside the five-minute window', async () => {
  const storage = createStorage(reminderData());
  let pushes = 0;
  const options = {
    timeZone: 'America/Guatemala',
    env: {},
    push: async () => { pushes++; }
  };

  assert.equal(await sendScheduleReminders(storage, { ...options, now: new Date('2026-03-16T13:54:00.000Z') }), 0);
  storage.records.calendario_escolar[0].tipo = 'festivo';
  assert.equal(await sendScheduleReminders(storage, { ...options, now: new Date('2026-03-16T13:55:00.000Z') }), 0);
  assert.equal(pushes, 0);
});
