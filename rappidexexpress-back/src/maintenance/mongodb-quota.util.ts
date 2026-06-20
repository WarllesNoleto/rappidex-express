export function isMongoQuotaError(error: any) {
  const message = String(error?.message || error?.errmsg || '').toLowerCase();
  return (
    message.includes('over your space quota') ||
    message.includes('writes are blocked') ||
    (message.includes('quota') && message.includes('blocked'))
  );
}

export function mongoQuotaFriendlyMessage() {
  return 'O MongoDB Atlas atingiu o limite de armazenamento do plano atual e bloqueou gravações. Execute o diagnóstico/limpeza administrativa de eventos antigos antes de tentar novamente.';
}
