import Icon from '../components/Icon.jsx';
import Avatar from './Avatar.jsx';
import { listTime } from './chatUtils.js';

function preview(c, myId) {
  const lm = c.lastMessage;
  if (!lm) return c.type === 'group' ? `${c.memberCount} members` : 'Say hello 👋';
  if (lm.type === 'system') return lm.body;
  const who = lm.senderId === myId ? 'You: ' : c.type === 'group' ? `${(lm.senderName || '').split(' ')[0]}: ` : '';
  return `${who}${lm.body.replace(/\s+/g, ' ')}`;
}

export default function Sidebar({
  isAdmin,
  scope = null,
  myId,
  conversations,
  listState,
  activeId,
  filter,
  query,
  typing,
  onFilter,
  onQuery,
  onOpen,
  onRetry,
  onNewGroup,
}) {
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    // A scoped list (admin panel) is already only visitor chats or only groups.
    ...(scope ? [] : [{ id: 'groups', label: 'Groups' }]),
    ...(isAdmin ? [{ id: 'archived', label: 'Archived' }] : []),
  ];

  return (
    <aside className="cside" aria-label="Conversations">
      <div className="cside__search">
        <Icon name="search" size={18} />
        <label htmlFor="chat-search" className="sr-only">
          Search chats
        </label>
        <input
          id="chat-search"
          type="search"
          placeholder="Search chats..."
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          maxLength={80}
          autoComplete="off"
        />
      </div>

      <div className="cside__filters" role="group" aria-label="Filter conversations">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`cchip ${filter === f.id ? 'is-active' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => onFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        {onNewGroup ? (
          <button type="button" className="cchip cchip--icon" onClick={onNewGroup} aria-label="Create a new group" title="New group">
            <Icon name="plus" size={16} />
          </button>
        ) : null}
      </div>

      <div className="cside__list">
        {listState.loading && !conversations.length ? (
          <ul className="cskeleton" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <span className="cskeleton__avatar" />
                <span className="cskeleton__lines">
                  <span />
                  <span />
                </span>
              </li>
            ))}
          </ul>
        ) : listState.error && !conversations.length ? (
          <div className="cside__state" role="alert">
            <p>{listState.error}</p>
            <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : !conversations.length ? (
          <div className="cside__state">
            <p>
              {query
                ? 'No chats match your search.'
                : filter === 'unread'
                  ? 'You’re all caught up — no unread chats.'
                  : filter === 'groups'
                    ? 'No groups yet.'
                    : filter === 'archived'
                      ? 'No archived chats.'
                      : scope === 'group'
                        ? 'No private groups yet.'
                        : 'No conversations yet.'}
            </p>
          </div>
        ) : (
          <ul className="clist">
            {conversations.map((c) => {
              const isTyping = typing[c.id];
              const ownerChat = c.other?.isOwner;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`clist__item ${activeId === c.id ? 'is-active' : ''} ${c.unread ? 'has-unread' : ''}`}
                    onClick={() => onOpen(c.id)}
                    aria-current={activeId === c.id ? 'true' : undefined}
                  >
                    <Avatar
                      name={c.title}
                      id={c.other?.id || c.id}
                      isOwner={ownerChat}
                      group={c.type === 'group'}
                      online={c.type === 'direct' && c.other?.online}
                      size={48}
                    />
                    <span className="clist__body">
                      <span className="clist__row">
                        <span className="clist__name">
                          {c.title}
                          {c.other?.status === 'blocked' ? <span className="ctag ctag--danger">Blocked</span> : null}
                          {c.status === 'closed' ? <span className="ctag">Closed</span> : null}
                        </span>
                        <span className="clist__time">{listTime(c.lastActivityAt)}</span>
                      </span>
                      <span className="clist__row">
                        <span className={`clist__preview ${isTyping ? 'is-typing' : ''}`}>
                          {isTyping ? `${c.type === 'group' ? `${isTyping.name.split(' ')[0]} is ` : ''}typing…` : preview(c, myId)}
                        </span>
                        {c.unread ? (
                          <span className="clist__badge" aria-label={`${c.unread} unread`}>
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
