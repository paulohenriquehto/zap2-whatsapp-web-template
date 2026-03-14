'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 4;
const IMAGE_ZOOM_STEP = 0.25;

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

const formatDuration = (value) => {
  if (!value || Number.isNaN(value)) {
    return '0:00';
  }

  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function VoiceNotePlayer({ message, isOutgoing }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(message.media?.durationSeconds ?? 0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || message.media?.durationSeconds || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [message.media?.durationSeconds]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    await audio.play();
    setIsPlaying(true);
  };

  const seekAudio = (event) => {
    const audio = audioRef.current;

    if (!audio || duration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextTime = duration * ratio;

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className={`wa-voice-note ${isOutgoing ? 'wa-voice-note-out' : 'wa-voice-note-in'}`}>
      <audio ref={audioRef} preload="metadata" src={message.media.url}>
        Seu navegador nao suporta reproducao de audio.
      </audio>

      <div className="wa-voice-note-main">
        <button
          type="button"
          className="wa-voice-note-button"
          onClick={() => {
            void togglePlayback();
          }}
          aria-label={isPlaying ? 'Pausar audio' : 'Reproduzir audio'}
        >
          <span className={isPlaying ? 'wa-voice-note-icon-pause' : 'wa-voice-note-icon-play'} />
        </button>

        <button
          type="button"
          className="wa-voice-note-track"
          onClick={seekAudio}
          aria-label="Mover audio"
        >
          <span className="wa-voice-note-track-base" />
          <span
            className="wa-voice-note-track-fill"
            style={{ width: `${progress}%` }}
          />
          <span
            className="wa-voice-note-track-thumb"
            style={{ left: `${progress}%` }}
          />
        </button>
      </div>

      <div className="wa-voice-note-meta-row">
        <span className="wa-voice-note-duration">
          {formatDuration(isPlaying ? currentTime : duration || currentTime)}
        </span>
        <span className="wa-voice-note-sent-at">{formatMessageTime(message.sentAt)}</span>
      </div>
    </div>
  );
}

function ImageLightbox({ media, caption, onClose }) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    document.body.classList.add('wa-lightbox-open');

    return () => {
      document.body.classList.remove('wa-lightbox-open');
    };
  }, []);

  const updateZoom = (nextZoom) => {
    setZoom(Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, nextZoom)));
  };

  const handleWheel = (event) => {
    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? IMAGE_ZOOM_STEP : -IMAGE_ZOOM_STEP));
  };

  return (
    <div className="wa-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="wa-lightbox-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wa-lightbox-toolbar">
          <div className="wa-lightbox-zoom-readout">{Math.round(zoom * 100)}%</div>
          <div className="wa-lightbox-actions">
            <button type="button" onClick={() => updateZoom(zoom - IMAGE_ZOOM_STEP)}>
              -
            </button>
            <button type="button" onClick={() => updateZoom(1)}>
              100%
            </button>
            <button type="button" onClick={() => updateZoom(zoom + IMAGE_ZOOM_STEP)}>
              +
            </button>
            <button type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>

        <div className="wa-lightbox-stage" onWheel={handleWheel}>
          <img
            src={media.url}
            alt={caption || 'Imagem ampliada do WhatsApp'}
            className="wa-lightbox-image"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>

        {caption ? <p className="wa-lightbox-caption">{caption}</p> : null}
      </div>
    </div>
  );
}

const MessageBody = ({ message, isOutgoing, onOpenImage }) => {
  if (message.media?.kind === 'audio') {
    return <VoiceNotePlayer message={message} isOutgoing={isOutgoing} />;
  }

  if (message.media?.kind === 'image') {
    return (
      <figure className="wa-image-card">
        <button
          type="button"
          className="wa-image-trigger"
          onClick={() =>
            onOpenImage({
              url: message.media.url,
              caption: message.textBody,
            })
          }
          aria-label="Abrir imagem"
        >
          <img
            src={message.media.url}
            alt={message.textBody || 'Imagem recebida no WhatsApp'}
            className="wa-image-preview"
            loading="lazy"
          />
        </button>
        {message.textBody ? (
          <figcaption className="wa-image-caption">{message.textBody}</figcaption>
        ) : null}
      </figure>
    );
  }

  return <p>{message.textBody || '[mensagem sem texto]'}</p>;
};

export function WhatsAppInbox({ session }) {
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [chats, setChats] = useState([]);
  const [activeChatJid, setActiveChatJid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
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
                    <MessageBody
                      message={message}
                      isOutgoing={message.fromMe}
                      onOpenImage={setLightboxImage}
                    />
                    {message.media?.kind === 'audio' ? null : (
                      <footer>
                        <span>{formatMessageTime(message.sentAt)}</span>
                        {message.fromMe ? <span>{message.status}</span> : null}
                      </footer>
                    )}
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

      {lightboxImage ? (
        <ImageLightbox
          media={lightboxImage}
          caption={lightboxImage.caption}
          onClose={() => setLightboxImage(null)}
        />
      ) : null}
    </main>
  );
}
