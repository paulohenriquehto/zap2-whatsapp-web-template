import path from 'node:path';

import { WhatsAppGateway } from './whatsapp-gateway.js';

const globalState = globalThis;

export const getWhatsAppGateway = () => {
  if (!globalState.__zap2Gateway) {
    const gateway = new WhatsAppGateway({
      authFolder: path.resolve(process.cwd(), '.auth/baileys'),
    });

    globalState.__zap2Gateway = gateway;
    void gateway.start();
  }

  return globalState.__zap2Gateway;
};
