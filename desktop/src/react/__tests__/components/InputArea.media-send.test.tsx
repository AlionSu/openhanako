// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputArea } from '../../components/InputArea';
import { useStore } from '../../stores';

const mocks = vi.hoisted(() => ({
  clearContent: vi.fn(),
  hanaFetch: vi.fn(),
  wsSend: vi.fn(),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: () => ({
    commands: {
      focus: vi.fn(),
      clearContent: mocks.clearContent,
      scrollIntoView: vi.fn(),
      setContent: vi.fn(),
      insertContent: vi.fn(),
    },
    chain: () => ({
      clearContent: () => ({
        insertContent: () => ({
          insertContent: () => ({
            focus: () => ({ run: vi.fn() }),
          }),
        }),
      }),
    }),
    getText: () => '',
    getJSON: () => ({ type: 'doc', content: [] }),
    state: { tr: { setMeta: vi.fn(() => ({})) } },
    view: { dispatch: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
  }),
  EditorContent: () => React.createElement('div', { 'data-testid': 'editor' }),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('../../components/input/extensions/skill-badge', () => ({
  SkillBadge: {},
}));

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/use-config', () => ({
  fetchConfig: vi.fn(async () => ({})),
}));

vi.mock('../../hooks/use-hana-fetch', () => ({
  hanaFetch: (path: string, opts?: RequestInit) => mocks.hanaFetch(path, opts),
  hanaUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

vi.mock('../../stores/session-actions', () => ({
  ensureSession: vi.fn(async () => true),
  loadSessions: vi.fn(),
}));

vi.mock('../../stores/desk-actions', () => ({
  loadDeskFiles: vi.fn(),
  searchDeskFiles: vi.fn(async () => []),
  toggleJianSidebar: vi.fn(),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocket: vi.fn(() => ({ send: mocks.wsSend })),
}));

vi.mock('../../MainContent', () => ({
  attachFilesFromPaths: vi.fn(),
}));

vi.mock('../../components/input/SlashCommandMenu', () => ({
  SlashCommandMenu: () => null,
}));

vi.mock('../../components/input/FileMentionMenu', () => ({
  FileMentionMenu: () => null,
}));

vi.mock('../../components/input/InputStatusBars', () => ({
  InputStatusBars: () => null,
}));

vi.mock('../../components/input/InputContextRow', () => ({
  InputContextRow: () => null,
}));

vi.mock('../../components/input/InputControlBar', () => ({
  InputControlBar: ({ canSend, onSend }: { canSend: boolean; onSend: () => void }) => React.createElement(
    'button',
    { type: 'button', 'data-testid': 'send', disabled: !canSend, onClick: onSend },
    'send',
  ),
}));

vi.mock('../../hooks/use-slash-items', () => ({
  useSkillSlashItems: () => [],
}));

vi.mock('../../utils/paste-upload-feedback', () => ({
  notifyPasteUploadFailure: vi.fn(),
}));

vi.mock('../../services/stream-resume', () => ({
  replayStreamResume: vi.fn(),
  isStreamResumeRebuilding: () => null,
  isStreamScopedMessage: () => false,
  updateSessionStreamMeta: vi.fn(),
}));

function seedSession() {
  useStore.setState({
    currentSessionPath: '/session/media.jsonl',
    connected: true,
    pendingNewSession: false,
    streamingSessions: [],
    inlineErrors: {},
    attachedFiles: [{
      fileId: 'sf_pasted',
      path: '/tmp/hana/session-files/pasted.png',
      name: 'pasted.png',
      isDirectory: false,
    }],
    attachedFilesBySession: {
      '/session/media.jsonl': [{
        fileId: 'sf_pasted',
        path: '/tmp/hana/session-files/pasted.png',
        name: 'pasted.png',
        isDirectory: false,
      }],
    },
    docContextAttached: false,
    quoteCandidate: null,
    quotedSelections: [],
    quotedSelection: null,
    models: [{
      id: 'deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek Chat',
      input: ['text'],
      isCurrent: true,
    }],
    sessionModelsByPath: {},
    previewItems: [],
    previewOpen: false,
    chatSessions: {},
    serverPort: 3210,
    serverToken: null,
    modelSwitching: false,
  } as never);
  useStore.getState().clearSession('/session/media.jsonl');
  useStore.getState().initSession('/session/media.jsonl', [], false);
}

describe('InputArea media send', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    seedSession();
    mocks.hanaFetch.mockResolvedValue(new Response(JSON.stringify({
      models: {
        vision_enabled: true,
        vision: { id: 'qwen-vl', provider: 'dashscope', input: ['text', 'image'] },
      },
    }), { status: 200 }));
    window.platform = {
      readFileBase64: vi.fn(async () => 'IMAGE_BASE64'),
    } as unknown as typeof window.platform;
    delete (window as unknown as { hana?: unknown }).hana;
  });

  it('sends pasted image bytes through the platform API when window.hana is unavailable', async () => {
    render(React.createElement(InputArea));

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(mocks.wsSend).toHaveBeenCalledTimes(1);
    });
    expect(window.platform.readFileBase64).toHaveBeenCalledWith('/tmp/hana/session-files/pasted.png');
    const payload = JSON.parse(String(mocks.wsSend.mock.calls[0][0]));
    expect(payload.images).toEqual([{
      type: 'image',
      data: 'IMAGE_BASE64',
      mimeType: 'image/png',
    }]);
    expect(payload.displayMessage.attachments[0]).toMatchObject({
      fileId: 'sf_pasted',
      path: '/tmp/hana/session-files/pasted.png',
      name: 'pasted.png',
      mimeType: 'image/png',
      visionAuxiliary: true,
    });
    expect(mocks.hanaFetch).toHaveBeenCalledWith('/api/preferences/models', undefined);
  });

  it('uses the chat-scoped auxiliary vision route for mobile image preflight', async () => {
    mocks.hanaFetch.mockImplementation(async (path: string) => {
      if (path === '/api/models/auxiliary-vision') {
        return new Response(JSON.stringify({
          auxiliaryVision: {
            enabled: true,
            configured: true,
            available: true,
            unavailableReason: null,
            model: { id: 'qwen-vl', provider: 'dashscope' },
          },
        }), { status: 200 });
      }
      if (path === '/api/preferences/models') {
        throw new Error('mobile preflight must not read settings preferences');
      }
      throw new Error(`unexpected fetch path ${path}`);
    });

    render(<InputArea surface="mobile" />);

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(mocks.wsSend).toHaveBeenCalledTimes(1);
    });
    expect(mocks.hanaFetch).toHaveBeenCalledWith('/api/models/auxiliary-vision', undefined);
    expect(mocks.hanaFetch.mock.calls.some(([path]) => path === '/api/preferences/models')).toBe(false);
  });

  it('sends audio bytes natively for official MiMo audio models', async () => {
    useStore.setState({
      attachedFiles: [{
        fileId: 'sf_voice',
        path: '/tmp/hana/session-files/voice.wav',
        name: 'voice.wav',
        isDirectory: false,
      }],
      attachedFilesBySession: {
        '/session/media.jsonl': [{
          fileId: 'sf_voice',
          path: '/tmp/hana/session-files/voice.wav',
          name: 'voice.wav',
          isDirectory: false,
        }],
      },
      models: [{
        id: 'mimo-v2.5',
        provider: 'mimo',
        name: 'MiMo V2.5',
        api: 'openai-completions',
        baseUrl: 'https://api.xiaomimimo.com/v1',
        input: ['text', 'audio'],
        isCurrent: true,
      }],
    } as never);
    window.platform = {
      readFileBase64: vi.fn(async () => 'AUDIO_BASE64'),
    } as unknown as typeof window.platform;

    render(React.createElement(InputArea));

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(mocks.wsSend).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(String(mocks.wsSend.mock.calls[0][0]));
    expect(window.platform.readFileBase64).toHaveBeenCalledWith('/tmp/hana/session-files/voice.wav');
    expect(payload.text).toBe('');
    expect(payload.audios).toEqual([{
      type: 'audio',
      data: 'AUDIO_BASE64',
      mimeType: 'audio/wav',
    }]);
    expect(payload.displayMessage.attachments[0]).toMatchObject({
      fileId: 'sf_voice',
      path: '/tmp/hana/session-files/voice.wav',
      name: 'voice.wav',
      mimeType: 'audio/wav',
    });
  });

  it('keeps audio attachments on the legacy text path for unsupported models', async () => {
    useStore.setState({
      attachedFiles: [{
        fileId: 'sf_voice',
        path: '/tmp/hana/session-files/voice.wav',
        name: 'voice.wav',
        isDirectory: false,
      }],
      attachedFilesBySession: {
        '/session/media.jsonl': [{
          fileId: 'sf_voice',
          path: '/tmp/hana/session-files/voice.wav',
          name: 'voice.wav',
          isDirectory: false,
        }],
      },
    } as never);

    render(React.createElement(InputArea));

    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(mocks.wsSend).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(String(mocks.wsSend.mock.calls[0][0]));
    expect(payload.audios).toBeUndefined();
    expect(payload.text).toBe('[附件] /tmp/hana/session-files/voice.wav');
    expect(window.platform.readFileBase64).not.toHaveBeenCalled();
  });

  it('does not send while an agent switch session is still pending', async () => {
    useStore.setState({ pendingSessionSwitchPath: '/session/new-agent.jsonl' } as never);

    render(React.createElement(InputArea));

    const send = screen.getByTestId('send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);

    await waitFor(() => {
      expect(mocks.wsSend).not.toHaveBeenCalled();
    });
  });
});
