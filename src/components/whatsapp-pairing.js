const placeholderByStatus = {
  connected: 'Sessao ativa. Nenhum QR code e necessario.',
  logged_out:
    'A sessao foi encerrada. Reinicie a aplicacao para gerar novo pareamento.',
  error: 'A conexao falhou. O sistema tentara novamente automaticamente.',
};

const formatTimestamp = (value) => {
  if (!value) {
    return 'Atualizacao em tempo real habilitada';
  }

  return `Ultima atualizacao as ${new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
};

export function WhatsAppPairing({ snapshot }) {
  const placeholderMessage =
    placeholderByStatus[snapshot.status] ?? 'Aguardando QR code';

  return (
    <main className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <h1>Zap2 Connect</h1>
        </div>
      </header>

      <section className="login-card">
        <div className="login-copy">
          <p className="eyebrow">Acesso rapido</p>
          <h2>{snapshot.headline}</h2>
          <p className="supporting-text">{snapshot.detail}</p>

          <ol className="steps">
            <li>
              <span>Abra o WhatsApp no seu telefone.</span>
            </li>
            <li>
              <span>
                Entre em <strong>Dispositivos conectados</strong>.
              </span>
            </li>
            <li>
              <span>Escaneie o QR code exibido nesta tela.</span>
            </li>
          </ol>

          <div className="persist-box">
            <div className="persist-check" aria-hidden="true">
              ✓
            </div>
            <div>
              <strong>Sessao salva neste servidor</strong>
              <p>
                Enquanto as credenciais forem validas, o pareamento nao precisa
                ser repetido.
              </p>
            </div>
          </div>
        </div>

        <div className="qr-panel">
          <div className="qr-frame">
            {snapshot.qrCodeDataUrl ? (
              <img
                id="qr-image"
                src={snapshot.qrCodeDataUrl}
                alt="QR code do WhatsApp"
              />
            ) : (
              <div className="qr-placeholder">
                <div className="pulse-grid" aria-hidden="true" />
                <p>{placeholderMessage}</p>
              </div>
            )}
          </div>

          <div className="qr-meta">
            <p className="qr-meta-label">Estado da conexao</p>
            <p className="qr-meta-value">{snapshot.headline}</p>
            <p className="qr-meta-footnote">
              {formatTimestamp(snapshot.updatedAt)}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
