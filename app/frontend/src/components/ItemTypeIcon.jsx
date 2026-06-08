import folderIconUrl from '../assets/file-icons/folder.svg';
import imageFileIconUrl from '../assets/file-icons/image.svg';
import videoFileIconUrl from '../assets/file-icons/video.svg';
import audioFileIconUrl from '../assets/file-icons/audio.svg';
import pdfFileIconUrl from '../assets/file-icons/pdf.svg';
import documentFileIconUrl from '../assets/file-icons/document.svg';
import wordFileIconUrl from '../assets/file-icons/word.svg';
import tableFileIconUrl from '../assets/file-icons/table.svg';
import powerpointFileIconUrl from '../assets/file-icons/powerpoint.svg';
import databaseFileIconUrl from '../assets/file-icons/database.svg';
import archiveFileIconUrl from '../assets/file-icons/zip.svg';
import genericFileIconUrl from '../assets/file-icons/file.svg';

export const getFileExtension = (item = {}) => {
  const source = item.name || item.path || '';
  const dotIndex = source.lastIndexOf('.');
  return dotIndex >= 0 ? source.slice(dotIndex + 1).toLowerCase() : '';
};

const isArchiveItem = (item = {}) => {
  const ext = getFileExtension(item);
  return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'].includes(ext);
};

const isPresentationItem = (item = {}) => {
  const ext = getFileExtension(item);
  return ['ppt', 'pptx', 'odp', 'key'].includes(ext);
};

const isOfficeDataItem = (item = {}) => {
  const ext = getFileExtension(item);
  return ['xml', 'sql', 'db', 'sqlite', 'sqlite3', 'parquet', 'avro'].includes(ext);
};

const isSpreadsheetItem = (item = {}) => {
  const ext = getFileExtension(item);
  return ['xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods', 'numbers'].includes(ext);
};

const isDocumentItem = (item = {}) => {
  const ext = getFileExtension(item);
  return item.type === 'Text' || ['doc', 'docx', 'rtf', 'odt', 'pages'].includes(ext);
};

export const isFullPreviewImageItem = (item = {}) => {
  if (item.type !== 'Image') return false;
  const ext = getFileExtension(item);
  return !['ico', 'icns', 'svg'].includes(ext);
};

const PackFileIcon = ({ src, size = 24, className = '', style }) => (
  <img
    src={src}
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', objectFit: 'contain', ...style }}
    aria-hidden="true"
    draggable="false"
    alt=""
  />
);

const GlossyFolderIcon = (props) => <PackFileIcon src={folderIconUrl} {...props} />;
const SpreadsheetFileIcon = (props) => <PackFileIcon src={tableFileIconUrl} {...props} />;
const PdfFileIcon = (props) => <PackFileIcon src={pdfFileIconUrl} {...props} />;
const ArchiveFileIcon = (props) => <PackFileIcon src={archiveFileIconUrl} {...props} />;
const PresentationFileIcon = (props) => <PackFileIcon src={powerpointFileIconUrl} {...props} />;
const OfficeDataFileIcon = (props) => <PackFileIcon src={databaseFileIconUrl} {...props} />;

const DocsFileIcon = (props) => {
  const ext = getFileExtension(props.item);
  return <PackFileIcon src={['doc', 'docx'].includes(ext) ? wordFileIconUrl : documentFileIconUrl} {...props} />;
};

const ItemTypeIcon = ({ item = {}, size = 20, className = '', style }) => {
  if (item.type === 'Folder') return <GlossyFolderIcon size={size} className={className} style={style} />;
  if (item.type === 'Image') return <PackFileIcon src={imageFileIconUrl} size={size} className={className} style={style} />;
  if (item.type === 'Video') return <PackFileIcon src={videoFileIconUrl} size={size} className={className} style={style} />;
  if (item.type === 'Music') return <PackFileIcon src={audioFileIconUrl} size={size} className={className} style={style} />;
  if (item.type === 'PDF') return <PdfFileIcon size={size} className={className} style={style} />;
  if (isArchiveItem(item)) return <ArchiveFileIcon size={size} className={className} style={style} />;
  if (isPresentationItem(item)) return <PresentationFileIcon size={size} className={className} style={style} />;
  if (isOfficeDataItem(item)) return <OfficeDataFileIcon size={size} className={className} style={style} />;
  if (isSpreadsheetItem(item)) return <SpreadsheetFileIcon size={size} className={className} style={style} />;
  if (isDocumentItem(item)) return <DocsFileIcon item={item} size={size} className={className} style={style} />;
  return <PackFileIcon src={genericFileIconUrl} size={size} className={className} style={style} />;
};

export default ItemTypeIcon;
