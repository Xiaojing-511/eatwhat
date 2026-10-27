Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: "" },
    confirmText: { type: String, value: "确定" },
    showConfirm: { type: Boolean, value: true },
    busy: { type: Boolean, value: false },
  },

  methods: {
    noop() {},

    onGuard() {
      this.triggerEvent("guard");
    },

    onMask() {
      if (this.data.busy) return;
      this.triggerEvent("close");
    },

    onConfirm() {
      if (this.data.busy) return;
      this.triggerEvent("confirm");
    },
  },
});
