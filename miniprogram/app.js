const { ensureCloud } = require("./utils/cloud.js");

App({
  globalData: {
    user: null,
  },

  onLaunch() {
    this.cloudReady = ensureCloud().catch((err) => {
      console.error("云环境初始化失败", err);
    });
  },
});
