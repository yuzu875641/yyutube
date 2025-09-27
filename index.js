import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 3000;

// ESM環境で__dirnameをエミュレート
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 複数のInvidiousインスタンスURLを配列で管理
// 信頼性と可用性を向上させるために、複数のインスタンスを順番に試します
const INVIDIOUS_INSTANCES = [
  'https://invidious.reallyaweso.me',
  'https://iv.melmac.space',
  'https://inv.vern.cc',
  'https://y.com.sb',
  'https://invidious.nikkosphere.com',
  'https://yt.omada.cafe'
];

// EJSをテンプレートエンジンとして設定
app.set('view engine', 'ejs');
// viewsディレクトリを設定
app.set('views', path.join(__dirname, 'views'));
// 静的ファイル（CSSなど）を配信
// __dirnameを使用することで、実行ディレクトリに依存しない絶対パスを指定します
app.use(express.static(path.join(__dirname, 'public')));

// ヘルパー関数: 複数のインスタンスを試してデータを取得
async function fetchData(endpoint) {
    let data = null;
    for (const baseUrl of INVIDIOUS_INSTANCES) {
        try {
            const response = await fetch(`${baseUrl}/api/v1/${endpoint}`);
            if (!response.ok) {
                // HTTPエラーの場合、次のインスタンスを試す
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            data = await response.json();
            console.log(`Successfully fetched from ${baseUrl}`);
            break; // 成功したらループを抜ける
        } catch (err) {
            console.error(`Error fetching from ${baseUrl}:`, err.message);
        }
    }
    if (!data) {
        // すべてのインスタンスで失敗した場合
        throw new Error('All Invidious instances failed to respond.');
    }
    return data;
}

// ルート: トップページ
app.get('/', (req, res) => {
    res.render('index', { title: 'YouTube Clone' });
});

// ルート: 検索結果ページ
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.redirect('/');
    }

    try {
        const searchResults = await fetchData(`search?q=${encodeURIComponent(query)}`);
        res.render('results', {
            title: `"${query}" の検索結果`,
            query: query,
            results: searchResults
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).render('error', { title: 'エラー', message: '検索中に問題が発生しました。' });
    }
});

// ルート: 動画再生ページ
app.get('/watch', async (req, res) => {
    const videoId = req.query.v;
    if (!videoId) {
        return res.redirect('/');
    }

    try {
        // 動画情報とコメントを並行して取得
        const [videoData, commentsData] = await Promise.all([
            fetchData(`videos/${videoId}`),
            fetchData(`comments/${videoId}`)
        ]);

        // 動画ストリームをフィルタリング
        const videoStreams = [
            ...(videoData.adaptiveFormats || []),
            ...(videoData.formatStreams || [])
        ].filter(stream => stream.qualityLabel && stream.url)
         .sort((a, b) => {
            const aRes = parseInt(a.resolution?.replace('p', '') || '0', 10);
            const bRes = parseInt(b.resolution?.replace('p', '') || '0', 10);
            return bRes - aRes;
        });

        // 初回再生用のストリームを選択
        const initialStream = videoStreams.find(stream =>
            stream.container === 'mp4' && !stream.audioQuality
        ) || videoStreams[0];

        res.render('video', {
            title: videoData.title,
            videoData: videoData,
            initialStream: initialStream,
            videoStreams: videoStreams,
            commentsData: commentsData
        });
    } catch (error) {
        console.error('Video page error:', error);
        res.status(500).render('error', { title: 'エラー', message: '動画の読み込み中に問題が発生しました。' });
    }
});

// ルート: チャンネルページ
app.get('/channel', async (req, res) => {
    const channelId = req.query.id;
    if (!channelId) {
        return res.redirect('/');
    }

    try {
        const channelData = await fetchData(`channels/${channelId}`);
        res.render('channel', {
            title: channelData.author,
            channelData: channelData
        });
    } catch (error) {
        console.error('Channel page error:', error);
        res.status(500).render('error', { title: 'エラー', message: 'チャンネル情報の取得中に問題が発生しました。' });
    }
});

app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});
