// file: server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Innertube } = require('youtubei.js');
const ytpl = require('ytpl');

// InvidiousインスタンスのURLを配列で定義（順番に試すため、この順序が重要）
const invidiousUrls = [
  'https://invidious.reallyaweso.me',
  'https://iv.melmac.space',
  'https://inv.vern.cc',
  'https://y.com.sb',
  'https://invidious.nikkosphere.com',
  'https://yt.omada.cafe'
];

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 失敗したら次のURLを試すヘルパー関数
const fetchWithFallback = async (path) => {
    for (const baseUrl of invidiousUrls) {
        try {
            const url = `${baseUrl}${path}`;
            console.log(`Attempting to fetch from: ${url}`);
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch from ${baseUrl}:`, error.message);
            continue;
        }
    }
    throw new Error('すべてのInvidiousインスタンスからの取得に失敗しました。');
};

// API: 検索機能
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: '検索クエリが必要です。' });
        }
        const youtube = await Innertube.create();
        const searchResult = await youtube.search(query);
        res.json(searchResult);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: '検索中にエラーが発生しました。' });
    }
});

// API: プロキシ機能（Invidiousのブロック回避）
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URLパラメータが必要です。' });
    }
    try {
        const response = await axios.get(url, { responseType: 'stream' });
        Object.keys(response.headers).forEach(key => res.set(key, response.headers[key]));
        response.data.pipe(res);
    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json({ error: `ターゲットURLからエラーが返されました: ${error.response.statusText}` });
        } else {
            res.status(500).json({ error: 'プロキシリクエスト中にエラーが発生しました。', details: error.message });
        }
    }
});

// API: 動画情報取得（Invidious経由）
app.get('/api/video/:videoId', async (req, res) => {
    const { videoId } = req.params;
    try {
        const data = await fetchWithFallback(`/api/v1/videos/${videoId}`);
        if (data.recommendedVideos) {
            data.recommendedVideos = data.recommendedVideos.map(video => ({
                ...video,
                url: `/api/proxy?url=${video.url}`
            }));
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: '動画情報の取得に失敗しました。' });
    }
});

// API: プレイリスト情報取得
app.get('/api/playlist/:playlistId', async (req, res) => {
    const { playlistId } = req.params;
    try {
        const playlist = await ytpl(playlistId);
        res.json(playlist);
    } catch (error) {
        res.status(500).json({ error: 'プレイリスト情報の取得に失敗しました。' });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
