'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 4;
const IMAGE_ZOOM_STEP = 0.25;

const getRecordingMimeType = () => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
  );
};

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

const formatFullDateTime = (value) => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

const WHATSAPP_LABEL_COLORS = [
  '#0b8f72',
  '#c45100',
  '#0e6db8',
  '#7a41b5',
  '#b43e7d',
  '#157347',
  '#9b7b00',
  '#006d77',
  '#a23b3b',
  '#4154c5',
  '#7a5c00',
  '#1d6f42',
  '#0b7285',
  '#7b4397',
  '#c46f00',
  '#3454d1',
  '#9c2f5d',
  '#00875a',
  '#7a4d1d',
  '#4f46e5',
];

const GROUP_PARTICIPANT_COLORS = [
  '#68c4ff',
  '#ff8ec6',
  '#49e07d',
  '#ffd166',
  '#b799ff',
  '#ffa94d',
  '#67e8f9',
  '#fda4af',
  '#a3e635',
  '#f9a8d4',
];

const getLabelColor = (colorId) =>
  WHATSAPP_LABEL_COLORS[
    Math.max(0, Math.min(WHATSAPP_LABEL_COLORS.length - 1, Number(colorId) || 0))
  ];

const getLabelSourceLabel = (source) =>
  String(source ?? '').toLowerCase() === 'local' ? 'Sistema' : 'WhatsApp';

const getParticipantAccentColor = (seedSource) => {
  const seed = Array.from(String(seedSource ?? 'participant')).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return GROUP_PARTICIPANT_COLORS[seed % GROUP_PARTICIPANT_COLORS.length];
};

const buildWaveformBars = (seedSource, count = 34) => {
  const seed = Array.from(String(seedSource ?? 'voice')).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return Array.from({ length: count }, (_, index) => {
    const amplitude =
      Math.sin((index + 1) * 0.72 + seed * 0.013) +
      Math.cos((index + 1) * 0.41 + seed * 0.007);
    return 22 + Math.round(Math.abs(amplitude) * 22);
  });
};

const getMessageStatusMeta = (status) => {
  const normalized = String(status ?? '').toLowerCase();

  if (!normalized) {
    return null;
  }

  if (['4', '5', 'read', 'played'].includes(normalized)) {
    return { glyph: '✓✓', tone: 'read' };
  }

  if (['2', '3', 'delivered', 'server_ack', 'delivery_ack'].includes(normalized)) {
    return { glyph: '✓✓', tone: 'sent' };
  }

  if (['1', 'sent', 'pending'].includes(normalized)) {
    return { glyph: '✓', tone: 'pending' };
  }

  return { glyph: normalized, tone: 'pending' };
};

function VoiceNotePlayer({
  message,
  isOutgoing,
  chatTitle,
  chatAvatarUrl,
  chatType,
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(message.media?.durationSeconds ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const waveformBars = useMemo(
    () => buildWaveformBars(message.messageId ?? message.sentAt),
    [message.messageId, message.sentAt],
  );
  const statusMeta = isOutgoing ? getMessageStatusMeta(message.status) : null;
  const participant = !isOutgoing && chatType === 'group' ? message.participant : null;
  const incomingAvatarTitle = participant?.title ?? chatTitle;
  const incomingAvatarUrl = participant?.avatarUrl ?? chatAvatarUrl;

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

      <div
        className={`wa-voice-note-shell ${
          isOutgoing ? 'wa-voice-note-shell-out' : 'wa-voice-note-shell-in'
        }`}
      >
        {isOutgoing ? (
          <div className="wa-avatar wa-voice-note-avatar">
            <Avatar title={chatTitle} url={chatAvatarUrl} />
            <span className="wa-voice-note-mic-badge" aria-hidden="true" />
          </div>
        ) : null}

        <div className="wa-voice-note-content">
          {participant ? (
            <GroupParticipantMeta
              participant={participant}
              showAvatar={false}
              compact
            />
          ) : null}

          <div className="wa-voice-note-main">
            <button
              type="button"
              className="wa-voice-note-button"
              onClick={() => {
                void togglePlayback();
              }}
              aria-label={isPlaying ? 'Pausar audio' : 'Reproduzir audio'}
            >
              <span
                className={
                  isPlaying ? 'wa-voice-note-icon-pause' : 'wa-voice-note-icon-play'
                }
              />
            </button>

            <button
              type="button"
              className="wa-voice-note-track"
              onClick={seekAudio}
              aria-label="Mover audio"
            >
              <span className="wa-voice-note-waveform wa-voice-note-waveform-base">
                {waveformBars.map((height, index) => (
                  <span key={`base-${index}`} style={{ height: `${height}px` }} />
                ))}
              </span>
              <span
                className="wa-voice-note-waveform wa-voice-note-waveform-fill"
                style={{ width: `${progress}%` }}
              >
                {waveformBars.map((height, index) => (
                  <span key={`fill-${index}`} style={{ height: `${height}px` }} />
                ))}
              </span>
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
            <span className="wa-voice-note-meta-end">
              <span className="wa-voice-note-sent-at">{formatMessageTime(message.sentAt)}</span>
              {statusMeta ? (
                <span
                  className={`wa-voice-note-status wa-voice-note-status-${statusMeta.tone}`}
                  aria-label={`Status ${message.status}`}
                >
                  {statusMeta.glyph}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {!isOutgoing ? (
          <div className="wa-avatar wa-voice-note-avatar">
            <Avatar title={incomingAvatarTitle} url={incomingAvatarUrl} />
            <span className="wa-voice-note-mic-badge" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ComposerRecorderDock({
  isRecording,
  audio,
  recordingSeconds,
  sending,
  onDiscard,
  onPauseRecording,
  onSend,
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio?.durationSeconds ?? 0);
  const waveformBars = useMemo(
    () =>
      buildWaveformBars(
        isRecording
          ? `composer-live-${recordingSeconds}`
          : `composer-ready-${audio?.durationSeconds ?? 0}-${audio?.mimeType ?? ''}`,
        46,
      ),
    [audio?.durationSeconds, audio?.mimeType, isRecording, recordingSeconds],
  );

  useEffect(() => {
    if (isRecording) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(recordingSeconds);
      return;
    }

    setDuration(audio?.durationSeconds ?? 0);
  }, [audio?.durationSeconds, isRecording, recordingSeconds]);

  useEffect(() => {
    const player = audioRef.current;

    if (!player || isRecording) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(player.duration || audio?.durationSeconds || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(player.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      player.currentTime = 0;
    };

    player.addEventListener('loadedmetadata', handleLoadedMetadata);
    player.addEventListener('timeupdate', handleTimeUpdate);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('loadedmetadata', handleLoadedMetadata);
      player.removeEventListener('timeupdate', handleTimeUpdate);
      player.removeEventListener('ended', handleEnded);
    };
  }, [audio?.durationSeconds, isRecording]);

  const progress =
    !isRecording && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const togglePlayback = async () => {
    const player = audioRef.current;

    if (!player || isRecording) {
      return;
    }

    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      return;
    }

    await player.play();
    setIsPlaying(true);
  };

  const seekAudio = (event) => {
    const player = audioRef.current;

    if (!player || isRecording || duration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextTime = duration * ratio;
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      className={`wa-composer-recorder ${
        isRecording
          ? 'wa-composer-recorder-live'
          : 'wa-composer-recorder-ready'
      }`}
    >
      {!isRecording && audio ? (
        <audio ref={audioRef} preload="metadata" src={audio.url}>
          Seu navegador nao suporta reproducao de audio.
        </audio>
      ) : null}

      <button
        type="button"
        className="wa-composer-recorder-trash"
        onClick={onDiscard}
        disabled={sending}
        aria-label="Descartar audio"
      >
        <span className="wa-composer-recorder-trash-icon" aria-hidden="true" />
      </button>

      <div className="wa-composer-recorder-capsule">
        {isRecording ? (
          <>
            <div className="wa-composer-recorder-live-meta">
              <span className="wa-composer-recorder-dot" aria-hidden="true" />
              <strong>{formatDuration(recordingSeconds)}</strong>
            </div>

            <div className="wa-composer-recorder-wave wa-composer-recorder-wave-live">
              {waveformBars.map((height, index) => (
                <span
                  key={`live-${index}`}
                  style={{
                    height: `${Math.max(6, height - 8)}px`,
                    '--wa-wave-delay': `${index * 0.04}s`,
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="wa-composer-recorder-play"
              onClick={() => {
                void togglePlayback();
              }}
              aria-label={isPlaying ? 'Pausar audio gravado' : 'Reproduzir audio gravado'}
            >
              <span
                className={
                  isPlaying
                    ? 'wa-voice-note-icon-pause'
                    : 'wa-voice-note-icon-play'
                }
              />
            </button>

            <div className="wa-composer-recorder-ready-body">
              <strong className="wa-composer-recorder-ready-time">
                {formatDuration(isPlaying ? currentTime : duration || currentTime)}
              </strong>

              <button
                type="button"
                className="wa-composer-recorder-track"
                onClick={seekAudio}
                aria-label="Mover audio gravado"
              >
                <span className="wa-composer-recorder-wave wa-composer-recorder-wave-base">
                  {waveformBars.map((height, index) => (
                    <span
                      key={`base-${index}`}
                      style={{ height: `${Math.max(6, height - 10)}px` }}
                    />
                  ))}
                </span>
                <span
                  className="wa-composer-recorder-wave wa-composer-recorder-wave-fill"
                  style={{ width: `${progress}%` }}
                >
                  {waveformBars.map((height, index) => (
                    <span
                      key={`fill-${index}`}
                      style={{ height: `${Math.max(6, height - 10)}px` }}
                    />
                  ))}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {isRecording ? (
        <button
          type="button"
          className="wa-composer-recorder-secondary"
          onClick={onPauseRecording}
          disabled={sending}
          aria-label="Finalizar gravacao para ouvir"
        >
          <span className="wa-voice-note-icon-pause" aria-hidden="true" />
        </button>
      ) : null}

      <button
        type="button"
        className="wa-composer-recorder-send"
        onClick={onSend}
        disabled={sending}
        aria-label={isRecording ? 'Enviar audio agora' : 'Enviar audio gravado'}
      >
        <span className="wa-composer-send-icon" aria-hidden="true" />
      </button>
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

const MessageBody = ({ message, isOutgoing, onOpenImage, chat }) => {
  const showParticipant = chat?.chatType === 'group' && !isOutgoing && message.participant;

  if (message.media?.kind === 'audio') {
    return (
      <VoiceNotePlayer
        message={message}
        isOutgoing={isOutgoing}
        chatTitle={chat?.title}
        chatAvatarUrl={chat?.avatarUrl}
        chatType={chat?.chatType}
      />
    );
  }

  if (message.media?.kind === 'image') {
    return (
      <>
        {showParticipant ? (
          <GroupParticipantMeta participant={message.participant} />
        ) : null}

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
      </>
    );
  }

  return (
    <>
      {showParticipant ? <GroupParticipantMeta participant={message.participant} /> : null}
      <p>{message.textBody || '[mensagem sem texto]'}</p>
    </>
  );
};

function GroupParticipantMeta({
  participant,
  compact = false,
  showAvatar = true,
}) {
  if (!participant?.title) {
    return null;
  }

  return (
    <div
      className={`wa-group-participant ${
        compact ? 'wa-group-participant-compact' : ''
      } ${showAvatar ? 'wa-group-participant-with-avatar' : ''}`}
      style={{
        '--wa-group-participant-accent': getParticipantAccentColor(
          participant.jid ?? participant.title,
        ),
      }}
    >
      {showAvatar ? (
        <div className="wa-avatar wa-group-participant-avatar">
          <Avatar title={participant.title} url={participant.avatarUrl} />
        </div>
      ) : null}

      <div className="wa-group-participant-copy">
        <strong>{participant.title}</strong>
        {participant.subtitle ? <span>{participant.subtitle}</span> : null}
      </div>
    </div>
  );
}

function ChatLabelChip({
  label,
  removable = false,
  busy = false,
  onRemove,
}) {
  return (
    <span
      className={`wa-label-chip wa-label-chip-${label.source ?? 'whatsapp'}`}
      style={{
        '--wa-label-color': getLabelColor(label.color),
      }}
    >
      <span className="wa-label-chip-swatch" aria-hidden="true" />
      <span className="wa-label-chip-text">{label.name}</span>
      <span className="wa-label-chip-badge">{getLabelSourceLabel(label.source)}</span>
      {removable ? (
        <button
          type="button"
          className="wa-label-chip-remove"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remover etiqueta ${label.name}`}
        >
          x
        </button>
      ) : null}
    </span>
  );
}

function ChatDetailsDrawer({
  activeChat,
  details,
  loading,
  error,
  selectedLabelId,
  onSelectLabel,
  onAddLabel,
  onRemoveLabel,
  newLabelName,
  onNewLabelNameChange,
  onCreateLabel,
  onClose,
  mutatingLabelId,
}) {
  const assignedLabelIds = new Set((details?.labels ?? []).map((label) => label.id));
  const availableLabels = (details?.availableLabels ?? []).filter(
    (label) => !assignedLabelIds.has(label.id),
  );
  const identityRows = [
    details?.chat?.savedName
      ? { label: 'Nome salvo', value: details.chat.savedName }
      : null,
    details?.chat?.pushName && details.chat.pushName !== details.chat.savedName
      ? { label: 'Push name', value: details.chat.pushName }
      : null,
    details?.chat?.verifiedName &&
      ![details.chat.savedName, details.chat.pushName].includes(details.chat.verifiedName)
      ? { label: 'Nome verificado', value: details.chat.verifiedName }
      : null,
    details?.chat?.formattedPhoneNumber
      ? { label: 'Numero', value: details.chat.formattedPhoneNumber }
      : null,
    details?.chat?.rawJid
      ? {
          label: 'JID',
          value:
            details.chat.chatType === 'group'
              ? details.chat.rawJid
              : details.chat.contactJid || details.chat.rawJid,
        }
      : null,
  ].filter(Boolean);

  return (
    <>
      <button
        type="button"
        className="wa-chat-drawer-backdrop"
        aria-label="Fechar detalhes do chat"
        onClick={onClose}
      />

      <aside className="wa-chat-drawer">
        <div className="wa-chat-drawer-header">
          <strong>Detalhes do contato</strong>
          <button
            type="button"
            className="wa-chat-drawer-close"
            onClick={onClose}
            aria-label="Fechar detalhes"
          >
            x
          </button>
        </div>

        {loading ? (
          <div className="wa-chat-drawer-empty">
            <p>Carregando detalhes...</p>
          </div>
        ) : details ? (
          <div className="wa-chat-drawer-body">
            {error ? <p className="wa-chat-drawer-error">{error}</p> : null}

            <section className="wa-chat-drawer-profile">
              <div className="wa-avatar wa-chat-drawer-avatar">
                <Avatar title={details.chat.title} url={details.chat.avatarUrl} />
              </div>
              <div className="wa-chat-drawer-profile-copy">
                <strong>{details.chat.title}</strong>
                <p>
                  {details.chat.subtitle ||
                    (activeChat?.chatType === 'group'
                      ? 'Grupo do WhatsApp'
                      : 'Contato do WhatsApp')}
                </p>
              </div>
            </section>

            <section className="wa-chat-drawer-section">
              <div className="wa-chat-drawer-section-header">
                <strong>Etiquetas</strong>
                <span>{details.labels.length}</span>
              </div>

              {details.labels.length > 0 ? (
                <div className="wa-label-chip-list">
                  {details.labels.map((label) => (
                    <ChatLabelChip
                      key={label.id}
                      label={label}
                      removable
                      busy={mutatingLabelId === label.id}
                      onRemove={() => onRemoveLabel(label.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="wa-chat-drawer-muted">
                  Nenhuma etiqueta aplicada a esta conversa.
                </p>
              )}

              <p className="wa-chat-drawer-hint">
                Etiquetas do sistema funcionam em qualquer conta. Quando a sessao
                for WhatsApp Business, as etiquetas sincronizadas do WhatsApp
                tambem aparecem aqui.
              </p>

              <div className="wa-chat-drawer-label-controls">
                <select
                  value={selectedLabelId}
                  onChange={(event) => onSelectLabel(event.target.value)}
                  disabled={availableLabels.length === 0}
                >
                  <option value="">
                    {availableLabels.length > 0
                      ? 'Selecionar etiqueta'
                      : 'Sem etiquetas disponiveis'}
                  </option>
                  {availableLabels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {`${label.name} (${getLabelSourceLabel(label.source)})`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onAddLabel}
                  disabled={!selectedLabelId || Boolean(mutatingLabelId)}
                >
                  Adicionar
                </button>
              </div>

              <div className="wa-chat-drawer-label-create">
                <input
                  type="text"
                  value={newLabelName}
                  onChange={(event) => onNewLabelNameChange(event.target.value)}
                  placeholder="Criar etiqueta interna, ex: Novo lead"
                  maxLength={50}
                />
                <button
                  type="button"
                  onClick={onCreateLabel}
                  disabled={!newLabelName.trim() || Boolean(mutatingLabelId)}
                >
                  {mutatingLabelId === '__create__' ? 'Criando...' : 'Criar e aplicar'}
                </button>
              </div>
            </section>

            <section className="wa-chat-drawer-section">
              <div className="wa-chat-drawer-section-header">
                <strong>Identificacao</strong>
              </div>

              {identityRows.length > 0 ? (
                <div className="wa-chat-detail-list">
                  {identityRows.map((item) => (
                    <div key={item.label} className="wa-chat-detail-row">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wa-chat-drawer-muted">
                  Este contato ainda nao compartilhou dados completos com a sessao.
                </p>
              )}
            </section>

            <section className="wa-chat-drawer-section">
              <div className="wa-chat-drawer-section-header">
                <strong>Primeiro contato</strong>
              </div>

              {details.firstMessage ? (
                <div className="wa-first-message-card">
                  <div className="wa-first-message-meta">
                    <span>{details.firstMessage.fromMe ? 'Enviada' : 'Recebida'}</span>
                    <strong>{formatFullDateTime(details.firstMessage.sentAt)}</strong>
                  </div>
                  <p>{details.firstMessage.preview || '[mensagem sem texto]'}</p>
                </div>
              ) : (
                <p className="wa-chat-drawer-muted">
                  Ainda nao existe primeira mensagem sincronizada para esta conversa.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className="wa-chat-drawer-empty">
            <p>{error || 'Selecione uma conversa para ver os detalhes.'}</p>
          </div>
        )}
      </aside>
    </>
  );
}

export function WhatsAppInbox({ session }) {
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [chats, setChats] = useState([]);
  const [activeChatJid, setActiveChatJid] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chatDetails, setChatDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [mutatingLabelId, setMutatingLabelId] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [recorderError, setRecorderError] = useState('');
  const threadRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordingFinalizeModeRef = useRef('preview');
  const recordingFinalizeResolverRef = useRef(null);

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

  const loadChatDetails = async (chatJid) => {
    if (!chatJid) {
      setChatDetails(null);
      setDetailsError('');
      return;
    }

    setLoadingDetails(true);
    setDetailsError('');

    try {
      const response = await fetch(
        `/api/inbox/chats/${encodeURIComponent(chatJid)}/details`,
        { cache: 'no-store' },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Falha ao carregar detalhes do contato.');
      }

      setChatDetails({
        chat: data.chat,
        firstMessage: data.firstMessage,
        labels: data.labels ?? [],
        availableLabels: data.availableLabels ?? [],
      });
    } catch (error) {
      setChatDetails(null);
      setDetailsError(
        error instanceof Error
          ? error.message
          : 'Falha ao carregar detalhes do contato.',
      );
    } finally {
      setLoadingDetails(false);
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
    if (!isRecording) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRecordingSeconds(
        Math.max(0, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)),
      );
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        recordingFinalizeModeRef.current = 'discard';
        recordingFinalizeResolverRef.current = null;
        mediaRecorderRef.current.stop();
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      if (recordedAudio?.url) {
        URL.revokeObjectURL(recordedAudio.url);
      }
    };
  }, [recordedAudio]);

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
    setSelectedLabelId('');
    setNewLabelName('');

    if (!detailsOpen) {
      return;
    }

    void loadChatDetails(activeChatJid);
  }, [activeChatJid, detailsOpen]);

  useEffect(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      recordingFinalizeModeRef.current = 'discard';
      recordingFinalizeResolverRef.current = null;
      mediaRecorderRef.current.stop();
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = 0;
    setIsRecording(false);
    setRecordingSeconds(0);
    setRecorderError('');
    setRecordedAudio((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
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
        await Promise.all([
          loadMessages(activeChatJid),
          detailsOpen ? loadChatDetails(activeChatJid) : Promise.resolve(),
        ]);
      }
    };

    events.addEventListener('inbox', () => {
      void refresh();
    });

    return () => {
      events.close();
    };
  }, [activeChatJid, detailsOpen]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return chats;
    }

    return chats.filter((chat) =>
      [chat.title, chat.subtitle, chat.formattedPhoneNumber, chat.lastMessagePreview, chat.chatJid]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [chats, search]);

  const activeChat =
    chats.find((chat) => chat.chatJid === activeChatJid) ?? filteredChats[0] ?? null;
  const isComposerRecorderActive = isRecording || Boolean(recordedAudio);
  const hasTextPayload = Boolean(composer.trim());

  const clearRecordedAudio = () => {
    setRecordedAudio((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
  };

  const closeDetailsDrawer = () => {
    setDetailsOpen(false);
    setSelectedLabelId('');
    setNewLabelName('');
    setDetailsError('');
  };

  const mutateChatLabel = async ({ labelId, action }) => {
    if (!activeChat?.chatJid || !labelId) {
      return;
    }

    setMutatingLabelId(labelId);
    setDetailsError('');

    try {
      const response = await fetch(
        `/api/inbox/chats/${encodeURIComponent(activeChat.chatJid)}/labels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action, labelId }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Falha ao atualizar a etiqueta.');
      }

      setSelectedLabelId('');
      await loadChatDetails(activeChat.chatJid);
      await loadChats();
    } catch (error) {
      setDetailsError(
        error instanceof Error
          ? error.message
          : 'Falha ao atualizar a etiqueta.',
      );
    } finally {
      setMutatingLabelId('');
    }
  };

  const createLocalChatLabel = async () => {
    if (!activeChat?.chatJid || !newLabelName.trim()) {
      return;
    }

    setMutatingLabelId('__create__');
    setDetailsError('');

    try {
      const response = await fetch(
        `/api/inbox/chats/${encodeURIComponent(activeChat.chatJid)}/labels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            name: newLabelName.trim(),
            assignToChat: true,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Falha ao criar a etiqueta.');
      }

      setNewLabelName('');
      setSelectedLabelId('');
      await loadChatDetails(activeChat.chatJid);
      await loadChats();
    } catch (error) {
      setDetailsError(
        error instanceof Error ? error.message : 'Falha ao criar a etiqueta.',
      );
    } finally {
      setMutatingLabelId('');
    }
  };

  const sendAudioPayload = async (audio) => {
    if (!activeChat || !audio) {
      return;
    }

    const formData = new FormData();
    formData.append('chatJid', activeChat.chatJid);
    formData.append(
      'audio',
      audio.blob,
      `voice-note.${audio.mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
    );
    formData.append('durationSeconds', String(audio.durationSeconds ?? 0));

    const response = await fetch('/api/inbox/send', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? 'Falha ao enviar o audio.');
    }
  };

  const sendTextPayload = async (text) => {
    if (!activeChat || !text) {
      return;
    }

    const response = await fetch('/api/inbox/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatJid: activeChat.chatJid,
        text,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? 'Falha ao enviar a mensagem.');
    }
  };

  const startRecording = async () => {
    if (!activeChat) {
      return;
    }

    setRecorderError('');
    clearRecordedAudio();

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setRecorderError('Este navegador nao suporta gravacao de audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      recordingFinalizeModeRef.current = 'preview';
      recordingFinalizeResolverRef.current = null;
      setRecordingSeconds(0);

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const finalizeMode = recordingFinalizeModeRef.current || 'preview';
        const resolveFinalize = recordingFinalizeResolverRef.current;
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
        );

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });

        recordingChunksRef.current = [];
        setIsRecording(false);
        setRecordingSeconds(0);
        recordingFinalizeModeRef.current = 'preview';
        recordingFinalizeResolverRef.current = null;

        if (!blob.size) {
          setRecorderError('Nao foi possivel capturar o audio.');
          resolveFinalize?.(null);
          return;
        }

        if (finalizeMode === 'discard') {
          resolveFinalize?.(null);
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const nextAudio = {
          blob,
          url: objectUrl,
          mimeType: blob.type || recorder.mimeType || mimeType || 'audio/webm',
          durationSeconds,
        };

        setRecordedAudio((current) => {
          if (current?.url) {
            URL.revokeObjectURL(current.url);
          }

          return nextAudio;
        });

        resolveFinalize?.(nextAudio);
      });

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setRecorderError(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel iniciar a gravacao.',
      );
    }
  };

  const finalizeRecording = async (mode = 'preview') => {
    if (mediaRecorderRef.current?.state !== 'recording') {
      return mode === 'discard' ? null : recordedAudio;
    }

    recordingFinalizeModeRef.current = mode;

    return new Promise((resolve) => {
      recordingFinalizeResolverRef.current = resolve;
      mediaRecorderRef.current.stop();
    });
  };

  const pauseRecording = async () => {
    setRecorderError('');
    await finalizeRecording('preview');
  };

  const discardCurrentAudio = async () => {
    setRecorderError('');

    if (isRecording) {
      await finalizeRecording('discard');
      return;
    }

    clearRecordedAudio();
  };

  const sendCurrentAudio = async () => {
    if (!activeChat) {
      return;
    }

    setRecorderError('');
    setSending(true);

    try {
      const audio = isRecording
        ? await finalizeRecording('send')
        : recordedAudio;

      if (!audio) {
        return;
      }

      await sendAudioPayload(audio);
      clearRecordedAudio();
      await loadChats();
      await loadMessages(activeChat.chatJid);
    } catch (error) {
      setRecorderError(
        error instanceof Error ? error.message : 'Nao foi possivel enviar.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    const text = composer.trim();

    if (!activeChat || isRecording) {
      return;
    }

    setRecorderError('');
    setSending(true);

    try {
      if (recordedAudio) {
        await sendAudioPayload(recordedAudio);
        clearRecordedAudio();
      } else {
        if (!text) {
          return;
        }

        await sendTextPayload(text);
        setComposer('');
      }

      await loadChats();
      await loadMessages(activeChat.chatJid);
    } catch (error) {
      setRecorderError(
        error instanceof Error ? error.message : 'Nao foi possivel enviar.',
      );
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

      <section className={`wa-panel ${detailsOpen ? 'wa-panel-drawer-open' : ''}`}>
        {activeChat ? (
          <>
            <header className="wa-chat-header">
              <button
                type="button"
                className="wa-chat-header-trigger"
                onClick={() => setDetailsOpen(true)}
              >
                <div className="wa-avatar wa-avatar-header">
                  <Avatar title={activeChat.title} url={activeChat.avatarUrl} />
                </div>

                <div className="wa-chat-header-main">
                  <strong>{activeChat.title}</strong>
                  <p>
                    {activeChat.subtitle ||
                      (activeChat.chatType === 'group'
                        ? 'Grupo do WhatsApp'
                        : 'Contato do WhatsApp')}
                  </p>
                </div>
              </button>
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
                      chat={activeChat}
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
              {recorderError ? (
                <p className="wa-composer-error">{recorderError}</p>
              ) : null}

              {isComposerRecorderActive ? (
                <ComposerRecorderDock
                  isRecording={isRecording}
                  audio={recordedAudio}
                  recordingSeconds={recordingSeconds}
                  sending={sending}
                  onDiscard={() => {
                    void discardCurrentAudio();
                  }}
                  onPauseRecording={() => {
                    void pauseRecording();
                  }}
                  onSend={() => {
                    void sendCurrentAudio();
                  }}
                />
              ) : (
                <div className="wa-composer-controls">
                  <button
                    type="button"
                    className="wa-composer-icon-button wa-composer-attach-button"
                    aria-label="Adicionar anexo"
                  >
                    <span className="wa-composer-plus-icon" aria-hidden="true">
                      +
                    </span>
                  </button>

                  <div className="wa-composer-input-shell">
                    <input
                      type="text"
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      placeholder="Digite uma mensagem"
                    />

                    <button
                      type="button"
                      className="wa-composer-icon-button wa-composer-emoji-button"
                      aria-label="Abrir emojis"
                    >
                      <span className="wa-composer-emoji-icon" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type={hasTextPayload ? 'submit' : 'button'}
                    className="wa-composer-icon-button wa-composer-primary-button"
                    onClick={
                      hasTextPayload
                        ? undefined
                        : () => void startRecording()
                    }
                    disabled={sending}
                    aria-label={hasTextPayload ? 'Enviar mensagem' : 'Gravar audio'}
                  >
                    <span
                      className={
                        hasTextPayload
                          ? 'wa-composer-send-icon'
                          : 'wa-composer-mic-icon'
                      }
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </form>

            {detailsOpen ? (
              <ChatDetailsDrawer
                activeChat={activeChat}
                details={chatDetails}
                loading={loadingDetails}
                error={detailsError}
                selectedLabelId={selectedLabelId}
                onSelectLabel={setSelectedLabelId}
                onAddLabel={() =>
                  void mutateChatLabel({
                    labelId: selectedLabelId,
                    action: 'add',
                  })
                }
                onRemoveLabel={(labelId) =>
                  void mutateChatLabel({
                    labelId,
                    action: 'remove',
                  })
                }
                newLabelName={newLabelName}
                onNewLabelNameChange={setNewLabelName}
                onCreateLabel={() => void createLocalChatLabel()}
                onClose={closeDetailsDrawer}
                mutatingLabelId={mutatingLabelId}
              />
            ) : null}
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
