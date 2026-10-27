const cloudConfig = require("../../config/cloud.js");
const { PAGE_SIZE, chunkPages, validateCollectionName, validateItemName } = require("../../utils/format.js");
const { chooseImage, compressImage, uploadImage, deleteCloudFiles, withImageUrls } = require("../../utils/image.js");
const {
  ensureDefaultCollections,
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
        options
      )
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
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = win.statusBarHeight || 20;
    const windowWidth = win.windowWidth || 375;
    let navBarHeight = 44;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        navBarHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height);
      }
    } catch (err) {
      navBarHeight = 44;
    }
    const toolbarHeight = Math.round((96 * windowWidth) / 750);
    const taglineHeight = Math.round((26 * windowWidth) / 750);
    this._windowWidth = windowWidth;
    this.setData({
      statusBarHeight,
      navBarHeight,
      toolbarHeight,
      headerOffset: statusBarHeight + navBarHeight + toolbarHeight + taglineHeight,
    });
  },

  onShow() {
    this.syncTab();
    this.loadAll();
  },

  syncTab(extra) {
    const tab = typeof this.getTabBar === "function" ? this.getTabBar() : null;
    if (!tab) return;
    const menuOpen = extra && extra.menuOpen !== undefined ? extra.menuOpen : this.data.menuOpen;
    const sheet = extra && extra.sheet !== undefined ? extra.sheet : this.data.sheet;
    const drawVisible = extra && extra.drawVisible !== undefined ? extra.drawVisible : this.data.drawVisible;
    const detailVisible =
      extra && extra.detailVisible !== undefined ? extra.detailVisible : this.data.detailVisible;
    const loading = extra && extra.loading !== undefined ? extra.loading : this.data.loading;
    tab.setData({
      selected: 0,
      hidden: !!(loading || menuOpen || sheet || drawVisible || detailVisible),
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
      const saved = wx.getStorageSync(cloudConfig.currentCollectionKey) || "";
      const current = collections.find((item) => item._id === saved) || collections[0] || null;
      const currentId = current ? current._id : "";
      const changed = currentId !== this.data.currentId;
      if (current) wx.setStorageSync(cloudConfig.currentCollectionKey, current._id);
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
        this.setData({ items: [], pages: [], pageIndex: 0, itemsLoading: false, loading: false });
        this.syncTab();
        return;
      }
      try {
        await this.refreshItems();
        if (this._loadToken !== token) return;
        this.setData({ loading: false });
        this.syncTab();
      } catch (err) {
        console.error(err);
        if (this._loadToken === token) {
          this.setData({ itemsLoading: false, loading: false });
          this.syncTab();
          toast("内容加载失败");
        }
      }
    } catch (err) {
      console.error(err);
      if (this._loadToken !== token) return;
      this.setData({ loading: false, loadError: true, itemsLoading: false });
      this.syncTab();
      const message = (err && err.message) || "";
      toast(message && message.indexOf("cloud") < 0 && message.length <= 20 ? message : "加载失败");
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
    if (token !== this._loadToken || this.data.currentId !== collectionId) return;
    const pages = toPages(items);
    let pageIndex = this.data.pageIndex || 0;
    if (pageIndex > pages.length - 1) pageIndex = Math.max(0, pages.length - 1);
    this.setData({ items, pages, pageIndex, itemsLoading: false });
  },

  noop() {},

  toggleMenu() {
    if (this.data.loading) return;
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
    if (this.data.loading || this._submitting) return;
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
    if (this.data.loading || this._submitting) return;
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
    return !!(this.data.sheet || this.data.menuOpen || this.data.drawVisible || this.data.detailVisible);
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
      renaming ? this.data.renamingName : undefined
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
          this.data.currentId === this.data.renamingId ? check.name : this.data.currentName;
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
    if (this._ignoreItemSubmitUntil && Date.now() < this._ignoreItemSubmitUntil) return;
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
      const previousShared = !!(editing && (editing.sharedImage || editing.is_system));
      if (this.data.sheetImageRemoved) {
        imageFileId = "";
        sharedImage = false;
      } else if (this.data.sheetLocalImage) {
        const compressed = await compressImage(this.data.sheetLocalImage);
        const folder = editing && editing.is_system ? cloudConfig.samplePrefix : cloudConfig.storagePrefix;
        uploaded = await uploadImage(compressed, folder);
        imageFileId = uploaded;
        sharedImage = false;
      }
      if (editing) {
        await updateItem(editing._id, { name: check.name, imageFileId, sharedImage });
        if (previous && previous !== imageFileId && !previousShared) await deleteCloudFiles([previous]);
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
      this.setData({ submitting: false, renamingId: "", renamingName: "", renamingSystem: false });
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
    if (this.data.loading || this.data.loadError || !this.data.items.length) return;
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
