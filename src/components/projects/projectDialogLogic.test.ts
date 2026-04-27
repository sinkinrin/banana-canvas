import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROJECT_DIALOG_NAME,
  createProjectDialogCallbacks,
  getProjectNameSubmissionValue,
  shouldCloseDialogForKey,
} from './projectDialogLogic';

test('empty project name submissions preserve existing default-name behavior', () => {
  assert.equal(DEFAULT_PROJECT_DIALOG_NAME, '未命名项目');
  assert.equal(getProjectNameSubmissionValue('   '), '未命名项目');
  assert.equal(getProjectNameSubmissionValue(' 海报项目 '), ' 海报项目 ');
});

test('Escape closes dialogs and other keys do not', () => {
  assert.equal(shouldCloseDialogForKey('Escape'), true);
  assert.equal(shouldCloseDialogForKey('Enter'), false);
});

test('cancel closes the active dialog without repository calls', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => {
        calls.push('create');
        return { id: 'created' };
      },
      renameProject: async () => {
        calls.push('rename');
      },
      deleteProject: async () => {
        calls.push('delete');
      },
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => {
      calls.push('refresh');
    },
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  actions.cancel();

  assert.deepEqual(calls, ['close']);
});

test('create submission closes, calls repository, and navigates to the created project', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async (name) => {
        calls.push(`create:${name}`);
        return { id: 'created-project' };
      },
      renameProject: async () => {
        calls.push('rename');
      },
      deleteProject: async () => {
        calls.push('delete');
      },
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => {
      calls.push('refresh');
    },
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  await actions.confirmCreate('New Project');

  assert.deepEqual(calls, ['close', 'create:New Project', 'navigate:/projects/created-project']);
});

test('rename and delete submissions close, call repository actions, and refresh projects', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => ({ id: 'unused' }),
      renameProject: async (projectId, name) => {
        calls.push(`rename:${projectId}:${name}`);
      },
      deleteProject: async (projectId) => {
        calls.push(`delete:${projectId}`);
      },
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => {
      calls.push('refresh');
    },
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  await actions.confirmRename('project-1', 'Renamed');
  await actions.confirmDelete('project-1');

  assert.deepEqual(calls, [
    'close',
    'rename:project-1:Renamed',
    'refresh',
    'close',
    'delete:project-1',
    'refresh',
  ]);
});

test('Escape callback cancels through the same close path', () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => ({ id: 'unused' }),
      renameProject: async () => {
        calls.push('rename');
      },
      deleteProject: async () => {
        calls.push('delete');
      },
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => {
      calls.push('refresh');
    },
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  actions.handleKeyDown('Enter');
  actions.handleKeyDown('Escape');

  assert.deepEqual(calls, ['close']);
});

test('dialog callback helper routes repository failures to the page error handler', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => {
        throw new Error('create failed');
      },
      renameProject: async () => {
        calls.push('rename');
      },
      deleteProject: async () => {
        calls.push('delete');
      },
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => {
      calls.push('refresh');
    },
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
    onError: (error) => {
      calls.push(`error:${error instanceof Error ? error.message : String(error)}`);
    },
  });

  await actions.confirmCreate('Broken Project');

  assert.deepEqual(calls, ['close', 'error:create failed']);
});
