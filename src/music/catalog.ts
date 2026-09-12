export const MUSIC_SERVER = 'tencent'
export const MUSIC_PLAYLIST_ID = '9619599108'
export const MUSIC_PLAYLIST_URL = `https://y.qq.com/n/ryqq/playlist/${MUSIC_PLAYLIST_ID}`
export const MUSIC_PLAYLIST_API = `https://music.3e0.cn/?server=${MUSIC_SERVER}&type=playlist&id=${MUSIC_PLAYLIST_ID}`

export const CDN_AUDIO_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  'tencent:000DNTXj0gJF8O':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E9%A9%AC%E4%B9%9F_Crabbit%20Cole%E5%85%88%E7%94%9F-%E6%B5%B7%E5%B1%BF%E4%BD%A0.mp3',
  'tencent:003lWqv52x5LTX':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E8%BD%AC%E5%B9%B4%E8%BD%AE-joysaaaa.mp3',
  'tencent:003TKeig0mQSE4':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%88%91%E8%BF%98%E6%98%AF%E6%83%B3%E5%86%8D%E9%97%AE%E4%BD%A0-%E4%BA%8E%E7%9D%BF%E8%BF%AA.mp3',
  'tencent:003Hqdah3PCoMh':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%A2%A6-%E6%B8%A9%E8%88%92%E5%A8%B4.mp3',
  'tencent:002TPhYX0GXc9i':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E9%9B%A8%E6%95%A3-%E4%BD%A0%E7%9A%84%E6%98%9F%E5%86%B0%E4%B9%90.mp3',
  'tencent:001m9RzL40omqi':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/I%20Will%20Never%20Let%20You%20Down-Rita%20Ora.mp3',
  'tencent:003DDwAx2tCXWn':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%80%8E%E4%B9%88%E5%94%B1%E6%83%85%E6%AD%8C-%E5%88%98%E6%83%9C%E5%90%9B.mp3',
  'tencent:003N7qbb2oHqUk':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%99%9A%E9%A3%8E%E5%BF%83%E9%87%8C%E5%90%B9-%E9%98%BF%E6%A2%A8%E7%B2%A4.mp3',
  'tencent:001SkJMR3SWoS3':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E4%B8%8D%E8%AF%B4%20(%E8%B7%AF%E8%BF%87%E7%89%88)-%E6%9D%8E%E8%8D%A3%E6%B5%A9.mp3',
  'tencent:0005V86C0UqNOW':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E7%BB%9D%E5%8F%A3%E4%B8%8D%E6%8F%90-ycccc.mp3',
  'tencent:0034AJQi1wsM1r':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%97%A0%E6%9D%A1%E4%BB%B6%E4%B8%BA%E4%BD%A0-%E6%A2%81%E9%9D%99%E8%8C%B9.mp3',
  'tencent:002TuiTx2Xh6oN':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E4%B8%8D%E5%8F%AF%E8%83%BD%E4%BA%8B%E4%BB%B6-joysaaaa.mp3',
  'tencent:003qVhV91cj03R':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E5%9C%86%20(Time%20After%20Time)-BoA.WENDY.NINGNING.mp3',
  'tencent:0047tzaU3jweDH':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%88%91%E5%8F%AA%E5%9C%A8%E4%B9%8E%E4%BD%A0-%E9%82%93%E4%B8%BD%E5%90%9B.mp3',
  'tencent:004Jl2Xh1rFBna':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%98%9F%E8%90%BD-%E4%B8%81%E6%BA%AA.mp3',
  'tencent:003piM753uRsvW':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%B2%A1%E7%A6%BB%E5%BC%80%E8%BF%87-%E6%9E%97%E5%BF%97%E7%82%AB.mp3',
  'tencent:004EEOpH27pnbB':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%82%B2%E6%83%85%E4%BA%BA%E7%89%A9-%E9%99%88%E5%B0%8F%E6%BB%A1.%E5%BA%84%E6%B7%87%E7%8E%9F29.mp3',
  'tencent:003cSLOO35W3yP':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E7%89%B9%E5%88%AB%E7%9A%84%E4%BA%BA-%E6%96%B9%E5%A4%A7%E5%90%8C.mp3',
  'tencent:004VIIJe2DmQqt':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%97%A0%E4%BA%BA%E6%B5%B7-%E8%8B%8F%E6%99%97.mp3',
  'tencent:0029vb0r2T9PE4':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E8%B7%B3%E6%A5%BC%E6%9C%BA-LBI%E5%88%A9%E6%AF%94.mp3',
  'tencent:002nraBm3LhdUm':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/PLAYING%20WITH%20FIRE%20(%EB%B6%88%EC%9E%A5%EB%82%9C)-BLACKPINK.mp3',
  'tencent:003mVERF2THBiE':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/MOONLIGHT-HENRY%E5%88%98%E5%AE%AA%E5%8D%8E.mp3',
  'tencent:0038HM2J2C2T36':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E8%90%BD%E5%9C%A8%E7%94%9F%E5%91%BD%E9%87%8C%E7%9A%84%E5%85%89-%E5%B0%B9%E6%98%94%E7%9C%A0.mp3',
  'tencent:00333VYG3eXFtv':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%B7%B1%E9%99%A2%E5%A4%96-%E9%98%BFYueYue.%E6%88%BE%E6%A0%BC.%E5%B0%8F%E7%94%B0%E9%9F%B3%E4%B9%90%E7%A4%BE.mp3',
  'tencent:003lx2pR2PeOPi':
    'https://cdn.tungchiahui.cn/tungwebsite/assets/music/%E6%99%B4%E5%A4%A9%E4%B8%8B%E9%9B%A8-ATK.%E6%A9%99%E6%B1%81.P40%E6%9E%97%E5%BA%B7%E9%89%B4.mp3',
})
