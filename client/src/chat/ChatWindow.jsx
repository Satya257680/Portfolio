import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { contact } from '../data/portfolioData.js';
import Avatar from './Avatar.jsx';
import { EMOJIS, dayLabel, nameColor, timeOf } from './chatUtils.js';

const drafts = new Map(); // conversationId -> unsent text (survives switching chats)
const MAX = 2000;

function Ticks({ status }) {
  if (status === 'pending') return <Icon name="clock" size={13} className="ctick ctick--pending" title="Sending" />;
  if (status === 'failed') return null;
  if (status === 'read') return <Icon name="checks" size={15} className="ctick ctick--read" title="Read" />;
  return <Icon name="check" size={14} className="ctick" title="Sent" />;
}

function HeaderMenu({ items }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="cmenu cmenu--right">
      <button type="button" className="cicon-btn" aria-label="Conversation options" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="more" size={22} />
      </button>
      {open ? (
        <>
          <button type="button" className="cmenu__backdrop" aria-label="Close options" onClick={() => setOpen(false)} />
          <ul className="cmenu__list" role="menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            {items.map((it) => (
              <li key={it.key} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`cmenu__item ${it.danger ? 'cmenu__item--danger' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  <Icon name={it.icon} size={18} /> {it.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function ChatWindow({
  isAdmin,
  myId,
  conversation,
  detail,
  thread,
  typing,
  ownerOnline,
  initialDraft,
  onBack,
  onSend,
  onRetry,
  onDiscard,
  onLoadOlder,
  onReload,
  onTyping,
  onAction,
}) {
  const c = conversation;
  const isGroup = c.type === 'group';
  const items = thread?.items || [];
  const [text, setText] = useState(() => drafts.get(c.id) || initialDraft || '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const lastTypingEmit = useRef(0);

  const other = !isGroup ? detail?.members.find((m) => m.id !== myId) : null;
  const closed = (detail?.status || c.status) === 'closed';
  const blocked = isAdmin && (other?.status === 'blocked' || c.other?.status === 'blocked');
  const muted = detail?.mutedUntil && new Date(detail.mutedUntil) > new Date();

  // Highest message id every other member has read → double ticks.
  const readUpTo = useMemo(() => {
    const others = (detail?.members || []).filter((m) => m.id !== myId);
    if (!others.length) return 0;
    return Math.min(...others.map((m) => m.lastReadMessageId || 0));
  }, [detail, myId]);

  useEffect(() => {
    drafts.set(c.id, text);
  }, [c.id, text]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [c.id]);

  // Keep the view pinned to the newest message unless the reader scrolled up;
  // keep position stable when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current && el.scrollTop < 40 && el.scrollHeight > prevHeight.current && !stickToBottom.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
  }, [items.length, typing]);

  const onScroll = () => {
    const el = scrollRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = el.scrollHeight;
  };

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };
  useEffect(autoGrow, [text]);

  const submit = (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || body.length > MAX || (closed && !isAdmin)) return;
    stickToBottom.current = true;
    setText('');
    drafts.delete(c.id);
    setEmojiOpen(false);
    onSend(body);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now;
      onTyping();
    }
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX);
    setText(next);
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  let status;
  if (typing) status = <span className="cwin__typing">{isGroup ? `${typing.name.split(' ')[0]} is typing…` : 'typing…'}</span>;
  else if (isGroup) {
    const names = (detail?.members || []).map((m) => (m.id === myId ? 'You' : m.name.split(' ')[0]));
    status = names.length ? `${detail.members.length} members · ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}` : `${c.memberCount} members`;
  } else if (c.other?.isOwner) {
    status = ownerOnline ? (
      <span className="cwin__online">
        <span className="cdot" aria-hidden="true" /> Online
      </span>
    ) : (
      'Usually replies within a few hours'
    );
  } else {
    status = (other?.online ?? c.other?.online) ? (
      <span className="cwin__online">
        <span className="cdot" aria-hidden="true" /> Online
      </span>
    ) : (
      other?.email || c.other?.email || 'Offline'
    );
  }

  const menuItems = [];
  if (isGroup) menuItems.push({ key: 'info', icon: 'info', label: 'Group info', onClick: () => onAction('groupInfo') });
  if (isAdmin) {
    menuItems.push({ key: 'unread', icon: 'chat', label: 'Mark as unread', onClick: () => onAction('unread') });
    menuItems.push(
      c.status === 'archived'
        ? { key: 'unarchive', icon: 'archive', label: 'Unarchive', onClick: () => onAction('unarchive') }
        : { key: 'archive', icon: 'archive', label: 'Archive chat', onClick: () => onAction('archive') },
    );
    if (!isGroup) {
      menuItems.push(
        closed
          ? { key: 'reopen', icon: 'chat', label: 'Reopen conversation', onClick: () => onAction('reopen') }
          : { key: 'close', icon: 'lock', label: 'Close conversation', onClick: () => onAction('close') },
      );
      menuItems.push(
        blocked
          ? { key: 'unblock', icon: 'ban', label: 'Unblock user', onClick: () => onAction('unblock') }
          : { key: 'block', icon: 'ban', label: 'Block user', danger: true, onClick: () => onAction('block') },
      );
    }
  }
  menuItems.push(
    muted
      ? { key: 'unmute', icon: 'bellOff', label: 'Unmute email alerts', onClick: () => onAction('unmute') }
      : { key: 'mute8', icon: 'bellOff', label: 'Mute email alerts (8 h)', onClick: () => onAction('mute8') },
  );
  if (!isAdmin) menuItems.push({ key: 'report', icon: 'flag', label: 'Report a problem', onClick: () => onAction('report') });

  let lastDay = '';
  let prevSender = null;

  return (
    <section className="cwin" aria-label={`Chat with ${c.title}`}>
      <header className="cwin__head">
        <button type="button" className="cicon-btn cwin__back" onClick={onBack} aria-label="Back to conversations">
          <Icon name="back" size={22} />
        </button>
        <Avatar name={c.title} id={c.other?.id || c.id} isOwner={c.other?.isOwner} group={isGroup} size={44} />
        <div className="cwin__who">
          <h2 className="cwin__name">{c.title}</h2>
          <p className="cwin__status" aria-live="polite">
            {status}
          </p>
        </div>
        <div className="cwin__actions">
          {!isAdmin && c.other?.isOwner ? (
            <a className="cicon-btn" href={contact.phoneHref} aria-label={`Call ${c.title}`} title="Call">
              <Icon name="phone" size={20} />
            </a>
          ) : null}
          {isAdmin && other?.email ? (
            <a className="cicon-btn" href={`mailto:${other.email}?subject=${encodeURIComponent('Re: Your message on my Portfolio Chat')}`} aria-label={`Email ${c.title}`} title="Reply via email">
              <Icon name="mail" size={20} />
            </a>
          ) : null}
          {isGroup ? (
            <button type="button" className="cicon-btn" onClick={() => onAction('groupInfo')} aria-label="Group info" title="Group info">
              <Icon name="team" size={20} />
            </button>
          ) : null}
          <HeaderMenu items={menuItems} />
        </div>
      </header>

      <div className="cwin__scroll" ref={scrollRef} onScroll={onScroll}>
        <ol className="cmsgs" aria-label="Messages" aria-live="polite" aria-relevant="additions">
          {thread?.hasMore ? (
            <li className="cmsgs__older">
              <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={onLoadOlder} disabled={thread.loading}>
                {thread.loading ? 'Loading…' : 'Load earlier messages'}
              </button>
            </li>
          ) : null}
          {!thread?.loaded && thread?.loading ? (
            <li className="cmsgs__state" role="status">
              <span className="cspinner" aria-hidden="true" /> Loading messages…
            </li>
          ) : null}
          {thread?.error && !items.length ? (
            <li className="cmsgs__state" role="alert">
              {thread.error}{' '}
              <button type="button" className="clink" onClick={onReload}>
                Retry
              </button>
            </li>
          ) : null}
          {thread?.loaded && !items.length ? (
            <li className="cmsgs__intro">
              {c.other?.isOwner ? (
                <>
                  <strong>Hi! 👋</strong> This is your private chat with {c.title}. Ask anything about projects, skills or opportunities —
                  you’ll get an email when there’s a reply.
                </>
              ) : (
                'No messages yet.'
              )}
            </li>
          ) : null}

          {items.map((m) => {
            const day = dayLabel(m.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.senderId === myId;
            const first = showDay || prevSender !== m.senderId || m.type === 'system';
            prevSender = m.type === 'system' ? null : m.senderId;
            const key = m.id ? `m${m.id}` : `p${m.clientMessageId}`;
            const tick = m.status === 'pending' || m.status === 'failed' ? m.status : m.id && readUpTo >= m.id ? 'read' : 'sent';
            return (
              <Fragment key={key}>
                {showDay ? (
                  <li className="cday">
                    <span>{day}</span>
                  </li>
                ) : null}
                {m.type === 'system' ? (
                  <li className="csys">
                    <span>{m.body}</span>
                  </li>
                ) : (
                  <li className={`cmsg ${mine ? 'cmsg--out' : 'cmsg--in'} ${first ? 'cmsg--first' : ''} ${m.status === 'failed' ? 'cmsg--failed' : ''}`}>
                    {isGroup && !mine ? (
                      <span className="cmsg__avatar">{first ? <Avatar name={m.senderName} id={m.senderId} size={34} /> : null}</span>
                    ) : null}
                    <div className="cbubble">
                      {isGroup && !mine && first ? (
                        <span className="cbubble__sender" style={{ color: nameColor(m.senderId) }}>
                          {m.senderName}
                        </span>
                      ) : null}
                      <span className="cbubble__text">{m.body}</span>
                      <span className="cbubble__meta">
                        <time dateTime={new Date(m.createdAt).toISOString()}>{timeOf(m.createdAt)}</time>
                        {mine ? <Ticks status={tick} /> : null}
                      </span>
                    </div>
                    {m.status === 'failed' ? (
                      <div className="cmsg__fail" role="alert">
                        <span>{m.error || 'Not sent.'}</span>
                        <button type="button" className="clink" onClick={() => onRetry(m)}>
                          Retry
                        </button>
                        <button type="button" className="clink" onClick={() => onDiscard(m)}>
                          Discard
                        </button>
                      </div>
                    ) : null}
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      </div>

      {closed && !isAdmin ? (
        <p className="cwin__closed" role="status">
          <Icon name="lock" size={16} /> This conversation was closed. You can still email{' '}
          <a href={`mailto:${contact.email}`}>{contact.email}</a>.
        </p>
      ) : (
        <form className="ccomposer" onSubmit={submit}>
          <div className="ccomposer__field">
            <div className="cemoji">
              <button
                type="button"
                className="cicon-btn cicon-btn--soft"
                aria-label="Insert emoji"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((v) => !v)}
              >
                <Icon name="smile" size={22} />
              </button>
              {emojiOpen ? (
                <div className="cemoji__panel" role="dialog" aria-label="Emoji" onKeyDown={(e) => e.key === 'Escape' && setEmojiOpen(false)}>
                  {EMOJIS.map((em) => (
                    <button key={em} type="button" onClick={() => insertEmoji(em)} aria-label={`Insert ${em}`}>
                      {em}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label htmlFor={`composer-${c.id}`} className="sr-only">
              Type a message
            </label>
            <textarea
              id={`composer-${c.id}`}
              ref={inputRef}
              rows={1}
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder={blocked ? 'This user is blocked' : 'Type a message...'}
              maxLength={MAX}
              disabled={blocked}
            />
            {text.length > MAX - 200 ? (
              <span className="ccomposer__count" aria-live="polite">
                {MAX - text.length}
              </span>
            ) : null}
          </div>
          <button type="submit" className="csend" aria-label="Send message" disabled={!text.trim() || blocked}>
            <Icon name="send" size={22} />
          </button>
        </form>
      )}
      {!isAdmin ? (
        <p className="cwin__note">
          <Icon name="shield" size={14} /> Private &amp; email-verified. Don’t share passwords, OTPs or sensitive personal details.
        </p>
      ) : null}
    </section>
  );
}
