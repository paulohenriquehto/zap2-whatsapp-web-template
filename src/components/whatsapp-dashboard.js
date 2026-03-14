'use client';

import { useEffect, useState } from 'react';

import { WhatsAppInbox } from './whatsapp-inbox.js';
import { WhatsAppPairing } from './whatsapp-pairing.js';

const titleByStatus = {
  idle: 'Preparando ambiente',
  connecting: 'Conectando ao WhatsApp',
  qr_ready: 'Escaneie para conectar',
  connected: 'Dispositivo conectado',
  reconnecting: 'Reconectando',
  logged_out: 'Sessao desconectada',
  error: 'Falha na conexao',
};

const initialState = {
  status: 'idle',
  headline: titleByStatus.idle,
  detail: 'Inicializando o canal com o WhatsApp.',
  qrCodeDataUrl: null,
  updatedAt: null,
};

export function WhatsAppDashboard() {
  const [snapshot, setSnapshot] = useState(initialState);

  useEffect(() => {
    let mounted = true;
    const events = new EventSource('/api/events');

    const loadInitialSnapshot = async () => {
      const response = await fetch('/api/session', { cache: 'no-store' });
      const data = await response.json();

      if (mounted) {
        setSnapshot(data);
      }
    };

    void loadInitialSnapshot();

    events.addEventListener('session', (event) => {
      if (mounted) {
        setSnapshot(JSON.parse(event.data));
      }
    });

    return () => {
      mounted = false;
      events.close();
    };
  }, []);

  const headline = snapshot.headline ?? titleByStatus[snapshot.status];
  const resolvedSnapshot = {
    ...snapshot,
    headline,
  };

  if (snapshot.status === 'connected') {
    return <WhatsAppInbox session={resolvedSnapshot} />;
  }

  return <WhatsAppPairing snapshot={resolvedSnapshot} />;
}
