const FALLBACK = {
  roomName: 'couple-room',
  chatPasswordRequired: false,
  turnMode: 'none'
};

export async function loadConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    return Object.assign({}, FALLBACK, data);
  } catch (e) {
    return FALLBACK;
  }
}
