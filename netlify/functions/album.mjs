import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const { DRIVE_API_KEY: apiKey, DRIVE_FOLDER_ID: folderId, DRIVE_RESOURCE_KEY: resourceKey, PORT = '4173', HOST = '127.0.0.1' } = process.env;
if (!apiKey || !/^[\w-]+$/.test(folderId ?? '')) {
  throw new Error('Configure DRIVE_API_KEY e DRIVE_FOLDER_ID no ambiente do servidor.');
}

const root = { id: folderId, resourceKey };
const key = createHash('sha256').update(apiKey).update(':').update(folderId).digest();
const imageFilter = "mimeType contains 'image/' and mimeType != 'image/svg+xml'";

async function drive(path, params, file) {
  const url = new URL('https://www.googleapis.com/drive/v3/files' + path);
  url.search = new URLSearchParams({ ...params, supportsAllDrives: 'true' });
  const headers = { 'X-Goog-Api-Key': apiKey };
  if (file?.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = file.id + '/' + file.resourceKey;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Drive respondeu com status ' + response.status);
  return response;
}

async function children(folder, filter, first = false) {
  const files = [];
  let pageToken = '';
  do {
    const result = await drive('', {
      q: "'" + folder.id + "' in parents and trashed = false and " + filter,
      fields: 'nextPageToken,files(id,name,resourceKey)',
      orderBy: 'name_natural',
      includeItemsFromAllDrives: 'true',
      pageSize: first ? '1' : '100',
      ...(pageToken && { pageToken }),
    }, folder);
    const data = await result.json();
    files.push(...data.files ?? []);
    pageToken = data.nextPageToken;
  } while (pageToken && (!first || !files.length));
  return files;
}

function albumId(folder) {
  return createHmac('sha256', key).update(folder.id).digest('base64url');
}

function photoId(file) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ id: file.id, resourceKey: file.resourceKey })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function readPhoto(token) {
  try {
    if (!/^[\w-]{40,1024}$/.test(token)) return null;
    const bytes = Buffer.from(token, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]));
  } catch {
    return null;
  }
}

function json(response, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function serve(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Método indisponível' });
  const { pathname } = new URL(request.url, 'http://localhost');

  if (pathname === '/api/albums' || pathname.startsWith('/api/albums/')) {
    const folders = await children(root, "mimeType = 'application/vnd.google-apps.folder'");
    if (pathname === '/api/albums') {
      const albums = await Promise.all(folders.map(async (folder) => {
        const [cover] = await children(folder, imageFilter, true);
        return { id: albumId(folder), name: folder.name, cover: cover ? { id: photoId(cover) } : null };
      }));
      return json(response, 200, albums);
    }
    const folder = folders.find((item) => albumId(item) === pathname.slice('/api/albums/'.length));
    if (!folder) return json(response, 404, { error: 'Álbum indisponível' });
    const photos = await children(folder, imageFilter);
    return json(response, 200, photos.map((file) => ({ id: photoId(file) })));
  }
  if (pathname.startsWith('/api/photo/')) {
    const file = readPhoto(pathname.slice('/api/photo/'.length));
    if (!file) return json(response, 404, { error: 'Foto indisponível' });
    const image = await drive('/' + encodeURIComponent(file.id), { alt: 'media' }, file);
    const type = image.headers.get('content-type')?.split(';')[0];
    if (!type?.startsWith('image/') || type === 'image/svg+xml') {
      await image.body?.cancel();
      return json(response, 415, { error: 'Formato indisponível' });
    }
    return new Response(image.body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return json(response, 404, { error: 'Página indisponível' });
}

export default async function handler(request) {
  try {
    return await serve(request);
  } catch {
    return json(null, 502, { error: 'Não foi possível carregar o Google Drive.' });
  }
}

export const config = { path: '/api/*' };
