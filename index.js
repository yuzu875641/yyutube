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
        const [videoData, commentsData] = await Promise.all([
            fetchData(`videos/${videoId}`),
            fetchData(`comments/${videoId}`)
        ]);

        let initialStream = null;

        // ----------------------------------------------------
        // 1. 最優先: formatStreams (映像・音声統合) の最初のものを初期ストリームとする
        // ----------------------------------------------------
        if (videoData.formatStreams && videoData.formatStreams.length > 0) {
            // URLを持つ最初のストリームを選択
            initialStream = videoData.formatStreams.find(stream => stream.url);
        }

        // ----------------------------------------------------
        // 2. 画質選択ドロップダウン用のストリームリストを作成
        // ----------------------------------------------------
        // adaptiveFormats (映像のみ/音声のみ) と formatStreams (統合) の両方から、
        // 映像を含むものを集めて高解像度順にソート
        const videoStreams = [
            ...(videoData.formatStreams || []),
            ...(videoData.adaptiveFormats || [])
        ].filter(stream => 
            stream.qualityLabel && stream.url && (stream.type.startsWith('video/') || stream.type.includes('video/'))
        )
         .sort((a, b) => {
            const aRes = parseInt(a.resolution?.replace('p', '') || '0', 10);
            const bRes = parseInt(b.resolution?.replace('p', '') || '0', 10);
            return bRes - aRes;
        });

        // ----------------------------------------------------
        // 3. initialStreamがまだ見つからない場合（フォールバック）
        // ----------------------------------------------------
        if (!initialStream && videoStreams.length > 0) {
             // 映像を含むストリームの中から最も高画質なものをフォールバックとして選択
            initialStream = videoStreams[0];
        }

        if (!initialStream) {
            throw new Error('No suitable video stream found for playback.');
        }
        
        // EJSテンプレートに渡す
        res.render('video', {
            title: videoData.title,
            videoData: videoData,
            initialStream: initialStream,
            videoStreams: videoStreams,
            commentsData: commentsData
        });
    } catch (error) {
        console.error('Video page error:', error);
        res.status(500).render('error', { title: 'エラー', message: `動画の読み込み中に問題が発生しました: ${error.message}` });
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
