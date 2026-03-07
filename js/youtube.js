/* ============================================
   YouTube Data API Module
   ============================================ */

const YouTubeAPI = (() => {

  // Extract playlist ID from various URL formats
  function extractPlaylistId(url) {
    const patterns = [
      /[?&]list=([a-zA-Z0-9_-]+)/,
      /playlist\?list=([a-zA-Z0-9_-]+)/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  // Parse ISO 8601 duration (PT1H23M45S → seconds)
  function parseDuration(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    const h = parseInt(m[1] || 0);
    const min = parseInt(m[2] || 0);
    const s = parseInt(m[3] || 0);
    return h * 3600 + min * 60 + s;
  }

  // Format seconds to human-readable string
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatHoursMinutes(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  // Check API response for quota/error issues
  function checkApiError(data) {
    if (data.error) {
      if (data.error.code === 403 && data.error.errors && data.error.errors[0]?.reason === 'quotaExceeded') {
        throw new Error('YouTube API daily quota exceeded. Please try again tomorrow or use a different API key.');
      }
      throw new Error(data.error.message || `YouTube API error (${data.error.code})`);
    }
  }

  // Fetch playlist info (title, thumbnail)
  async function fetchPlaylistInfo(playlistId) {
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      checkApiError(errData);
      throw new Error('Failed to fetch playlist info');
    }
    const data = await res.json();
    checkApiError(data);
    if (!data.items || data.items.length === 0) throw new Error('Playlist not found or is private');
    const item = data.items[0];
    return {
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ''
    };
  }

  // Fetch all video IDs from a playlist (handles pagination)
  async function fetchPlaylistItems(playlistId) {
    const items = [];
    let pageToken = '';

    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        checkApiError(errData);
        throw new Error('Failed to fetch playlist items');
      }
      const data = await res.json();
      checkApiError(data);

      for (const item of data.items) {
        if (item.snippet.title === 'Private video' || item.snippet.title === 'Deleted video') continue;
        items.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
          position: item.snippet.position
        });
      }

      pageToken = data.nextPageToken || '';
    } while (pageToken);

    return items;
  }

  // Fetch video durations in bulk (max 50 per call)
  async function fetchVideoDurations(videoIds) {
    const durations = {};
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      chunks.push(videoIds.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const ids = chunk.join(',');
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        checkApiError(errData);
        throw new Error('Failed to fetch video details');
      }
      const data = await res.json();
      checkApiError(data);
      for (const item of data.items) {
        durations[item.id] = parseDuration(item.contentDetails.duration);
      }
    }

    return durations;
  }

  // Complete workflow: fetch playlist + videos + durations
  // Accepts either a full URL or a raw playlist ID
  async function fetchFullPlaylist(playlistUrlOrId) {
    const playlistId = extractPlaylistId(playlistUrlOrId) || playlistUrlOrId;
    if (!playlistId) throw new Error('Invalid playlist URL');

    const info = await fetchPlaylistInfo(playlistId);
    const items = await fetchPlaylistItems(playlistId);

    if (items.length === 0) throw new Error('No videos found in this playlist');

    const videoIds = items.map(i => i.videoId);
    const durations = await fetchVideoDurations(videoIds);

    const videos = items.map(item => ({
      ...item,
      duration: durations[item.videoId] || 0,
      durationStr: formatDuration(durations[item.videoId] || 0)
    }));

    const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);

    return {
      playlistId,
      title: info.title,
      thumbnail: info.thumbnail,
      totalVideos: videos.length,
      totalDuration,
      totalDurationStr: formatHoursMinutes(totalDuration),
      videos
    };
  }

  return {
    extractPlaylistId,
    parseDuration,
    formatDuration,
    formatHoursMinutes,
    fetchFullPlaylist
  };
})();
