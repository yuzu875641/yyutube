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
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            data = await response.json();
            console.log(`Successfully fetched from ${baseUrl}`);
            break;
        } catch (err) {
            console.error(`Error fetching from ${baseUrl}:`, err.message);
        }
    }
    if (!data) {
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
        const videoData = await fetchData(`videos/${videoId}`);
        const commentsData = await fetchData(`comments/${videoId}`);

        // ----------------------------------------------------
        // 動画埋め込み用の初期ストリームを選択 (formatStreamsを優先)
        // ----------------------------------------------------
        let initialStream = null;

        // まず formatStreams から映像と音声が統合されたMP4ストリームを探す
        if (videoData.formatStreams && videoData.formatStreams.length > 0) {
            initialStream = videoData.formatStreams.find(stream =>
                stream.container === 'mp4' && stream.url && stream.qualityLabel
            );
        }

        // formatStreams に適切なものがなければ、adaptiveFormats から探す
        // ここでは映像と音声が分離されていない（=統合されている可能性が高い）MP4を優先
        if (!initialStream && videoData.adaptiveFormats && videoData.adaptiveFormats.length > 0) {
            initialStream = videoData.adaptiveFormats.find(stream =>
                stream.container === 'mp4' && stream.url && stream.qualityLabel && !stream.audioQuality
            );
        }

        // 最終的に見つからなければ、利用可能な最初のストリームをフォールバックとして使用
        if (!initialStream) {
             const allAvailableStreams = [
                ...(videoData.formatStreams || []),
                ...(videoData.adaptiveFormats || [])
            ].filter(stream => stream.url && stream.qualityLabel)
             .sort((a, b) => {
                const aRes = parseInt(a.resolution?.replace('p', '') || '0', 10);
                const bRes = parseInt(b.resolution?.replace('p', '') || '0', 10);
                return bRes - aRes;
            });
            initialStream = allAvailableStreams[0];
        }

        // ----------------------------------------------------
        // 画質選択ドロップダウン用のストリームリストを作成
        // (adaptiveFormats と formatStreams の両方から、映像を含むものを集める)
        // ----------------------------------------------------
        const videoStreams = [
            ...(videoData.formatStreams || []),
            ...(videoData.adaptiveFormats || [])
        ].filter(stream => 
            stream.qualityLabel && stream.url && stream.type.startsWith('video/')
        ) // 映像ストリームのみをフィルタリング
         .sort((a, b) => {
            const aRes = parseInt(a.resolution?.replace('p', '') || '0', 10);
            const bRes = parseInt(b.resolution?.replace('p', '') || '0', 10);
            return bRes - aRes;
        });

        if (!initialStream) {
            // initialStreamがどうしても見つからなかった場合のエラーハンドリング
            throw new Error('No suitable video stream found for playback.');
        }

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
