const cloudConfig = require("../config/cloud.js");

let client = null;
let ready = null;

function ensureCloud() {
  if (!ready) {
    ready = initCloud().catch((err) => {
      ready = null;
      client = null;
      throw err;
    });
  }
  return ready;
}

async function initCloud() {
  if (!wx.cloud || typeof wx.cloud.Cloud !== "function") {
    throw new Error("当前基础库不支持云开发环境共享");
  }
  const instance = new wx.cloud.Cloud({
    resourceAppid: cloudConfig.resourceAppid,
    resourceEnv: cloudConfig.env,
  });
  await instance.init();
  client = instance;
  return instance;
}

function getCloud() {
  if (!client) throw new Error("云环境尚未初始化");
  return client;
}

module.exports = {
  ensureCloud,
  getCloud,
};
