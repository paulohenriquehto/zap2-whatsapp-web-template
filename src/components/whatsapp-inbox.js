'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const formatChatTime = (value) => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMessageTime = (value) => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildInitials = (title) => {
  if (!title) {
    return '?';
  }

  return title
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
};

const Avatar = ({ title, url }) => {
  if (url) {
    return <img src={url} alt={title} className="wa-avatar-image" />;
  }

  return <span>{buildInitials(title)}</span>;
};

export function WhatsAppInbox({ session }) {
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [chats, setChats] = useState([]);
  const [activeChatJid, setActiveChatJid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);

  const loadChats = async () => {
    const response = await fetch('/api/inbox/chats', { cache: 'no-store' });
    const data = await response.json();
    setChats(data.chats ?? []);
  };

  const loadMessages = async (chatJid) => {
    if (!chatJid) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/inbox/chats/${encodeURIComponent(chatJid)}/messages`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      setMessages(data.messages ?? []);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    document.body.classList.add('wa-mode-inbox');

    return () => {
      document.body.classList.remove('wa-mode-inbox');
    };
  }, []);

  useEffect(() => {
    if (!activeChatJid && chats.length > 0) {
      setActiveChatJid(chats[0].chatJid);
    }

    if (
      activeChatJid &&
      chats.length > 0 &&
      !chats.some((chat) => chat.chatJid === activeChatJid)
    ) {
      setActiveChatJid(chats[0]?.chatJid ?? null);
    }
  }, [activeChatJid, chats]);

  useEffect(() => {
    void loadMessages(activeChatJid);
  }, [activeChatJid]);

  useEffect(() => {
    const threadElement = threadRef.current;

    if (!threadElement) {
      return;
    }

    threadElement.scrollTop = threadElement.scrollHeight;
  }, [messages, loadingMessages]);

  useEffect(() => {
    const events = new EventSource('/api/inbox/events');

    const refresh = async () => {
      await loadChats();
      if (activeChatJid) {
        await loadMessages(activeChatJid);
      }
    };

    events.addEventListener('inbox', () => {
      void refresh();
    });

    return () => {
      events.close();
    };
  }, [activeChatJid]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return chats;
    }

    return chats.filter((chat) =>
      [chat.title, chat.lastMessagePreview, chat.chatJid]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [chats, search]);

  const activeChat =
    chats.find((chat) => chat.chatJid === activeChatJid) ?? filteredChats[0] ?? null;

  const handleSendMessage = async (event) => {
    event.preventDefault();

    const text = composer.trim();

    if (!text || !activeChat) {
      return;
    }

    setSending(true);

    try {
      await fetch('/api/inbox/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatJid: activeChat.chatJid,
          text,
        }),
      });

      setComposer('');
      await loadChats();
      await loadMessages(activeChat.chatJid);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="wa-shell">
      <aside className="wa-sidebar">
        <header className="wa-sidebar-header">
          <div>
            <p className="wa-brand">WhatsApp</p>
            <p className="wa-session-meta">
              Sessao ativa {session.accountLabel ? `em ${session.accountLabel}` : ''}
            </p>
          </div>
        </header>

        <div className="wa-search">
          <input
            type="search"
            placeholder="Pesquisar ou comecar uma nova conversa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="wa-chip-row">
          <button type="button" className="wa-chip wa-chip-active">
            Tudo
          </button>
          <button type="button" className="wa-chip">
            Nao lidas
          </button>
          <button type="button" className="wa-chip">
            Favoritas
          </button>
        </div>

        <div className="wa-chat-list">
          {filteredChats.map((chat) => {
            const isActive = chat.chatJid === activeChat?.chatJid;

            return (
              <button
                key={chat.chatJid}
                type="button"
                className={`wa-chat-card ${isActive ? 'wa-chat-card-active' : ''}`}
                onClick={() => setActiveChatJid(chat.chatJid)}
              >
                <div className="wa-avatar">
                  <Avatar title={chat.title} url={chat.avatarUrl} />
                </div>

                <div className="wa-chat-copy">
                  <div className="wa-chat-title-row">
                    <strong>{chat.title}</strong>
                    <span>{formatChatTime(chat.lastMessageAt)}</span>
                  </div>

                  <div className="wa-chat-preview-row">
                    <p>{chat.lastMessagePreview || 'Sem mensagens sincronizadas ainda.'}</p>
                    {chat.unreadCount > 0 ? (
                      <span className="wa-unread-badge">{chat.unreadCount}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="wa-panel">
        {activeChat ? (
          <>
            <header className="wa-chat-header">
              <div className="wa-chat-header-main">
                <div className="wa-avatar wa-avatar-header">
                  <Avatar title={activeChat.title} url={activeChat.avatarUrl} />
                </div>

                <div>
                  <strong>{activeChat.title}</strong>
                  <p>{activeChat.chatJid}</p>
                </div>
              </div>
            </header>

            <div ref={threadRef} className="wa-thread">
              {loadingMessages ? (
                <div className="wa-empty-state">
                  <p>Carregando mensagens...</p>
                </div>
              ) : messages.length > 0 ? (
                messages.map((message) => (
                  <article
                    key={`${message.chatJid}:${message.messageId}`}
                    className={`wa-bubble ${message.fromMe ? 'wa-bubble-out' : 'wa-bubble-in'}`}
                  >
                    <p>{message.textBody || '[mensagem sem texto]'}</p>
                    <footer>
                      <span>{formatMessageTime(message.sentAt)}</span>
                      {message.fromMe ? <span>{message.status}</span> : null}
                    </footer>
                  </article>
                ))
              ) : (
                <div className="wa-empty-state">
                  <p>Nenhuma mensagem sincronizada ainda para esta conversa.</p>
                </div>
              )}
            </div>

            <form className="wa-composer" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                placeholder="Digite uma mensagem"
              />
              <button type="submit" disabled={sending}>
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </form>
          </>
        ) : (
          <div className="wa-empty-hero">
            <div className="wa-empty-hero-art" aria-hidden="true">
              <span />
            </div>
            <h2>Inbox pronta</h2>
            <p>
              Depois do QR, as conversas reais vao aparecer aqui com o historico
              sincronizado do Baileys.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
