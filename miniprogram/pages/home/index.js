const cloudConfig = require("../../config/cloud.js");
const {
  PAGE_SIZE,
  chunkPages,
  validateCollectionName,
  validateItemName,
} = require("../../utils/format.js");
const {
  chooseImage,
  compressImage,
  uploadImage,
  deleteCloudFiles,
  withImageUrls,
} = require("../../utils/image.js");
const {
  ensureDefaultCollections,
  getUser,
  saveUser,
  createCollection,
  renameCollection,
  listItems,
  createItem,
  updateItem,
  removeItem,
  removeCollection,
} = require("../../utils/db.js");
const sound = require("../../utils/sound.js");

function toast(title) {
  wx.showToast({ title, icon: "none" });
}

function askModal(options) {
  return new Promise((resolve) => {
    wx.showModal(
      Object.assign(
        {
          confirmColor: "#111111",
          success: resolve,
          fail: () => resolve({ confirm: false }),
        },
        options,
      ),
    );
  });
}

function askSheet(itemList) {
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList,
      success: (res) => resolve(res.tapIndex),
      fail: () => resolve(-1),
    });
  });
}

const GUIDE_STEPS = [
  {
    selector: ".guide-directory",
    lines: ["这是目录区，点击右侧的“+”即可添加新目录～"],
  },
  {
    selector: ".guide-add",
    lines: ["点击这里新建目录中的内容哦～"],
  },
  {
    center: true,
    lines: [
      "随手记下你爱吃的，纠结时自有答案～",
      "现在就创建一个属于你的美食清单吧！",
    ],
  },
];

function readGuideDone() {
  try {
    return !!wx.getStorageSync(cloudConfig.guideDoneKey);
  } catch (err) {
    return false;
  }
}

function toPages(items) {
  return chunkPages(items, PAGE_SIZE).map((cards, index) => ({
    key: index + "-" + cards.map((card) => card._id).join(","),
    cards,
  }));
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    toolbarHeight: 48,
    headerOffset: 112,
    loading: true,
    itemsLoading: false,
    loadError: false,
    collections: [],
    currentId: "",
    currentName: "",
    menuOpen: false,
    menuHeight: 48,
    items: [],
    pages: [],
    pageIndex: 0,
    sheet: "",
    sheetTitle: "",
    sheetConfirm: "",
    sheetName: "",
    sheetPreview: "",
    sheetLocalImage: "",
    sheetImageRemoved: false,
    editingItem: null,
    renamingId: "",
    renamingName: "",
    renamingSystem: false,
    submitting: false,
    drawVisible: false,
    drawPool: [],
    detailVisible: false,
    detailItem: null,
    showGuide: false,
    guideReady: false,
    guideCenter: false,
    guideLines: [],
    guideHoleStyle: "",
    guideTipStyle: "",
  },

  onLoad() {
    try {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"],
      });
    } catch (err) {}
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = win.statusBarHeight || 20;
    const windowWidth = win.windowWidth || 375;
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
    const toolbarHeight = Math.round((96 * windowWidth) / 750);
    const taglineHeight = Math.round((26 * windowWidth) / 750);
    this._windowWidth = windowWidth;
    this._windowHeight = win.windowHeight || 667;
    this.setData({
      statusBarHeight,
      navBarHeight,
      toolbarHeight,
      headerOffset:
        statusBarHeight + navBarHeight + toolbarHeight + taglineHeight,
    });
  },

  onShow() {
    this.syncTab();
    this.loadAll();
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

  syncTab(extra) {
    const tab = typeof this.getTabBar === "function" ? this.getTabBar() : null;
    if (!tab) return;
    const menuOpen =
      extra && extra.menuOpen !== undefined
        ? extra.menuOpen
        : this.data.menuOpen;
    const sheet =
      extra && extra.sheet !== undefined ? extra.sheet : this.data.sheet;
    const drawVisible =
      extra && extra.drawVisible !== undefined
        ? extra.drawVisible
        : this.data.drawVisible;
    const detailVisible =
      extra && extra.detailVisible !== undefined
        ? extra.detailVisible
        : this.data.detailVisible;
    const loading =
      extra && extra.loading !== undefined ? extra.loading : this.data.loading;
    const showGuide =
      extra && extra.showGuide !== undefined
        ? extra.showGuide
        : this.data.showGuide;
    tab.setData({
      selected: 0,
      hidden: !!(
        loading ||
        menuOpen ||
        sheet ||
        drawVisible ||
        detailVisible ||
        showGuide
      ),
    });
  },

  menuHeightFor(count) {
    const width = this._windowWidth || 375;
    const rows = Math.max(count || 0, 1);
    const rowPx = (96 * width) / 750;
    const maxPx = (560 * width) / 750;
    return Math.round(Math.min(rows * rowPx, maxPx));
  },

  async loadAll() {
    const token = (this._loadToken || 0) + 1;
    this._loadToken = token;
    try {
      const collections = await ensureDefaultCollections();
      if (this._loadToken !== token) return;
      let user = null;
      if (!this._guideChecked && !readGuideDone()) {
        user = await getUser();
        if (this._loadToken !== token) return;
      }
      this._loadedUser = user;
      const saved = wx.getStorageSync(cloudConfig.currentCollectionKey) || "";
      const current =
        collections.find((item) => item._id === saved) ||
        collections[0] ||
        null;
      const currentId = current ? current._id : "";
      const changed = currentId !== this.data.currentId;
      if (current)
        wx.setStorageSync(cloudConfig.currentCollectionKey, current._id);
      else wx.removeStorageSync(cloudConfig.currentCollectionKey);
      this.setData({
        loadError: false,
        collections,
        currentId,
        currentName: current ? current.name : "",
        pageIndex: changed ? 0 : this.data.pageIndex,
        menuHeight: this.menuHeightFor(collections.length),
        itemsLoading: !!currentId,
      });
      if (!currentId) {
        this.reveal({
          items: [],
          pages: [],
          pageIndex: 0,
          itemsLoading: false,
        });
        return;
      }
      try {
        await this.refreshItems();
        if (this._loadToken !== token) return;
        this.reveal();
      } catch (err) {
        console.error(err);
        if (this._loadToken === token) {
          this.reveal({ itemsLoading: false });
          toast("内容加载失败");
        }
      }
    } catch (err) {
      console.error(err);
      if (this._loadToken !== token) return;
      this.setData({ loading: false, loadError: true, itemsLoading: false });
      this.syncTab();
      const message = (err && err.message) || "";
      toast(
        message && message.indexOf("cloud") < 0 && message.length <= 20
          ? message
          : "加载失败",
      );
    }
  },

  reveal(patch) {
    const data = Object.assign(
      { loading: false },
      patch || {},
      this.guidePatch(),
    );
    this.setData(data, () => {
      this.syncTab();
      if (data.showGuide) this.measureGuide();
    });
  },

  guidePatch() {
    if (this._guideChecked) return {};
    this._guideChecked = true;
    if (this.guideAlreadyDone(this._loadedUser)) return {};
    this._guideStep = 0;
    return {
      showGuide: true,
      guideReady: false,
      guideCenter: false,
      guideLines: GUIDE_STEPS[0].lines,
      guideHoleStyle: "",
      guideTipStyle: "",
    };
  },

  guideAlreadyDone(user) {
    if (readGuideDone()) return true;
    if (user && user.guideDone) {
      try {
        wx.setStorageSync(cloudConfig.guideDoneKey, 1);
      } catch (err) {}
      return true;
    }
    return false;
  },

  measureGuide(attempt) {
    if (!this.data.showGuide) return;
    const step = GUIDE_STEPS[this._guideStep || 0];
    if (!step || step.center) {
      this.setData({
        guideReady: true,
        guideCenter: true,
        guideHoleStyle: "",
        guideLines: (step && step.lines) || [],
      });
      return;
    }
    const token = (this._guideMeasureToken || 0) + 1;
    this._guideMeasureToken = token;
    const run = () => {
      if (!this.data.showGuide || token !== this._guideMeasureToken) return;
      const query = wx.createSelectorQuery().in(this);
      query.selectAll(step.selector).boundingClientRect();
      query.exec((res) => {
        if (!this.data.showGuide || token !== this._guideMeasureToken) return;
        const rect = this.pickGuideRect(res && res[0]);
        if (!rect) {
          if ((attempt || 0) < 12) {
            setTimeout(() => {
              if (token === this._guideMeasureToken)
                this.measureGuide((attempt || 0) + 1);
            }, 80);
            return;
          }
          this.placeGuide(this.fallbackGuideRect());
          return;
        }
        this.placeGuide(rect);
      });
    };
    if (typeof wx.nextTick === "function") wx.nextTick(run);
    else run();
  },

  pickGuideRect(list) {
    const rects = Array.isArray(list) ? list : list ? [list] : [];
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      if (rect && rect.width > 0 && rect.height > 0) return rect;
    }
    return null;
  },

  fallbackGuideRect() {
    const winW = this._windowWidth || 375;
    const rpx = winW / 750;
    const top =
      (this.data.statusBarHeight || 20) +
      (this.data.navBarHeight || 44) +
      12 * rpx;
    const step = GUIDE_STEPS[this._guideStep || 0];
    if (step && step.selector === ".guide-add") {
      const size = 64 * rpx;
      return {
        left: winW - 32 * rpx - size,
        top: top,
        width: size,
        height: size,
      };
    }
    const height = 72 * rpx;
    return {
      left: 32 * rpx,
      top: top,
      width: Math.min(winW * 0.62, 280),
      height: height,
    };
  },

  placeGuide(rect) {
    const pad = 8;
    const winW = this._windowWidth || 375;
    const winH = this._windowHeight || 667;
    let left = rect.left - pad;
    let top = rect.top - pad;
    let width = rect.width + pad * 2;
    let height = rect.height + pad * 2;
    if (left < 8) {
      width -= 8 - left;
      left = 8;
    }
    if (top < 8) {
      height -= 8 - top;
      top = 8;
    }
    if (left + width > winW - 8) width = Math.max(8, winW - 8 - left);
    if (top + height > winH - 8) height = Math.max(8, winH - 8 - top);
    const hole =
      "left:" +
      left +
      "px;top:" +
      top +
      "px;width:" +
      width +
      "px;height:" +
      height +
      "px;";
    const tipWidth = Math.max(160, winW - 48);
    const tipTop = Math.min(top + height + 16, winH - 120);
    this.setData({
      guideHoleStyle: hole,
      guideTipStyle: "left:24px;width:" + tipWidth + "px;top:" + tipTop + "px;",
      guideReady: true,
      guideCenter: false,
      guideLines: (GUIDE_STEPS[this._guideStep || 0] || GUIDE_STEPS[0]).lines,
    });
  },

  onGuideNext() {
    if (!this.data.showGuide || this._guideFinishing || !this.data.guideReady)
      return;
    sound.playClick();
    const next = (this._guideStep || 0) + 1;
    if (next >= GUIDE_STEPS.length) {
      this.finishGuide();
      return;
    }
    this._guideStep = next;
    const step = GUIDE_STEPS[next];
    this.setData({
      guideLines: step.lines,
      guideCenter: !!step.center,
    });
    this.measureGuide();
  },

  onGuideSkip() {
    if (!this.data.showGuide || this._guideFinishing) return;
    sound.playClick();
    this.finishGuide();
  },

  async finishGuide() {
    if (this._guideFinishing) return;
    this._guideFinishing = true;
    try {
      wx.setStorageSync(cloudConfig.guideDoneKey, 1);
    } catch (err) {}
    this.setData({ showGuide: false, guideReady: false, guideCenter: false });
    this.syncTab({ showGuide: false });
    try {
      await saveUser({ guideDone: true });
    } catch (err) {
      console.error(err);
    } finally {
      this._guideFinishing = false;
    }
  },

  async refreshItems() {
    const collectionId = this.data.currentId;
    const token = this._loadToken;
    if (!collectionId) {
      this.setData({ items: [], pages: [], pageIndex: 0, itemsLoading: false });
      return;
    }
    const items = await withImageUrls(await listItems(collectionId));
    if (token !== this._loadToken || this.data.currentId !== collectionId)
      return;
    const pages = toPages(items);
    let pageIndex = this.data.pageIndex || 0;
    if (pageIndex > pages.length - 1) pageIndex = Math.max(0, pages.length - 1);
    this.setData({ items, pages, pageIndex, itemsLoading: false });
  },

  noop() {},

  toggleMenu() {
    if (this.data.loading || this.data.showGuide) return;
    const menuOpen = !this.data.menuOpen;
    this.setData({
      menuOpen,
      menuHeight: this.menuHeightFor(this.data.collections.length),
    });
    this.syncTab({ menuOpen });
  },

  closeMenu() {
    if (!this.data.menuOpen) return;
    this.setData({ menuOpen: false });
    this.syncTab({ menuOpen: false });
  },

  async onSwitchCollection(event) {
    const id = event.currentTarget.dataset.id;
    const found = this.data.collections.find((item) => item._id === id);
    if (!found) return;
    if (id === this.data.currentId) {
      this.setData({ menuOpen: false });
      this.syncTab({ menuOpen: false });
      return;
    }
    wx.setStorageSync(cloudConfig.currentCollectionKey, id);
    this.setData({
      menuOpen: false,
      currentId: id,
      currentName: found.name,
      pageIndex: 0,
      items: [],
      pages: [],
      itemsLoading: true,
    });
    this.syncTab({ menuOpen: false });
    try {
      await this.refreshItems();
    } catch (err) {
      console.error(err);
      this.setData({ itemsLoading: false });
      toast("内容加载失败");
    }
  },

  onCollectionActions(event) {
    const id = event.currentTarget.dataset.id;
    const found = this.data.collections.find((item) => item._id === id);
    if (!found) return;
    this.setData({
      menuOpen: false,
      sheet: "collection-actions",
      sheetTitle: found.name,
      sheetConfirm: "",
      renamingId: id,
      renamingName: found.name,
      renamingSystem: !!found.is_system,
    });
    this.syncTab({ menuOpen: false, sheet: "collection-actions" });
  },

  onPickRename() {
    this.openRename(this.data.renamingId, this.data.renamingName);
  },

  onPickDeleteCollection() {
    if (this.data.renamingSystem) {
      toast("示例清单不能删除");
      return;
    }
    this.setData({
      sheet: "delete-collection",
      sheetTitle: "删除清单",
      sheetConfirm: "删除",
    });
    this.syncTab({ sheet: "delete-collection" });
  },

  openCreate() {
    if (this.data.loading || this._submitting || this.data.showGuide) return;
    this.setData({
      menuOpen: false,
      sheet: "create",
      sheetTitle: "创建清单",
      sheetConfirm: "创建",
      sheetName: "",
      renamingId: "",
      renamingName: "",
    });
    this.syncTab({ menuOpen: false, sheet: "create" });
  },

  openRename(id, name) {
    this.setData({
      menuOpen: false,
      sheet: "rename",
      sheetTitle: "重命名清单",
      sheetConfirm: "保存",
      sheetName: name,
      renamingId: id,
      renamingName: name,
    });
    this.syncTab({ menuOpen: false, sheet: "rename" });
  },

  openAdd() {
    if (this.data.loading || this._submitting || this.data.showGuide) return;
    if (!this.data.currentId) {
      toast("先创建一个清单");
      return;
    }
    this.setData({
      menuOpen: false,
      sheet: "add",
      sheetTitle: "添加「" + this.data.currentName + "」内容",
      sheetConfirm: "添加",
      sheetName: "",
      sheetPreview: "",
      sheetLocalImage: "",
      sheetImageRemoved: false,
      editingItem: null,
    });
    this.syncTab({ menuOpen: false, sheet: "add" });
  },

  openEdit(item) {
    this.setData({
      menuOpen: false,
      sheet: "edit",
      sheetTitle: "编辑条目",
      sheetConfirm: "保存",
      sheetName: item.name || "",
      sheetPreview: item.imageUrl || "",
      sheetLocalImage: "",
      sheetImageRemoved: false,
      editingItem: item,
    });
    this.syncTab({ menuOpen: false, sheet: "edit" });
  },

  onSheetGuard() {
    // 弹层空白处收起键盘时，同一次点击会穿透到下面的卡片
    this._ignoreTapUntil = Date.now() + 400;
  },

  ignorePenetratedTap() {
    if (this._ignoreTapUntil && Date.now() < this._ignoreTapUntil) return true;
    return !!(
      this.data.sheet ||
      this.data.menuOpen ||
      this.data.drawVisible ||
      this.data.detailVisible ||
      this.data.showGuide
    );
  },

  closeSheet() {
    if (this._submitting) return;
    this._ignoreTapUntil = Date.now() + 400;
    this.setData({
      sheet: "",
      sheetTitle: "",
      sheetConfirm: "",
      sheetName: "",
      sheetPreview: "",
      sheetLocalImage: "",
      sheetImageRemoved: false,
      editingItem: null,
      renamingId: "",
      renamingName: "",
      renamingSystem: false,
    });
    this.syncTab({ sheet: "" });
  },

  onSheetName(event) {
    this.setData({ sheetName: event.detail.value });
  },

  async onChooseSheetImage() {
    try {
      const path = await chooseImage();
      // 选图返回后短时间内忽略提交，避免穿透点击把记录直接创建掉
      this._ignoreItemSubmitUntil = Date.now() + 500;
      this.setData({
        sheetLocalImage: path,
        sheetPreview: path,
        sheetImageRemoved: false,
      });
    } catch (err) {
      if (err && err.cancel) return;
      toast("选择图片失败");
    }
  },

  onRemoveSheetImage() {
    this.setData({
      sheetPreview: "",
      sheetLocalImage: "",
      sheetImageRemoved: true,
    });
  },

  async submitCollection() {
    if (this._submitting) return;
    const renaming = this.data.sheet === "rename";
    const names = this.data.collections.map((item) => item.name);
    const check = validateCollectionName(
      this.data.sheetName,
      names,
      renaming ? this.data.renamingName : undefined,
    );
    if (!check.ok) {
      toast(check.message);
      return;
    }
    this._submitting = true;
    this.setData({ submitting: true });
    let saved = false;
    try {
      if (renaming) {
        await renameCollection(this.data.renamingId, check.name);
        const currentName =
          this.data.currentId === this.data.renamingId
            ? check.name
            : this.data.currentName;
        this.setData({
          sheet: "",
          sheetName: "",
          renamingId: "",
          renamingName: "",
          currentName,
        });
      } else {
        const created = await createCollection(check.name);
        wx.setStorageSync(cloudConfig.currentCollectionKey, created._id);
        this.setData({
          sheet: "",
          sheetName: "",
          menuOpen: false,
          currentId: created._id,
          currentName: created.name,
          pageIndex: 0,
        });
      }
      saved = true;
    } catch (err) {
      console.error(err);
      toast(renaming ? "重命名失败" : "创建失败");
    } finally {
      this._submitting = false;
      this.setData({ submitting: false });
      this.syncTab({ sheet: saved ? "" : this.data.sheet });
    }
    if (saved) await this.loadAll();
  },

  async submitItem() {
    if (this._submitting) return;
    if (this._ignoreItemSubmitUntil && Date.now() < this._ignoreItemSubmitUntil)
      return;
    const editing = this.data.sheet === "edit" ? this.data.editingItem : null;
    const check = validateItemName(this.data.sheetName);
    if (!check.ok) {
      toast(check.message);
      return;
    }
    if (!editing && !this.data.currentId) {
      toast("先创建一个清单");
      return;
    }
    this._submitting = true;
    this.setData({ submitting: true });
    let uploaded = "";
    let saved = false;
    try {
      let imageFileId = editing ? editing.imageFileId || "" : "";
      let sharedImage = editing ? !!editing.sharedImage : false;
      const previous = imageFileId;
      const previousShared = !!(
        editing &&
        (editing.sharedImage || editing.is_system)
      );
      if (this.data.sheetImageRemoved) {
        imageFileId = "";
        sharedImage = false;
      } else if (this.data.sheetLocalImage) {
        const compressed = await compressImage(this.data.sheetLocalImage);
        const folder =
          editing && editing.is_system
            ? cloudConfig.samplePrefix
            : cloudConfig.storagePrefix;
        uploaded = await uploadImage(compressed, folder);
        imageFileId = uploaded;
        sharedImage = false;
      }
      if (editing) {
        await updateItem(editing._id, {
          name: check.name,
          imageFileId,
          sharedImage,
        });
        if (previous && previous !== imageFileId && !previousShared)
          await deleteCloudFiles([previous]);
        uploaded = "";
        this.setData({
          sheet: "",
          sheetName: "",
          sheetPreview: "",
          sheetLocalImage: "",
          sheetImageRemoved: false,
          editingItem: null,
        });
        toast("已保存");
      } else {
        await createItem(this.data.currentId, check.name, imageFileId);
        uploaded = "";
        this.setData({
          sheetName: "",
          sheetPreview: "",
          sheetLocalImage: "",
          sheetImageRemoved: false,
        });
        toast("已添加");
      }
      saved = true;
    } catch (err) {
      console.error(err);
      if (uploaded) await deleteCloudFiles([uploaded]);
      toast("保存失败");
    } finally {
      this._submitting = false;
      this.setData({ submitting: false });
      this.syncTab({ sheet: editing && saved ? "" : this.data.sheet });
    }
    if (!saved) return;
    try {
      await this.refreshItems();
    } catch (err) {
      console.error(err);
      toast("条目加载失败");
    }
  },

  onTapItem(event) {
    if (this._longPressed) {
      this._longPressed = false;
      return;
    }
    if (this.ignorePenetratedTap()) return;
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find((row) => row._id === id);
    if (!item) return;
    sound.playClick();
    this.setData({
      menuOpen: false,
      detailVisible: true,
      detailItem: item,
    });
    this.syncTab({ menuOpen: false, detailVisible: true });
  },

  async onLongPressItem(event) {
    this._longPressed = true;
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find((row) => row._id === id);
    if (!item) return;
    const tap = await askSheet(["编辑", "删除"]);
    if (tap === 0) this.openEdit(item);
    if (tap === 1) this.confirmDeleteItem(item);
  },

  async confirmDeleteItem(item) {
    const res = await askModal({
      title: "删除这条清单内容？",
      content: item.name || "",
    });
    if (!res.confirm) return;
    wx.showLoading({ title: "删除中", mask: true });
    try {
      await removeItem(item);
      if (this.data.detailItem && this.data.detailItem._id === item._id) {
        this.setData({ detailVisible: false, detailItem: null });
        this.syncTab({ detailVisible: false });
      }
      await this.refreshItems();
    } catch (err) {
      console.error(err);
      toast("删除失败");
    } finally {
      wx.hideLoading();
    }
  },

  async confirmDeleteCollection() {
    if (this._submitting) return;
    const id = this.data.renamingId;
    if (!id) return;
    const found = this.data.collections.find((item) => item._id === id);
    if ((found && found.is_system) || this.data.renamingSystem) {
      toast("示例清单不能删除");
      return;
    }
    this._submitting = true;
    this.setData({ submitting: true, sheet: "" });
    this.syncTab({ sheet: "" });
    wx.showLoading({ title: "删除中", mask: true });
    try {
      await removeCollection(id);
      if (wx.getStorageSync(cloudConfig.currentCollectionKey) === id) {
        wx.removeStorageSync(cloudConfig.currentCollectionKey);
      }
      this.setData({ menuOpen: false });
      await this.loadAll();
    } catch (err) {
      console.error(err);
      toast("删除失败");
    } finally {
      this._submitting = false;
      this.setData({
        submitting: false,
        renamingId: "",
        renamingName: "",
        renamingSystem: false,
      });
      wx.hideLoading();
      this.syncTab();
    }
  },

  onSwiperChange(event) {
    const current = event.detail.current;
    if (current === this.data.pageIndex) return;
    this.setData({ pageIndex: current });
  },

  prevPage() {
    if (this.data.pageIndex <= 0 || this.data.pages.length <= 1) return;
    this.setData({ pageIndex: this.data.pageIndex - 1 });
  },

  nextPage() {
    if (this.data.pageIndex >= this.data.pages.length - 1) return;
    this.setData({ pageIndex: this.data.pageIndex + 1 });
  },

  onDraw() {
    if (
      this.data.loading ||
      this.data.showGuide ||
      this.data.loadError ||
      !this.data.items.length
    )
      return;
    this.setData({
      menuOpen: false,
      detailVisible: false,
      detailItem: null,
      drawVisible: true,
      drawPool: this.data.items.map((item) => ({
        _id: item._id,
        name: item.name,
        imageFileId: item.imageFileId || "",
        imageUrl: item.imageUrl || "",
        createdAt: item.createdAt || 0,
      })),
    });
    this.syncTab({ menuOpen: false, detailVisible: false, drawVisible: true });
  },

  onOverlayClose() {
    if (this.data.detailVisible) {
      this.setData({ detailVisible: false, detailItem: null });
      this.syncTab({ detailVisible: false });
      return;
    }
    this.setData({ drawVisible: false });
    this.syncTab({ drawVisible: false });
  },

  onDetailEdit() {
    const item = this.data.detailItem;
    if (!item) return;
    this.setData({ detailVisible: false, detailItem: null });
    this.syncTab({ detailVisible: false });
    this.openEdit(item);
  },

  onDetailDelete() {
    const item = this.data.detailItem;
    if (!item) return;
    this.confirmDeleteItem(item);
  },
});
