const cloudConfig = require("../../config/cloud.js");
const { getUser, saveUser } = require("../../utils/db.js");
const {
  compressImage,
  uploadImage,
  deleteCloudFiles,
  tempUrlMap,
} = require("../../utils/image.js");

function toast(title) {
  wx.showToast({ title, icon: "none" });
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    nickName: "",
    avatarFileId: "",
    avatarUrl: "",
  },

  onLoad() {
    try {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"],
      });
    } catch (err) {}
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = win.statusBarHeight || 20;
    let navBarHeight = 44;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        navBarHeight = Math.max(
          44,
          (menu.top - statusBarHeight) * 2 + menu.height,
        );
      }
    } catch (err) {
      navBarHeight = 44;
    }
    this.setData({ statusBarHeight, navBarHeight });
  },

  onShareAppMessage() {
    return {
      title: "吃什么？把今天的记录，留给未来纠结的自己",
      path: "/pages/home/index",
    };
  },

  onShareTimeline() {
    return {
      title: "吃什么？把今天的记录，留给未来纠结的自己",
    };
  },

  onShow() {
    const tab = typeof this.getTabBar === "function" ? this.getTabBar() : null;
    if (tab) tab.setData({ selected: 1, hidden: false });
    this.loadProfile();
  },

  async loadProfile() {
    const token = (this._token || 0) + 1;
    this._token = token;
    try {
      const user = await getUser();
      if (this._token !== token) return;
      const nickName = (user && user.nickName) || "";
      const avatarFileId = (user && user.avatarFileId) || "";
      const urls = await tempUrlMap([avatarFileId]);
      if (this._token !== token) return;
      this._savedNick = nickName;
      this.setData({
        nickName,
        avatarFileId,
        avatarUrl: urls[avatarFileId] || "",
      });
    } catch (err) {
      console.error(err);
      if (this._token === token) toast("资料加载失败");
    }
  },

  onNicknameInput(event) {
    this.setData({ nickName: event.detail.value });
  },

  async onNicknameBlur(event) {
    const nickName = String((event.detail && event.detail.value) || "").trim();
    if (nickName === (this._savedNick || "")) {
      this.setData({ nickName });
      return;
    }
    try {
      const user = await saveUser({ nickName });
      this._savedNick = user.nickName || "";
      this.setData({ nickName: this._savedNick });
    } catch (err) {
      console.error(err);
      toast("名字保存失败");
    }
  },

  async onChooseAvatar(event) {
    const path = event.detail && event.detail.avatarUrl;
    if (!path) return;
    wx.showLoading({ title: "保存中", mask: true });
    let uploaded = "";
    try {
      const compressed = await compressImage(path);
      uploaded = await uploadImage(compressed, cloudConfig.avatarPrefix);
      const previous = this.data.avatarFileId;
      const user = await saveUser({ avatarFileId: uploaded });
      if (previous && previous !== uploaded) await deleteCloudFiles([previous]);
      const avatarFileId = (user && user.avatarFileId) || uploaded;
      uploaded = "";
      const urls = await tempUrlMap([avatarFileId]);
      this.setData({ avatarFileId, avatarUrl: urls[avatarFileId] || "" });
    } catch (err) {
      console.error(err);
      if (uploaded) await deleteCloudFiles([uploaded]);
      toast("头像保存失败");
    } finally {
      wx.hideLoading();
    }
  },
});
