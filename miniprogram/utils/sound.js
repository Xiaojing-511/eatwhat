const CLICK_SRC = "/audio/click.mp3";
const DRAW_TICK_SRC = "/audio/random-draw-ticks-100ms.mp3";
const CARD_REVEAL_SRC = "/audio/card-reveal.mp3";
const POOL_SIZE = 3;

const pool = [];
let cursor = 0;
let prepared = false;

function prepare() {
  if (prepared) return;
  if (typeof wx === "undefined" || !wx.createInnerAudioContext) return;
  prepared = true;
  for (let i = 0; i < POOL_SIZE; i += 1) {
    const audio = wx.createInnerAudioContext({ useWebAudioImplement: true });
    audio.src = CLICK_SRC;
    audio.onError((err) => {
      console.error("点击音效播放失败", err);
    });
    pool.push(audio);
  }
}

function playClick() {
  prepare();
  if (!pool.length) return;
  const audio = pool[cursor];
  cursor = (cursor + 1) % pool.length;
  try {
    audio.stop();
  } catch (err) {
    // 尚未开始播放时 stop 可能失败，忽略后直接播放
  }
  audio.play();
}

let drawTickAudio = null;
let cardRevealAudio = null;

function createSound(src) {
  const audio = wx.createInnerAudioContext({ useWebAudioImplement: true });
  audio.src = src;
  audio.onError((err) => {
    console.error("音效播放失败", src, err);
  });
  return audio;
}

function stopAudio(audio) {
  if (!audio) return;
  try {
    audio.stop();
  } catch (err) {
    // 尚未开始播放时 stop 可能失败
  }
}

function restart(audio) {
  stopAudio(audio);
  audio.play();
}

function ensureDrawSounds() {
  if (typeof wx === "undefined" || !wx.createInnerAudioContext) return false;
  if (!drawTickAudio) drawTickAudio = createSound(DRAW_TICK_SRC);
  if (!cardRevealAudio) cardRevealAudio = createSound(CARD_REVEAL_SRC);
  return true;
}

function playDrawTick() {
  if (!ensureDrawSounds()) return;
  stopAudio(cardRevealAudio);
  restart(drawTickAudio);
}

function playCardReveal() {
  if (!ensureDrawSounds()) return;
  stopAudio(drawTickAudio);
  restart(cardRevealAudio);
}

function stopDrawSounds() {
  stopAudio(drawTickAudio);
  stopAudio(cardRevealAudio);
}

module.exports = {
  playClick,
  playDrawTick,
  playCardReveal,
  stopDrawSounds,
};
