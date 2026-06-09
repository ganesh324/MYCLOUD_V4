export const getFileExtension = (item = {}) => {
  const source = item.name || item.path || '';
  const dotIndex = source.lastIndexOf('.');
  return dotIndex >= 0 ? source.slice(dotIndex + 1).toLowerCase() : '';
};

export const isFullPreviewImageItem = (item = {}) => {
  if (item.type !== 'Image') return false;
  const ext = getFileExtension(item);
  return !['ico', 'icns', 'svg'].includes(ext);
};
