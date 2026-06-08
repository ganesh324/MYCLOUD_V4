export const getRegisteredDevice = () => {
  const storageKey = 'mycloud_device_id';
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    const randomBytes = new Uint8Array(16);
    window.crypto?.getRandomValues?.(randomBytes);
    const randomPart = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`;
    deviceId = `browser-${randomPart}`;
    localStorage.setItem(storageKey, deviceId);
  }
  return {
    device_id: deviceId,
    device_label: navigator.platform || 'Browser device',
    device_user_agent: navigator.userAgent || 'Unknown browser'
  };
};
