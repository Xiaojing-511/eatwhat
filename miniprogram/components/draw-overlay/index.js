const { pickRandom, nameAtTick, formatTime } = require("../../utils/format.js");
const { playDrawTick, playCardReveal, stopDrawSounds } = require("../../utils/sound.js");

const ROLL_MS = 1000;
const TICK_MS = 100;
const FADE_MS = 50;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    pool: { type: Array, value: [] },
    mode: { type: String, value: "draw" },
    item: { type: Object, value: null },
  },

  data: {
    phase: "idle",
    rollingName: "",
    result: null,
    resultTime: "",
    againText: "抽取中",
    busy: false,
  },

  observers: {
    "visible, pool, mode, item": function (visible, pool, mode, item) {
      if (!visible) {
        this.reset();
        return;
      }
      if (mode === "detail") {
        this.showDetail(item);
        return;
      }
      if (this._rolling) return;
      if (pool && pool.length) this.startRoll();
    },
  },

  lifetimes: {
    detached() {
      this._generation = (this._generation || 0) + 1;
      this.clearTimers();
      stopDrawSounds();
    },
  },

  methods: {
    noop() {},

    clearTimers() {
      if (this._timer) clearTimeout(this._timer);
      if (this._reveal) clearTimeout(this._reveal);
      this._timer = null;
      this._reveal = null;
    },

    reset() {
      this._generation = (this._generation || 0) + 1;
      this._rolling = false;
      this._picked = null;
      this.clearTimers();
      stopDrawSounds();
      if (this.data.phase === "idle" && !this.data.busy) return;
      this.setData({
        phase: "idle",
        rollingName: "",
        result: null,
        resultTime: "",
        againText: "抽取中",
        busy: false,
      });
    },

    showDetail(item) {
      if (!item || !item._id) return;
      if (this.data.phase === "result" && this.data.result && this.data.result._id === item._id) {
        return;
      }
      this._generation = (this._generation || 0) + 1;
      this._rolling = false;
      this.clearTimers();
      stopDrawSounds();
      this.setData({
        phase: "result",
        rollingName: "",
        result: item,
        resultTime: formatTime(item.createdAt),
        againText: "",
        busy: false,
      });
    },

    startRoll() {
      const pool = this.data.pool || [];
      if (!pool.length || this._rolling) return;
      const picked = pickRandom(pool, null, this._lastPicked);
      if (!picked) return;
      this._lastPicked = picked;

      const generation = (this._generation || 0) + 1;
      this._generation = generation;
      this._rolling = true;
      this._picked = picked;
      this.clearTimers();

      const names = pool.map((item) => item.name);
      const started = Date.now();
      this.setData({
        phase: "rolling",
        rollingName: nameAtTick(names, 0),
        result: null,
        resultTime: formatTime(picked.createdAt),
        againText: "抽取中",
        busy: true,
      });
      playDrawTick();

      const step = () => {
        if (this._generation !== generation) return;
        const elapsed = Date.now() - started;
        if (elapsed >= ROLL_MS) {
          this.beginFade(generation);
          return;
        }
        this.setData({ rollingName: nameAtTick(names, Math.floor(elapsed / TICK_MS)) });
        this._timer = setTimeout(step, TICK_MS);
      };
      this._timer = setTimeout(step, TICK_MS);
    },

    beginFade(generation) {
      if (this._generation !== generation) return;
      this.clearTimers();
      playCardReveal();
      this.setData({ phase: "fading" });
      this._reveal = setTimeout(() => {
        if (this._generation !== generation) return;
        this._rolling = false;
        this.setData({
          phase: "result",
          result: this._picked,
          busy: false,
          againText: "再抽一次",
        });
      }, FADE_MS);
    },

    onAgain() {
      if (this.data.busy || this._rolling || this.data.phase !== "result") return;
      this._rolling = false;
      this.startRoll();
    },

    onEdit() {
      if (this.data.mode !== "detail") return;
      this.triggerEvent("edit", { item: this.data.result });
    },

    onDelete() {
      if (this.data.mode !== "detail") return;
      this.triggerEvent("delete", { item: this.data.result });
    },

    onMask() {
      if (this.data.busy || this._rolling) return;
      this.triggerEvent("close");
    },
  },
});
