import { useEffect, useState } from 'react';

// A clip counts as available only when the server returns a video. Dev servers often answer a missing file
// with the app's HTML page, so a 200 status alone is not enough.
export async function probeClip(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('video/');
  } catch {
    return false;
  }
}

// Returns { [path]: true | false }. A path is missing from the result until its check has finished.
export default function useClipAvailability(paths) {
  const key = [...new Set(paths)].join('|');
  const [status, setStatus] = useState({});

  useEffect(() => {
    let active = true;
    const list = key ? key.split('|') : [];
    Promise.all(list.map(async (path) => [path, await probeClip(path)])).then((entries) => {
      if (active) setStatus(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [key]);

  return status;
}
