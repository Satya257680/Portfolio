// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AttachmentTooLargeDialog from './AttachmentTooLargeDialog.jsx';
import ChatWindow from './ChatWindow.jsx';
import { MAX_ATTACHMENT_BYTES } from './attachments.js';

beforeEach(() => {
  vi.useFakeTimers();
  window.alert = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({ initiallyOpen = true }) {
  const [open, setOpen] = useState(initiallyOpen);
  const trigger = useRef(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Attach file
      </button>
      <AttachmentTooLargeDialog open={open} onClose={() => setOpen(false)} returnFocusRef={trigger} />
    </>
  );
}

describe('AttachmentTooLargeDialog', () => {
  it('renders the required content with dialog semantics and an accessible name', () => {
    render(<Harness />);
    const dialog = screen.getByRole('alertdialog', { name: 'Attachment too large' });
    expect(dialog).toHaveProperty('ariaModal', 'true');
    expect(dialog.getAttribute('aria-describedby')).toBe('cattach-dialog-desc cattach-dialog-limit');
    expect(screen.getByText('Please choose a file under 10 MB to continue.')).toBeTruthy();
    expect(screen.getByText(/Maximum file size: 10 MB/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('moves focus into the dialog and keeps Tab inside it', () => {
    render(<Harness />);
    const ok = screen.getByRole('button', { name: 'Got it' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  it('closes with Escape and returns focus to the triggering control', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Got it' }), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(250)); // exit animation
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Attach file' }));
  });

  it('closes with "Got it", the close button, or a backdrop click', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    act(() => vi.advanceTimersByTime(250));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => vi.advanceTimersByTime(250));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    fireEvent.mouseDown(document.querySelector('.cattach-dialog'));
    act(() => vi.advanceTimersByTime(250));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();
  });

  it('renders nothing while closed', () => {
    render(<Harness initiallyOpen={false} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('ChatWindow attachment validation', () => {
  const conversation = { id: 7, type: 'direct', title: 'Satyajit Nayak', status: 'open', other: { id: 1, isOwner: true } };
  const detail = { status: 'open', members: [{ id: 1, name: 'Satyajit Nayak', isOwner: true, lastReadMessageId: 0 }, { id: 2, name: 'Vera', lastReadMessageId: 0 }] };

  function setup(onUpload = vi.fn(async () => true)) {
    const onNotice = vi.fn();
    render(
      <ChatWindow
        isAdmin={false}
        myId={2}
        conversation={conversation}
        detail={detail}
        thread={{ items: [], loaded: true }}
        ownerOnline={false}
        initialDraft=""
        onBack={() => {}}
        onSend={() => {}}
        onUpload={onUpload}
        onNotice={onNotice}
        onDownload={() => {}}
        onRetry={() => {}}
        onDiscard={() => {}}
        onLoadOlder={() => {}}
        onReload={() => {}}
        onTyping={() => {}}
        onAction={() => {}}
      />,
    );
    const input = document.querySelector('.cfile-input');
    const choose = async (size, name = 'Portfolio-main.zip', type = 'application/zip') => {
      const f = new File(['x'], name, { type });
      Object.defineProperty(f, 'size', { value: size });
      await act(async () => {
        fireEvent.change(input, { target: { files: [f] } });
      });
      return f;
    };
    return { onUpload, onNotice, choose };
  }

  it('shows the dialog (not window.alert) and does not upload a file over 10 MB', async () => {
    const { onUpload, choose } = setup();
    await choose(MAX_ATTACHMENT_BYTES + 1);
    expect(screen.getByRole('alertdialog', { name: 'Attachment too large' })).toBeTruthy();
    expect(onUpload).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('uploads a file of exactly 10 MB without showing the dialog', async () => {
    const { onUpload, choose } = setup();
    const f = await choose(MAX_ATTACHMENT_BYTES, 'exact.pdf', 'application/pdf');
    expect(onUpload).toHaveBeenCalledWith(f);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('uses a short notice — not the size dialog — for unsupported types and failures', async () => {
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('Network error — the file was not sent.'), { status: 0, code: 'NETWORK' });
    });
    const { onNotice, choose, onUpload } = setup(failing);
    await choose(100, 'clip.mp4', 'video/mp4');
    expect(onUpload).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenLastCalledWith(expect.stringMatching(/not allowed/));
    await choose(100, 'notes.pdf', 'application/pdf');
    expect(onNotice).toHaveBeenLastCalledWith('Network error — the file was not sent.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('shows the dialog when the server rejects the size (413 ATTACHMENT_TOO_LARGE)', async () => {
    const rejecting = vi.fn(async () => {
      throw Object.assign(new Error('Attachments must be 10 MB or smaller.'), { status: 413, code: 'ATTACHMENT_TOO_LARGE' });
    });
    const { onNotice, choose } = setup(rejecting);
    await choose(1024, 'ok.pdf', 'application/pdf');
    expect(screen.getByRole('alertdialog', { name: 'Attachment too large' })).toBeTruthy();
    expect(onNotice).not.toHaveBeenCalled();
  });
});

