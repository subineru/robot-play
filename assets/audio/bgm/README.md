# External BGM Drop-in Directory (`assets/audio/bgm/`)

將客製化 `.ogg` / `.mp3` / `.wav` 音樂檔放進此資料夾後，只需於 [`game/shared/bgm_catalog.js`](../../../game/shared/bgm_catalog.js) 的 `BUILT_IN_BGM_TRACKS` 新增一筆條目即可出現在 `SYSTEM -> 音訊` 的選單與戰鬥曲目清單中：

```js
Object.freeze({
  id: 'my_custom_boss',
  context: 'combat', // 'menu' 或 'combat'
  type: 'file',
  url: 'my_custom_boss.ogg', // 相對於 assets/audio/bgm/
  bpm: 140,
  musicalKey: 'E Minor',
  label: '自訂頭目戰主題 (140 BPM)',
  subLabel: 'External Studio Track',
})
```
